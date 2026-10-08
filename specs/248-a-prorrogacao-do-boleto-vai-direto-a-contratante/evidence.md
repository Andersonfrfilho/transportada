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
