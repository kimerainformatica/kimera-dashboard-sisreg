// One-off: copies the users (same password hashes) and the alert thresholds
// from the old SQLite database (server/data/clinica.db) into MySQL.
// Old manual patients/appointments are not carried over: SISREG is now the source.
//   node src/scripts/migrarSqlite.js [caminho/clinica.db]
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { iniciarBanco, consultar, encerrarBanco, DEFINICOES_CONFIG } from '../db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const arquivo = process.argv[2] || path.join(__dirname, '..', '..', 'data', 'clinica.db');
if (!fs.existsSync(arquivo)) {
  console.error(`Banco SQLite não encontrado: ${arquivo}`);
  process.exit(1);
}

const antigo = new DatabaseSync(arquivo, { readOnly: true });
await iniciarBanco();

const usuarios = antigo.prepare('SELECT usuario, nome, senha_hash, papel, ativo, criado_em FROM usuarios').all();
for (const u of usuarios) {
  await consultar(
    `INSERT INTO usuarios (usuario, nome, senha_hash, papel, ativo, criado_em) VALUES (?, ?, ?, ?, ?, ?) AS novo
     ON DUPLICATE KEY UPDATE nome = novo.nome, senha_hash = novo.senha_hash, papel = novo.papel, ativo = novo.ativo`,
    [u.usuario, u.nome, u.senha_hash, u.papel === 'admin' ? 'admin' : 'equipe', u.ativo ? 1 : 0, u.criado_em]
  );
}
console.log(`${usuarios.length} usuário(s) copiado(s).`);

// Only thresholds that still exist with the same meaning.
const configs = antigo.prepare('SELECT chave, valor FROM configuracoes').all();
let copiadas = 0;
for (const c of configs) {
  if (!['faltas_alerta_criticas', 'janela_faltas_meses'].includes(c.chave)) continue;
  const def = DEFINICOES_CONFIG[c.chave];
  const n = Number(c.valor);
  if (!Number.isInteger(n) || n < def.min || n > def.max) continue;
  await consultar(
    `INSERT INTO configuracoes (escopo, chave, valor) VALUES ('global', ?, ?) AS novo ON DUPLICATE KEY UPDATE valor = novo.valor`,
    [c.chave, String(n)]
  );
  copiadas++;
}
console.log(`${copiadas} configuração(ões) copiada(s).`);
antigo.close();
await encerrarBanco();
