// Date helpers. Dates in the DB are stored as 'YYYY-MM-DD' (or
// 'YYYY-MM-DD HH:MM:SS' for appointments) and are treated as LOCAL time —
// never as UTC — so a Brazilian clinic does not see off-by-one-day metrics.

const MS_DIA = 24 * 60 * 60 * 1000;

function dataValida(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function iso(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Parses the date formats that show up in Brazilian spreadsheets and gov't
 * exports (SISREG included) and returns 'YYYY-MM-DD' or null:
 *   DD/MM/YYYY, DD/MM/YY, DD-MM-YYYY, DD.MM.YYYY, YYYY-MM-DD, YYYY/MM/DD,
 *   YYYYMMDD, any of them followed by a time (HH:MM[:SS]), ISO datetimes,
 *   and Excel serial numbers (e.g. 45123).
 */
export function parseDataFlex(valor) {
  if (valor == null) return null;
  const v = valor.toString().trim();
  if (!v) return null;

  let m;
  if ((m = v.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T].*)?$/))) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    return dataValida(y, mo, d) ? iso(y, mo, d) : null;
  }
  if ((m = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:[ T,].*)?$/))) {
    const d = Number(m[1]), mo = Number(m[2]);
    let y = Number(m[3]);
    if (m[3].length === 2) y += y < 50 ? 2000 : 1900;
    if (m[3].length === 3) return null;
    return dataValida(y, mo, d) ? iso(y, mo, d) : null;
  }
  if ((m = v.match(/^(\d{4})(\d{2})(\d{2})$/))) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    return dataValida(y, mo, d) ? iso(y, mo, d) : null;
  }
  // Excel serial date (days since 1899-12-30). Only a plausible range is accepted.
  if (/^\d{5}$/.test(v)) {
    const serial = Number(v);
    if (serial > 20000 && serial < 80000) {
      const dt = new Date(Date.UTC(1899, 11, 30) + serial * MS_DIA);
      return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
    }
  }
  return null;
}

/** Local-time Date from 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM[:SS]' / ISO strings. */
export function paraDataLocal(texto) {
  if (texto instanceof Date) return texto;
  if (!texto) return null;
  const v = texto.toString().trim();
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)
  );
}

export function hojeISO() {
  const d = new Date();
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

export function agoraSQL() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Whole days from `dataTexto` to `referencia` (local midnight to local midnight). */
export function diffDias(dataTexto, referencia = new Date()) {
  const d = paraDataLocal(dataTexto);
  if (!d) return null;
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const b = new Date(referencia.getFullYear(), referencia.getMonth(), referencia.getDate());
  return Math.round((b - a) / MS_DIA);
}

/** Adds calendar months (clamping the day of month) and returns 'YYYY-MM-DD'. */
export function somarMeses(dataTexto, meses) {
  const d = paraDataLocal(dataTexto);
  if (!d) return null;
  const alvo = new Date(d.getFullYear(), d.getMonth() + meses, 1);
  const ultimoDia = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d.getDate(), ultimoDia));
  return iso(alvo.getFullYear(), alvo.getMonth() + 1, alvo.getDate());
}

export function idadeEmAnos(dataNascimento, referencia = new Date()) {
  const d = paraDataLocal(dataNascimento);
  if (!d) return null;
  let idade = referencia.getFullYear() - d.getFullYear();
  const aniversarioPassou =
    referencia.getMonth() > d.getMonth() ||
    (referencia.getMonth() === d.getMonth() && referencia.getDate() >= d.getDate());
  if (!aniversarioPassou) idade--;
  return idade;
}

export function ehDataISO(texto) {
  return typeof texto === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(texto) && parseDataFlex(texto) === texto;
}

/** Accepts 'YYYY-MM-DDTHH:MM' (datetime-local input) or 'YYYY-MM-DD HH:MM[:SS]' and returns SQL form. */
export function normalizarDataHora(valor) {
  if (!valor) return null;
  const v = valor.toString().trim();
  const m = v.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    if (!ehDataISO(m[1])) return null;
    return `${m[1]} ${m[2]}:${m[3]}:${m[4] ?? '00'}`;
  }
  const soData = parseDataFlex(v);
  return soData ? `${soData} 00:00:00` : null;
}
