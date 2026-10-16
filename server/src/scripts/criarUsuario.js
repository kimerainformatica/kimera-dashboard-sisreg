import { iniciarBanco, consultar, encerrarBanco } from '../db.js';
import { hashSenha } from '../auth.js';

const [, , usuario, senha, nome] = process.argv;

if (!usuario || !senha) {
  console.error('Uso: node src/scripts/criarUsuario.js <usuario> <senha> [nome]');
  process.exit(1);
}
if (senha.length < 6) {
  console.error('A senha precisa ter ao menos 6 caracteres.');
  process.exit(1);
}

const chave = usuario.trim().toLowerCase();
await iniciarBanco();
await consultar(
  `INSERT INTO usuarios (usuario, nome, senha_hash, papel) VALUES (?, ?, ?, 'admin') AS novo
   ON DUPLICATE KEY UPDATE senha_hash = novo.senha_hash, nome = novo.nome, ativo = 1`,
  [chave, nome || chave, hashSenha(senha)]
);
await encerrarBanco();
console.log(`Usuário "${chave}" criado/atualizado com sucesso (papel: admin).`);
