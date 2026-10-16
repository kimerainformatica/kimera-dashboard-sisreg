// Integration test against a throwaway MySQL database (dashboard_sisreg_teste).
// Skipped when MySQL is not reachable.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_NAME = 'dashboard_sisreg_teste';
const { iniciarBanco, consultar, encerrarBanco } = await import('../src/db.js');
const { importarLeitura } = await import('../src/services/importacaoSisreg.js');
const { lerExportacao } = await import('../src/sisreg/leitor.js');
const { leiturasEspecialidade } = await import('../src/services/leituras.js');
const { arquivo, linha } = await import('./fixtures.js');

let disponivel = true;
before(async () => {
  try {
    await iniciarBanco();
    for (const t of ['solicitacao_itens', 'solicitacoes', 'acompanhamentos', 'pacientes', 'profissionais', 'procedimentos', 'importacoes']) {
      await consultar(`DELETE FROM ${t}`);
    }
  } catch (e) {
    disponivel = false;
    console.warn(`MySQL indisponível, teste de integração ignorado: ${e.message}`);
  }
});
after(async () => { await encerrarBanco().catch(() => {}); });

const importar = (buf, exportadoEm) => importarLeitura(lerExportacao(buf), { arquivo: 't.csv', exportadoEm });

test('importação: upsert, situação atualizada, exportação antiga ignorada', async (t) => {
  if (!disponivel) return t.skip('MySQL indisponível');

  const v1 = arquivo(
    linha({ solicitacao: '700000001', data_agendamento: '05.09.2026', situacao: 'PENDENTE' }),
    linha({ solicitacao: '700000002', codigo_interno: '0257002', codigo_unificado: '0307040127', descricao_procedimento: 'MANUTENÇÃO', data_agendamento: '06.09.2026' }),
    linha({ solicitacao: '700000003', codigo_interno: '0598041', descricao_procedimento: 'CONSULTA EM ODONTOLOGIA - CLINICO GERAL', data_agendamento: '07.09.2026', cns: '700000000000009', nome: 'OUTRO' }),
  );
  const r1 = await importar(v1, '2026-09-05');
  assert.equal(r1.novas, 3);
  assert.equal(r1.pacientesNovos, 2);

  const [o] = await consultar(`SELECT s.tipo, e.slug FROM solicitacoes s JOIN especialidades e ON e.id = s.especialidade_id WHERE s.id = 700000002`);
  assert.deepEqual({ ...o }, { tipo: 'producao', slug: 'ortodontia' });

  // Same appointment exported later as CONFIRMADO, with a new phone.
  const v2 = arquivo(linha({ solicitacao: '700000001', data_agendamento: '05.09.2026', situacao: 'CONFIRMADO', telefone: '(98)97777-0000' }));
  const r2 = await importar(v2, '2026-10-13');
  assert.equal(r2.atualizadas, 1);
  assert.equal(r2.mudancas.pendente_para_confirmado, 1);

  // An older export arriving late must not undo it.
  const r3 = await importar(arquivo(linha({ solicitacao: '700000001', data_agendamento: '05.09.2026', situacao: 'PENDENTE', telefone: '(98)90000-0000' })), '2026-09-06');
  assert.equal(r3.ignoradas, 1);
  const [s] = await consultar('SELECT situacao FROM solicitacoes WHERE id = 700000001');
  assert.equal(s.situacao, 'CONFIRMADO');
  const [p] = await consultar(`SELECT telefone_principal FROM pacientes WHERE cns = '700000000000001'`);
  assert.equal(p.telefone_principal, '98977770000');

  const L = await leiturasEspecialidade('ortodontia');
  assert.equal(L.pacientes.length, 1);
  // Only the consultation counts as attendance; the procedure day is the last visit.
  assert.equal(L.pacientes[0].comparecimentos, 1);
  assert.equal(L.pacientes[0].faltas, 0);
  assert.equal(L.pacientes[0].ultimaVisita, '2026-09-06');
});
