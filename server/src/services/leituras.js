import { consultar, primeiro, lerConfiguracoes, versaoDados } from '../db.js';
import { diffDias, somarMeses, idadeEmAnos, hojeISO, paraDataLocal } from '../lib/datas.js';
import { normalizarTexto, somenteDigitos } from '../lib/texto.js';
import { ErroValidacao } from '../lib/erros.js';
import { MARCOS_ORTODONTIA } from '../sisreg/classificacao.js';

/*
 * Status of one SISREG solicitação (see "Como calculamos"). Attendance and
 * misses are measured ONLY on consultations/returns (tipo 'agenda');
 * procedure rows (tipo 'producao') never count as a miss nor as attendance.
 * - compareceu       consultation CONFIRMADO.
 * - falta            consultation PENDENTE whose date is before the export
 *                    that reported it.
 * - realizado        procedure CONFIRMADO.
 * - nao_confirmado   procedure PENDENTE in the past — not a miss.
 * - agendado         PENDENTE, date on/after the export and on/after the data
 *                    reference date — a future appointment.
 * - sem_atualizacao  PENDENTE, date on/after its export but already in the
 *                    past: the month needs a newer export to know the outcome.
 */
export const STATUS = ['compareceu', 'falta', 'realizado', 'nao_confirmado', 'agendado', 'sem_atualizacao'];

export function statusSolicitacao({ situacao, tipo, data_hora, situacao_em }, referencia) {
  const consulta = tipo === 'agenda';
  if (situacao === 'CONFIRMADO') return consulta ? 'compareceu' : 'realizado';
  const dia = data_hora.slice(0, 10);
  if (dia < situacao_em) return consulta ? 'falta' : 'nao_confirmado';
  return dia >= referencia ? 'agendado' : 'sem_atualizacao';
}

/** Same rule as statusSolicitacao, as SQL over alias `s` (one bound param: referencia). */
export const SQL_STATUS = `CASE
  WHEN s.situacao = 'CONFIRMADO' THEN IF(s.tipo = 'agenda', 'compareceu', 'realizado')
  WHEN DATE(s.data_hora) < s.situacao_em THEN IF(s.tipo = 'agenda', 'falta', 'nao_confirmado')
  WHEN DATE(s.data_hora) >= ? THEN 'agendado'
  ELSE 'sem_atualizacao' END`;

export const NIVEIS = ['critico', 'sem_retorno', 'faltoso', 'em_dia', 'encerrado'];
const ORDEM_NIVEL = Object.fromEntries(NIVEIS.map((n, i) => [n, i]));
export const STATUS_ACOMPANHAMENTO = ['em_tratamento', 'concluido', 'abandonou', 'transferido'];
const ENCERRADOS = new Set(['concluido', 'abandonou', 'transferido']);

export async function obterEspecialidade(slug) {
  const e = await primeiro('SELECT id, slug, nome, visivel FROM especialidades WHERE slug = ?', [slug]);
  if (!e) {
    const err = new Error('Especialidade não encontrada');
    err.status = 404;
    throw err;
  }
  return e;
}

/**
 * Reference date of the data: the last day with a confirmed attendance in
 * any specialty (capped at today). "Days without return" and "future
 * appointment" are measured against it, not against today — the exports
 * only cover the months that were imported.
 */
export async function dataReferencia() {
  const r = await primeiro(`SELECT DATE_FORMAT(MAX(data_hora), '%Y-%m-%d') AS ref FROM solicitacoes WHERE situacao = 'CONFIRMADO'`);
  const hoje = hojeISO();
  return r?.ref && r.ref < hoje ? r.ref : hoje;
}

// ---------------------------------------------------------------------------
// Per-specialty readings, cached until the next write (versaoDados) or day change.
// ---------------------------------------------------------------------------

const cache = new Map();

export async function leiturasEspecialidade(slug) {
  const chaveVersao = `${versaoDados()}|${hojeISO()}`;
  const emCache = cache.get(slug);
  if (emCache && emCache.chave === chaveVersao) return emCache.valor;
  const valor = await calcularLeituras(slug);
  cache.set(slug, { chave: chaveVersao, valor });
  return valor;
}

async function calcularLeituras(slug) {
  const especialidade = await obterEspecialidade(slug);
  const { valores: cfg } = await lerConfiguracoes(slug);
  const referencia = await dataReferencia();
  const inicioJanela = cfg.janela_faltas_meses > 0 ? somarMeses(referencia, -cfg.janela_faltas_meses) : null;

  const solicitacoes = await consultar(
    `SELECT id, paciente_id, profissional_id, tipo, data_hora, situacao, DATE_FORMAT(situacao_em, '%Y-%m-%d') AS situacao_em
     FROM solicitacoes WHERE especialidade_id = ? ORDER BY data_hora, id`,
    [especialidade.id]
  );
  const itens = await consultar(
    `SELECT i.solicitacao_id, i.codigo_interno, p.codigo_unificado, p.descricao, p.categoria
     FROM solicitacao_itens i
     JOIN solicitacoes s ON s.id = i.solicitacao_id
     JOIN procedimentos p ON p.codigo_interno = i.codigo_interno
     WHERE s.especialidade_id = ?`,
    [especialidade.id]
  );
  const pacientesBase = await consultar(
    `SELECT p.id, p.cns, p.nome, DATE_FORMAT(p.data_nascimento, '%Y-%m-%d') AS data_nascimento, p.sexo,
            p.telefones, p.telefone_principal, p.bairro, p.municipio
     FROM pacientes p WHERE p.id IN (SELECT paciente_id FROM solicitacoes WHERE especialidade_id = ?)`,
    [especialidade.id]
  );
  const profissionais = await consultar(
    `SELECT id, nome FROM profissionais WHERE id IN (SELECT profissional_id FROM solicitacoes WHERE especialidade_id = ?) ORDER BY nome`,
    [especialidade.id]
  );
  const acompanhamentos = await consultar(
    'SELECT paciente_id, status, observacoes FROM acompanhamentos WHERE especialidade_id = ?',
    [especialidade.id]
  );

  const nomeProf = new Map(profissionais.map((p) => [p.id, p.nome]));
  const acompPorPaciente = new Map(acompanhamentos.map((a) => [a.paciente_id, a]));
  const itensPorSol = new Map();
  for (const i of itens) {
    if (!itensPorSol.has(i.solicitacao_id)) itensPorSol.set(i.solicitacao_id, []);
    itensPorSol.get(i.solicitacao_id).push(i);
  }

  for (const s of solicitacoes) {
    s.dia = s.data_hora.slice(0, 10);
    s.status = statusSolicitacao(s, referencia);
    s.itens = itensPorSol.get(s.id) ?? [];
  }

  const porPaciente = new Map();
  for (const s of solicitacoes) {
    if (!porPaciente.has(s.paciente_id)) porPaciente.set(s.paciente_id, []);
    porPaciente.get(s.paciente_id).push(s);
  }

  const ehOrto = slug === 'ortodontia';
  const sigtapMarco = Object.fromEntries(Object.entries(MARCOS_ORTODONTIA).map(([k, m]) => [m.sigtap, k]));
  const refData = paraDataLocal(referencia);

  const pacientes = pacientesBase.map((p) => {
    const sols = porPaciente.get(p.id) ?? [];
    const metricas = metricasPaciente(sols, { referencia, inicioJanela, cfg });
    const acomp = acompPorPaciente.get(p.id);
    const ultimaSol = sols[sols.length - 1];

    let nivel = 'em_dia';
    if (acomp?.status && ENCERRADOS.has(acomp.status)) nivel = 'encerrado';
    else if (metricas.alertas.critico) nivel = 'critico';
    else if (metricas.alertas.semRetorno) nivel = 'sem_retorno';
    else if (metricas.faltas > 0) nivel = 'faltoso';

    const extra = {};
    if (ehOrto) {
      let instalacao = null;
      let manutencoes = 0;
      for (const s of sols) {
        if (s.status !== 'realizado' && s.status !== 'compareceu') continue;
        for (const i of s.itens) {
          const marco = sigtapMarco[i.codigo_unificado];
          if ((marco === 'instalacao_fixo' || marco === 'aparelho_removivel') && !instalacao) {
            instalacao = { data: s.dia, tipo: marco === 'instalacao_fixo' ? 'fixo' : 'removivel' };
          }
          if (marco === 'manutencao') manutencoes++;
        }
      }
      extra.instalacao = instalacao;
      extra.manutencoes = manutencoes;
    }

    return {
      ...p,
      idade: idadeEmAnos(p.data_nascimento, refData),
      profissional_id: ultimaSol?.profissional_id ?? null,
      profissional_nome: nomeProf.get(ultimaSol?.profissional_id) ?? null,
      acompanhamento_status: acomp?.status ?? null,
      tem_observacoes: Boolean(acomp?.observacoes),
      ...metricas,
      nivel,
      ...extra,
    };
  });

  return { especialidade, cfg, referencia, inicioJanela, solicitacoes, pacientes, profissionais, nomeProf };
}

/**
 * Attendance metrics of one patient within a specialty, per DAY.
 * Misses and attendance rate look ONLY at consultations/returns: a day whose
 * consultation was confirmed is one attendance, a day whose consultation was
 * missed is one miss — procedures that day neither cause nor cancel a miss.
 * Visit dates (first/last visit, days without return) still use any
 * confirmed row, procedures included, since the patient was in the clinic.
 */
export function metricasPaciente(sols, { referencia, inicioJanela, cfg }) {
  const dias = new Map();
  for (const s of sols) {
    const d = dias.get(s.dia) ?? { dia: s.dia, compareceu: false, falta: false, presenca: false, agendado: false, semAtualizacao: false };
    if (s.status === 'compareceu') { d.compareceu = true; d.presenca = true; }
    else if (s.status === 'realizado') d.presenca = true;
    else if (s.status === 'falta') d.falta = true;
    else if (s.status === 'agendado') d.agendado = true;
    else if (s.status === 'sem_atualizacao' && s.tipo !== 'producao') d.semAtualizacao = true;
    dias.set(s.dia, d);
  }
  const ordenados = [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia));
  const consultas = ordenados.filter((d) => d.compareceu || d.falta);
  const comparecidos = consultas.filter((d) => d.compareceu);
  const faltasDias = consultas.filter((d) => !d.compareceu);
  const faltasJanela = inicioJanela ? faltasDias.filter((d) => d.dia >= inicioJanela) : faltasDias;

  let faltasConsecutivas = 0;
  for (let i = consultas.length - 1; i >= 0 && !consultas[i].compareceu; i--) faltasConsecutivas++;

  const presencas = ordenados.filter((d) => d.presenca);
  const futuros = ordenados.filter((d) => !d.presenca && d.agendado);
  const primeiraVisita = presencas[0]?.dia ?? null;
  const ultimaVisita = presencas[presencas.length - 1]?.dia ?? null;
  const proximoAgendamento = futuros[0]?.dia ?? null;
  const ultimaFalta = faltasDias[faltasDias.length - 1]?.dia ?? null;
  const refDate = paraDataLocal(referencia);
  const base = ultimaVisita ?? ordenados[0]?.dia ?? null;
  const diasSemRetorno = base ? Math.max(0, diffDias(base, refDate)) : null;

  const totalRealizados = comparecidos.length + faltasDias.length;
  return {
    primeiraVisita,
    ultimaVisita,
    ultimaFalta,
    proximoAgendamento,
    comparecimentos: comparecidos.length,
    faltas: faltasJanela.length,
    faltasHistorico: faltasDias.length,
    faltasConsecutivas,
    semAtualizacao: ordenados.filter((d) => d.semAtualizacao && !d.compareceu && !d.falta).length,
    taxaComparecimento: totalRealizados ? comparecidos.length / totalRealizados : null,
    diasSemRetorno,
    alertas: {
      critico: faltasConsecutivas >= cfg.faltas_alerta_criticas,
      semRetorno: !proximoAgendamento && diasSemRetorno != null && diasSemRetorno >= cfg.dias_sem_retorno_alerta,
    },
  };
}

// ---------------------------------------------------------------------------
// Patient ranking with filters.
// ---------------------------------------------------------------------------

const ORDENACOES = {
  alerta: (a, b) => ORDEM_NIVEL[a.nivel] - ORDEM_NIVEL[b.nivel] || b.faltasConsecutivas - a.faltasConsecutivas || (b.diasSemRetorno ?? 0) - (a.diasSemRetorno ?? 0),
  faltas: (a, b) => b.faltas - a.faltas || b.faltasConsecutivas - a.faltasConsecutivas,
  faltas_consecutivas: (a, b) => b.faltasConsecutivas - a.faltasConsecutivas || b.faltas - a.faltas,
  dias_sem_retorno: (a, b) => (b.diasSemRetorno ?? -1) - (a.diasSemRetorno ?? -1),
  comparecimento: (a, b) => (a.taxaComparecimento ?? 2) - (b.taxaComparecimento ?? 2),
  ultima_visita: (a, b) => (b.ultimaVisita ?? '').localeCompare(a.ultimaVisita ?? ''),
  primeira_visita: (a, b) => (a.primeiraVisita ?? '9').localeCompare(b.primeiraVisita ?? '9'),
  proximo: (a, b) => (a.proximoAgendamento ?? '9').localeCompare(b.proximoAgendamento ?? '9'),
  nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
  idade: (a, b) => (a.idade ?? 999) - (b.idade ?? 999),
};
export const CHAVES_ORDENACAO = Object.keys(ORDENACOES);

function inteiroOuNulo(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new ErroValidacao(`Valor numérico inválido: ${v}`);
  return n;
}

export function filtrarPacientes(pacientes, f = {}) {
  const busca = normalizarTexto(f.busca);
  const buscaDigitos = somenteDigitos(f.busca);
  const niveis = f.nivel ? String(f.nivel).split(',') : null;
  const faltasMin = inteiroOuNulo(f.faltas_min);
  const idadeMin = inteiroOuNulo(f.idade_min);
  const idadeMax = inteiroOuNulo(f.idade_max);
  const diasMin = inteiroOuNulo(f.dias_sem_retorno_min);
  const profissional = f.profissional_id ? Number(f.profissional_id) : null;
  const municipio = f.municipio ? normalizarTexto(f.municipio) : null;

  return pacientes.filter((p) => {
    if (busca) {
      const porNome = normalizarTexto(p.nome).includes(busca);
      const porNumero = buscaDigitos.length >= 4 && (p.cns.includes(buscaDigitos) || (p.telefones && somenteDigitos(p.telefones).includes(buscaDigitos)));
      if (!porNome && !porNumero) return false;
    }
    if (niveis && !niveis.includes(p.nivel)) return false;
    if (profissional && p.profissional_id !== profissional) return false;
    if (faltasMin != null && p.faltas < faltasMin) return false;
    if (idadeMin != null && (p.idade == null || p.idade < idadeMin)) return false;
    if (idadeMax != null && (p.idade == null || p.idade > idadeMax)) return false;
    if (diasMin != null && (p.diasSemRetorno == null || p.diasSemRetorno < diasMin)) return false;
    if (f.sexo && p.sexo !== f.sexo) return false;
    if (municipio && normalizarTexto(p.municipio) !== municipio) return false;
    if (f.acompanhamento) {
      if (f.acompanhamento === 'sem' ? p.acompanhamento_status : p.acompanhamento_status !== f.acompanhamento) return false;
    }
    if (f.aparelho) {
      if (f.aparelho === 'sem' ? p.instalacao : p.instalacao?.tipo !== f.aparelho) return false;
    }
    if (f.sem_agendamento === 'true' && p.proximoAgendamento) return false;
    if (f.primeira_visita_de && (!p.primeiraVisita || p.primeiraVisita < f.primeira_visita_de)) return false;
    if (f.primeira_visita_ate && (!p.primeiraVisita || p.primeiraVisita > f.primeira_visita_ate)) return false;
    return true;
  });
}

export function ordenarPacientes(lista, ordenarPor = 'alerta', direcao = '') {
  const cmp = ORDENACOES[ordenarPor] ?? ORDENACOES.alerta;
  const ordenada = [...lista].sort((a, b) => cmp(a, b) || a.nome.localeCompare(b.nome, 'pt-BR'));
  if (direcao === 'asc' && ordenarPor !== 'nome') ordenada.reverse();
  if (direcao === 'desc' && ordenarPor === 'nome') ordenada.reverse();
  return ordenada;
}

// ---------------------------------------------------------------------------
// Overview ("painel") for a period.
// ---------------------------------------------------------------------------

function novoContador() {
  return { agendadas: 0, comparecimentos: 0, faltas: 0, aguardando: 0, semAtualizacao: 0, pacientes: new Set() };
}

function contar(acc, s) {
  if (s.tipo === 'agenda') {
    acc.agendadas++;
    if (s.status === 'compareceu') acc.comparecimentos++;
    else if (s.status === 'falta') acc.faltas++;
    else if (s.status === 'agendado') acc.aguardando++;
    else if (s.status === 'sem_atualizacao') acc.semAtualizacao++;
  }
  if (s.status === 'compareceu' || s.status === 'realizado') acc.pacientes.add(s.paciente_id);
}

function fecharContador(acc) {
  const realizadas = acc.comparecimentos + acc.faltas;
  return {
    agendadas: acc.agendadas,
    comparecimentos: acc.comparecimentos,
    faltas: acc.faltas,
    aguardando: acc.aguardando,
    semAtualizacao: acc.semAtualizacao,
    pacientesAtendidos: acc.pacientes.size,
    taxaFaltas: realizadas ? acc.faltas / realizadas : null,
  };
}

export async function painel(slug, { inicio, fim, profissional_id } = {}) {
  const L = await leiturasEspecialidade(slug);
  const profissional = profissional_id ? Number(profissional_id) : null;
  const doProf = profissional ? L.solicitacoes.filter((s) => s.profissional_id === profissional) : L.solicitacoes;

  const meses = new Map();
  for (const s of L.solicitacoes) {
    const m = s.dia.slice(0, 7);
    meses.set(m, (meses.get(m) ?? 0) + 1);
  }
  const mesesDisponiveis = [...meses.keys()].sort();
  const dataMin = L.solicitacoes[0]?.dia ?? null;
  const dataMax = L.solicitacoes[L.solicitacoes.length - 1]?.dia ?? null;
  const ini = inicio || dataMin;
  const fi = fim || dataMax;
  const noPeriodo = doProf.filter((s) => (!ini || s.dia >= ini) && (!fi || s.dia <= fi));

  const total = novoContador();
  const porMes = new Map();
  const porProf = new Map();
  const procs = new Map();
  for (const s of noPeriodo) {
    contar(total, s);
    const pp = porProf.get(s.profissional_id) ?? novoContador();
    contar(pp, s);
    porProf.set(s.profissional_id, pp);
    if (s.status === 'compareceu' || s.status === 'realizado') {
      for (const i of s.itens) {
        if (i.categoria !== 'procedimento') continue;
        const chave = i.codigo_unificado || i.codigo_interno;
        const acc = procs.get(chave) ?? { codigo: chave, descricao: i.descricao, quantidade: 0 };
        acc.quantidade++;
        procs.set(chave, acc);
      }
    }
  }
  // The monthly series ignores the period filter (it is the context around it).
  for (const s of doProf) {
    const m = s.dia.slice(0, 7);
    const acc = porMes.get(m) ?? novoContador();
    contar(acc, s);
    porMes.set(m, acc);
  }

  // First attendance ever (in the imported data) falling inside the period.
  const pacientesDoPeriodo = profissional ? L.pacientes.filter((p) => p.profissional_id === profissional) : L.pacientes;
  const novos = pacientesDoPeriodo.filter((p) => p.primeiraVisita && p.primeiraVisita >= ini && p.primeiraVisita <= fi).length;

  const alertas = Object.fromEntries(NIVEIS.map((n) => [n, 0]));
  for (const p of pacientesDoPeriodo) alertas[p.nivel]++;

  const resumo = fecharContador(total);
  const extra = {};
  if (slug === 'ortodontia') {
    const porMarco = (k) => procs.get(MARCOS_ORTODONTIA[k].sigtap)?.quantidade ?? 0;
    extra.ortodontia = {
      instalacoesFixo: porMarco('instalacao_fixo'),
      aparelhosRemoviveis: porMarco('aparelho_removivel'),
      manutencoes: porMarco('manutencao'),
      moldagens: porMarco('moldagem'),
    };
  }

  return {
    especialidade: L.especialidade,
    referencia: L.referencia,
    dadosDesde: dataMin,
    dadosAte: dataMax,
    mesesDisponiveis,
    periodo: { inicio: ini, fim: fi },
    kpis: { ...resumo, pacientesNovos: novos, novosConfiavel: Boolean(dataMin && ini > dataMin), procedimentosRealizados: [...procs.values()].reduce((s, p) => s + p.quantidade, 0) },
    alertas,
    serieMensal: [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, acc]) => ({ mes, ...fecharContador(acc) })),
    porProfissional: [...porProf.entries()]
      .map(([id, acc]) => ({ profissional_id: id, nome: L.nomeProf.get(id) ?? '—', ...fecharContador(acc) }))
      .sort((a, b) => b.agendadas - a.agendadas || b.pacientesAtendidos - a.pacientesAtendidos),
    procedimentos: [...procs.values()].sort((a, b) => b.quantidade - a.quantidade),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Appointment list (SQL, paginated) and one patient's full reading.
// ---------------------------------------------------------------------------

export async function listarAgenda(slug, f = {}, { page = 1, pageSize = 50 } = {}) {
  const esp = await obterEspecialidade(slug);
  const referencia = await dataReferencia();
  const where = ['s.especialidade_id = ?'];
  const params = [esp.id];
  if (f.data_de) { where.push('s.data_hora >= ?'); params.push(`${f.data_de} 00:00:00`); }
  if (f.data_ate) { where.push('s.data_hora <= ?'); params.push(`${f.data_ate} 23:59:59`); }
  if (f.profissional_id) { where.push('s.profissional_id = ?'); params.push(Number(f.profissional_id)); }
  if (f.tipo) { where.push('s.tipo = ?'); params.push(f.tipo); }
  if (f.paciente_id) { where.push('s.paciente_id = ?'); params.push(Number(f.paciente_id)); }
  if (f.busca) {
    const digitos = somenteDigitos(f.busca);
    if (digitos.length >= 4) { where.push('(p.cns LIKE ? OR s.id = ?)'); params.push(`%${digitos}%`, digitos); }
    else { where.push('p.nome LIKE ?'); params.push(`%${f.busca.trim()}%`); }
  }
  const statusSql = SQL_STATUS;
  let filtroStatus = '';
  const paramsStatus = [];
  if (f.status && STATUS.includes(f.status)) { filtroStatus = `AND (${statusSql}) = ?`; paramsStatus.push(referencia, f.status); }

  const base = `FROM solicitacoes s
    JOIN pacientes p ON p.id = s.paciente_id
    JOIN profissionais pr ON pr.id = s.profissional_id
    WHERE ${where.join(' AND ')} ${filtroStatus}`;
  const [{ total }] = await consultar(`SELECT COUNT(*) AS total ${base}`, [...params, ...paramsStatus]);
  const pagina = Math.max(1, Number(page) || 1);
  const tamanho = Math.min(500, Math.max(1, Number(pageSize) || 50));
  const linhas = await consultar(
    `SELECT s.id, s.data_hora, s.tipo, s.situacao, DATE_FORMAT(s.situacao_em, '%Y-%m-%d') AS situacao_em, ${statusSql} AS status,
            s.paciente_id, p.nome AS paciente_nome, p.cns, p.telefones,
            pr.nome AS profissional_nome, s.profissional_id,
            (SELECT GROUP_CONCAT(pc.descricao ORDER BY pc.categoria, pc.descricao SEPARATOR ' · ')
               FROM solicitacao_itens i JOIN procedimentos pc ON pc.codigo_interno = i.codigo_interno
              WHERE i.solicitacao_id = s.id) AS procedimentos
     ${base}
     ORDER BY s.data_hora ${f.ordem === 'asc' ? 'ASC' : 'DESC'}, s.id
     LIMIT ? OFFSET ?`,
    [referencia, ...params, ...paramsStatus, tamanho, (pagina - 1) * tamanho]
  );
  return { items: linhas, total, page: pagina, pageSize: tamanho, totalPages: Math.max(1, Math.ceil(total / tamanho)), referencia };
}

export async function detalhePaciente(slug, pacienteId) {
  const L = await leiturasEspecialidade(slug);
  const leitura = L.pacientes.find((p) => p.id === pacienteId);
  const cadastro = await primeiro(
    `SELECT id, cns, nome, DATE_FORMAT(data_nascimento, '%Y-%m-%d') AS data_nascimento, sexo, nome_mae, telefones,
            telefone_principal, tipo_logradouro, logradouro, numero, complemento, bairro, cep, municipio,
            DATE_FORMAT(dados_em, '%Y-%m-%d') AS dados_em
     FROM pacientes WHERE id = ?`,
    [pacienteId]
  );
  if (!cadastro) {
    const err = new Error('Paciente não encontrado');
    err.status = 404;
    throw err;
  }
  const historico = L.solicitacoes
    .filter((s) => s.paciente_id === pacienteId)
    .map((s) => ({
      id: s.id,
      data_hora: s.data_hora,
      tipo: s.tipo,
      status: s.status,
      profissional_nome: L.nomeProf.get(s.profissional_id) ?? null,
      procedimentos: s.itens.map((i) => ({ codigo: i.codigo_interno, descricao: i.descricao, categoria: i.categoria })),
    }))
    .reverse();

  const referencia = L.referencia;
  const outras = await consultar(
    `SELECT e.slug, e.nome, COUNT(*) AS solicitacoes,
            SUM((${SQL_STATUS}) = 'falta') AS faltas,
            SUM(s.tipo = 'agenda' AND s.situacao = 'CONFIRMADO') AS comparecimentos,
            DATE_FORMAT(MAX(s.data_hora), '%Y-%m-%d') AS ultima
     FROM solicitacoes s LEFT JOIN especialidades e ON e.id = s.especialidade_id
     WHERE s.paciente_id = ? AND (s.especialidade_id IS NULL OR s.especialidade_id <> ?)
     GROUP BY e.slug, e.nome ORDER BY ultima DESC`,
    [referencia, pacienteId, L.especialidade.id]
  );
  const acomp = await primeiro(
    `SELECT a.status, a.observacoes, a.atualizado_em, u.nome AS atualizado_por
     FROM acompanhamentos a LEFT JOIN usuarios u ON u.id = a.atualizado_por
     WHERE a.paciente_id = ? AND a.especialidade_id = ?`,
    [pacienteId, L.especialidade.id]
  );

  return {
    ...cadastro,
    ...(leitura ?? {}),
    idade: idadeEmAnos(cadastro.data_nascimento, paraDataLocal(referencia)),
    referencia,
    configuracao: L.cfg,
    historico,
    outrasEspecialidades: outras,
    acompanhamento: acomp,
  };
}
