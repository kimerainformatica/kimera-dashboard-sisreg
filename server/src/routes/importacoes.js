import { Router } from 'express';
import multer from 'multer';
import { consultar, primeiro } from '../db.js';
import { rota, idParam } from '../middleware/errors.js';
import { analisarArquivo, confirmarAnalise } from '../services/importacaoSisreg.js';
import { ErroValidacao } from '../lib/erros.js';
import { ehDataISO } from '../lib/datas.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });

/** Browsers send multipart filenames as latin1; recover the UTF-8 name. */
function nomeOriginal(arquivo) {
  const nome = Buffer.from(arquivo.originalname, 'latin1').toString('utf8');
  return nome.includes('�') ? arquivo.originalname : nome;
}

router.get('/', rota(async (req, res) => {
  const limite = Math.min(200, Math.max(1, Number(req.query.limite) || 50));
  res.json(await consultar(
    `SELECT i.id, i.arquivo, DATE_FORMAT(i.exportado_em, '%Y-%m-%d') AS exportado_em,
            DATE_FORMAT(i.periodo_inicio, '%Y-%m-%d') AS periodo_inicio, DATE_FORMAT(i.periodo_fim, '%Y-%m-%d') AS periodo_fim,
            i.total_linhas, i.solicitacoes_novas, i.solicitacoes_atualizadas, i.solicitacoes_ignoradas,
            i.situacoes_alteradas, i.pacientes_novos, i.procedimentos_novos, i.duracao_ms, i.criado_em,
            u.usuario AS usuario
     FROM importacoes i LEFT JOIN usuarios u ON u.id = i.usuario_id
     ORDER BY i.id DESC LIMIT ?`,
    [limite]
  ));
}));

/** Months covered by the imported data, with the latest export date of each. */
router.get('/cobertura', rota(async (req, res) => {
  res.json(await consultar(
    `SELECT DATE_FORMAT(data_hora, '%Y-%m') AS mes, COUNT(*) AS solicitacoes,
            DATE_FORMAT(MAX(situacao_em), '%Y-%m-%d') AS exportado_em,
            SUM(situacao = 'PENDENTE' AND DATE(data_hora) >= situacao_em AND tipo = 'agenda') AS sem_desfecho
     FROM solicitacoes GROUP BY mes ORDER BY mes`
  ));
}));

router.get('/:id', idParam, rota(async (req, res) => {
  const imp = await primeiro('SELECT * FROM importacoes WHERE id = ?', [req.id]);
  if (!imp) return res.status(404).json({ erro: 'Importação não encontrada' });
  res.json({ ...imp, avisos: typeof imp.avisos === 'string' ? JSON.parse(imp.avisos) : imp.avisos });
}));

router.post('/analisar', upload.single('arquivo'), rota(async (req, res) => {
  if (!req.file) throw new ErroValidacao('Envie o arquivo exportado do SISREG (.csv)');
  res.json(await analisarArquivo(req.file.buffer, nomeOriginal(req.file), req.usuario.id));
}));

router.post('/confirmar', rota(async (req, res) => {
  const { token, exportado_em } = req.body ?? {};
  if (!token) throw new ErroValidacao('Análise não informada');
  if (exportado_em && !ehDataISO(exportado_em)) throw new ErroValidacao('Data de exportação inválida');
  res.json(await confirmarAnalise(token, { exportadoEm: exportado_em, usuarioId: req.usuario.id }));
}));

export default router;
