import mysql from 'mysql2/promise';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ESPECIALIDADES } from './sisreg/classificacao.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arquivoEnv = path.join(__dirname, '..', '.env');
if (fs.existsSync(arquivoEnv)) process.loadEnvFile(arquivoEnv);

export const CONFIG_BANCO = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'dashboard',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'dashboard_sisreg',
};

// dateStrings keeps DATE/DATETIME as 'YYYY-MM-DD[ HH:MM:SS]' local strings —
// the same shape the lib/datas helpers and the frontend formatters expect,
// with no UTC conversion shifting appointments by a day.
const pool = mysql.createPool({
  ...CONFIG_BANCO,
  connectionLimit: 10,
  charset: 'utf8mb4',
  dateStrings: true,
  timezone: 'local',
  decimalNumbers: true,
  supportBigNumbers: true,
});

/** Rows of a SELECT. */
export async function consultar(sql, params = []) {
  const [linhas] = await pool.query(sql, params);
  return linhas;
}

/** First row of a SELECT, or null. */
export async function primeiro(sql, params = []) {
  const [linhas] = await pool.query(sql, params);
  return linhas[0] ?? null;
}

/** INSERT/UPDATE/DELETE — returns { affectedRows, insertId, ... }. */
export async function executar(sql, params = []) {
  const [resultado] = await pool.query(sql, params);
  marcarAlteracao();
  return resultado;
}

/**
 * Runs `fn(conn)` inside a transaction on a dedicated connection; commits on
 * success, rolls back on any error.
 */
export async function transacao(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const resultado = await fn(conn);
    await conn.commit();
    marcarAlteracao();
    return resultado;
  } catch (err) {
    await conn.rollback().catch(() => {});
    throw err;
  } finally {
    conn.release();
  }
}

// In-process change counter: the derived per-patient readings are cached and
// recomputed only after a write went through this module (single-process app).
let versao = 0;
export function marcarAlteracao() { versao++; }
export function versaoDados() { return versao; }

export async function encerrarBanco() {
  await pool.end();
}

// ---------------------------------------------------------------------------
// Schema migrations. MySQL commits DDL implicitly, so each step is a list of
// idempotent-ish statements recorded in schema_migracoes once it finishes.
// ---------------------------------------------------------------------------

const MIGRACOES = [
  // v1 — SISREG mirror for every specialty + internal notes, users, imports.
  [
    `CREATE TABLE IF NOT EXISTS especialidades (
      id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      slug VARCHAR(40) NOT NULL UNIQUE,
      nome VARCHAR(80) NOT NULL,
      visivel TINYINT(1) NOT NULL DEFAULT 0,
      ordem SMALLINT NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS procedimentos (
      codigo_interno VARCHAR(10) NOT NULL PRIMARY KEY,
      codigo_unificado VARCHAR(10),
      descricao VARCHAR(160) NOT NULL,
      especialidade_id SMALLINT UNSIGNED NULL,
      categoria ENUM('consulta','retorno','procedimento') NOT NULL DEFAULT 'procedimento',
      classificado_manualmente TINYINT(1) NOT NULL DEFAULT 0,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_proc_especialidade (especialidade_id),
      KEY idx_proc_unificado (codigo_unificado),
      CONSTRAINT fk_proc_especialidade FOREIGN KEY (especialidade_id) REFERENCES especialidades(id)
    )`,
    `CREATE TABLE IF NOT EXISTS profissionais (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      cpf CHAR(11) NOT NULL UNIQUE,
      nome VARCHAR(120) NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      KEY idx_prof_nome (nome)
    )`,
    `CREATE TABLE IF NOT EXISTS usuarios (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      usuario VARCHAR(60) NOT NULL UNIQUE,
      nome VARCHAR(120),
      senha_hash VARCHAR(200) NOT NULL,
      papel ENUM('admin','equipe') NOT NULL DEFAULT 'equipe',
      ativo TINYINT(1) NOT NULL DEFAULT 1,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS sessoes (
      token CHAR(64) NOT NULL PRIMARY KEY,
      usuario_id INT UNSIGNED NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expira_em DATETIME NOT NULL,
      KEY idx_sessoes_usuario (usuario_id),
      CONSTRAINT fk_sessoes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS importacoes (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      arquivo VARCHAR(255) NOT NULL,
      usuario_id INT UNSIGNED NULL,
      exportado_em DATE NOT NULL,
      periodo_inicio DATE NULL,
      periodo_fim DATE NULL,
      codificacao VARCHAR(30),
      total_linhas INT UNSIGNED NOT NULL DEFAULT 0,
      solicitacoes_novas INT UNSIGNED NOT NULL DEFAULT 0,
      solicitacoes_atualizadas INT UNSIGNED NOT NULL DEFAULT 0,
      solicitacoes_ignoradas INT UNSIGNED NOT NULL DEFAULT 0,
      situacoes_alteradas INT UNSIGNED NOT NULL DEFAULT 0,
      pacientes_novos INT UNSIGNED NOT NULL DEFAULT 0,
      procedimentos_novos INT UNSIGNED NOT NULL DEFAULT 0,
      avisos JSON NULL,
      duracao_ms INT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_import_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS pacientes (
      id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      cns CHAR(15) NOT NULL UNIQUE,
      nome VARCHAR(120) NOT NULL,
      data_nascimento DATE NULL,
      sexo CHAR(1) NULL,
      nome_mae VARCHAR(120) NULL,
      telefones VARCHAR(160) NULL,
      telefone_principal VARCHAR(11) NULL,
      tipo_logradouro VARCHAR(30) NULL,
      logradouro VARCHAR(120) NULL,
      numero VARCHAR(12) NULL,
      complemento VARCHAR(80) NULL,
      bairro VARCHAR(80) NULL,
      cep CHAR(8) NULL,
      municipio VARCHAR(60) NULL,
      ibge CHAR(6) NULL,
      dados_em DATE NOT NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_pac_nome (nome),
      KEY idx_pac_telefone (telefone_principal),
      KEY idx_pac_municipio (municipio)
    )`,
    `CREATE TABLE IF NOT EXISTS solicitacoes (
      id BIGINT UNSIGNED NOT NULL PRIMARY KEY COMMENT 'número da solicitação no SISREG',
      paciente_id INT UNSIGNED NOT NULL,
      profissional_id INT UNSIGNED NOT NULL,
      especialidade_id SMALLINT UNSIGNED NULL,
      tipo ENUM('agenda','producao') NOT NULL,
      data_hora DATETIME NOT NULL,
      situacao ENUM('CONFIRMADO','PENDENTE') NOT NULL,
      situacao_em DATE NOT NULL COMMENT 'data da exportação que informou a situação',
      data_solicitacao DATE NULL,
      data_autorizacao DATE NULL,
      cid VARCHAR(5) NULL,
      cnes_solicitante VARCHAR(7) NULL,
      unidade_solicitante VARCHAR(120) NULL,
      municipio_solicitante VARCHAR(60) NULL,
      operador_solicitante VARCHAR(40) NULL,
      operador_autorizador VARCHAR(40) NULL,
      cpf_profissional_solicitante VARCHAR(11) NULL,
      nome_profissional_solicitante VARCHAR(120) NULL,
      importacao_id INT UNSIGNED NULL,
      criado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em DATETIME NULL ON UPDATE CURRENT_TIMESTAMP,
      KEY idx_sol_esp_data (especialidade_id, data_hora),
      KEY idx_sol_paciente_data (paciente_id, data_hora),
      KEY idx_sol_prof_data (profissional_id, data_hora),
      KEY idx_sol_data (data_hora),
      KEY idx_sol_importacao (importacao_id),
      CONSTRAINT fk_sol_paciente FOREIGN KEY (paciente_id) REFERENCES pacientes(id),
      CONSTRAINT fk_sol_profissional FOREIGN KEY (profissional_id) REFERENCES profissionais(id),
      CONSTRAINT fk_sol_especialidade FOREIGN KEY (especialidade_id) REFERENCES especialidades(id),
      CONSTRAINT fk_sol_importacao FOREIGN KEY (importacao_id) REFERENCES importacoes(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS solicitacao_itens (
      solicitacao_id BIGINT UNSIGNED NOT NULL,
      codigo_interno VARCHAR(10) NOT NULL,
      valor DECIMAL(10,2) NULL,
      PRIMARY KEY (solicitacao_id, codigo_interno),
      KEY idx_item_codigo (codigo_interno),
      CONSTRAINT fk_item_solicitacao FOREIGN KEY (solicitacao_id) REFERENCES solicitacoes(id) ON DELETE CASCADE,
      CONSTRAINT fk_item_procedimento FOREIGN KEY (codigo_interno) REFERENCES procedimentos(codigo_interno)
    )`,
    `CREATE TABLE IF NOT EXISTS acompanhamentos (
      paciente_id INT UNSIGNED NOT NULL,
      especialidade_id SMALLINT UNSIGNED NOT NULL,
      status ENUM('em_tratamento','concluido','abandonou','transferido') NULL,
      observacoes TEXT NULL,
      atualizado_por INT UNSIGNED NULL,
      atualizado_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (paciente_id, especialidade_id),
      CONSTRAINT fk_acomp_paciente FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE,
      CONSTRAINT fk_acomp_especialidade FOREIGN KEY (especialidade_id) REFERENCES especialidades(id),
      CONSTRAINT fk_acomp_usuario FOREIGN KEY (atualizado_por) REFERENCES usuarios(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS configuracoes (
      escopo VARCHAR(40) NOT NULL COMMENT 'global ou slug da especialidade',
      chave VARCHAR(60) NOT NULL,
      valor VARCHAR(255) NOT NULL,
      PRIMARY KEY (escopo, chave)
    )`,
  ],
];

async function migrar(conn) {
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migracoes (
    versao INT UNSIGNED NOT NULL PRIMARY KEY,
    aplicada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  const [[{ atual }]] = await conn.query('SELECT COALESCE(MAX(versao), 0) AS atual FROM schema_migracoes');
  for (let v = atual; v < MIGRACOES.length; v++) {
    for (const sql of MIGRACOES[v]) await conn.query(sql);
    await conn.query('INSERT INTO schema_migracoes (versao) VALUES (?)', [v + 1]);
    console.log(`[db] migração ${v + 1}/${MIGRACOES.length} aplicada`);
  }
}

async function semearEspecialidades(conn) {
  for (const e of ESPECIALIDADES) {
    // Only inserts: the visibility toggle and names edited in the UI survive restarts.
    await conn.query(
      'INSERT IGNORE INTO especialidades (slug, nome, visivel, ordem) VALUES (?, ?, ?, ?)',
      [e.slug, e.nome, e.visivel ? 1 : 0, e.ordem]
    );
  }
}

/**
 * Creates the database if needed, applies pending migrations and seeds the
 * specialty catalogue. Serialized with a named lock so two processes starting
 * together (server + import script) do not migrate twice.
 */
export async function iniciarBanco() {
  const admin = await mysql.createConnection({ ...CONFIG_BANCO, database: undefined, charset: 'utf8mb4' });
  try {
    await admin.query(
      `CREATE DATABASE IF NOT EXISTS \`${CONFIG_BANCO.database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
    );
  } finally {
    await admin.end();
  }
  const conn = await pool.getConnection();
  try {
    await conn.query('SELECT GET_LOCK(?, 30)', ['dashboard_migracao']);
    await migrar(conn);
    await semearEspecialidades(conn);
    await semearConfiguracoes(conn);
  } finally {
    await conn.query('SELECT RELEASE_LOCK(?)', ['dashboard_migracao']).catch(() => {});
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Settings. Every threshold lives here with its type/range so the settings
// screen, the API validation and the readings engine agree. Values are stored
// per scope: 'global', overridable per specialty slug.
// ---------------------------------------------------------------------------

export const DEFINICOES_CONFIG = {
  faltas_alerta_criticas: {
    padrao: 2, tipo: 'inteiro', min: 1, max: 20,
    rotulo: 'Faltas seguidas para alerta crítico',
    descricao: 'Quantas faltas seguidas (sem comparecer no meio) colocam o paciente em alerta crítico.',
  },
  dias_sem_retorno_alerta: {
    padrao: 45, tipo: 'inteiro', min: 7, max: 730,
    rotulo: 'Dias sem retorno para alerta',
    descricao: 'Paciente sem consulta futura no SISREG e sem comparecer há mais dias que isso (contando até a data de referência dos dados) entra em "sem retorno".',
  },
  janela_faltas_meses: {
    padrao: 0, tipo: 'inteiro', min: 0, max: 120,
    rotulo: 'Janela para contar faltas (meses)',
    descricao: 'Só faltas dentro desta janela contam para o total de faltas e para o indicador "faltoso". 0 = todo o histórico importado.',
  },
};

async function semearConfiguracoes(conn) {
  for (const [chave, def] of Object.entries(DEFINICOES_CONFIG)) {
    await conn.query('INSERT IGNORE INTO configuracoes (escopo, chave, valor) VALUES (?, ?, ?)', ['global', chave, String(def.padrao)]);
  }
}

function validarValor(def, bruto) {
  const n = Number.parseInt(bruto, 10);
  return Number.isFinite(n) && n >= def.min && n <= def.max ? n : null;
}

/**
 * Effective settings for a scope: defaults ← global ← specialty override.
 * Returns { valores, origem } where origem tells, per key, which layer won.
 */
export async function lerConfiguracoes(escopo = 'global') {
  const linhas = await consultar(
    'SELECT escopo, chave, valor FROM configuracoes WHERE escopo IN (?, ?)',
    ['global', escopo]
  );
  const valores = {};
  const origem = {};
  for (const [chave, def] of Object.entries(DEFINICOES_CONFIG)) {
    valores[chave] = def.padrao;
    origem[chave] = 'padrao';
    for (const camada of ['global', escopo]) {
      const l = linhas.find((x) => x.escopo === camada && x.chave === chave);
      const v = l ? validarValor(def, l.valor) : null;
      if (v != null) { valores[chave] = v; origem[chave] = camada; }
    }
  }
  return { valores, origem };
}
