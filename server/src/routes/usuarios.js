import { Router } from 'express';
import { consultar, primeiro } from '../db.js';
import { hashSenha } from '../auth.js';
import { rota, idParam } from '../middleware/errors.js';

const router = Router();
const PAPEIS_VALIDOS = ['admin', 'equipe'];
const CAMPOS_PUBLICOS = 'id, usuario, nome, papel, ativo, criado_em';

async function contarAdminsAtivos(excluirId) {
  const linha = await primeiro(
    `SELECT COUNT(*) AS n FROM usuarios WHERE papel = 'admin' AND ativo = 1 AND id <> ?`,
    [excluirId ?? 0]
  );
  return linha.n;
}

router.get('/', rota(async (req, res) => {
  res.json(await consultar(`SELECT ${CAMPOS_PUBLICOS} FROM usuarios ORDER BY usuario`));
}));

router.post('/', rota(async (req, res) => {
  const { usuario, senha, nome, papel } = req.body ?? {};
  if (!usuario || !usuario.trim()) return res.status(400).json({ erro: 'Usuário é obrigatório' });
  if (!senha || senha.length < 6) return res.status(400).json({ erro: 'A senha precisa ter ao menos 6 caracteres' });
  const papelFinal = PAPEIS_VALIDOS.includes(papel) ? papel : 'equipe';

  const chave = usuario.trim().toLowerCase();
  if (await primeiro('SELECT id FROM usuarios WHERE usuario = ?', [chave])) {
    return res.status(409).json({ erro: `Já existe um usuário "${chave}"` });
  }
  const info = await consultar(
    'INSERT INTO usuarios (usuario, nome, senha_hash, papel) VALUES (?, ?, ?, ?)',
    [chave, nome?.trim() || chave, hashSenha(senha), papelFinal]
  );
  res.status(201).json(await primeiro(`SELECT ${CAMPOS_PUBLICOS} FROM usuarios WHERE id = ?`, [info.insertId]));
}));

router.put('/:id', idParam, rota(async (req, res) => {
  const existente = await primeiro('SELECT * FROM usuarios WHERE id = ?', [req.id]);
  if (!existente) return res.status(404).json({ erro: 'Usuário não encontrado' });

  const { nome, papel, ativo } = req.body ?? {};
  const papelFinal = papel !== undefined ? (PAPEIS_VALIDOS.includes(papel) ? papel : existente.papel) : existente.papel;
  const ativoFinal = ativo !== undefined ? (ativo ? 1 : 0) : existente.ativo;

  const vaiPerderAdmin = existente.papel === 'admin' && (papelFinal !== 'admin' || ativoFinal === 0);
  if (vaiPerderAdmin && (await contarAdminsAtivos(existente.id)) === 0) {
    return res.status(409).json({ erro: 'Precisa haver ao menos um administrador ativo no sistema' });
  }

  await consultar('UPDATE usuarios SET nome = ?, papel = ?, ativo = ? WHERE id = ?', [
    nome?.trim() || existente.nome, papelFinal, ativoFinal, req.id,
  ]);
  if (!ativoFinal) await consultar('DELETE FROM sessoes WHERE usuario_id = ?', [req.id]);
  res.json(await primeiro(`SELECT ${CAMPOS_PUBLICOS} FROM usuarios WHERE id = ?`, [req.id]));
}));

router.put('/:id/senha', idParam, rota(async (req, res) => {
  const existente = await primeiro('SELECT id FROM usuarios WHERE id = ?', [req.id]);
  if (!existente) return res.status(404).json({ erro: 'Usuário não encontrado' });
  const { senha_nova } = req.body ?? {};
  if (!senha_nova || senha_nova.length < 6) {
    return res.status(400).json({ erro: 'A nova senha precisa ter ao menos 6 caracteres' });
  }
  await consultar('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [hashSenha(senha_nova), req.id]);
  await consultar('DELETE FROM sessoes WHERE usuario_id = ?', [req.id]);
  res.status(204).end();
}));

router.delete('/:id', idParam, rota(async (req, res) => {
  const existente = await primeiro('SELECT * FROM usuarios WHERE id = ?', [req.id]);
  if (!existente) return res.status(404).json({ erro: 'Usuário não encontrado' });
  if (req.usuario.id === req.id) {
    return res.status(409).json({ erro: 'Você não pode remover o próprio usuário' });
  }
  if (existente.papel === 'admin' && (await contarAdminsAtivos(existente.id)) === 0) {
    return res.status(409).json({ erro: 'Precisa haver ao menos um administrador ativo no sistema' });
  }
  await consultar('DELETE FROM usuarios WHERE id = ?', [req.id]);
  res.status(204).end();
}));

export default router;
