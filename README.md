# Dashboard SISREG — Especialidades Odontológicas (UEO Sorrir)

Painel para acompanhar os agendamentos do **SISREG** por especialidade:
comparecimentos, **faltas**, pacientes sem retorno e procedimentos realizados.
Todas as especialidades do arquivo são importadas e guardadas; a interface libera
uma de cada vez — hoje, **Ortodontia**. Roda em um computador da clínica e é
acessado pelos demais na **rede local**.

## Stack

- **Banco:** MySQL 8.4 (versão ZIP em `%USERPROFILE%\MySQL`, porta 3306, só aceita conexões do próprio computador)
- **Backend:** Node.js 22.5+ + Express + `mysql2` — `server/`
- **Frontend:** React + Vite + `lucide-react` — `client/`
- Versão anterior (SQLite, cadastro manual): `backup/versao-sqlite-2026-10-15.tar.gz`

## Ligar o sistema

```bat
ferramentas\iniciar-sistema.bat
```

Liga o MySQL (se estiver desligado), gera a interface se preciso e sobe o sistema em
`http://localhost:3001`. Os outros computadores da rede acessam por
`http://<IP-DESTE-COMPUTADOR>:3001` (veja o IP com `ipconfig`; o Firewall do Windows
pode pedir para liberar o Node na primeira vez).

Para o MySQL ligar sozinho com o Windows, rode **uma vez** como administrador
`ferramentas\instalar-servico-mysql.bat` (feche antes o MySQL aberto pelo outro script).

Desenvolvimento (recarrega ao salvar): `npm run dev` → `http://localhost:5173`.

## Configuração do banco

`server/.env` (não versionar):

```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=dashboard
DB_PASSWORD=...
DB_NAME=dashboard_sisreg
```

O sistema cria as tabelas sozinho na primeira subida (`schema_migracoes`). A senha do
`root` do MySQL fica em `%USERPROFILE%\MySQL\CREDENCIAIS-ROOT.txt` (fora do repositório).

## Login

Sessão por cookie, senha com hash `scrypt`. O usuário administrador foi trazido
do banco antigo com a mesma senha. Criar usuário ou trocar senha esquecida:

```bash
npm run usuario:criar -w server -- <usuario> <senha> "Nome opcional"
```

## Importar o SISREG

No SISREG, exporte os **agendamentos da unidade executante** (CSV, um arquivo por mês;
o nome termina com a data da exportação, ex.: `...SORRIR-20261013.csv`).

- **Pela tela:** menu *Importar SISREG* → arraste um ou vários arquivos → confira a
  análise (novas, atualizadas, pendente→confirmado, códigos novos) → *Importar*.
- **Em lote:** `npm run importar -w server -- "arquivos SISREG"` (pasta ou arquivos).

Reimportar um mês não duplica nada: a chave é o nº da solicitação + código do
procedimento. A situação e o cadastro do paciente só são substituídos por uma
exportação **mais nova** — um arquivo antigo enviado depois é ignorado.

### Como o arquivo é lido

- Cada linha é um procedimento de uma **solicitação** (data/hora, paciente, profissional
  e situação são os mesmos em todas as linhas dela).
- A **especialidade** vem do `codigo_interno` (`server/src/sisreg/classificacao.js`):
  os 4 primeiros dígitos agrupam por especialidade (0257 ortodontia, 0250 endodontia,
  0120 Sorrir Móvel…); os grupos de consulta 0598/0710/2018 são mapeados código a
  código. Códigos novos são classificados na importação e podem ser corrigidos em
  *Configurações → Procedimentos*.
- **Consulta/retorno** (agenda) é onde se mede falta; **procedimento** é a produção do
  atendimento.

## Regras dos indicadores

Texto completo no botão **"Como calculamos"** de cada especialidade.

- **Compareceu** — situação CONFIRMADO.
- **Falta** — consulta/retorno PENDENTE com data anterior à exportação que a trouxe.
- **Sem atualização** — PENDENTE com data já passada, mas exportada antes/no dia;
  reexporte o mês (a tela de importação mostra quantas há por mês).
- **Data de referência** — último dia com atendimento confirmado nos dados; "dias sem
  retorno" e "próximo agendamento" são medidos contra ela.
- **Crítico** — N faltas seguidas (padrão 2). **Sem retorno** — sem agenda futura e sem
  comparecer há N dias (padrão 45). **Faltoso** — ao menos 1 falta na janela.
- Limites em *Configurações*, gerais ou por especialidade.
- **Acompanhamento da equipe** (no painel do paciente): situação do tratamento e
  observações; concluído/abandonou/transferido tira o paciente dos alertas. É o único
  dado editável — o resto vem do SISREG.

## Testes

```bash
npm test -w server   # leitor do SISREG, classificação, métricas e importação (banco dashboard_sisreg_teste)
```

## Dados sensíveis

Os arquivos do SISREG trazem nome, CNS, endereço e telefone dos pacientes. A pasta
`arquivos SISREG/` e `backup/` ficam fora do versionamento (`.gitignore`). O MySQL só
escuta em `127.0.0.1`. A app roda em HTTP simples para a rede interna — não exponha a
porta 3001 na internet sem um proxy HTTPS.
