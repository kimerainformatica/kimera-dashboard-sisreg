import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { iniciarBanco, CONFIG_BANCO } from './db.js';
import authRouter from './routes/auth.js';
import especialidadesRouter from './routes/especialidades.js';
import importacoesRouter from './routes/importacoes.js';
import procedimentosRouter from './routes/procedimentos.js';
import configuracoesRouter from './routes/configuracoes.js';
import usuariosRouter from './routes/usuarios.js';
import { requireAuth, limparSessoesExpiradas } from './middleware/requireAuth.js';
import { requireAdmin } from './middleware/requireAdmin.js';
import { tratarErros, rotaNaoEncontrada } from './middleware/errors.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

// The Vite dev server proxies /api and clinic mode serves the SPA from this
// same process, so cross-origin access is off unless explicitly allowed
// (CORS_ORIGEM=http://host:porta) — cookies must not leak to any site.
if (process.env.CORS_ORIGEM) {
  app.use(cors({ origin: process.env.CORS_ORIGEM.split(','), credentials: true }));
}
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ status: 'ok', versao: '3.0.0', hora: new Date().toISOString() }));
app.use('/api/auth', authRouter);

app.use('/api/especialidades', requireAuth, especialidadesRouter);
app.use('/api/importacoes', requireAuth, importacoesRouter);
app.use('/api/procedimentos', requireAuth, procedimentosRouter);
app.use('/api/configuracoes', requireAuth, configuracoesRouter);
app.use('/api/usuarios', requireAuth, requireAdmin, usuariosRouter);
app.all('/api/*', rotaNaoEncontrada);

// Serve the built React app when present (production / clinic-server mode)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get('*', (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use(tratarErros);

try {
  await iniciarBanco();
} catch (err) {
  console.error(`Não foi possível conectar ao MySQL em ${CONFIG_BANCO.host}:${CONFIG_BANCO.port} (banco "${CONFIG_BANCO.database}", usuário "${CONFIG_BANCO.user}").`);
  console.error(`Motivo: ${err.code ?? ''} ${err.message}`);
  console.error('Verifique se o MySQL está ligado e se server/.env está preenchido (veja README).');
  process.exit(1);
}
const removidas = await limparSessoesExpiradas();
if (removidas) console.log(`[auth] ${removidas} sessão(ões) expirada(s) removida(s)`);

app.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  console.log(`Servidor rodando na porta ${PORT} (MySQL ${CONFIG_BANCO.host}:${CONFIG_BANCO.port}/${CONFIG_BANCO.database})`);
  console.log(`  local:  http://localhost:${PORT}`);
  for (const ip of ips) console.log(`  rede:   http://${ip}:${PORT}`);
});
