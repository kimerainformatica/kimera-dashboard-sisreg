import { Router } from 'express';
import { consultar, primeiro, transacao } from '../db.js';
import { rota } from '../middleware/errors.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { recalcularSolicitacoes } from '../services/importacaoSisreg.js';
import { ErroValidacao } from '../lib/erros.js';

const router = Router();
const CATEGORIAS = ['consulta', 'retorno', 'procedimento'];

router.get('/', rota(async (req, res) => {
  const where = [];
  const params = [];
  if (req.query.especialidade_id === 'sem') where.push('p.especialidade_id IS NULL');
  else if (req.query.especialidade_id) { where.push('p.especialidade_id = ?'); params.push(Number(req.query.especialidade_id)); }
  if (req.query.busca) {
    where.push('(p.descricao LIKE ? OR p.codigo_interno LIKE ? OR p.codigo_unificado LIKE ?)');
    const t = `%${req.query.busca.trim()}%`;
    params.push(t, t, t);
  }
  res.json(await consultar(
    `SELECT p.codigo_interno, p.codigo_unificado, p.descricao, p.categoria, p.especialidade_id, p.classificado_manualmente,
            e.nome AS especialidade_nome,
            (SELECT COUNT(*) FROM solicitacao_itens i WHERE i.codigo_interno = p.codigo_interno) AS usos
     FROM procedimentos p LEFT JOIN especialidades e ON e.id = p.especialidade_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY p.especialidade_id IS NOT NULL, e.ordem, p.categoria, p.descricao`,
    params
  ));
}));

/** Reclassifies a code and moves every solicitação that uses it. */
router.put('/:codigo', requireAdmin, rota(async (req, res) => {
  const atual = await primeiro('SELECT * FROM procedimentos WHERE codigo_interno = ?', [req.params.codigo]);
  if (!atual) return res.status(404).json({ erro: 'Procedimento não encontrado' });
  const { especialidade_id, categoria } = req.body ?? {};
  const esp = especialidade_id === null || especialidade_id === '' ? null : Number(especialidade_id ?? atual.especialidade_id);
  const cat = categoria ?? atual.categoria;
  if (!CATEGORIAS.includes(cat)) throw new ErroValidacao('Categoria inválida');
  if (esp != null && !(await primeiro('SELECT id FROM especialidades WHERE id = ?', [esp]))) {
    throw new ErroValidacao('Especialidade inválida');
  }
  const movidas = await transacao(async (conn) => {
    await conn.query(
      'UPDATE procedimentos SET especialidade_id = ?, categoria = ?, classificado_manualmente = 1 WHERE codigo_interno = ?',
      [esp, cat, atual.codigo_interno]
    );
    return recalcularSolicitacoes(conn, { codigo: atual.codigo_interno });
  });
  res.json({ ...(await primeiro('SELECT * FROM procedimentos WHERE codigo_interno = ?', [atual.codigo_interno])), solicitacoes_recalculadas: movidas });
}));

export default router;
