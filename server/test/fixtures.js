// Builders for synthetic SISREG export files used by the tests.
export const CABECALHO = 'solicitacao;codigo_interno;codigo_unificado;descricao_procedimento;cpf_proficional_executante;nome_profissional_executante;data_agendamento;hr_agendamento;tipo;cns;nome;dt_nascimento;idade;idade_meses;nome_mae;tipo_logradouro;logradouro;complemento;numero_logradouro;bairro;cep;telefone;municipio;ibge;mun_solicitante;ibge_solicitante;cnes_solicitante;unidade_fantasia;sexo;data_solicitacao;operador_solicitante;data_autorizacao;operador_autorizador;valor_procedimento;situacao;cid;cpf_profissional_solicitante;nome_profissional_solicitante';

/** One export row with sensible defaults; override any column by name. */
export function linha(campos = {}) {
  const base = {
    solicitacao: '600000001', codigo_interno: '2018486', codigo_unificado: '0301010048',
    descricao_procedimento: 'CONSULTA EM ODONTOLOGIA - ORTODONTIA - RETORNO', cpf_proficional_executante: '12345678901',
    nome_profissional_executante: 'DRA TESTE', data_agendamento: '01.09.2026', hr_agendamento: '08:00', tipo: '0',
    cns: '700000000000001', nome: 'PACIENTE TESTE', dt_nascimento: '10.05.2010', idade: '16', idade_meses: '0',
    nome_mae: 'MAE TESTE', tipo_logradouro: 'RUA', logradouro: 'A', complemento: '', numero_logradouro: '1',
    bairro: 'CENTRO', cep: '65000000', telefone: '(98)99999-0000', municipio: 'SAO LUIS', ibge: '211130',
    mun_solicitante: 'SAO LUIS', ibge_solicitante: '211130', cnes_solicitante: '9431039',
    unidade_fantasia: 'UNIDADE TESTE', sexo: 'F', data_solicitacao: '01.08.2026', operador_solicitante: 'OP',
    data_autorizacao: '01.08.2026', operador_autorizador: 'OP', valor_procedimento: '6.30', situacao: 'CONFIRMADO',
    cid: 'K072', cpf_profissional_solicitante: '12345678901', nome_profissional_solicitante: 'DRA TESTE',
  };
  const r = { ...base, ...campos };
  return CABECALHO.split(';').map((c) => r[c]).join(';');
}

export const arquivo = (...linhas) => Buffer.from([CABECALHO, ...linhas].join('\r\n'), 'utf8');
