// Text helpers shared by search, import and validation. Everything that
// compares user-typed or imported text goes through here so "José" == "jose".

export function semAcento(texto) {
  return (texto ?? '').toString().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Lowercase, accent-free, single-spaced — the canonical form stored in *_busca columns. */
export function normalizarTexto(texto) {
  return semAcento(texto).toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Header-style key: accents, punctuation and underscores collapse to single spaces. */
export function normalizarChave(texto) {
  return semAcento(texto)
    .toLowerCase()
    .replace(/[_\-./\\()[\]:]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function somenteDigitos(texto) {
  return (texto ?? '').toString().replace(/\D+/g, '');
}

/**
 * Extracts the first Brazilian phone number from a free-text cell (SISREG
 * often packs "(85) 99999-9999 / 3333-3333" or "85999999999 - mãe").
 * Returns { principal, outros } where principal is formatted and outros holds
 * any extra numbers so nothing is lost on import.
 */
export function extrairTelefones(texto) {
  const bruto = (texto ?? '').toString();
  if (!bruto.trim()) return { principal: null, outros: [] };
  const candidatos = bruto.match(/\+?\d[\d\s().-]{6,}\d/g) || [];
  const numeros = [];
  for (const c of candidatos) {
    let d = somenteDigitos(c);
    if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
    if (d.startsWith('0') && (d.length === 11 || d.length === 12)) d = d.slice(1);
    if (d.length >= 8 && d.length <= 11 && !numeros.includes(d)) numeros.push(d);
  }
  if (numeros.length === 0) return { principal: null, outros: [] };
  const [principal, ...outros] = numeros;
  return { principal: formatarTelefone(principal), outros: outros.map(formatarTelefone) };
}

export function formatarTelefone(digitos) {
  const d = somenteDigitos(digitos);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`;
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return d || null;
}

const SEXO_MAP = { m: 'M', masculino: 'M', masc: 'M', f: 'F', feminino: 'F', fem: 'F' };
export function normalizarSexo(valor) {
  const v = normalizarTexto(valor);
  return SEXO_MAP[v] ?? null;
}

export function capitalizarNome(nome) {
  const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  return (nome ?? '')
    .toString()
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .split(' ')
    .map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(' ');
}
