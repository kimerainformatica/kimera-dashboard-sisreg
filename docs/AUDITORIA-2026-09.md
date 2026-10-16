# Auditoria técnica — Dashboard Orto (setembro/2026)

Revisão completa do código (backend `server/`, frontend `client/`) com foco em
**leitura/importação dos arquivos do SISREG**, **definições dos indicadores** e
robustez geral. Cada item abaixo diz o que estava errado, o impacto na clínica e
o que foi feito. Todos os itens marcados como corrigidos estão cobertos por
testes automatizados (`cd server && npm test` — 18 testes) e foram validados
ponta a ponta contra o servidor com um arquivo SISREG simulado (Windows-1252,
`;`, linhas de título e rodapé).

## 1. Falhas críticas encontradas

| # | Falha | Onde estava | Impacto | Situação |
|---|-------|-------------|---------|----------|
| C1 | **Importação duplicava pacientes.** Não existia nenhuma chave de deduplicação (CNS, código da solicitação, nome+nascimento). | `routes/pacientes.js` (`/importar/confirmar`) | O SISREG exporta a fila diariamente; cada reimportação dobrava a base e distorcia todos os KPIs e o ranking. | **Corrigido.** Deduplicação por CNS (índice único no banco) → código da solicitação → nome+nascimento → nome+telefone, também dentro do próprio arquivo. Política configurável (atualizar contato / ignorar). Homônimos sem chave são avisados. |
| C2 | **Datas do SISREG com hora não eram reconhecidas** (`03/01/2026 10:15:00`) e viravam silenciosamente *a data de hoje*. | `normalizarData()` em `routes/pacientes.js` | Corrompia `data_inicio_tratamento` → "tempo de tratamento" zerado, ranking e alerta de prazo errados para todo lote importado. | **Corrigido.** `lib/datas.js::parseDataFlex` aceita DD/MM/AAAA[ HH:MM[:SS]], DD/MM/AA, DD-MM-AAAA, AAAA-MM-DD, AAAAMMDD, serial do Excel; valida dia/mês reais (31/02 é rejeitado). Data ausente/ilegível gera **aviso explícito** e usa a data padrão escolhida pelo usuário. |
| C3 | **Linhas de título antes do cabeçalho quebravam a leitura.** O parser tomava a 1ª linha como cabeçalho. | `parse(..., { columns: true })` | Relatórios do SISREG trazem "SISREG III – Fila de espera / Período: …" antes do cabeçalho e "Total de registros" no rodapé → colunas erradas ou erro. | **Corrigido.** `detectarLinhaCabecalho` acha a linha de cabeçalho pela largura modal + conteúdo textual; preâmbulo e rodapé são ignorados e mostrados ao usuário. Linha do cabeçalho pode ser ajustada manualmente. |
| C4 | **Codificação/separador frágeis.** Latin-1 em vez de Windows-1252 (0x80–0x9F viram lixo), sem UTF-16 (Excel "Texto Unicode"), só `,`/`;` (sem TAB/`\|`), decisão pela 1ª linha apenas. | `decodificarBuffer`, `detectarDelimitador` | Acentos errados ("MunicÃ­pio", "–"), arquivos TAB não abriam, títulos com vírgula escolhiam o separador errado. | **Corrigido.** Detecção por BOM/validação UTF-8 estrita/heurística UTF-16, decodificação `windows-1252`; separador escolhido pela consistência entre as 40 primeiras linhas (fora de aspas). |
| C5 | **Configurações sem validação.** `faltas_alerta_criticas = "abc"` → `Number` = `NaN` → `x >= NaN` sempre falso. | `routes/configuracoes.js`, `services/metrics.js` | Um erro de digitação **desligava os alertas** sem nenhum aviso. | **Corrigido.** Cada chave tem tipo, mínimo, máximo e descrição (`DEFINICOES_CONFIG` em `db.js`); a API rejeita valores fora do intervalo e a leitura sempre cai no padrão seguro. |
| C6 | **Datas `AAAA-MM-DD` interpretadas como UTC** em `new Date('2025-01-04')` vs. `new Date()` local. | `services/metrics.js::diffDias` | Erro de 1 dia nas contagens no fuso do Brasil (UTC-3) — visível nos limiares de alerta. | **Corrigido.** `lib/datas.js` trata tudo como horário local (meia-noite a meia-noite). |
| C7 | **Consultas passadas que ficaram "agendado" eram invisíveis.** | `metrics.js` ignorava `agendado` no passado | Se a recepção esquece de dar baixa, o paciente **nunca vira faltoso** nem aparece em lugar nenhum. | **Corrigido.** Novo indicador "consultas sem baixa" (limiar configurável): KPI no dashboard, fila na Agenda com baixa em lote, aviso no painel do paciente. |
| C8 | **Erros de integridade viravam 500 genérico** (dentista inexistente, CNS repetido). | `index.js` handler | Usuário via "Erro interno" sem saber o que corrigir. | **Corrigido.** `middleware/errors.js` traduz `ErroValidacao` (400 com lista de mensagens) e violações SQLite (409 com o campo). Ids inválidos → 400. |
| C9 | **Busca sensível a acento/caixa** (`LIKE` do SQLite só ignora caixa em ASCII). | `/pacientes`, `/pacientes/buscar` | "jose" não achava "José"; telefone só batia se digitado com a mesma formatação. | **Corrigido.** Colunas `nome_busca` e `telefone_busca` (sem acento/só dígitos, indexadas) mantidas em toda escrita; busca também por CNS. |
| C10 | **Endpoint legado `/importar`** sem detecção de separador/codificação, sem normalizar datas nem validar status. | `routes/pacientes.js` | Gravava datas em formato livre e status inválidos. | **Corrigido.** Passou a usar o mesmo motor (mapeamento automático), com `?simular=true`. |
| C11 | **Sessão gravava no banco em toda requisição** (`UPDATE sessoes` a cada GET). | `middleware/requireAuth.js` | Escrita desnecessária e impedia qualquer cache de métricas. | **Corrigido.** Renovação deslizante só quando restam < 11h55 (a cada ~5 min); sessões expiradas são limpas no boot e no login. |
| C12 | **CORS aberto para qualquer origem** com autenticação por cookie. | `index.js` | Risco de o cookie ser usado por outro site na mesma rede. | **Corrigido.** CORS desligado por padrão (Vite faz proxy; modo clínica é mesma origem); liga-se só com `CORS_ORIGEM=`. |

### Falhas de definição (não eram bugs de código, mas leituras erradas)

| # | Problema | Correção |
|---|----------|----------|
| D1 | "Faltoso" = 1 falta em toda a vida do paciente. | Janela configurável (`janela_faltas_meses`, padrão 12; 0 = histórico todo). O total do histórico continua disponível no painel. |
| D2 | Prazo previsto = `meses × 30 dias`. | Meses de calendário reais (`somarMeses`), com data-fim explícita e % de andamento. |
| D3 | "Dias sem retorno" contava da última consulta *realizada* (inclusive falta). | Conta do último **comparecimento** — é isso que interessa para reengajar. |
| D4 | Paciente da fila do SISREG era obrigado a ter dentista e status "em andamento". | `dentista_id` passou a ser opcional e existe o status **aguardando (fila)**; ao marcar a 1ª consulta o paciente vira "em andamento" e herda o dentista. |
| D5 | Nenhum lugar explicava como cada número é calculado. | Endpoint `/api/dashboard/definicoes` + painel "Como calculamos" no dashboard, sempre com os limites vigentes. |

## 2. Melhorias implementadas

### Importação (SISREG e planilhas)
- Assistente em **4 passos**: Arquivo → Mapear colunas → **Revisar (simulação, nada gravado)** → Resultado.
- Faixa de detecção: layout (SISREG / planilha interna / genérico), codificação, separador, linhas de título e rodapé ignoradas; ajuste manual de separador e linha do cabeçalho com releitura.
- **Perfil de cada coluna**: % preenchida, tipo inferido (CNS/data/telefone/número/texto), exemplos; aviso quando a coluna mapeada não bate com o tipo esperado.
- Sugestão de mapeamento por sinônimos com listas de exclusão ("Nome do Profissional Solicitante" nunca vira nome do paciente) e confirmação pelo conteúdo (dígito verificador do CNS, datas válidas).
- Campos novos gravados: CNS (validado pelo algoritmo DATASUS), data de nascimento, sexo, município, procedimento, classificação de risco, situação e código da solicitação no SISREG, unidade solicitante, origem.
- Telefones "sujos" (`(85) 99999-1111 / 3222-0000`, `+55…`, `0…`) normalizados; nomes em CAIXA ALTA capitalizados.
- Lista de ocorrências por linha (erro / aviso / duplicado / atualizado) filtrável e exportável em CSV.
- **Log de importações** (`importacoes`) com usuário, contagens e mapeamento; **desfazer** remove os pacientes criados pela importação que ainda não têm consulta.
- Testes: `server/test/importacao.test.js`, `server/test/lib.test.js`.

### Dashboard e leituras
- KPIs clicáveis (viram filtro): em tratamento, aguardando, faltosos, críticos, sem retorno, sem baixa, sem dentista; comparecimento médio e global.
- Filtros novos: status, origem, "qualquer alerta", sem baixa, mínimo de faltas, "sem dentista"; ordenação por gravidade, prazo, próxima consulta; cabeçalhos clicáveis (asc/desc); busca com debounce por nome/telefone/CNS.
- Coluna **Prazo** com barra de andamento (vermelha quando estourado); próxima consulta e pendências de baixa na linha.
- **Painel lateral do paciente**: motivo do alerta em texto, dados de identidade/SISREG, linha do tempo do tratamento, histórico de consultas com mudança de status inline.
- **Exportar CSV** do ranking com os filtros atuais (BOM + `;`, abre direto no Excel em PT-BR).
- Métricas em cache invalidado por `total_changes()` do SQLite — recalcula só quando algo foi gravado.

### Agenda
- Resumo (hoje / 7 dias / sem baixa / faltas no mês), períodos prontos e personalizado, paginação, busca por paciente.
- **Modo "sem baixa"** com seleção e baixa em lote (compareceu/faltou).
- Validação real de data/hora, dentista e paciente; bloqueio de duplicidade no mesmo horário.

### Cadastro e API
- Validação única (`services/pacientes.js`) usada por formulário, API e importação; respostas com lista de mensagens e avisos não bloqueantes.
- Migrações versionadas (`PRAGMA user_version`) com reconstrução segura da tabela `pacientes` (FK desligada durante a migração, `foreign_key_check` antes do commit).
- Tela de Configurações gerada a partir das definições (rótulo, faixa, descrição) + histórico de importações com desfazer.

## 3. Verificação realizada
- `npm test` no servidor: 18/18.
- Migração aplicada no banco real `server/data/clinica.db` (v0 → v2), backup em `%TEMP%` antes.
- Fluxo HTTP completo com arquivo SISREG simulado: preview → simulação → execução → reimportação (0 duplicados, 1 atualizado) → desfazer.
- Capturas de tela (Chrome headless) do dashboard, painel do paciente, assistente (mapeamento e revisão), pacientes, agenda e configurações.

## 4. Pendências e recomendações
- **Layout real do SISREG da sua regional**: os sinônimos cobrem os cabeçalhos conhecidos (com espaços e com `_`), mas vale importar um arquivo real em modo simulação e me mandar o cabeçalho para eu fixar um preset exato.
- Desfazer importação não reverte *atualizações* de contato (só remove criados); se precisar, dá para guardar o valor anterior no log.
- Envio de lembretes (WhatsApp/SMS) para "sem retorno" e faltosos: a base já tem telefone normalizado; falta só o conector.
- HTTPS: a app segue em HTTP na rede interna; para expor fora da LAN, coloque um proxy TLS na frente.
