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
