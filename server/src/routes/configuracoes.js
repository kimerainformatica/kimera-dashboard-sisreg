import { Router } from 'express';
import { DEFINICOES_CONFIG, lerConfiguracoes, transacao, primeiro } from '../db.js';
import { rota } from '../middleware/errors.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { ErroValidacao } from '../lib/erros.js';

const router = Router();

async function escopoValido(escopo) {
  if (!escopo || escopo === 'global') return 'global';
  if (!(await primeiro('SELECT id FROM especialidades WHERE slug = ?', [escopo]))) {
    throw new ErroValidacao('Especialidade inválida');
  }
  return escopo;
}

router.get('/', rota(async (req, res) => {
  const escopo = await escopoValido(req.query.escopo);
  res.json({ escopo, ...(await lerConfiguracoes(escopo)), definicoes: DEFINICOES_CONFIG });
}));

// Only known keys are accepted and each is checked against its definition,
// so a typo can never silently disable the alerts. In a specialty scope,
// null removes the override and falls back to the global value.
router.put('/', requireAdmin, rota(async (req, res) => {
  const escopo = await escopoValido(req.query.escopo);
  const erros = [];
  const gravar = [];
  const remover = [];
  for (const [chave, bruto] of Object.entries(req.body ?? {})) {
    const def = DEFINICOES_CONFIG[chave];
    if (!def) { erros.push(`Configuração desconhecida: ${chave}`); continue; }
    if (bruto === null || bruto === '') {
      if (escopo === 'global') erros.push(`${def.rotulo}: não pode ficar vazio`);
      else remover.push(chave);
      continue;
    }
    const n = Number(bruto);
    if (!Number.isInteger(n) || n < def.min || n > def.max) {
      erros.push(`${def.rotulo}: informe um número inteiro entre ${def.min} e ${def.max}`);
      continue;
    }
    gravar.push([escopo, chave, String(n)]);
  }
  if (erros.length) throw new ErroValidacao(erros);

  await transacao(async (conn) => {
    for (const linha of gravar) {
      await conn.query(
        'INSERT INTO configuracoes (escopo, chave, valor) VALUES (?, ?, ?) AS novo ON DUPLICATE KEY UPDATE valor = novo.valor',
        linha
      );
    }
    for (const chave of remover) await conn.query('DELETE FROM configuracoes WHERE escopo = ? AND chave = ?', [escopo, chave]);
  });
  res.json({ escopo, ...(await lerConfiguracoes(escopo)), definicoes: DEFINICOES_CONFIG });
}));

export default router;
