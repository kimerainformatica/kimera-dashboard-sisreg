import crypto from 'node:crypto';

const KEYLEN = 64;

export function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(senha, salt, KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

export function verificarSenha(senha, senhaHashArmazenada) {
  const [salt, hashArmazenado] = (senhaHashArmazenada || '').split(':');
  if (!salt || !hashArmazenado) return false;
  const hashCalculado = crypto.scryptSync(senha, salt, KEYLEN);
  const bufferArmazenado = Buffer.from(hashArmazenado, 'hex');
  if (bufferArmazenado.length !== hashCalculado.length) return false;
  return crypto.timingSafeEqual(hashCalculado, bufferArmazenado);
}

export function gerarTokenSessao() {
  return crypto.randomBytes(32).toString('hex');
}
