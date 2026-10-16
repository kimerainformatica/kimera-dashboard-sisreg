import { normalizarTexto } from '../lib/texto.js';

// Specialty catalogue. Only `visivel` ones show up in the interface; the
// import still classifies and stores every specialty.
export const ESPECIALIDADES = [
  { slug: 'ortodontia', nome: 'Ortodontia', visivel: true, ordem: 1 },
  { slug: 'clinica-geral', nome: 'Clínica Geral', ordem: 2 },
  { slug: 'dentistica', nome: 'Dentística', ordem: 3 },
  { slug: 'endodontia', nome: 'Endodontia', ordem: 4 },
  { slug: 'periodontia', nome: 'Periodontia', ordem: 5 },
  { slug: 'protese', nome: 'Prótese Dentária', ordem: 6 },
  { slug: 'cirurgia', nome: 'Cirurgia Buco-Maxilo-Facial', ordem: 7 },
  { slug: 'odontopediatria', nome: 'Odontopediatria', ordem: 8 },
  { slug: 'pne', nome: 'Pacientes com Necessidades Especiais', ordem: 9 },
  { slug: 'estomatologia', nome: 'Estomatologia', ordem: 10 },
  { slug: 'radiologia', nome: 'Radiologia', ordem: 11 },
  { slug: 'sorrir-movel', nome: 'Sorrir Móvel', ordem: 12 },
];

/*
 * How the unit's export encodes the specialty (checked on Jun–Sep/2026 files):
 * the first 4 digits of `codigo_interno` group procedures by specialty
 * schedule. Three groups are shared consultation schedules (0598 = first
 * visit, 0710 = return, 2018 = return/local agenda) and must be mapped code by
 * code; everything else maps by prefix.
 */
const POR_PREFIXO = {
  '0250': 'endodontia',
  '0251': 'protese',
  '0252': 'estomatologia',
  '0253': 'dentistica',
  '0254': 'odontopediatria',
  '0255': 'cirurgia',
  '0256': 'periodontia',
  '0257': 'ortodontia',
  '0259': 'radiologia',
  '0267': 'pne',
  '1009': 'clinica-geral',
  '0120': 'sorrir-movel',
};

const POR_CODIGO = {
  '0598041': ['clinica-geral', 'consulta'],
  '0598025': ['dentistica', 'consulta'],
  '0598016': ['cirurgia', 'consulta'],
  '0598022': ['endodontia', 'consulta'],
  '0598038': ['pne', 'consulta'],
  '0598027': ['periodontia', 'consulta'],
  '0598026': ['odontopediatria', 'consulta'],
  '0598023': ['protese', 'consulta'],
  '0598024': ['estomatologia', 'consulta'],
  '0710552': ['endodontia', 'retorno'],
  '0710556': ['protese', 'retorno'],
  '0710555': ['periodontia', 'retorno'],
  '2018486': ['ortodontia', 'retorno'],
  '2018661': ['sorrir-movel', 'consulta'],
  '2018436': ['radiologia', 'consulta'],
};

const PREFIXOS_AGENDA = new Set(['0598', '0710', '2018']);

// Fallback for consultation codes that appear later: specialty by keyword.
const PALAVRAS_CHAVE = [
  ['ortodont', 'ortodontia'],
  ['endodont', 'endodontia'],
  ['periodont', 'periodontia'],
  ['protese', 'protese'],
  ['dentistica', 'dentistica'],
  ['cirurgia', 'cirurgia'],
  ['odontopediatr', 'odontopediatria'],
  ['necessidade espe', 'pne'],
  ['estomatolog', 'estomatologia'],
  ['radiolog', 'radiologia'],
  ['clinico geral', 'clinica-geral'],
  ['agenda local', 'sorrir-movel'],
  ['movel', 'sorrir-movel'],
];

/**
 * Classifies a SISREG procedure code.
 * Returns { especialidade: slug|null, categoria: 'consulta'|'retorno'|'procedimento' }.
 * Consultations/returns are the scheduled appointments (attendance and misses
 * are measured on them); 'procedimento' rows are what was done in the visit.
 */
export function classificarProcedimento(codigoInterno, descricao = '') {
  const codigo = (codigoInterno ?? '').toString().trim();
  if (POR_CODIGO[codigo]) {
    const [especialidade, categoria] = POR_CODIGO[codigo];
    return { especialidade, categoria };
  }
  const prefixo = codigo.slice(0, 4);
  if (PREFIXOS_AGENDA.has(prefixo)) {
    const texto = normalizarTexto(descricao);
    const achado = PALAVRAS_CHAVE.find(([termo]) => texto.includes(termo));
    return {
      especialidade: achado ? achado[1] : null,
      categoria: /retorno/.test(texto) ? 'retorno' : 'consulta',
    };
  }
  return { especialidade: POR_PREFIXO[prefixo] ?? null, categoria: 'procedimento' };
}

/**
 * Orthodontic milestones, by national SIGTAP code (codigo_unificado), which
 * is stable across units — unlike the unit's internal codes.
 */
export const MARCOS_ORTODONTIA = {
  instalacao_fixo: { sigtap: '0307040119', rotulo: 'Instalação de aparelho fixo' },
  aparelho_removivel: { sigtap: '0701070021', rotulo: 'Aparelho removível' },
  manutencao: { sigtap: '0307040127', rotulo: 'Manutenção/conserto de aparelho' },
  moldagem: { sigtap: '0307040178', rotulo: 'Moldagem ortodôntica' },
};
