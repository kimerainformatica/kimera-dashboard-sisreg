/** Error whose message is safe to show the user (becomes HTTP 400). */
export class ErroValidacao extends Error {
  constructor(mensagem, detalhes) {
    super(Array.isArray(mensagem) ? mensagem.join('; ') : mensagem);
    this.name = 'ErroValidacao';
    this.detalhes = Array.isArray(mensagem) ? mensagem : detalhes;
  }
}
