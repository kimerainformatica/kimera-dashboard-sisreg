// Shared display helpers so every screen names the same thing the same way.

export const NIVEIS_ALERTA = [
  { value: 'critico', label: 'Crítico (faltas seguidas)' },
  { value: 'sem_retorno', label: 'Sem retorno' },
  { value: 'faltoso', label: 'Faltoso' },
  { value: 'em_dia', label: 'Em dia' },
  { value: 'encerrado', label: 'Encerrado' },
];

// Attendance (compareceu/falta) exists only for consultations; procedure rows
// get their own neutral statuses and never count as a miss.
export const STATUS_SOLICITACAO = [
  { value: 'compareceu', label: 'Compareceu' },
  { value: 'falta', label: 'Falta' },
  { value: 'realizado', label: 'Procedimento realizado' },
  { value: 'nao_confirmado', label: 'Procedimento não confirmado' },
  { value: 'agendado', label: 'Agendado' },
  { value: 'sem_atualizacao', label: 'Sem atualização' },
];

export const STATUS_ACOMPANHAMENTO = [
  { value: 'em_tratamento', label: 'Em tratamento' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'abandonou', label: 'Abandonou' },
  { value: 'transferido', label: 'Transferido' },
];

export const TIPOS_SOLICITACAO = [
  { value: 'agenda', label: 'Consulta / retorno' },
  { value: 'producao', label: 'Procedimentos' },
];

export const CATEGORIAS_PROCEDIMENTO = [
  { value: 'consulta', label: 'Consulta (agenda)' },
  { value: 'retorno', label: 'Retorno (agenda)' },
  { value: 'procedimento', label: 'Procedimento (produção)' },
];

const porValor = (lista) => (v) => lista.find((x) => x.value === v)?.label ?? v ?? '—';
export const labelNivel = porValor(NIVEIS_ALERTA);
export const labelStatusSolicitacao = porValor(STATUS_SOLICITACAO);
export const labelAcompanhamento = porValor(STATUS_ACOMPANHAMENTO);
export const labelCategoria = porValor(CATEGORIAS_PROCEDIMENTO);

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** '2026-09' → 'set/2026' */
export function formatarMes(anoMes) {
  if (!anoMes) return '—';
  const [y, m] = anoMes.split('-');
  return `${MESES[Number(m) - 1]}/${y}`;
}

/** First and last day of a 'YYYY-MM' month. */
export function limitesMes(anoMes) {
  const [y, m] = anoMes.split('-').map(Number);
  const ultimo = new Date(y, m, 0).getDate();
  return { inicio: `${anoMes}-01`, fim: `${anoMes}-${String(ultimo).padStart(2, '0')}` };
}

export function formatarData(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

export function formatarDataHora(iso) {
  if (!iso) return '—';
  const [data, hora = ''] = iso.replace('T', ' ').split(' ');
  return `${formatarData(data)}${hora ? ` ${hora.slice(0, 5)}` : ''}`;
}

export function formatarPct(v, casas = 0) {
  return v == null ? '—' : `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

export function formatarNumero(n) {
  return n == null ? '—' : Number(n).toLocaleString('pt-BR');
}

export function formatarDias(n) {
  if (n == null) return '—';
  if (Math.abs(n) < 60) return `${n} d`;
  const meses = Math.round(n / 30.44);
  return meses < 24 ? `${meses} m` : `${(n / 365.25).toFixed(1)} a`;
}

/** 'MARIA DA SILVA' → 'Maria da Silva' for display (SISREG sends upper case). */
export function nomeProprio(nome) {
  if (!nome) return nome;
  const minusculas = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
  return nome.toLowerCase().split(' ').map((p, i) => (i > 0 && minusculas.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}

/** Phone numbers as separate tappable entries. */
export function listarTelefones(texto) {
  if (!texto) return [];
  return [...new Set(texto.split('/').map((t) => t.trim()).filter(Boolean))];
}

/** 'MARIA DE SOUZA DA SILVA' → 'Maria Silva' (first + last name) for tight columns. */
export function nomeCurto(nome) {
  const partes = (nomeProprio(nome) ?? '').split(' ').filter(Boolean);
  return partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1]}` : partes[0] ?? '—';
}
