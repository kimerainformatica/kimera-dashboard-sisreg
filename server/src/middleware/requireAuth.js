import { consultar, primeiro } from '../db.js';
import { rota } from './errors.js';

export const NOME_COOKIE = 'kimera_sessao';
export const DURACAO_SESSAO_HORAS = 12;

export function novaExpiracao() {
  return new Date(Date.now() + DURACAO_SESSAO_HORAS * 3600000);
}

/** Removes expired sessions; called on startup and after each login. */
export async function limparSessoesExpiradas() {
  const r = await consultar('DELETE FROM sessoes WHERE expira_em < NOW()');
  return r.affectedRows;
}

export const requireAuth = rota(async (req, res, next) => {
  const token = req.cookies?.[NOME_COOKIE];
  if (!token) return res.status(401).json({ erro: 'Não autenticado' });

  const sessao = await primeiro(
    `SELECT s.token, s.usuario_id, TIMESTAMPDIFF(SECOND, NOW(), s.expira_em) AS restante,
            u.id, u.usuario, u.nome, u.papel, u.ativo
     FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ?`,
    [token]
  );
  if (!sessao || sessao.restante <= 0 || !sessao.ativo) {
    if (sessao) await consultar('DELETE FROM sessoes WHERE token = ?', [token]);
    res.clearCookie(NOME_COOKIE);
    return res.status(401).json({ erro: sessao ? 'Sessão expirada, faça login novamente' : 'Não autenticado' });
  }

  // Sliding expiration: active use keeps the session alive through a shift.
  // Refreshed at most every 5 minutes so plain reads do not write to the DB.
  if (sessao.restante < DURACAO_SESSAO_HORAS * 3600 - 300) {
    await consultar('UPDATE sessoes SET expira_em = ? WHERE token = ?', [novaExpiracao(), token]);
  }

  req.usuario = { id: sessao.id, usuario: sessao.usuario, nome: sessao.nome, papel: sessao.papel };
  req.sessaoToken = token;
  next();
});
