// Bulk import of SISREG exports from the command line:
//   npm run importar -w server -- "../arquivos SISREG/arquivo1.csv" "../arquivos SISREG/arquivo2.csv"
// A directory imports every .csv inside it. Files are imported oldest export
// first so newer situations always win.
import fs from 'node:fs';
import path from 'node:path';
import { iniciarBanco, encerrarBanco } from '../db.js';
import { lerExportacao } from '../sisreg/leitor.js';
import { importarLeitura } from '../services/importacaoSisreg.js';
import { hojeISO } from '../lib/datas.js';

const entradas = process.argv.slice(2);
if (!entradas.length) {
  console.error('Uso: node src/scripts/importarSisreg.js <arquivo.csv | pasta> [...]');
  process.exit(1);
}

const arquivos = entradas.flatMap((e) => {
  if (fs.statSync(e).isDirectory()) {
    return fs.readdirSync(e).filter((f) => f.toLowerCase().endsWith('.csv')).map((f) => path.join(e, f));
  }
  return [e];
});

await iniciarBanco();
const leituras = arquivos.map((arquivo) => {
  const leitura = lerExportacao(fs.readFileSync(arquivo), path.basename(arquivo));
  return { arquivo, leitura, exportadoEm: leitura.exportadoEmSugerido ?? hojeISO() };
});
leituras.sort((a, b) => a.exportadoEm.localeCompare(b.exportadoEm) || a.leitura.periodo.inicio.localeCompare(b.leitura.periodo.inicio));

let falhou = false;
for (const { arquivo, leitura, exportadoEm } of leituras) {
  try {
    const r = await importarLeitura(leitura, { arquivo: path.basename(arquivo), exportadoEm });
    console.log(
      `${path.basename(arquivo)}: período ${r.periodo.inicio}..${r.periodo.fim}, exportado em ${exportadoEm} — ` +
      `${r.novas} novas, ${r.atualizadas} atualizadas, ${r.ignoradas} ignoradas, ` +
      `${r.pacientesNovos} pacientes novos, ${r.procedimentosNovos.length} procedimentos novos, ` +
      `${r.totalErros} linhas com erro (${r.duracao_ms} ms)`
    );
  } catch (e) {
    falhou = true;
    console.error(`${path.basename(arquivo)}: ERRO — ${e.message}`);
  }
}
await encerrarBanco();
process.exit(falhou ? 1 : 0);
