import crypto from 'node:crypto';
import { consultar, transacao } from '../db.js';
import { lerExportacao } from '../sisreg/leitor.js';
import { classificarProcedimento } from '../sisreg/classificacao.js';
import { ErroValidacao } from '../lib/erros.js';
import { hojeISO, ehDataISO } from '../lib/datas.js';

const LOTE = 1000;

function emLotes(lista, tamanho = LOTE) {
  const lotes = [];
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho));
  return lotes;
}

async function mapaEspecialidades(exec = consultar) {
  const linhas = await exec('SELECT id, slug, nome FROM especialidades');
  return { porSlug: new Map(linhas.map((e) => [e.slug, e])), porId: new Map(linhas.map((e) => [e.id, e])) };
}

/** Existing rows keyed by `chave`, fetched in chunks of an IN list. */
async function buscarExistentes(sql, valores, chave) {
  const mapa = new Map();
  for (const lote of emLotes(valores, 5000)) {
    if (!lote.length) continue;
    for (const l of await consultar(sql, [lote])) mapa.set(String(l[chave]), l);
  }
  return mapa;
}

/**
 * Specialty and kind of each procedure: the stored classification when the
 * code is known (it may have been corrected by hand), else the import rules.
 */
function classificacaoEfetiva(codigo, descricao, existentes, especialidades) {
  const ex = existentes.get(codigo);
  if (ex) {
    return { especialidade: especialidades.porId.get(ex.especialidade_id)?.slug ?? null, categoria: ex.categoria };
  }
  return classificarProcedimento(codigo, descricao);
}

// ---------------------------------------------------------------------------
// 1. Analysis — reads the file and compares it with the database without
//    writing anything. The parsed file is kept in memory under a token so the
//    confirmation does not upload 13 MB again.
// ---------------------------------------------------------------------------

const analises = new Map();
const VALIDADE_ANALISE_MS = 30 * 60 * 1000;

function limparAnalisesVencidas() {
  const agora = Date.now();
  for (const [token, a] of analises) if (agora - a.criadoEm > VALIDADE_ANALISE_MS) analises.delete(token);
}

export async function analisarArquivo(buffer, nomeArquivo, usuarioId) {
  limparAnalisesVencidas();
  const leitura = lerExportacao(buffer, nomeArquivo);
  const exportadoEm = leitura.exportadoEmSugerido ?? hojeISO();
  const resumo = await resumirLeitura(leitura, exportadoEm);
  const token = crypto.randomBytes(16).toString('hex');
  analises.set(token, { leitura, nomeArquivo, usuarioId, criadoEm: Date.now() });
  return { token, arquivo: nomeArquivo, ...resumo };
}

async function resumirLeitura(leitura, exportadoEm) {
  const especialidades = await mapaEspecialidades();
  const ids = [...leitura.solicitacoes.keys()];
  const existentes = await buscarExistentes(
    'SELECT id, situacao, situacao_em FROM solicitacoes WHERE id IN (?)', ids, 'id'
  );
  const pacientesExistentes = await buscarExistentes(
    'SELECT cns FROM pacientes WHERE cns IN (?)', [...leitura.pacientes.keys()], 'cns'
  );
  const procExistentes = await buscarExistentes(
    'SELECT codigo_interno, especialidade_id, categoria FROM procedimentos WHERE codigo_interno IN (?)',
    [...leitura.procedimentos.keys()], 'codigo_interno'
  );

  let novas = 0, atualizadas = 0, ignoradas = 0;
  const mudancas = { pendente_para_confirmado: 0, confirmado_para_pendente: 0 };
  const porEspecialidade = new Map();

  for (const s of leitura.solicitacoes.values()) {
    const ex = existentes.get(s.id);
    if (!ex) novas++;
    else if (ex.situacao_em > exportadoEm) ignoradas++;
    else {
      atualizadas++;
      if (ex.situacao === 'PENDENTE' && s.situacao === 'CONFIRMADO') mudancas.pendente_para_confirmado++;
      if (ex.situacao === 'CONFIRMADO' && s.situacao === 'PENDENTE') mudancas.confirmado_para_pendente++;
    }
    const classes = [...s.itens.keys()].map((c) =>
      classificacaoEfetiva(c, leitura.procedimentos.get(c).descricao, procExistentes, especialidades)
    );
    const agenda = classes.find((c) => c.categoria !== 'procedimento');
    const slug = (agenda ?? classes.find((c) => c.especialidade) ?? {}).especialidade ?? null;
    const chave = slug ?? '_sem';
    const acc = porEspecialidade.get(chave) ?? { slug, agendados: 0, pendentes: 0, procedimentos: 0 };
    if (agenda) {
      acc.agendados++;
      if (s.situacao === 'PENDENTE') acc.pendentes++;
    } else acc.procedimentos++;
    porEspecialidade.set(chave, acc);
  }

  const procedimentosNovos = [...leitura.procedimentos.values()]
    .filter((p) => !procExistentes.has(p.codigo_interno))
    .map((p) => {
      const c = classificarProcedimento(p.codigo_interno, p.descricao);
      return { ...p, especialidade: c.especialidade, especialidade_nome: especialidades.porSlug.get(c.especialidade)?.nome ?? null, categoria: c.categoria };
    });

  return {
    codificacao: leitura.codificacao,
    exportadoEm,
    exportadoEmDoNome: Boolean(leitura.exportadoEmSugerido),
    periodo: leitura.periodo,
    totalLinhas: leitura.totalLinhas,
    totalSolicitacoes: leitura.solicitacoes.size,
    novas,
    atualizadas,
    ignoradas,
    mudancas,
    pacientes: leitura.pacientes.size,
    pacientesNovos: [...leitura.pacientes.keys()].filter((c) => !pacientesExistentes.has(c)).length,
    profissionais: leitura.profissionais.size,
    procedimentosNovos,
    porEspecialidade: [...porEspecialidade.values()]
      .map((e) => ({ ...e, nome: e.slug ? especialidades.porSlug.get(e.slug)?.nome ?? e.slug : 'Sem especialidade' }))
      .sort((a, b) => b.agendados + b.procedimentos - (a.agendados + a.procedimentos)),
    erros: leitura.erros,
    totalErros: leitura.totalErros,
  };
}

// ---------------------------------------------------------------------------
// 2. Execution — upserts everything in one transaction. The file is the
//    source of truth for the solicitações it contains, except when the DB
//    already holds a newer export of the same solicitação.
// ---------------------------------------------------------------------------

let fila = Promise.resolve();
/** Imports run one at a time, in arrival order. */
function serializar(fn) {
  const execucao = fila.then(fn, fn);
  fila = execucao.catch(() => {});
  return execucao;
}

export function confirmarAnalise(token, { exportadoEm, usuarioId } = {}) {
  const analise = analises.get(token);
  if (!analise) throw new ErroValidacao('A análise expirou ou não existe. Envie o arquivo novamente.');
  return serializar(async () => {
    const resultado = await importarLeitura(analise.leitura, {
      arquivo: analise.nomeArquivo,
      exportadoEm: exportadoEm || analise.leitura.exportadoEmSugerido || hojeISO(),
      usuarioId: usuarioId ?? analise.usuarioId,
    });
    analises.delete(token);
    return resultado;
  });
}

/** Recomputes kind (agenda/produção) and specialty of solicitações from their items. */
export async function recalcularSolicitacoes(conn, { ids, codigo } = {}) {
  let filtro = '';
  const params = [];
  if (ids) { filtro = 'WHERE i.solicitacao_id IN (?)'; params.push(ids); }
  else if (codigo) {
    filtro = 'WHERE i.solicitacao_id IN (SELECT solicitacao_id FROM solicitacao_itens WHERE codigo_interno = ?)';
    params.push(codigo);
  }
  const [r] = await conn.query(
    `UPDATE solicitacoes s
     JOIN (
       SELECT i.solicitacao_id,
              MAX(p.categoria <> 'procedimento') AS agenda,
              COALESCE(MAX(CASE WHEN p.categoria <> 'procedimento' THEN p.especialidade_id END), MAX(p.especialidade_id)) AS especialidade_id
       FROM solicitacao_itens i
       JOIN procedimentos p ON p.codigo_interno = i.codigo_interno
       ${filtro}
       GROUP BY i.solicitacao_id
     ) x ON x.solicitacao_id = s.id
     SET s.tipo = IF(x.agenda, 'agenda', 'producao'), s.especialidade_id = x.especialidade_id`,
    params
  );
  return r.affectedRows;
}

export async function importarLeitura(leitura, { arquivo, exportadoEm, usuarioId = null }) {
  if (!ehDataISO(exportadoEm)) throw new ErroValidacao('Data de exportação inválida');
  if (!leitura.solicitacoes.size) throw new ErroValidacao('Nenhuma linha válida no arquivo');
  const inicio = Date.now();
  const resumo = await resumirLeitura(leitura, exportadoEm);
  const especialidades = await mapaEspecialidades();

  return transacao(async (conn) => {
    const q = async (sql, params) => (await conn.query(sql, params))[0];

    const imp = await q(
      `INSERT INTO importacoes (arquivo, usuario_id, exportado_em, periodo_inicio, periodo_fim, codificacao, total_linhas)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [arquivo, usuarioId, exportadoEm, leitura.periodo.inicio, leitura.periodo.fim, leitura.codificacao, leitura.totalLinhas]
    );
    const importacaoId = imp.insertId;

    // Procedures: new codes get the rule-based classification; known codes
    // only refresh their description (a manual classification is kept).
    const procs = [...leitura.procedimentos.values()].map((p) => {
      const c = classificarProcedimento(p.codigo_interno, p.descricao);
      return [p.codigo_interno, p.codigo_unificado, p.descricao, especialidades.porSlug.get(c.especialidade)?.id ?? null, c.categoria];
    });
    for (const lote of emLotes(procs)) {
      await q(
        `INSERT INTO procedimentos (codigo_interno, codigo_unificado, descricao, especialidade_id, categoria)
         VALUES ? AS novo
         ON DUPLICATE KEY UPDATE codigo_unificado = novo.codigo_unificado, descricao = novo.descricao`,
        [lote]
      );
    }

    const profs = [...leitura.profissionais.entries()].map(([cpf, nome]) => [cpf, nome]);
    for (const lote of emLotes(profs)) {
      await q(
        'INSERT INTO profissionais (cpf, nome) VALUES ? AS novo ON DUPLICATE KEY UPDATE nome = novo.nome',
        [lote]
      );
    }

    // Patients: the export carries the registration as it was on the export
    // date, so dados_em = export date and only a newer export overwrites it —
    // an old month imported late never brings back an outdated phone.
    const camposPac = ['cns', 'nome', 'data_nascimento', 'sexo', 'nome_mae', 'telefones', 'telefone_principal',
      'tipo_logradouro', 'logradouro', 'numero', 'complemento', 'bairro', 'cep', 'municipio', 'ibge', 'dados_em'];
    const atualizaPac = camposPac
      .filter((c) => c !== 'cns' && c !== 'dados_em')
      .map((c) => `${c} = IF(novo.dados_em >= pacientes.dados_em, novo.${c}, pacientes.${c})`)
      .concat('dados_em = GREATEST(novo.dados_em, pacientes.dados_em)')
      .join(', ');
    for (const lote of emLotes([...leitura.pacientes.values()])) {
      await q(
        `INSERT INTO pacientes (${camposPac.join(', ')}) VALUES ? AS novo ON DUPLICATE KEY UPDATE ${atualizaPac}`,
        [lote.map((p) => camposPac.map((c) => (c === 'dados_em' ? exportadoEm : p[c])))]
      );
    }

    const idPaciente = new Map();
    for (const lote of emLotes([...leitura.pacientes.keys()], 5000)) {
      for (const l of await q('SELECT id, cns FROM pacientes WHERE cns IN (?)', [lote])) idPaciente.set(l.cns, l.id);
    }
    const idProfissional = new Map();
    for (const l of await q('SELECT id, cpf FROM profissionais WHERE cpf IN (?)', [[...leitura.profissionais.keys()]])) {
      idProfissional.set(l.cpf, l.id);
    }

    // Skip solicitações already informed by a newer export.
    const maisNovas = new Set();
    for (const lote of emLotes([...leitura.solicitacoes.keys()], 5000)) {
      for (const l of await q('SELECT id FROM solicitacoes WHERE id IN (?) AND situacao_em > ?', [lote, exportadoEm])) {
        maisNovas.add(String(l.id));
      }
    }
    const aGravar = [...leitura.solicitacoes.values()].filter((s) => !maisNovas.has(s.id));

    const camposSol = ['id', 'paciente_id', 'profissional_id', 'tipo', 'data_hora', 'situacao', 'situacao_em',
      'data_solicitacao', 'data_autorizacao', 'cid', 'cnes_solicitante', 'unidade_solicitante', 'municipio_solicitante',
      'operador_solicitante', 'operador_autorizador', 'cpf_profissional_solicitante', 'nome_profissional_solicitante', 'importacao_id'];
    const atualizaSol = camposSol
      .filter((c) => !['id', 'tipo'].includes(c))
      .map((c) => `${c} = novo.${c}`)
      .join(', ');

    for (const lote of emLotes(aGravar)) {
      const linhas = lote.map((s) => camposSol.map((c) => {
        switch (c) {
          case 'paciente_id': return idPaciente.get(s.cns);
          case 'profissional_id': return idProfissional.get(s.cpf_executante);
          case 'tipo': return 'producao';
          case 'situacao_em': return exportadoEm;
          case 'importacao_id': return importacaoId;
          default: return s[c];
        }
      }));
      await q(`INSERT INTO solicitacoes (${camposSol.join(', ')}) VALUES ? AS novo ON DUPLICATE KEY UPDATE ${atualizaSol}`, [linhas]);

      const ids = lote.map((s) => s.id);
      await q('DELETE FROM solicitacao_itens WHERE solicitacao_id IN (?)', [ids]);
      const itens = lote.flatMap((s) => [...s.itens.entries()].map(([codigo, valor]) => [s.id, codigo, valor]));
      await q('INSERT INTO solicitacao_itens (solicitacao_id, codigo_interno, valor) VALUES ?', [itens]);
      await recalcularSolicitacoes(conn, { ids });
    }

    const final = {
      solicitacoes_novas: resumo.novas,
      solicitacoes_atualizadas: resumo.atualizadas,
      solicitacoes_ignoradas: resumo.ignoradas,
      situacoes_alteradas: resumo.mudancas.pendente_para_confirmado + resumo.mudancas.confirmado_para_pendente,
      pacientes_novos: resumo.pacientesNovos,
      procedimentos_novos: resumo.procedimentosNovos.length,
      duracao_ms: Date.now() - inicio,
    };
    await q(
      `UPDATE importacoes SET solicitacoes_novas = ?, solicitacoes_atualizadas = ?, solicitacoes_ignoradas = ?,
         situacoes_alteradas = ?, pacientes_novos = ?, procedimentos_novos = ?, duracao_ms = ?, avisos = ?
       WHERE id = ?`,
      [...Object.values(final), JSON.stringify({ erros: resumo.erros, totalErros: resumo.totalErros, procedimentosNovos: resumo.procedimentosNovos }), importacaoId]
    );

    return { importacaoId, arquivo, ...resumo, ...final };
  });
}
