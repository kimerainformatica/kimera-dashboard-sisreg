import { ErroValidacao } from '../lib/erros.js';

/** Express 4 does not catch rejected promises: wrap every async handler. */
export const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * Turns thrown errors into JSON the frontend can show. Validation errors keep
 * their message; MySQL constraint failures become 409/400 with a readable
 * explanation instead of a generic 500.
 */
export function tratarErros(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof ErroValidacao || err.status === 400) {
    return res.status(400).json({ erro: err.message, detalhes: err.detalhes });
  }
  if (err.status === 404 || err.status === 403) {
    return res.status(err.status).json({ erro: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'Corpo da requisição não é um JSON válido' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ erro: 'Arquivo muito grande (limite de 60 MB)' });
  }
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ erro: 'Já existe um registro com este valor' });
  }
  if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === 'ER_ROW_IS_REFERENCED_2') {
    return res.status(409).json({ erro: 'Registro vinculado a outro cadastro' });
  }
  if (['ECONNREFUSED', 'PROTOCOL_CONNECTION_LOST', 'ER_ACCESS_DENIED_ERROR', 'ETIMEDOUT'].includes(err.code)) {
    console.error(`[db] ${err.code}: ${err.message}`);
    return res.status(503).json({ erro: 'Banco de dados MySQL indisponível. Verifique se o serviço está ligado.' });
  }

  console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
}

export function rotaNaoEncontrada(req, res) {
  res.status(404).json({ erro: 'Rota não encontrada' });
}

/** Parses an :id route param, replying 400 when it is not a positive integer. */
export function idParam(req, res, next) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ erro: 'Identificador inválido' });
  req.id = id;
  next();
}
