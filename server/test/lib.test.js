import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDataFlex, diffDias, somarMeses, normalizarDataHora, paraDataLocal } from '../src/lib/datas.js';
import { extrairTelefones, normalizarTexto, normalizarChave, capitalizarNome } from '../src/lib/texto.js';
import { normalizarCNS } from '../src/lib/cns.js';

test('parseDataFlex aceita os formatos brasileiros e do SISREG', () => {
  assert.equal(parseDataFlex('05/03/2024'), '2024-03-05');
  assert.equal(parseDataFlex('5/3/2024'), '2024-03-05');
  assert.equal(parseDataFlex('05/03/2024 10:30:00'), '2024-03-05');
  assert.equal(parseDataFlex('05/03/2024 10:30'), '2024-03-05');
  assert.equal(parseDataFlex('05-03-2024'), '2024-03-05');
  assert.equal(parseDataFlex('05.03.24'), '2024-03-05');
  assert.equal(parseDataFlex('2024-03-05'), '2024-03-05');
  assert.equal(parseDataFlex('2024-03-05T10:30:00.000Z'), '2024-03-05');
  assert.equal(parseDataFlex('2024/03/05'), '2024-03-05');
  assert.equal(parseDataFlex('20240305'), '2024-03-05');
  assert.equal(parseDataFlex('45356'), '2024-03-05'); // serial Excel
});

test('parseDataFlex rejeita datas impossíveis e lixo', () => {
  assert.equal(parseDataFlex('31/02/2024'), null);
  assert.equal(parseDataFlex('13/13/2024'), null);
  assert.equal(parseDataFlex('abc'), null);
  assert.equal(parseDataFlex(''), null);
  assert.equal(parseDataFlex(null), null);
  assert.equal(parseDataFlex('12345678'), null);
});

test('diffDias trabalha em horário local (sem erro de 1 dia)', () => {
  const ref = new Date(2026, 8, 19, 23, 30);
  assert.equal(diffDias('2026-09-19', ref), 0);
  assert.equal(diffDias('2026-09-18', ref), 1);
  assert.equal(diffDias('2026-09-18 23:59:00', ref), 1);
  assert.equal(diffDias('2026-09-20', ref), -1);
});

test('somarMeses usa meses de calendário com dia limitado', () => {
  assert.equal(somarMeses('2024-01-31', 1), '2024-02-29');
  assert.equal(somarMeses('2024-01-15', 18), '2025-07-15');
  assert.equal(somarMeses('2026-09-19', -12), '2025-09-19');
});

test('normalizarDataHora aceita datetime-local e SQL', () => {
  assert.equal(normalizarDataHora('2026-09-19T14:30'), '2026-09-19 14:30:00');
  assert.equal(normalizarDataHora('2026-09-19 14:30:15'), '2026-09-19 14:30:15');
  assert.equal(normalizarDataHora('19/09/2026'), '2026-09-19 00:00:00');
  assert.equal(normalizarDataHora('2026-02-30T10:00'), null);
  assert.equal(paraDataLocal('2026-09-19 14:30:00').getHours(), 14);
});

test('extrairTelefones lida com células poluídas do SISREG', () => {
  assert.deepEqual(extrairTelefones('(85) 99999-8888 / 3333-4444'), { principal: '(85) 99999-8888', outros: ['3333-4444'] });
  assert.equal(extrairTelefones('85999998888').principal, '(85) 99999-8888');
  assert.equal(extrairTelefones('+55 85 99999 8888').principal, '(85) 99999-8888');
  assert.equal(extrairTelefones('085999998888').principal, '(85) 99999-8888');
  assert.equal(extrairTelefones('sem telefone').principal, null);
  assert.equal(extrairTelefones('').principal, null);
});

test('normalização de texto e chaves de cabeçalho', () => {
  assert.equal(normalizarTexto('  José   da SILVA '), 'jose da silva');
  assert.equal(normalizarChave('NOME_DO_PACIENTE'), 'nome do paciente');
  assert.equal(normalizarChave('Data da Solicitação:'), 'data da solicitacao');
  assert.equal(normalizarChave('CNS (Cartão SUS)'), 'cns cartao sus');
  assert.equal(capitalizarNome('MARIA DE SOUZA E SILVA'), 'Maria de Souza e Silva');
});

test('CNS: valida dígito verificador e limpa formatação', () => {
  // Provisório válido: soma ponderada divisível por 11.
  assert.equal(normalizarCNS('898 0011 5018 3123'), null); // formato ok, dígito errado
  assert.equal(normalizarCNS('123'), null);
  assert.equal(normalizarCNS(''), null);
  const provisorioValido = gerarProvisorio();
  assert.equal(normalizarCNS(provisorioValido), provisorioValido);
  const definitivoValido = gerarDefinitivo('12345678901');
  assert.equal(normalizarCNS(definitivoValido), definitivoValido);
  assert.equal(normalizarCNS(definitivoValido.slice(0, 14) + '9'), null);
});

function gerarProvisorio() {
  for (let n = 700000000000000; ; n += 7) {
    const s = String(n);
    let soma = 0;
    for (let i = 0; i < 15; i++) soma += Number(s[i]) * (15 - i);
    if (soma % 11 === 0) return s;
  }
}

function gerarDefinitivo(pis) {
  let soma = 0;
  for (let i = 0; i < 11; i++) soma += Number(pis[i]) * (15 - i);
  let dv = 11 - (soma % 11);
  if (dv === 11) dv = 0;
  if (dv === 10) {
    soma += 2;
    dv = 11 - (soma % 11);
    if (dv === 11) dv = 0;
    return `${pis}001${dv}`;
  }
  return `${pis}000${dv}`;
}
