import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classificarProcedimento } from '../src/sisreg/classificacao.js';
import { lerExportacao, dataDoNomeArquivo, limpar } from '../src/sisreg/leitor.js';
import { statusSolicitacao, metricasPaciente } from '../src/services/leituras.js';
import { arquivo, linha } from './fixtures.js';

test('classificação por código, por prefixo e por palavra-chave', () => {
  assert.deepEqual(classificarProcedimento('2018486'), { especialidade: 'ortodontia', categoria: 'retorno' });
  assert.deepEqual(classificarProcedimento('2018661'), { especialidade: 'sorrir-movel', categoria: 'consulta' });
  assert.deepEqual(classificarProcedimento('0257002', 'MANUTENÇÃO'), { especialidade: 'ortodontia', categoria: 'procedimento' });
  assert.deepEqual(classificarProcedimento('0120159'), { especialidade: 'sorrir-movel', categoria: 'procedimento' });
  assert.deepEqual(classificarProcedimento('0598099', 'CONSULTA EM ODONTOLOGIA - ORTODONTIA'), { especialidade: 'ortodontia', categoria: 'consulta' });
  assert.deepEqual(classificarProcedimento('0710999', 'CONSULTA EM ODONTOLOGIA – ENDODONTIA - RETORNO'), { especialidade: 'endodontia', categoria: 'retorno' });
  assert.deepEqual(classificarProcedimento('9999999', 'QUALQUER'), { especialidade: null, categoria: 'procedimento' });
});

test('nome do arquivo informa a data de exportação', () => {
  assert.equal(dataDoNomeArquivo('UNIDADE SORRIR-20261013.csv'), '2026-10-13');
  assert.equal(dataDoNomeArquivo('UNIDADE SORRIR-20261013 (2).csv'), '2026-10-13');
  assert.equal(dataDoNomeArquivo('agendamentos.csv'), null);
  assert.equal(limpar(' PROFILAXIA  –  X '), 'PROFILAXIA - X');
});

test('leitor agrupa linhas em solicitações com itens e mantém o cadastro mais recente', () => {
  const l = lerExportacao(arquivo(
    linha({ codigo_interno: '0257002', codigo_unificado: '0307040127', descricao_procedimento: 'MANUTENÇÃO', solicitacao: '600000002' }),
    linha({ codigo_interno: '0257023', codigo_unificado: '0101020104', descricao_procedimento: 'ORIENTAÇÃO', solicitacao: '600000002' }),
    linha({ data_agendamento: '01.10.2026', solicitacao: '600000003', telefone: '(98)98888-1111', situacao: 'PENDENTE' }),
    linha({ solicitacao: '600000004', data_agendamento: '31.02.2026' }),
    linha({ solicitacao: '600000002', codigo_interno: '0257001', cns: '700000000000002' }),
  ), 'X-20261013.csv');
  assert.equal(l.solicitacoes.size, 2);
  assert.deepEqual([...l.solicitacoes.get('600000002').itens.keys()], ['0257002', '0257023']);
  assert.equal(l.solicitacoes.get('600000003').data_hora, '2026-10-01 08:00:00');
  assert.equal(l.pacientes.get('700000000000001').telefone_principal, '98988881111');
  assert.equal(l.totalErros, 2);
  assert.equal(l.exportadoEmSugerido, '2026-10-13');
  assert.deepEqual(l.periodo, { inicio: '2026-09-01', fim: '2026-10-01' });
});

test('leitor recusa arquivo que não é a exportação de agendamentos', () => {
  assert.throws(() => lerExportacao(Buffer.from('nome;telefone\nA;1')), /Colunas ausentes/);
});

test('status: falta só em agenda pendente antes da exportação', () => {
  const s = (situacao, tipo, data, exportado) => statusSolicitacao({ situacao, tipo, data_hora: `${data} 08:00:00`, situacao_em: exportado }, '2026-09-30');
  assert.equal(s('CONFIRMADO', 'agenda', '2026-09-10', '2026-10-13'), 'compareceu');
  assert.equal(s('PENDENTE', 'agenda', '2026-09-10', '2026-10-13'), 'falta');
  assert.equal(s('CONFIRMADO', 'producao', '2026-09-10', '2026-10-13'), 'realizado');
  assert.equal(s('PENDENTE', 'producao', '2026-09-10', '2026-10-13'), 'nao_confirmado');
  assert.equal(s('PENDENTE', 'agenda', '2026-08-31', '2026-08-31'), 'sem_atualizacao');
  assert.equal(s('PENDENTE', 'agenda', '2026-10-20', '2026-10-13'), 'agendado');
});

test('métricas: falta e comparecimento só nas consultas; procedimento não gera nem anula falta', () => {
  const cfg = { faltas_alerta_criticas: 2, dias_sem_retorno_alerta: 45 };
  const sol = (dia, status, tipo = 'agenda') => ({ dia, status, tipo });
  const m = metricasPaciente([
    sol('2026-06-05', 'compareceu'),
    sol('2026-07-05', 'falta'), sol('2026-07-05', 'realizado', 'producao'),
    sol('2026-08-05', 'falta'),
    sol('2026-08-20', 'nao_confirmado', 'producao'),
    sol('2026-09-05', 'falta'),
  ], { referencia: '2026-09-30', inicioJanela: null, cfg });
  assert.equal(m.comparecimentos, 1);
  assert.equal(m.faltas, 3);
  assert.equal(m.faltasConsecutivas, 3);
  assert.equal(m.taxaComparecimento, 0.25);
  // The procedure day still marks the patient's last visit.
  assert.equal(m.ultimaVisita, '2026-07-05');
  assert.equal(m.diasSemRetorno, 87);
  assert.equal(m.alertas.critico, true);
  assert.equal(m.alertas.semRetorno, true);

  const soProcedimento = metricasPaciente([sol('2026-09-10', 'nao_confirmado', 'producao'), sol('2026-09-12', 'realizado', 'producao')], { referencia: '2026-09-30', inicioJanela: null, cfg });
  assert.equal(soProcedimento.faltas, 0);
  assert.equal(soProcedimento.comparecimentos, 0);
  assert.equal(soProcedimento.taxaComparecimento, null);
  assert.equal(soProcedimento.ultimaVisita, '2026-09-12');

  const comFuturo = metricasPaciente([sol('2026-07-05', 'compareceu'), sol('2026-10-05', 'agendado')], { referencia: '2026-09-30', inicioJanela: null, cfg });
  assert.equal(comFuturo.proximoAgendamento, '2026-10-05');
  assert.equal(comFuturo.alertas.semRetorno, false);

  const janela = metricasPaciente([sol('2025-01-05', 'falta'), sol('2026-09-05', 'compareceu')], { referencia: '2026-09-30', inicioJanela: '2025-09-30', cfg });
  assert.equal(janela.faltas, 0);
  assert.equal(janela.faltasHistorico, 1);
});
