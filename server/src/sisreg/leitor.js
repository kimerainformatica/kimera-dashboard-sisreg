import { parse } from 'csv-parse/sync';
import { somenteDigitos, extrairTelefones } from '../lib/texto.js';
import { parseDataFlex } from '../lib/datas.js';
import { ErroValidacao } from '../lib/erros.js';

// ---------------------------------------------------------------------------
// Reader for the SISREG "agendamentos da unidade executante" export: one row
// per procedure of a solicitação, 38 fixed columns, ';'-separated. Rows are
// folded into solicitações (+ their items), patients and professionals.
// ---------------------------------------------------------------------------

export const COLUNAS_OBRIGATORIAS = [
  'solicitacao', 'codigo_interno', 'descricao_procedimento', 'cpf_proficional_executante',
  'nome_profissional_executante', 'data_agendamento', 'hr_agendamento', 'cns', 'nome', 'situacao',
];

const SITUACOES = new Set(['CONFIRMADO', 'PENDENTE']);
const LIMITE_ERROS = 300;

/** Gov't exports come as UTF-8 (with or without BOM) or Windows-1252. */
export function decodificar(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { texto: buffer.subarray(3).toString('utf8'), codificacao: 'UTF-8 (BOM)' };
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return { texto: buffer.subarray(2).toString('utf16le'), codificacao: 'UTF-16 LE' };
  }
  try {
    return { texto: new TextDecoder('utf-8', { fatal: true }).decode(buffer), codificacao: 'UTF-8' };
  } catch {
    return { texto: new TextDecoder('windows-1252').decode(buffer), codificacao: 'Windows-1252 (ANSI)' };
  }
}

/** Collapses whitespace (incl. no-break spaces) and normalizes dashes. */
export function limpar(valor) {
  return (valor ?? '').toString().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
}

function ouNulo(valor) {
  const v = limpar(valor);
  return v === '' ? null : v;
}

/** SISREG names files "<UNIDADE>-YYYYMMDD.csv" with the export date. */
export function dataDoNomeArquivo(nome) {
  const m = (nome ?? '').match(/(\d{8})(?:\s*\(\d+\))?\.[a-z0-9]+$/i);
  return m ? parseDataFlex(m[1]) : null;
}

function horaValida(hora) {
  const m = limpar(hora).match(/^(\d{1,2}):(\d{2})/);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}:00`;
}

/**
 * Parses an export buffer. Throws ErroValidacao when the file is not the
 * agendamentos export; row-level problems are collected in `erros` and the
 * row is skipped.
 */
export function lerExportacao(buffer, nomeArquivo = '') {
  const { texto, codificacao } = decodificar(buffer);
  const primeiraLinha = texto.split(/\r?\n/, 1)[0];
  const delimitador = (primeiraLinha.match(/;/g) || []).length >= (primeiraLinha.match(/,/g) || []).length ? ';' : ',';

  let registros;
  try {
    registros = parse(texto, {
      delimiter: delimitador,
      columns: (cab) => cab.map((c) => limpar(c).toLowerCase()),
      relax_column_count: true,
      relax_quotes: true,
      skip_empty_lines: true,
      bom: true,
      info: true,
    });
  } catch (e) {
    throw new ErroValidacao(`Não foi possível ler o arquivo: ${e.message}`);
  }
  if (!registros.length) throw new ErroValidacao('O arquivo está vazio');

  const colunas = Object.keys(registros[0].record);
  const faltando = COLUNAS_OBRIGATORIAS.filter((c) => !colunas.includes(c));
  if (faltando.length) {
    throw new ErroValidacao(
      `Este arquivo não parece ser a exportação de agendamentos do SISREG. Colunas ausentes: ${faltando.join(', ')}`
    );
  }

  const solicitacoes = new Map();
  const pacientes = new Map();
  const profissionais = new Map();
  const procedimentos = new Map();
  const erros = [];
  let totalErros = 0;
  let periodoInicio = null;
  let periodoFim = null;

  const erro = (linha, motivo) => {
    totalErros++;
    if (erros.length < LIMITE_ERROS) erros.push({ linha, motivo });
  };

  for (const { record: r, info } of registros) {
    const linha = info.lines;
    const id = somenteDigitos(r.solicitacao);
    const codigo = limpar(r.codigo_interno);
    const cns = somenteDigitos(r.cns);
    const cpfExec = somenteDigitos(r.cpf_proficional_executante).padStart(11, '0');
    const data = parseDataFlex(limpar(r.data_agendamento));
    const hora = horaValida(r.hr_agendamento);
    const situacao = limpar(r.situacao).toUpperCase();

    if (!id || id.length > 18) { erro(linha, 'Número da solicitação inválido'); continue; }
    if (!codigo) { erro(linha, `Solicitação ${id}: procedimento sem código`); continue; }
    if (cns.length !== 15) { erro(linha, `Solicitação ${id}: CNS do paciente inválido`); continue; }
    if (!data) { erro(linha, `Solicitação ${id}: data de agendamento inválida (${limpar(r.data_agendamento)})`); continue; }
    if (!SITUACOES.has(situacao)) { erro(linha, `Solicitação ${id}: situação desconhecida "${situacao}"`); continue; }
    if (!limpar(r.nome)) { erro(linha, `Solicitação ${id}: paciente sem nome`); continue; }

    const dataHora = `${data} ${hora ?? '00:00:00'}`;
    let sol = solicitacoes.get(id);
    if (sol) {
      // Every row of a solicitação must agree on who/when — otherwise skip the row.
      if (sol.cns !== cns || sol.data_hora !== dataHora || sol.cpf_executante !== cpfExec) {
        erro(linha, `Solicitação ${id}: linha com paciente, data ou profissional diferente das demais`);
        continue;
      }
    } else {
      sol = {
        id,
        cns,
        cpf_executante: cpfExec,
        data_hora: dataHora,
        situacao,
        data_solicitacao: parseDataFlex(limpar(r.data_solicitacao)),
        data_autorizacao: parseDataFlex(limpar(r.data_autorizacao)),
        cid: ouNulo(r.cid)?.slice(0, 5) ?? null,
        cnes_solicitante: ouNulo(r.cnes_solicitante),
        unidade_solicitante: ouNulo(r.unidade_fantasia)?.slice(0, 120) ?? null,
        municipio_solicitante: ouNulo(r.mun_solicitante),
        operador_solicitante: ouNulo(r.operador_solicitante)?.slice(0, 40) ?? null,
        operador_autorizador: ouNulo(r.operador_autorizador)?.slice(0, 40) ?? null,
        cpf_profissional_solicitante: somenteDigitos(r.cpf_profissional_solicitante) || null,
        nome_profissional_solicitante: ouNulo(r.nome_profissional_solicitante)?.slice(0, 120) ?? null,
        itens: new Map(),
      };
      solicitacoes.set(id, sol);
    }
    const valor = Number.parseFloat(limpar(r.valor_procedimento).replace(',', '.'));
    sol.itens.set(codigo, Number.isFinite(valor) ? valor : null);

    if (!procedimentos.has(codigo)) {
      procedimentos.set(codigo, {
        codigo_interno: codigo,
        codigo_unificado: somenteDigitos(r.codigo_unificado) || null,
        descricao: limpar(r.descricao_procedimento).slice(0, 160) || codigo,
      });
    }
    profissionais.set(cpfExec, limpar(r.nome_profissional_executante).slice(0, 120));

    // Demographics: within one file keep the row of the latest appointment.
    const atual = pacientes.get(cns);
    if (!atual || atual.dados_em < data) {
      const telefones = ouNulo(r.telefone);
      const principal = extrairTelefones(telefones).principal;
      pacientes.set(cns, {
        cns,
        nome: limpar(r.nome).slice(0, 120),
        data_nascimento: parseDataFlex(limpar(r.dt_nascimento)),
        sexo: ['M', 'F'].includes(limpar(r.sexo).toUpperCase()) ? limpar(r.sexo).toUpperCase() : null,
        nome_mae: ouNulo(r.nome_mae)?.slice(0, 120) ?? null,
        telefones: telefones?.slice(0, 160) ?? null,
        telefone_principal: principal ? somenteDigitos(principal).slice(0, 11) : null,
        tipo_logradouro: ouNulo(r.tipo_logradouro)?.slice(0, 30) ?? null,
        logradouro: ouNulo(r.logradouro)?.slice(0, 120) ?? null,
        numero: ouNulo(r.numero_logradouro)?.slice(0, 12) ?? null,
        complemento: ouNulo(r.complemento)?.slice(0, 80) ?? null,
        bairro: ouNulo(r.bairro)?.slice(0, 80) ?? null,
        cep: somenteDigitos(r.cep).slice(0, 8) || null,
        municipio: ouNulo(r.municipio)?.slice(0, 60) ?? null,
        ibge: somenteDigitos(r.ibge).slice(0, 6) || null,
        dados_em: data,
      });
    }

    if (!periodoInicio || data < periodoInicio) periodoInicio = data;
    if (!periodoFim || data > periodoFim) periodoFim = data;
  }

  return {
    codificacao,
    totalLinhas: registros.length,
    exportadoEmSugerido: dataDoNomeArquivo(nomeArquivo),
    periodo: { inicio: periodoInicio, fim: periodoFim },
    solicitacoes,
    pacientes,
    profissionais,
    procedimentos,
    erros,
    totalErros,
  };
}
