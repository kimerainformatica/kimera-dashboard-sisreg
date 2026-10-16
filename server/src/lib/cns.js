import { somenteDigitos } from './texto.js';

/**
 * Validates a Cartão Nacional de Saúde number (15 digits) using the DATASUS
 * algorithms: definitive cards start with 1 or 2 (mod-11 check over the
 * 11-digit PIS), provisional cards start with 7, 8 or 9 (weighted sum mod 11).
 * Returns the clean 15-digit string, or null if invalid/empty.
 */
export function normalizarCNS(valor) {
  const cns = somenteDigitos(valor);
  if (cns.length !== 15) return null;
  if (/^[12]/.test(cns)) return validarDefinitivo(cns) ? cns : null;
  if (/^[789]/.test(cns)) return validarProvisorio(cns) ? cns : null;
  return null;
}

function validarDefinitivo(cns) {
  const pis = cns.slice(0, 11);
  let soma = 0;
  for (let i = 0; i < 11; i++) soma += Number(pis[i]) * (15 - i);
  let resto = soma % 11;
  let dv = 11 - resto;
  let esperado;
  if (dv === 11) dv = 0;
  if (dv === 10) {
    soma += 2;
    resto = soma % 11;
    dv = 11 - resto;
    if (dv === 11) dv = 0;
    esperado = `${pis}001${dv}`;
  } else {
    esperado = `${pis}000${dv}`;
  }
  return esperado === cns;
}

function validarProvisorio(cns) {
  let soma = 0;
  for (let i = 0; i < 15; i++) soma += Number(cns[i]) * (15 - i);
  return soma % 11 === 0;
}
