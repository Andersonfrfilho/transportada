# Evidência — spec 248

## Fase 0 — Conferência

### T0.1 — Fatos do `plan.md` § Contexto contra o código

Conferido em 2026-10-08, na worktree `transportada-wt/spec-248` (branch `work/spec-248`, a partir de
`origin/staging` `718fbd8eb`). Pacotes conferidos nos instalados por `bun install --frozen-lockfile`:
`@adatechnology/meta-whatsapp-module` 0.8.0, `@adatechnology/meta-whatsapp-provider` 0.4.0,
`@adatechnology/fiscal-provider` 0.3.2, `@adatechnology/notification-module` 0.1.0-rc.3.

Nenhum fato do plan foi contrariado. As notas abaixo são divergências de **linha ou de caminho**; o
fato afirmado vale.

- `save-occurrence-type.use-case.ts:147` → afirmado: "impede que o aviso interno zere o e-mail à
  contratante". Encontrado: a linha 147 é fim de comentário; o comentário (`:142-147`) descreve o
  RF2 da 247 (assunto e corpo "seguem gravados como vieram"). O campo `emailsContractor` está em `:68`.
  Não há zeragem no arquivo.
- `contractors.report_email` `:115` → encontrado em `:120` (`reportEmail`), tabela `contractors` em
  `:108`, arquivo `apps/api-transportada/src/database/delivery-client.schema.ts`.
- `main.ts:1688-1695` (ordem: conversa antes do despachante) → encontrado em
  `apps/api-transportada/src/main.ts:1703-1712`: `createOccurrenceConversationWhatsAppHook({ next:
whatsappCommandHook(instance) })`. Ordem confirmada; a faixa citada é outra região.
- `whatsapp-conversation-inbound` `:63-129` e `:78-82` → confirmados.
- `meta-whatsapp-sending.gateway.ts:35-51` → arquivo em
  `apps/api-transportada/src/whatsapp/infrastructure/` (o plan não cita o diretório). `sendText` `:36`,
  `sendTemplate` `:41`; não há `sendMedia`. Confirmado.
- `me-occurrence-conversation.routes.ts:28-33` → a faixa contém `READ_POLICY` e `UPLOADS_PATH`. A rota
  `/me/trips/current/occurrence-conversations` não foi localizada nessa faixa; conferir na Fase 1/4.
- `ADR-0048 §2 :38-42` → `### 2` está em `:41` e "Sem contato" em `:43`. Fato confirmado.
- `contractor-portal-conversation.use-case.ts:163-170` → a faixa é a assinatura da factory. A
  afirmação "sem aviso ao operador" foi confirmada por busca: o arquivo não tem `notify`.
- `frontend-transportada/src/main.tsx:451-490` (redirect ao app do motorista) → confirmado no app
  `apps/frontend-transportada`. `frontend-driver` não tem nenhum módulo de conversa de ocorrência.
- `nfe.schema.ts` sem e-mail → confirmado no da API (`apps/api-transportada/src/database/nfe.schema.ts`,
  `nfeParticipants` em `:356`, sem coluna de e-mail). O `email` do worker (`:90`) pertence a
  `company_fiscal_profiles`, não à NF-e.
- `decideWhatsAppWindowExpiry` `:57` → confirmado; não é chamado em nenhum `apps/*/src`.
- `BILL_EXTENSION_OCCURRENCE_TYPE_NAME` `:52` → confirmado.
- `maskEmailAddress` `company-user.policy.ts:177` → confirmado, função não exportada.

Pacotes instalados (`node_modules/.bun`):

- `SendMessageUseCase.sendMedia` `:1052`, chama `assertWithinWindow` em `:1053`. `assertWithinWindow`
  está em `:1031-1033` (o plan cita `:1029-1033`). `WHATSAPP_WINDOW_HOURS = 24` em `:1014`; lança
  `WindowExpiredError` quando `hours >= 24`. Confirmado, com a faixa de linha ajustada.
- `touchInbound` `:405-411`, chamado em `:987`. Confirmado.
- Migração `20260725195853_freezing_switch/migration.sql:29` contém `last_inbound_at`. Confirmado.
- Provider: `sendMedia` na interface `index.d.ts:198`; roteamento de mime `index.js:242-247`;
  códigos de janela `:152-156`; `WhatsAppWindowExpiredError` lançado em `:186-198`; `uploadMedia` é
  privado. Confirmado.
- `NfeXmlParty` `types.d.ts:816-822`, sem `email`; `recipient?` em `:876`. Confirmado.
- `notification-module` rc.3: índice único de `dedupe_key` em `migration.sql:101`. Confirmado.

### T0.2 — Spec 247 em `origin/staging`

Confirmado após `git fetch`: `origin/staging` tem os commits `7e4fa0a46`, `3647eda84` e `187a9482d`
(`spec 247`), e a pasta `specs/247-a-devolucao-soma-os-itens-linha-por-linha`. Pré-condição atendida.

## Fase 1 — Painel e app tolerantes (etapa 1)

### T1.1 — Painel tolera os campos do retorno (tipo, exceção por contratante, `contractorReply`)

Arquivos: `apps/frontend-transportada/src/modules/trip/shared/occurrenceContractorReply.{constant,validation}.ts`
(novos), `tripResponse.validation.ts` (chaves permitidas do tipo + `contractorReply` da ocorrência),
`occurrenceAttachmentOverrides.validation.ts` (as três colunas da exceção por contratante),
`trip.constant.ts` (`contractorReply` em `TRIP_OCCURRENCE_OPTIONAL_KEYS`). Teste novo:
`test/occurrence-contractor-reply-tolerance.contract.test.ts`, na lista do `package.json`.

Vocabulário e faixas em `occurrenceContractorReply.constant.ts` (espelham o `spec.md` § "Campos novos
do tipo"); `contractorReplyWaitHours` aceita nulo (sem prazo); a exceção aceita nulo (herda).
`contractorReply` é aceito como ausente, nulo ou objeto; o formato interno ainda não é lido pelo painel.

Gates (frontend-transportada, 2026-10-08):

- `bun run typecheck` → `tsc --noEmit`, sem erro.
- `bun test ./test/occurrence-contractor-reply-tolerance.contract.test.ts` → 10 pass, 0 fail (novo).
- `bun run test` (script da app) → 7675 pass, 0 fail, 39 arquivos.
- `bun run lint` → 0 erro, 16 avisos (todos pré-existentes, nenhum nos arquivos tocados).
- `bunx prettier --check` nos arquivos tocados → ok.
- Recusa de valor fora do vocabulário, da faixa e de `contractorReply` não-objeto cobertas pelos testes
  `recusa campo do retorno fora do vocabulário ou da faixa`, `recusa contractorReply que não é objeto` e
  `recusa coluna da exceção fora do vocabulário`. Mutação (validação removida) não executada nesta task.

### T1.2 — App do motorista tolera os campos do retorno no tipo

Arquivos: `apps/frontend-driver/src/modules/driver-trip/shared/driverOccurrenceContractorReply.validation.ts`
(novo, cópia por valor do vocabulário do painel, como o app já faz com `driverTrip.types.ts`),
`driverTrip.types.ts` (`isDriverOccurrenceType` passa a exigir `hasValidContractorReplyFields`).
Teste novo: `test/driverOccurrenceContractorReply.validation.contract.test.ts`, na lista `test` do
`package.json`.

Premissa: o app do motorista não lê o registro da ocorrência (`contractorReply`) hoje; a única
validação de ocorrência/tipo que ele faz é `isDriverOccurrenceType`, e é nela que a tolerância entra.

Gates (frontend-driver, 2026-10-08):

- `bun run typecheck` → `tsc --noEmit`, sem erro.
- `bun test ./test/driverOccurrenceContractorReply.validation.contract.test.ts` → 4 pass, 0 fail (novo).
- `bun run test` (script da app) → 1434 pass, 0 fail, 6 arquivos.
- `bun run lint` (`eslint .`, cwd da app) → saída vazia, exit 0.
- `bunx prettier --check` nos arquivos tocados → ok (o teste novo foi reformatado antes do check final).
- Mutação (validação removida) não executada nesta task.

## T2.2 — o worker grava o e-mail do destinatário da nota (2026-10-08)

Mudança: `@adatechnology/fiscal-provider` 0.3.2 → 0.4.0 (api e worker, `bun.lock` atualizado). Migration aditiva
`20261008163250_nfe_recipient_email` (`nfe_documents.recipient_email text` nula + CHECK de formato e `length <= 254`) com
`rollback.sql`. Schemas Drizzle da api e do worker atualizados. Política pura `resolveRecipientEmail` (trim; vazio vira
nulo; inválido ou > 254 vira nulo com `wasRejected`), usada pelo import e pela distribuição; o log
`nfe_recipient_email_rejected` leva só `companyId` e `rejectedRecipientEmailCount`, nunca o endereço.

**T3.1 NÃO deve criar a coluna `recipient_email`: ela já existe desde esta task.**

Gates:

- `make migration-test` → 160 pass, 0 fail; `bun run db:check` ok.
- worker: `typecheck` ok, `lint` ok, `bun run test` → 2183 pass, 0 fail (12 testes novos da política).
- worker integração (3 arquivos, incluindo o novo, em banco descartável migrado com o `db:migrate` da api) → 17 pass, 0 fail.
- api: `typecheck` ok, `lint` ok, `bun run test` → 10964 pass, 0 fail.
- `prettier --check` nos arquivos tocados → ok.

Não executado: `make worker-integration` completo (só os 3 arquivos relevantes; o banco compartilhado estava meio migrado por outro worktree).

## T2.3 — Job `nfe.recipient-email.backfill`

Rotina `createNfeRecipientEmailBackfillRoutine` (worker): lê em lotes de 50, por cursor de `documentId`, as notas com
`recipient_email IS NULL`, relê o XML original, reaproveita `resolveRecipientEmail` e grava só onde o campo continua nulo
(`UPDATE ... WHERE recipient_email IS NULL`: nunca sobrescreve, e a segunda passada não muda nada). Cada documento é
isolado (`Promise.allSettled`): falha de leitura ou de parse conta em `failed` e não derruba o lote. O log é só contagem
(`examined`, `filled`, `rejected`, `withoutEmail`, `failed`), nunca endereço nem a mensagem do erro.

Catálogo (api, worker, cron, frontend) e migration `20261008164340_nfe_recipient_email_backfill_job` (CHECKs de
`job_executions` e `job_schedules`, linha em `job_schedules`, `rollback.sql`, `snapshot.json`; `db:check` ok).

**Como roda: nasce pausado** (`enabled=false`, `paused_origin='system'`), então não roda sozinho em staging nem em
produção — diferente do `identity.document.backfill`, que é diário e automático. Disparo manual:
`POST /operations/jobs/nfe.recipient-email.backfill/run` (`OPERATIONS_RUN_POLICY`; o mesmo botão "rodar agora" da tela de
operações). `startManual` só insere a execução e não consulta o agendamento, então vale para job pausado. **Não** usar
`/resume`: ligaria a rotina diária. **Em produção, só com autorização do usuário.**

Limite conhecido: nota cujo XML não traz `<dest><email>` segue nula e é relida a cada execução (não há coluna-marcadora).

Gates:

- worker: `typecheck` ok, `lint` ok, `bun run test` → 2190 pass, 0 fail (7 testes novos de contrato da rotina).
- worker integração (`nfe-recipient-email-backfill` + `nfe-import-recipient-email`) em banco descartável migrado com o
  `db:migrate` da api → pass, 0 fail.
- api: `typecheck` ok, `lint` ok, `bun run test` → 10967 pass, 0 fail (3 contratos estáticos novos da migration).
- cron: `typecheck` ok, `lint` ok, `test` → 101 pass. frontend: `typecheck` ok, `lint` 0 erros, contrato do catálogo ok.

## T3.1 — Schema e migration do retorno à contratante

Migration `20261009022945_occurrence_contractor_reply` (aditiva; `migration.sql`, `rollback.sql`, `snapshot.json`).
Constantes e vocabulários em `src/shared/occurrence-contractor-reply.constant.ts`; tabelas em
`src/database/occurrence-contractor-reply.schema.ts`; colunas e CHECKs do tipo e da exceção em `trip.schema.ts`.

- Tipo: 13 colunas com default constante (sem `UPDATE` por nome de tipo), 13 CHECKs de domínio/limite e 4 cruzadas.
  Exceção da contratante: 3 colunas nulas sem default, cada uma com a própria CHECK. `nfe_documents.recipient_email`
  **não** foi recriada (já existe); `tasks.md` e `plan.md` corrigidos.
- Três tabelas novas, todas com FK composta `(company_id, ...)` e `ON DELETE RESTRICT`; eventos append-only por trigger.
- Nomes de constraint de até 63 caracteres: dois passavam disso e foram encurtados
  (`..._driver_reply_window_action_check`, `..._contractor_reply_alert_wait_check`, `..._deliveries_company_fk`).

Decisões:

- (a) A resposta aponta a ocorrência por FK composta `RESTRICT` para `trip_document_occurrences`: eventos são
  append-only, cascata colidiria com o trigger.
- (b) `deliveries.mail_message_id` é `uuid` sem FK; a decisão fica para a T4.7.
- (c) A validação da configuração efetiva (tipo + exceção) é dos use cases da Fase 4, não do banco.
- (d) `deliveries.address` é dado pessoal: retenção/expurgo entra na T7.3.
- Desvio: `config ? 'version'` virou `jsonb_exists("config", 'version')` (o `?` colide com o parser de parâmetros).
- Tenant-safety: não existe repositório ainda; a prova é o contrato estático sobre o schema e o SQL
  (`test/database-migration/occurrence-contractor-reply.static.contract.ts`). As checagens de texto de repositório
  de `tenant-safety.contract.ts` passam à Fase 4.

Gates: `bun run typecheck` ok; `bun run db:generate` → `no_changes`; `bun run db:check` ok;
`bun --env-file=../../.env.test test ./test/database-migration.contract.test.ts` → 128 pass, 0 fail;
`make migration-test` (Docker disponível) → 169 pass, 0 fail (apply, rollback e reapply da migration).

## T3.2 — Integração da migration contra o Postgres real

`test/database-migration/occurrence-contractor-reply-constraints.assertion.ts` (orquestra), `-type.assertion.ts`,
`-rows.assertion.ts` e `.fixture.ts`, chamado de `database-migration.integration.ts` logo antes do rollback da mesma migration.

- Padrões: a migration é desfeita, um tipo é gravado **sem** as colunas novas, a migration é reaplicada, e as 13 colunas
  têm o padrão literal (sem `UPDATE`). O literal vive no teste, não é lido da constante.
- Tipo: 22 casos recusados, cada um com o **nome** da CHECK (vocabulários, faixas 1–168 / 15–1440 / 1–96, 1000/200/4000
  caracteres, `requires_mail`, `alert_wait`, `forward_automatic_needs_reply` — inclusive `automatic` com modo `off` —,
  `forward_needs_text`) e 15 aceitos nas bordas.
- Retorno: `handled ⇔ autor e nota` (quatro formas), `reason`, `config`, `alert_count`, nota 1–500; unicidade por ocorrência.
- Entregas: vocabulários, `address` só em e-mail e até 254, `sent ⇔ sent_at`, `operator ⇔ actor_user_id`, chave vazia,
  unicidade `(company_id, idempotency_key)`.
- Eventos: vocabulários, `system ⇔ sem ator`, `UPDATE` e `DELETE` recusados (55000, linha intacta).
- `RESTRICT`: apagar a ocorrência (23503) e apagar o retorno com evento (23503) falham.
- Fora do escopo: as três CHECKs da exceção da contratante (pedem contratante gravada); ficam no contrato estático da T3.1.
- Limpeza: `TRUNCATE` das três tabelas (não dispara o trigger) e remoção das linhas da fixture, porque o rollback recusa
  retorno gravado.
- Desvio: os casos nasceram verdes (a migration da T3.1 já os satisfaz); a prova de que cada um pega é a T3.3.
- Primeiras execuções vermelhas por defeito do **teste**, não da migration: `config` enviado como texto virava string JSON
  (`config_check` no lugar de `status_check`) e `actor_kind = 'robot'` sem ator também reprova `actor_check`.

Gates: `bun run typecheck` ok; `bun run lint` ok; `bun --env-file=../../.env.test test ./test/database-migration.contract.test.ts`
→ 128 pass, 0 fail; `make migration-test` → 169 pass, 0 fail.

## T3.3 — Mutações da T3.2, cada uma com a execução vermelha

Cada mutação foi aplicada em `drizzle/20261009022945_occurrence_contractor_reply/migration.sql`, rodou `make migration-test`
(exit 2) e foi desfeita com `git checkout`; o `git diff` ficou vazio depois de cada uma.

1. **Tirar a CHECK `company_occurrence_types_forward_automatic_needs_reply_check`** — 166 pass, 3 fail: o teste de integração
   (`applies, constrains, rolls back, and reapplies`) com `Expected PostgreSQL SQLSTATE 23514` no caso `automatic` com modo
   `off` (`occurrence-contractor-reply-type.assertion.ts`), mais dois contratos estáticos (fragmento ausente; forma das quatro
   CHECKs cruzadas).
2. **Padrão de `forward_to_note_recipient` = `'automatic'`** — 166 pass, 3 fail: a própria migration cai nas linhas existentes
   (`PostgresError: check constraint "company_occurrence_types_forward_automatic_needs_reply_check" of relation
"company_occurrence_types" is violated by some row`, o que também derruba o backfill de viagens e o teste de integração),
   mais o contrato estático do padrão constante.
3. **`actor_user_id` nulo com `trigger = 'operator'`** (CHECK trocada por `"actor_user_id" is null or "trigger" = 'operator'`)
   — 168 pass, 1 fail: integração com `Expected PostgreSQL SQLSTATE 23514` em `assertDeliveryConstraints`
   (`-rows.assertion.ts:126`, o caso operador sem ator). Uma primeira versão da mutação, que afrouxava também o vocabulário,
   falhou por outro caso (`Expected trigger_check, Received actor_check`); foi descartada por ser grosseira.

Execução verde depois de desfazer tudo: `make migration-test` → 169 pass, 0 fail, exit 0.

## T4.1 — Contrato da decisão do retorno, vermelho antes da implementação

`test/occurrence-conversation/contractor-reply.contract.ts` (a mesma tabela, byte a byte, na API e no worker) cobre
`decideContractorReply` (0/1/N anexos, tipo pelos bytes e não pelo nome, já entregue, cancelado, tratado, já respondido,
modo `off`, cópia da configuração vence o tipo de hoje) e `decideAlert` (prazo, intervalo, teto, paradas, janela pendente).
O `contractor-reply-parity.contract.ts` do worker compara política, constantes e contrato com a cópia da API.

Execução vermelha (a política ainda não existe), de `apps/api-transportada`:
`bun --env-file=../../.env.test test --timeout 120000 ./test/occurrence-conversation.contract.test.ts` →
`error: Cannot find module '../../src/occurrence-conversation/domain/contractor-reply.policy.js'`, 0 pass, 1 fail, 1 error.
O commit da T4.1 é vermelho de propósito (contrato antes do código); a T4.2 fecha.

## T4.2 — `decideContractorReply` e `decideAlert` nas duas apps

`src/occurrence-conversation/domain/contractor-reply.policy.ts` (cópia por valor idêntica na API e no worker, mais a cópia
de `src/shared/occurrence-contractor-reply.constant.ts` no worker). Contrato da T4.1 verde: 319 pass na entrada
`occurrence-conversation` da API. Gates: `bun run typecheck` e `bun run lint` exit 0 nas duas apps; contrato da API
(`bun --env-file=../../.env.test test --timeout 120000`) 11087 pass, 0 fail; worker (`bun run test`) 2232 pass, 0 fail;
prettier limpo.

## T4.3 — Mutações da T4.1, cada uma com a execução vermelha

Cada mutação foi aplicada em `apps/api-transportada/src/occurrence-conversation/domain/contractor-reply.policy.ts`, rodou
`bun --env-file=../../.env.test test --timeout 120000 ./test/occurrence-conversation.contract.test.ts` (exit 1) e foi
desfeita com `git checkout`; o `git diff` ficou vazio depois de cada uma. A cópia do worker é idêntica (parity), logo a mesma
mutação reprova lá também pela tabela espelhada.

1. **Aceitar pelo nome do arquivo** (o filtro aceita `fileName` terminado em `.pdf` além do tipo) — 318 pass, 1 fail:
   `the type is decided by the bytes the attachment carries, never by the file name`.
2. **Entregar com dois PDFs** (`accepted.length > 2` no lugar de `> 1`) — 316 pass, 3 fail: `2 pdfs`,
   `N attachments with 2 pdfs among them`, `pdf and image when the type accepts both`.
3. **Alerta depois do teto** (`alertCount > alertMaxCount` no lugar de `>=`) — 318 pass, 1 fail:
   `the last allowed alert fires and the next one never does (cap)`.
4. **Ler o modo e o tipo de anexo do tipo, e não da cópia do retorno** — 317 pass, 2 fail: `mode off` e
   `the copy of the reply decides, not the type as it is today`.

Execução verde depois de desfazer tudo: 319 pass, 0 fail (entrada `occurrence-conversation`), e os gates da T4.2 seguem
valendo (a política não mudou).

## T4.4a — abertura do retorno na transação do envio automático

**Desenho.** Um ponto só: `executeSend` (`send-occurrence-mail.use-case.ts`), dentro da unidade de trabalho, depois de
`recordConversationMessage` e antes de `saveIdempotency`, **só com `input.automatic === true`**. Fica fora a repetição
(devolve a resposta gravada antes de chegar ali), o `skipped` (nunca chama `sendMail.send`) e o envio manual. A porta
transacional ganhou `findContractorReplyConfiguration` e `openContractorReply`
(`drizzle-occurrence-contractor-reply.repository.ts`): a leitura junta a ocorrência ao tipo com LEFT JOIN na exceção da
contratante; a escrita é `INSERT ... ON CONFLICT (company_id, occurrence_id) DO NOTHING`, com `deadline_at = agora +
waitHours` (nulo sem espera). A política pura `resolveContractorReplyConfiguration` (sobre `resolveWithOverrides`) só
dá exceção a `mode`, `waitHours` e `forwardToNoteRecipient`; o resto vem do tipo; um esquema Zod com `version` valida a
cópia antes do jsonb.

**Decisão (configuração efetiva inválida).** Modo efetivo diferente de `off` mas combinação que o CHECK do tipo não vê
(exceção liga o modo num tipo sem `emails_contractor`, sem texto ao motorista, alerta ligado sem prazo, encaminhamento com
assunto/corpo em branco): **não abre retorno**, loga `occurrence_contractor_reply_configuration_invalid` só com
`companyId` e `occurrenceId` (sem PII) e o envio segue. Abrir um retorno que nunca poderia ser decidido seria pior do que
não abrir; derrubar o aviso à contratante por erro de cadastro, também.

**Gates.** `bun run typecheck` 0 · `bun run lint` 0 · contrato `bun --env-file=../../.env.test test --timeout 120000`
11107 pass, 0 fail, 25 skip (já existentes) · integração
`occurrence-automatic-mail`, `occurrence-contractor-reply-opens` (nova, 5 testes), `occurrence-conversation-mail`: 12
pass, 0 fail · prettier limpo · o schema não foi tocado (sem `db:generate`).

**Mutações com execução vermelha** (`occurrence-contractor-reply-opens.integration.ts`, desfeitas com `cp` da cópia; verde
depois):

1. **`if` pelo nome do tipo** (`type.name === 'Prorrogação' ? 'off' : ...` na leitura) — 4 pass, 1 fail: CA04 `mesmo nome,
configuração diferente`.
2. **Ler o modo do tipo ignorando a exceção** (`mode: null` na exceção lida) — 4 pass, 1 fail: CA04 `a exceção da
contratante muda modo, prazo e encaminhamento só da ocorrência dela`.

**Desvios.** (a) A produção foi escrita antes dos contratos; os contratos foram escritos em seguida e a prova de que
protegem são as duas mutações acima, não uma execução vermelha anterior ao código. (b) A CA01 roda pelo caso de uso
automático real (leitor + envio Drizzle) e não pelos caminhos de entrada do app e do WhatsApp com o gancho
(`main.ts`); isso fica na T4.4b junto do varredor. (c) CA01 e CA04 ficaram num arquivo novo
(`occurrence-contractor-reply-opens.integration.ts`, na lista do `test:integration`) para não passar o arquivo existente
de 200 linhas. (d) O relógio do envio nos testes é o fixo do fixture, então o prazo é comparado a `2026-09-24T18:00Z + espera`.
(e) `main.ts` passa o `logger` ao envio automático (o manual não precisa).
