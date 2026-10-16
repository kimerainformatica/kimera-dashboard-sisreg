import { Router } from 'express';
import { consultar, executar, primeiro } from '../db.js';
import { rota, idParam } from '../middleware/errors.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { ErroValidacao } from '../lib/erros.js';
import { ehDataISO } from '../lib/datas.js';
import {
  obterEspecialidade, leiturasEspecialidade, filtrarPacientes, ordenarPacientes, painel, listarAgenda,
  detalhePaciente, STATUS_ACOMPANHAMENTO, CHAVES_ORDENACAO, NIVEIS,
} from '../services/leituras.js';

const router = Router();

router.get('/', rota(async (req, res) => {
  const linhas = await consultar(
    `SELECT e.id, e.slug, e.nome, e.visivel, e.ordem,
            COUNT(s.id) AS solicitacoes, COUNT(DISTINCT s.paciente_id) AS pacientes
     FROM especialidades e LEFT JOIN solicitacoes s ON s.especialidade_id = e.id
     GROUP BY e.id ORDER BY e.ordem, e.nome`
  );
  res.json(req.usuario.papel === 'admin' ? linhas : linhas.filter((e) => e.visivel));
}));

router.put('/:id', requireAdmin, idParam, rota(async (req, res) => {
  const { visivel, nome } = req.body ?? {};
  const atual = await primeiro('SELECT * FROM especialidades WHERE id = ?', [req.id]);
  if (!atual) return res.status(404).json({ erro: 'Especialidade não encontrada' });
  const nomeFinal = nome === undefined ? atual.nome : String(nome).trim();
  if (!nomeFinal || nomeFinal.length > 80) throw new ErroValidacao('Nome da especialidade inválido');
  await executar('UPDATE especialidades SET visivel = ?, nome = ? WHERE id = ?', [
    visivel === undefined ? atual.visivel : visivel ? 1 : 0, nomeFinal, req.id,
  ]);
  res.json(await primeiro('SELECT * FROM especialidades WHERE id = ?', [req.id]));
}));

// Everything below reads one specialty; hidden ones are admin-only.
const especialidade = rota(async (req, res, next) => {
  const esp = await obterEspecialidade(req.params.slug);
  if (!esp.visivel && req.usuario.papel !== 'admin') {
    return res.status(403).json({ erro: 'Esta especialidade ainda não está liberada na interface' });
  }
  req.especialidade = esp;
  next();
});

function validarPeriodo({ inicio, fim }) {
  for (const [rotulo, v] of [['início', inicio], ['fim', fim]]) {
    if (v && !ehDataISO(v)) throw new ErroValidacao(`Data de ${rotulo} inválida`);
  }
  if (inicio && fim && inicio > fim) throw new ErroValidacao('A data inicial é maior que a final');
}

router.get('/:slug/painel', especialidade, rota(async (req, res) => {
  validarPeriodo(req.query);
  res.json(await painel(req.especialidade.slug, req.query));
}));

router.get('/:slug/opcoes', especialidade, rota(async (req, res) => {
  const L = await leiturasEspecialidade(req.especialidade.slug);
  const municipios = new Map();
  for (const p of L.pacientes) if (p.municipio) municipios.set(p.municipio, (municipios.get(p.municipio) ?? 0) + 1);
  res.json({
    especialidade: L.especialidade,
    referencia: L.referencia,
    profissionais: L.profissionais,
    municipios: [...municipios.entries()].sort((a, b) => b[1] - a[1]).map(([nome, pacientes]) => ({ nome, pacientes })),
    configuracao: L.cfg,
  });
}));

const COLUNAS_CSV = [
  ['Paciente', (p) => p.nome],
  ['CNS', (p) => p.cns],
  ['Idade', (p) => p.idade],
  ['Sexo', (p) => p.sexo],
  ['Telefones', (p) => p.telefones],
  ['Município', (p) => p.municipio],
  ['Bairro', (p) => p.bairro],
  ['Profissional', (p) => p.profissional_nome],
  ['Primeira visita', (p) => p.primeiraVisita],
  ['Última visita', (p) => p.ultimaVisita],
  ['Próximo agendamento', (p) => p.proximoAgendamento],
  ['Comparecimentos', (p) => p.comparecimentos],
  ['Faltas', (p) => p.faltas],
  ['Faltas seguidas', (p) => p.faltasConsecutivas],
  ['Dias sem retorno', (p) => p.diasSemRetorno],
  ['Comparecimento (%)', (p) => (p.taxaComparecimento == null ? '' : Math.round(p.taxaComparecimento * 100))],
  ['Alerta', (p) => p.nivel],
  ['Acompanhamento', (p) => p.acompanhamento_status],
];
const COLUNAS_CSV_ORTO = [
  ['Aparelho', (p) => p.instalacao?.tipo],
  ['Instalação', (p) => p.instalacao?.data],
  ['Manutenções', (p) => p.manutencoes],
];

function celulaCsv(v) {
  const s = v == null ? '' : String(v);
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

router.get('/:slug/pacientes', especialidade, rota(async (req, res) => {
  const { ordenar_por = 'alerta', direcao = '', page = 1, page_size = 50, formato } = req.query;
  if (!CHAVES_ORDENACAO.includes(ordenar_por)) throw new ErroValidacao('Ordenação inválida');
  if (req.query.nivel && String(req.query.nivel).split(',').some((n) => !NIVEIS.includes(n))) {
    throw new ErroValidacao('Nível de alerta inválido');
  }
  const L = await leiturasEspecialidade(req.especialidade.slug);
  const lista = ordenarPacientes(filtrarPacientes(L.pacientes, req.query), ordenar_por, direcao);

  if (formato === 'csv') {
    const colunas = req.especialidade.slug === 'ortodontia' ? [...COLUNAS_CSV, ...COLUNAS_CSV_ORTO] : COLUNAS_CSV;
    const linhas = [colunas.map(([r]) => r).join(';'), ...lista.map((p) => colunas.map(([, f]) => celulaCsv(f(p))).join(';'))];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="pacientes-${req.especialidade.slug}-${L.referencia}.csv"`);
    return res.send('﻿' + linhas.join('\r\n'));
  }

  const tamanho = Math.min(500, Math.max(1, Number(page_size) || 50));
  const totalPages = Math.max(1, Math.ceil(lista.length / tamanho));
  const pagina = Math.min(totalPages, Math.max(1, Number(page) || 1));
  const inicio = (pagina - 1) * tamanho;
  res.json({
    items: lista.slice(inicio, inicio + tamanho).map((p, i) => ({ ...p, ranking: inicio + i + 1 })),
    total: lista.length,
    page: pagina,
    pageSize: tamanho,
    totalPages,
    referencia: L.referencia,
  });
}));

router.get('/:slug/pacientes/:id', especialidade, idParam, rota(async (req, res) => {
  res.json(await detalhePaciente(req.especialidade.slug, req.id));
}));

router.put('/:slug/pacientes/:id/acompanhamento', especialidade, idParam, rota(async (req, res) => {
  const { status, observacoes } = req.body ?? {};
  if (status != null && status !== '' && !STATUS_ACOMPANHAMENTO.includes(status)) {
    throw new ErroValidacao('Status de acompanhamento inválido');
  }
  const obs = (observacoes ?? '').toString().trim();
  if (obs.length > 5000) throw new ErroValidacao('Observações muito longas (máximo de 5000 caracteres)');
  if (!(await primeiro('SELECT id FROM pacientes WHERE id = ?', [req.id]))) {
    return res.status(404).json({ erro: 'Paciente não encontrado' });
  }
  await executar(
    `INSERT INTO acompanhamentos (paciente_id, especialidade_id, status, observacoes, atualizado_por)
     VALUES (?, ?, ?, ?, ?) AS novo
     ON DUPLICATE KEY UPDATE status = novo.status, observacoes = novo.observacoes, atualizado_por = novo.atualizado_por`,
    [req.id, req.especialidade.id, status || null, obs || null, req.usuario.id]
  );
  res.json(await detalhePaciente(req.especialidade.slug, req.id));
}));

router.get('/:slug/agenda', especialidade, rota(async (req, res) => {
  const { data_de, data_ate } = req.query;
  validarPeriodo({ inicio: data_de, fim: data_ate });
  res.json(await listarAgenda(req.especialidade.slug, req.query, { page: req.query.page, pageSize: req.query.page_size }));
}));

router.get('/:slug/definicoes', especialidade, rota(async (req, res) => {
  const L = await leiturasEspecialidade(req.especialidade.slug);
  const c = L.cfg;
  res.json({
    referencia: L.referencia,
    configuracao: c,
    regras: [
      { chave: 'fonte', titulo: 'De onde vêm os dados', texto: 'Das exportações de agendamentos do SISREG importadas no sistema. Cada solicitação pertence a uma especialidade conforme o código do procedimento (Configurações → Procedimentos).' },
      { chave: 'referencia', titulo: 'Data de referência', texto: `É o último dia com atendimento confirmado nos dados importados (hoje: ${L.referencia}). "Dias sem retorno" e "próximo agendamento" são medidos contra ela, porque os arquivos só cobrem os meses importados.` },
      { chave: 'compareceu', titulo: 'Compareceu', texto: 'Consulta ou retorno com situação CONFIRMADO no SISREG. Comparecimentos, faltas e a taxa de comparecimento são contados só nas consultas.' },
      { chave: 'falta', titulo: 'Falta', texto: 'Consulta ou retorno que estava PENDENTE na exportação feita depois da data marcada. Só consultas geram falta, e um procedimento confirmado no mesmo dia não anula a falta da consulta.' },
      { chave: 'procedimentos', titulo: 'Procedimentos', texto: 'Linhas de procedimento (manutenção, instalação, orientação etc.) aparecem como "Procedimento realizado" (CONFIRMADO) ou "Procedimento não confirmado" (PENDENTE) e nunca contam como falta nem como comparecimento. Elas só servem para registrar o que foi feito e a data da última visita.' },
      { chave: 'sem_atualizacao', titulo: 'Sem atualização', texto: 'Consulta PENDENTE cuja data já passou, mas a exportação importada foi feita antes ou no dia dela. Não é falta nem comparecimento: importe uma exportação mais nova daquele mês.' },
      { chave: 'faltoso', titulo: 'Faltoso', texto: `Ao menos 1 falta ${c.janela_faltas_meses > 0 ? `nos últimos ${c.janela_faltas_meses} meses` : 'no histórico importado'}.` },
      { chave: 'critico', titulo: 'Crítico', texto: `${c.faltas_alerta_criticas} ou mais faltas seguidas, contando da consulta mais recente para trás, sem comparecer no meio.` },
      { chave: 'sem_retorno', titulo: 'Sem retorno', texto: `Sem agendamento futuro e sem visita há ${c.dias_sem_retorno_alerta} dias ou mais até a data de referência. Para isso, a visita é o último dia com consulta ou procedimento confirmado.` },
      { chave: 'encerrado', titulo: 'Encerrado', texto: 'Paciente marcado pela equipe como concluído, abandonou ou transferido — sai dos alertas.' },
      ...(L.especialidade.slug === 'ortodontia'
        ? [{ chave: 'aparelho', titulo: 'Aparelho', texto: 'Data da primeira instalação de aparelho fixo (SIGTAP 03.07.04.011-9) ou removível (07.01.07.002-1) confirmada nos dados importados.' }]
        : []),
    ],
  });
}));

export default router;
