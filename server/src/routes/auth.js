import { Router } from 'express';
import { consultar, primeiro } from '../db.js';
import { hashSenha, verificarSenha, gerarTokenSessao } from '../auth.js';
import { requireAuth, NOME_COOKIE, novaExpiracao, limparSessoesExpiradas, DURACAO_SESSAO_HORAS } from '../middleware/requireAuth.js';
import { rota } from '../middleware/errors.js';

const router = Router();

// Simple in-memory brute-force guard: fine for a single-process LAN app.
const tentativasFalhas = new Map();
const LIMITE_TENTATIVAS = 5;
const BLOQUEIO_MINUTOS = 10;

router.post('/login', rota(async (req, res) => {
  const { usuario, senha } = req.body ?? {};
  if (!usuario || !senha) {
    return res.status(400).json({ erro: 'Usuário e senha são obrigatórios' });
  }
  const chave = usuario.trim().toLowerCase();

  const bloqueio = tentativasFalhas.get(chave);
  if (bloqueio?.bloqueadoAte && bloqueio.bloqueadoAte > Date.now()) {
    const minutos = Math.ceil((bloqueio.bloqueadoAte - Date.now()) / 60000);
    return res.status(429).json({ erro: `Muitas tentativas. Tente novamente em ${minutos} min.` });
  }

  const registro = await primeiro('SELECT * FROM usuarios WHERE usuario = ? AND ativo = 1', [chave]);
  const senhaValida = registro && verificarSenha(senha, registro.senha_hash);

  if (!senhaValida) {
    const atual = tentativasFalhas.get(chave) ?? { count: 0 };
    atual.count += 1;
    if (atual.count >= LIMITE_TENTATIVAS) {
      atual.bloqueadoAte = Date.now() + BLOQUEIO_MINUTOS * 60000;
      atual.count = 0;
    }
    tentativasFalhas.set(chave, atual);
    return res.status(401).json({ erro: 'Usuário ou senha inválidos' });
  }

  tentativasFalhas.delete(chave);
  await limparSessoesExpiradas();

  const token = gerarTokenSessao();
  await consultar('INSERT INTO sessoes (token, usuario_id, expira_em) VALUES (?, ?, ?)', [token, registro.id, novaExpiracao()]);

  res.cookie(NOME_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: DURACAO_SESSAO_HORAS * 3600 * 1000,
  });
  res.json({ id: registro.id, usuario: registro.usuario, nome: registro.nome, papel: registro.papel });
}));

router.post('/logout', rota(async (req, res) => {
  const token = req.cookies?.[NOME_COOKIE];
  if (token) await consultar('DELETE FROM sessoes WHERE token = ?', [token]);
  res.clearCookie(NOME_COOKIE);
  res.status(204).end();
}));

router.get('/me', requireAuth, (req, res) => {
  res.json(req.usuario);
});

router.put('/senha', requireAuth, rota(async (req, res) => {
  const { senha_atual, senha_nova } = req.body ?? {};
  if (!senha_atual || !senha_nova) {
    return res.status(400).json({ erro: 'Informe a senha atual e a nova senha' });
  }
  if (senha_nova.length < 6) {
    return res.status(400).json({ erro: 'A nova senha precisa ter ao menos 6 caracteres' });
  }
  const registro = await primeiro('SELECT senha_hash FROM usuarios WHERE id = ?', [req.usuario.id]);
  if (!verificarSenha(senha_atual, registro.senha_hash)) {
    return res.status(401).json({ erro: 'Senha atual incorreta' });
  }
  await consultar('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [hashSenha(senha_nova), req.usuario.id]);
  res.status(204).end();
}));

export default router;
