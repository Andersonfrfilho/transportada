# Evidência — 299

Cada task registra aqui: data, comandos rodados com o resultado (pass/fail e contagem), arquivos tocados e decisões
tomadas na execução.

## T0.1 — 2026-11-06

Conferência no código, sem código de produção. Base: worktree `work/spec-299-impl` sobre `origin/staging` `00920a499`
(já com a PR #564, menção no grupo). Busca por `grep`/leitura dirigida; nenhum teste rodado (task de decisão).
Arquivo tocado: `plan.md` (os "T0.1 confere" viraram arquivo:símbolo) e este.

### 1. Origem grupo × individual do evento (D5)

- **Fato**: não é gravada. `trip_stop_events.channel` é `TRIP_FIELD_CHANNELS` (`database/trip.schema.ts:119`:
  `driver_app | office | whatsapp | backoffice`) e os dois canais de WhatsApp gravam `whatsapp` (`main.ts:1496-1527`).
  Só as coletas guardam `origin_channel` (`WHATSAPP_DELIVERY_PREPARATION_CHANNELS = ['group','individual']`), e só o
  que abriu coleta.
- **Decisão**: derivar na entrega, sem coluna nova, da última **entrada** do motorista por canal: grupo =
  `max(whatsapp_group_requests.last_activity_at)` do `group_jid` dele (`fleet_driver_whatsapp_groups`; toda mensagem aceita
  no grupo abre ou entra num pedido — `whatsapp-group-request.service.ts:296-330` —, e a 292 T1 define que toda mensagem
  do grupo é do motorista dono dele); individual = `sessions.last_inbound_at` do pacote para o telefone dele (a mesma
  porta de leitura da janela de 24 h). O mais recente vence; nenhum → grupo. Porta `DriverLastChannelPort`.
- **Base**: menor mudança que atende o D5 ("o último canal de WhatsApp que o motorista usou"); gravar a origem no
  evento mexeria nos use cases de campo de todos os canais só para esta leitura.
- Lacunas conhecidas e aceitas: a localização avulsa do grupo (`handleLocation`) e a mensagem recusada por "ocupado" não
  atualizam `last_activity_at` — o motorista que só fez isso conta pelo canal anterior.

### 2. Permissões

- **Fato**: `trip.read` e `trip.manage` (singular; o plano dizia `trips.manage`), `identity/domain/authorization.policy.ts`.
  `trip.read` está em `driver`, `aggregate`, `helper` (`:269-284`).
- **Decisão**: a pendência "Motorista sem resposta" exige `trip.manage` (não `trip.read`, que mostraria a todo motorista
  quem não respondeu); a dispensa `POST /driver-stop-reminders/:id/dismissal` também `trip.manage`. Mesmo critério da
  pendência e da dispensa da 294 (`drizzle-address-correction-suggestion-pending-item.source.ts:111`,
  `/address-correction-suggestions/:suggestionId/dismiss`).
- **Robô**: molde conferido — `trip.canhoto-auto-review` em `TRANSPORTADA_PERMISSIONS` (`:101`),
  `COMPANY_ROLE_PERMISSIONS.automation` (`:297-302`) e `SERVICE_ONLY_PERMISSIONS` (`:406-412`). `trip.stop-reminder-dispatch`
  entra nos mesmos três lugares, mais os espelhos (`useAuthMe.query.ts:81`, `identity{,.en}.locale.json`) e os quatro
  contratos de permissão (lista no `plan.md`). O realm não declara permissão; nada muda lá.

### 3. Aba das Configurações

- **Fato**: `COMPANY_SETTINGS_TAB_IDS` tem 13 abas (`companySettingsTabs.service.ts:303`). `automations` monta só o
  `ContractorAutomationsPanel` (285, autocontido, `CompanySettings.page.tsx:261`); `whatsapp` é o cadastro do Evolution.
- **Decisão**: o bloco "Cobrança do motorista" vai na aba `automations`, como segundo painel autocontido
  (`DriverStopReminderPanel`), registro `driverStopReminders` com `tab: 'automations'`. Sem aba nova; a `whatsapp` não
  serve porque o lembrete também usa a Meta.

### 4. Extração do portão "pergunta aberta"

- **Fato** (corrige o levantamento): o portão da 294 é a política pura `RouteOfferGate`/`canAskRouteOffer`
  (`whatsapp-driver-route-offer.policy.ts:65-79`), montada em **três** pontos, cada um com só o que o contexto dele permite
  (`whatsapp-command-driver.service.ts:471-479`, `register-driver-flow-actions.ts:518-525`,
  `whatsapp-group-driver-flow.service.ts:210-215`). Nenhum lê `whatsapp_group_requests`; o de `register-driver-flow-actions`
  não lê a pergunta do canhoto nem o áudio.
- **Decisão**: `RouteOfferGate`/`canAskRouteOffer` **movem** sem mudar para `whatsapp-commands/domain/driver-open-question.policy.ts`
  (importadores só trocam o caminho); os três pontos da oferta ficam como estão — unificar mudaria a oferta (no grupo o
  pedido aberto é o próprio turno). Novo: `DriverOpenQuestions = RouteOfferGate & { hasOpenGroupRequest }`,
  `hasDriverOpenQuestion(q)` e `DriverOpenQuestionPort.read({ companyId, driverId, now })`, com adaptador em `main.ts`
  que compõe as leituras existentes (coleta composta `main.ts:1673`, `findOpen` do grupo, contexto da sessão Meta,
  áudio). O áudio ganha `hasPendingInConversation` (sem dono: o "1" do ajudante no grupo também colide); as instâncias
  de áudio e de turno do grupo sobem de dentro de `createEvolutionWebhook` para a composição de `main.ts` e são
  passadas por parâmetro.
- **Base**: RNF1 pede "nenhuma pergunta sobre outra aberta"; o lembrete pergunta de fora de qualquer turno e precisa
  da leitura completa. O spec diz "o mesmo portão da oferta" (RF8.3): o lembrete usa as mesmas leituras e a mesma
  decisão pura, acrescida do pedido do grupo — é mais estrito que a oferta, nunca menos.
- Risco registrado: o áudio é por processo; com mais de uma réplica da API a leitura vale só para a réplica que atendeu.

### 5. Menção no grupo e "uma resposta, uma mensagem"

- **Fato**: em `origin/staging` (PR #564): `GroupReplySenderPort.send({ mentionNumber })`
  (`whatsapp-group-request.port.ts:125`), `createEvolutionGroupReplySender` (`evolution-group-reply.gateway.ts`),
  `sendEvolutionTextWithMention` (`evolution-mention-text.gateway.ts`), via
  `createEvolutionDocumentSender(...).sendText({ mentionNumber })` (`evolution-document-sender.gateway.ts:116`). O `send` do
  porto é fogo-e-esquece. O buffer da #561 (`whatsapp-turn-replies.service.ts`) só junta dentro de `withinTurn`; fora,
  entrega na hora depois do que um turno aberto guardou para a mesma chave.
- **Decisão**: o lembrete monta o corpo pela função pura extraída de `createMentionOnFirstMessage`
  (`withGroupMention`) e entrega por `groupTurns.send` com `deliver` aguardando o `sendText` do document sender — tem
  `providerMessageId` e o erro (para devolver a tentativa), nunca é juntado a outro turno e não passa na frente de um
  turno aberto. Número: `toWhatsAppPhone(fleet_drivers.phone)`; sem número válido sai sem marca.

### 6. Transações dos eventos da parada

Ver `plan.md` § Contexto "Transações" e § API "Serviço". Resumo: saída `report-stop-departure.use-case.ts:40`, chegada
`report-stop-arrival.use-case.ts:48` (ligação comum em `applyStopDeparture`/`applyStopArrival`,
`stop-event-steps.service.ts:96,147`), chegada junto `recordSkippedSteps` (`recorded-together-steps.service.ts:83`), baixa
`runDocumentOutcome` (`document-outcome.service.ts:62`, `closeStopAndTrip` `document-outcome-steps.service.ts:216`),
cancelamento de saída `cancel-stop-departure.use-case.ts:44`, ocorrências `report-stop-occurrence.use-case.ts:162`,
`register-driver-occurrence.use-case.ts:65`, `register-office-document-occurrences.use-case.ts:50`. Encerramento e
cancelamento da viagem têm a transação no repositório (`DrizzleTripRepository.close` `drizzle-trip.repository.ts:206`,
`DrizzleTripRouteRepository.markCancelled` `drizzle-trip-route.repository.ts:329`): fecham por `UPDATE` ali dentro.

### 7. Migration e molde do CHECK

- Última migration: `apps/api-transportada/drizzle/20261106120034_nfe_access_key_lookups`.
- Molde do `CHECK` + agenda: `20261013010226_occurrence_contractor_reply_alert_job` (21 rotinas, igual ao `JOB_CATALOG`;
  `INSERT` com `enabled`/`paused_at`/`paused_origin`). O `20261002120000_trip_canhoto_read_job` citado no plano é o molde
  antigo; o plano foi corrigido.

### Pendente do dono

1. **Rotina com a chave global desligada.** O RF20 diz "Desligada: … o worker não registra a rotina". O `plan.md`
   (§ Worker) diz o contrário: registra sempre que a credencial existe e fecha `succeeded` sem ler nada, porque a linha
   de `job_schedules` semeada pela migration faria o ciclo fechar `job_run_routine_missing` a cada 5 min se a rotina não
   existir. Opções: (a) seguir o plano e corrigir o texto do RF20; (b) seguir o RF20 e semear a agenda **pausada**
   (`enabled=false`, `paused_origin='system'`, molde `20261013010226`), ligada à mão quando a chave virar. Recomendação
   técnica: (a). Não decidido aqui; trava só a T1.1/T2.4.

## T0.2 — 2026-11-06

Contratos vermelhos das políticas puras (relógio injetado: `now`/`anchorAt` por parâmetro). Arquivos:
`apps/api-transportada/test/driver-stop-reminders/stop-reminder-{schedule,origin,transition,gate,message}.contract.ts`,
entrypoint `test/driver-stop-reminders.contract.test.ts` (na lista do script `test` do `package.json`, depois de
`address-correction-mail`). Módulos-alvo (T1.3, **não criados**): `src/driver-stop-reminders/domain/`
`{driver-stop-reminder.constant,stop-reminder-schedule.policy,stop-reminder-origin.policy,stop-reminder-transition.policy,stop-reminder-gate.policy,stop-reminder-message.policy}.ts`.

### Vermelho pelo motivo certo

```text
$ bun --env-file=../../.env.test test --timeout 120000 ./test/driver-stop-reminders.contract.test.ts
# Unhandled error between tests
error: Cannot find module '../../src/driver-stop-reminders/domain/driver-stop-reminder.constant.js' from '.../test/driver-stop-reminders/stop-reminder-schedule.contract.ts'
 0 pass
 1 fail
 1 error
```

`bun run typecheck` falha só nos módulos ausentes (TS2307 nas cinco políticas e na constante; mais um TS7006 em
`stop-reminder-message.contract.ts:84` que é efeito do tipo ausente). ESLint (`--max-warnings=0`, cwd da app) e
`prettier --check` nos arquivos novos: limpos.

### Contrato de API que a T1.3 deve cumprir (assinaturas)

- `constant`: `DRIVER_STOP_REMINDER_DEFAULT_SETTINGS = { maxAttempts: 3, intervalMinutes: 30, graceMinMinutes: 30,
gracePercent: 50, dwellMinutes: 30 }`; `DRIVER_STOP_REMINDER_FALLBACK_TRAVEL_SECONDS = 2700`;
  `DRIVER_STOP_REMINDER_SPEECH_NODE`. Constantes a criar também (valores testados como literais): adiamentos máx. 3,
  espera por pedido aberto 5 min, espera máx. da vaga 120 s.
- schedule: `computeStopReminderSchedule({ stage, anchorAt, travelSeconds | undefined, settings }) → { expectedAt, dueAt }`
  (`expectedAt` só tem sentido no `arrival`); `computeNextStopReminderDueAt({ lastSentAt, settings })`;
  `decideStopReminderDueAction({ attempts, maxAttempts }) → 'send' | 'escalate'`.
- origin: `resolveStopReminderOrigin({ sharedPoint?, previousStopPoint?, companyPoint? }) → { kind:
'shared_point'|'previous_stop'|'company'|'fallback', point?, isSharedPoint }` (valores do `origin_kind` do plano).
- transition: `decideStopReminderTransition({ event, openReminders }) → readonly ({ type:'open', stopId, stage } |
{ type:'close', reminderId, reason })[]`. `event = { kind: departed|departure_cancelled|arrived|delivered|returned|
occurrence|trip_closed|trip_cancelled, stopId, authorship: crew|office, recordedTogether, stopClosed }`;
  `closed` reasons: `arrived | occurrence | stop_closed | departure_cancelled | trip_closed | trip_cancelled | superseded`.
  Lista vazia = "none". Idempotência (RNF2) sai de `openReminders`.
- gate: `decideStopReminderGate({ now, stage, stop: { hasArrived, isClosed }, operatingHours: { weekday(0=dom), start
'HH:MM', end }[], holidayDates: 'YYYY-MM-DD'[], timeZone, hasOpenQuestion, sendSlotAt? }) → { decision:'send' } |
{ decision:'close' } | { decision:'defer', reason: outside_operating_hours|open_question|no_send_slot, until }`.
  Início da faixa inclusivo, fim exclusivo. As duas chaves (env + empresa) **não** estão no portão: a consulta da rotina
  (RF7) só devolve empresa ligada com a global ligada.
- message: `buildStopReminderMessage({ stage, driverName, stop: { firstNoteNumber, noteCount, clientName }, departedAt?,
expectedAt?, arrivedAt?, isSharedPoint, timeZone }) → { nodeKey, variables, options: { choice, action }[] }`;
  `decideStopReminderPostponement({ postponements }) → { outcome: 'postponed'|'no_answer', postponements, consumesAttempt }`.

### Chaves dos nós de fala escolhidas (T1.3/T2.3 reusam)

| Nó                                   | Quando                                         | Variáveis                             |
| ------------------------------------ | ---------------------------------------------- | ------------------------------------- |
| `fala_lembrete_chegada`              | etapa `arrival`, `isSharedPoint`               | `nome`, `parada`, `saida`, `previsao` |
| `fala_lembrete_chegada_sem_previsao` | etapa `arrival`, sem ponto compartilhado (RF6) | `nome`, `parada`, `saida`             |
| `fala_lembrete_entrega`              | etapa `settlement`                             | `nome`, `parada`, `chegada`           |

`parada` = `NF <primeira> · <cliente>`, com ` +N` depois do número quando há mais notas (`NF 17234 +2 · Cliente`).
Horas `HH:MM` no fuso da empresa. A marcação `@<telefone>` é do suporte de menção do grupo, não do nó. Ações das opções:
`arrival` → `arrived|delivered|occurrence|postpone`; `settlement` → `delivered|not_delivered|occurrence|postpone`.

### Dúvidas

- Os nomes das variáveis (`nome`, `parada`, `saida`, `previsao`, `chegada`) seguem o português dos nós `fala_*`; a T1.3
  confere com a convenção do grafo raiz e ajusta o contrato se divergir.
- Escape de dado de terceiro (RF9) não está nestes contratos: onde o escape mora hoje (política ou renderizador do nó)
  decide a T1.3/T2.3.

## T1.1 — 2026-11-06

Chave global `DRIVER_REMINDERS_ENABLED` (padrão `false`), espelho de `MDFE_AUTO_ISSUE_ENABLED`. Ainda sem consumidor
(as tasks seguintes a usam). Contrato antes da implementação.

**Vermelho antes** (`bun test` nos dois contratos, sem implementação):

- API `test/authentication.contract.test.ts`: `Expected: false / Received: undefined` em `driverRemindersEnabled`
  (teste novo `DRIVER_REMINDERS_ENABLED: ausente ou vazio é desligado, true liga, outro valor derruba o boot`).
- Worker `test/environment.contract.test.ts`: 3 falhas no describe novo `o interruptor dos lembretes do motorista`
  (ausente/vazio → `undefined`; `true` → `undefined`; `yes` não derruba o boot).

**Verde depois:**

- API `test/authentication.contract.test.ts`: 19 pass, 0 fail.
- Worker `test/environment.contract.test.ts`: 47 pass, 0 fail (o teste `parses the autonomous Bun worker configuration`
  ganhou `driverRemindersEnabled: false` no `toEqual`, senão ficava vermelho pela chave nova).

**Arquivos:**

- `apps/api-transportada/src/config/environment.schema.ts`: chave com `preprocess` (vazio = ausente) e mapeamento
  `driverRemindersEnabled`.
- `apps/api-transportada/src/shared/api.types.ts`: campo `driverRemindersEnabled` em `ApiEnvironment`.
- `apps/api-transportada/test/authentication.contract.test.ts`: caso novo.
- `apps/api-transportada/test/integration/server.integration.ts`, `auth-me.integration.ts`: fixtures de `ApiEnvironment`
  ganham `driverRemindersEnabled: false` (o typecheck exigiu).
- `apps/worker-transportada/src/config/environment.schema.ts`: chave com `preprocess` (vazio = ausente, como a API;
  o `MDFE_AUTO_ISSUE_ENABLED` do worker não tem essa tolerância, por isso o desvio) e mapeamento.
- `apps/worker-transportada/src/shared/worker.types.ts`: campo `driverRemindersEnabled`.
- `apps/worker-transportada/test/environment.contract.test.ts`: describe novo + chave no `toEqual` existente.
- `.env.example` (raiz): `DRIVER_REMINDERS_ENABLED=false` logo abaixo de `MDFE_AUTO_ISSUE_ENABLED`.
- `specs/299-o-bot-cobra-o-motorista-na-hora-certa/tasks.md`: T1.1 marcada.

`make config` lê o schema da API (`parseEnvironment(process.env)`, com o `.env` real) e não o do worker; por isso
a validação do `make config` cobre a chave da API, e a do worker fica no contrato do worker.

**Gates:**

- API `bun run typecheck`: só os erros esperados da T0.2 (`test/driver-stop-reminders/*`, TS2307/TS7006, 8 linhas).
  Zero erro novo.
- API eslint (`--max-warnings=0`) e prettier nos arquivos tocados: limpos.
- API `bun run test`: 14188 pass, 35 skip, 1 fail + 1 error, os dois em `test/driver-stop-reminders.contract.test.ts`
  (`Cannot find module .../driver-stop-reminders/domain/*`, esperado até a T1.3).
- API `bun --env-file=../../.env.test test --timeout 120000`: 14197 pass, 26 skip, 1 fail + 1 error, os mesmos da T0.2.
- API `bun run test:integration` (`--env-file=../../.env.test`): **1957 pass, 8 skip, 0 fail** (1965 testes em 347 arquivos, 6852 s; log `/tmp/claude-1000/-home-miyazaki-Documents-personal-transportada/4aacf520-d202-44a6-b36e-4909184c8327/api-integration2.log`). Sem testes de falha. Os arquivos de integração tocados só mudaram fixture (`driverRemindersEnabled: false`).
- Worker `bun run typecheck`: 0 erros. Worker eslint e prettier nos arquivos tocados: limpos.
- Worker `bun run test`: 3037 pass, 0 fail, 115 arquivos.
- `make config` (raiz): exit 0.

## T1.2 — 2026-11-06

Migration A aditiva `20261106232509_driver_stop_reminders` (`migration.sql`, `rollback.sql`, `snapshot.json`): tabelas
`driver_stop_reminders` e `company_driver_reminder_settings` conforme o plano, e a rotina `driver.stop-reminder.dispatch`
(300 s) nas duas CHECK de `job` (geradas do catálogo) e em `job_schedules`, semeada **pausada pelo sistema** (`enabled=false`,
`paused_origin='system'`, molde da 248 T4.10) até a T2.4 registrar a rotina no worker.

**Vermelho antes** (contratos de catálogo estendidos primeiro, sem o catálogo):

- API `test/job-catalog.contract.test.ts`: 2 falhas (`names every routine…`, `accepts every interval the migration already seeded`).
- Worker `test/job-catalog.contract.test.ts`: 2 falhas (paridade com a API; vocabulário de falhas por rotina).

**Verde depois:** catálogos da API e do worker ganharam a entrada (`minimumIntervalSeconds: JOB_TICK_INTERVAL_SECONDS`,
`failureOutcomes: ['api_unreachable']`); sem rotina em `main.ts` e sem reclamação de rotina ausente nos testes do worker.

**Achados no caminho (exigidos por contratos existentes):**

- `static-migration.contract.ts`: lista de pastas de migration ganhou a nova.
- `make migration-test` quebrou primeiro no rollback encadeado (a CHECK antiga recusava a linha do relógio):
  novo `test/database-migration/driver-stop-reminders-rollback.assertion.ts`, chamado no começo do helper da 248 T4.10.
- `deploy/staging-refresh/prune-source.sql`: política obrigatória por tabela (contrato spec 291): settings `keep`,
  lembretes `empty` (não levar fila de cobrança para staging).
- Vocabulário de `closed_reason` (T0.2 não o fixa): `arrived, stop_closed, occurrence, superseded, departure_cancelled,
trip_closed, trip_cancelled, dismissed`, em `src/shared/driver-stop-reminder.constant.ts`.

**Gates:**

- `make migration-test` (raiz): 231 pass, 0 fail.
- `db:generate` depois: `{"status":"no_changes"}`.
- API `bun run typecheck`: só os 8 erros esperados da T0.2 (`test/driver-stop-reminders/*`). eslint (`--max-warnings=0`) e
  prettier nos arquivos tocados: limpos.
- API `bun run test`: 14188 pass, 1 fail + 1 error, ambos o contrato esperado da T0.2.
- Worker `bun run typecheck`: 0 erros; eslint/prettier limpos; `bun run test`: 3037 pass, 0 fail.
- Integração: nenhum arquivo de `test/integration` cobre `job_schedules`/migration além do que o `migration-test` já roda.

## T1.3 — 2026-11-06

Políticas puras em `apps/api-transportada/src/driver-stop-reminders/domain/`: `driver-stop-reminder.constant.ts` (defaults
reexportados de `src/shared/driver-stop-reminder.constant.ts`, chaves de nó, adiamentos máx. 3, espera de pedido aberto
5 min, espera máx. da vaga 120 s), `driver-stop-reminder.types.ts` (`*Params`/`*Result`), e
`stop-reminder-{schedule,origin,transition,gate,message}.policy.ts`. Sem I/O, sem `Date.now`: relógio por parâmetro. Texto
de fala nunca literal: a política devolve chave de nó e variáveis. Contratos da T0.2 não foram alterados.

**Vermelho (T0.2) → verde agora:**

- Antes: `test/driver-stop-reminders.contract.test.ts` — 0 pass, 1 fail, 1 error (`Cannot find module .../domain/*`).
- Agora: 79 pass, 0 fail, 94 expect().

**Gates (de `apps/api-transportada`):**

- `bun run typecheck`: limpo (0 erros).
- `bunx eslint src/driver-stop-reminders test/driver-stop-reminders --max-warnings=0`: limpo.
- `bunx prettier --check` nos mesmos caminhos: limpo.
- `bun run test`: 14267 pass, 35 skip, 0 fail (224 arquivos).
- `bun --env-file=../../.env.test test --timeout 120000`: 14276 pass, 26 skip, 0 fail.
- Integração: nenhum arquivo de `test/integration` tocado, não rodada.

## T1.4 — 2026-11-06

`DriverStopReminderService.onStopEvent` (`src/driver-stop-reminders/application/`) abre e fecha o lembrete **dentro da
transação do evento**, pelo método novo `onStopEvent` do `DriverFieldReportTransactionPort` (no-op sem o runtime, isto é,
com `DRIVER_REMINDERS_ENABLED=false`; a chave da empresa só vale no envio, plano D6). Pontos de ligação: `applyStopDeparture`
e `applyStopArrival` (só na primeira chegada; `recordedTogether` repassado), `closeStopAndTrip` (entrega/devolução que fecha a
parada), `cancelStopDeparture`, `reportStopOccurrence`, `registerDriverOccurrence` e o lote do escritório
(`office-occurrence-batch.service.ts`); encerramento e cancelamento da viagem fecham por `UPDATE` em
`DrizzleTripRepository.close` / `DrizzleTripRouteRepository.markCancelled` (`closePendingStopReminders`). A abertura grava a
reserva (45 min + tolerância, `origin_kind='fallback'`); depois do commit a unidade de trabalho chama
`runtime.refineAfterCommit`, que mede a estrada no OSRM (origem: ponto da saída › parada anterior › empresa) e faz `UPDATE`
por `id` + `version` (versão +1). OSRM fora, sem geocódigo ou sem origem: fica `fallback`, sem erro. Status de fechamento:
`closed` (chegada, baixa, ocorrência, encerramento) ou `cancelled` (substituído, saída cancelada, viagem cancelada).
`drizzle-driver-stop-reminder-refinement.repository.ts` entrou em `EVENT_LOCATION_READERS` (lê lat/lng do `departed`).

**Vermelho → verde:**

- Antes (teste escrito primeiro): `test/integration/driver-stop-reminders.integration.ts` — 0 pass, 1 fail, 1 error
  (`Cannot find module .../driver-stop-reminder.runtime.js`: o runtime não existia).
- Agora: 15 pass, 0 fail (saída com reserva e depois OSRM; reserva visível antes do OSRM responder; OSRM fora; chegada fecha e
  abre entrega; chegada do escritório abre entrega; chegada junto com a baixa não abre; entrega e devolução; ocorrência; saída
  cancelada; viagem encerrada e cancelada; evento repetido; saída de outra parada substitui; chave global desligada).
- Contrato com dublês: `test/driver-stop-reminders/driver-stop-reminder-service.contract.ts` (5 casos).

**Gates (de `apps/api-transportada`):**

- `bun run typecheck`: limpo. eslint e prettier nos arquivos tocados: limpos.
- `bun run test`: 14272 pass, 35 skip, 0 fail.
- `bun --env-file=../../.env.test test --timeout 120000`: 14281 pass, 26 skip, 0 fail.
- Integração tocada: `driver-stop-reminders.integration.ts` (adicionada ao `test:integration`) 15 pass.
- Integração dos use cases alterados (18 arquivos: stop-event-sequence, stop-order-guard, me-trip-departure, trip-field-office,
  trip-field-authorship, event-location-stamp, delivered-moment, trip-cancel-releases-notes, trip-lifecycle,
  occurrence-driver-lock, occurrence-duplicate-request, stop-occurrence-photo, trip-occurrence-attachment,
  address-arrival-correction, next-stop-offer, trip-retire-stop, trip-crew-transfer, whatsapp-driver-flow-actions):
  187 pass, 0 fail. A suíte inteira fica para a CI.

## Revisão PR 566 — correções

Achados da revisão do código dos Fases 0–1. Cada correção de comportamento nasceu de um teste vermelho.

| #   | Achado                                                        | Correção                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | O refino do OSRM reescrevia o prazo da `settlement`           | A entrada do refino carrega `stage`; o refinador só toca `arrival` (a entrega vence `arrived_at + permanência`, RF2)                                                                                                                                                                                                                                                  |
| 2   | Sem `companyId` em leituras/escritas do refino e no `close()` | `companyId` em todo `WHERE` do repositório de refino (lembrete, `trip_stops`, `trip_stop_events`, paradas anteriores, `applyRefinement`) e no `close()`; `geocoded_addresses` segue cache compartilhado; `refineAfterCommit` recebe `{ companyId, reminderId }`                                                                                                       |
| 3   | Âncora usava `input.now`, o evento grava a hora do toque      | Saída ancora em `resolvedTappedAt ?? now`; chegada na hora do evento como gravada (relógio corrigido quando aceito, senão `now`)                                                                                                                                                                                                                                      |
| 4   | Falha do sink derrubava o evento do motorista                 | `open()` roda num SAVEPOINT (`executor.transaction`): erro desfaz só a inserção, loga `companyId`/`tripStopId`/`stage`/nome do erro e o evento confirma. `close()` segue na transação, sem guarda (RF4)                                                                                                                                                               |
| 5   | RF3 "parada removida"                                         | Ver nota abaixo: nenhuma mudança de código                                                                                                                                                                                                                                                                                                                            |
| 6   | Baixa que não fecha a parada deixava `arrival` aberta         | Escritório não marca chegada junto: a baixa parcial dele não chamava o sink. Agora toda baixa chama `onStopEvent` (`stopClosed: stopCompleted`) e a política fecha a `arrival` da parada com `arrived` quando a parada não fecha                                                                                                                                      |
| 7   | Resíduos                                                      | `authorship` fora do serviço (opcional no tipo, que a política ignora); perda da corrida de versão no refino é logada sem PII (`driver_stop_reminder_refinement_lost_race`); `;` sobrando após `--> statement-breakpoint` do `rollback.sql`; o laço do `applyForStop` segue sequencial (fechar antes de abrir, o parcial é único por parada e etapa) e agora diz isso |

**Achado 5 (decisão):** a única coisa que apaga uma parada é `DELETE FROM trip_stops` (`deleteStop` da reconciliação e
`releaseUnloadedDocuments`), e `driver_stop_reminders_company_trip_stop_fk` é `ON DELETE CASCADE`: o lembrete some junto, na
mesma transação, e nunca fica `pending` apontando para parada inexistente. Fechar antes do `DELETE` seria um `UPDATE` apagado
na sequência. `retireStop`/`releaseDocument` só rodam em viagem não despachada (`tripStillOpen`), onde ainda não há lembrete.
Teste de caracterização (já nasce verde, por isso sem vermelho): "remover a parada (cascata da FK) não deixa lembrete pendente".
Consequência para a Fase 2: o histórico de um lembrete se perde com a parada; a entrega relê por `id` e trata "não existe" como fechado.

### Para a Fase 2

- Troca de tripulação (`transferTripCrew`) **não** fecha nem reatribui o lembrete (decisão do dono): o `driver_id` gravado na
  abertura pode ficar velho. A entrega (Fase 2) resolve o motorista **atual** da viagem na hora do envio, nunca confia em `driver_id`.
- O worker de entrega relê o lembrete por `id` e `companyId`; lembrete inexistente (parada removida por cascata) é "nada a enviar".

### Vermelho → verde

Vermelho (testes escritos antes do código, `driver-stop-reminders.integration.ts`, 14 pass / 8 fail):

- `a chegada fecha a chegada e abre a entrega a partir dela` (agora com saída de ponto compartilhado): `toMatchObject` falhou — a
  entrega foi refinada (`originKind` ≠ `fallback`).
- `o refino do OSRM não reescreve o prazo da entrega`: `Expected: 1793963400000 / Received: 1793964600000`.
- `o refino e o fechamento de outra empresa não alcançam o lembrete`: `expect(received).toBeUndefined()` recebeu o lembrete.
- `a saída tocada offline ancora o prazo na hora do toque`: `Expected "2026-11-06T10:00:00.000Z" / Received "2026-11-06T10:40:00.000Z"`.
- `a chegada tocada offline ancora a entrega na hora corrigida`: `Expected "…10:10:00.000Z" / Received "…10:40:00.000Z"`.
- `falha ao abrir o lembrete não derruba o evento do motorista`: `(fail)` — o gatilho que recusa o `INSERT` abortou a saída.
- `a baixa do escritório que não fecha a parada fecha a chegada`: `toMatchObject` falhou (lembrete seguia `pending`).
- Contrato `stop-reminder-transition.contract.ts`: 22 pass / 2 fail (`delivered`/`returned` sem fechar a parada).

Verde: `driver-stop-reminders.integration.ts` 22 pass, 0 fail; `stop-reminder-transition` 24 pass; contrato do refinador cobre
`settlement` nunca refinado.

### Gates (de `apps/api-transportada`)

- `bun run typecheck`: limpo. eslint e prettier nos 15 arquivos tocados: limpos.
- `bun run test`: 14291 pass, 35 skip, 0 fail.
- `bun --env-file=../../.env.test test --timeout 120000`: 14300 pass, 26 skip, 0 fail.
- `make migration-test` (raiz, após o `rollback.sql`): 231 pass, 0 fail.
- Integração (cada arquivo isolado): ver a lista abaixo.
  19 arquivos, todos 0 fail: driver-stop-reminders (22), stop-event-sequence (10), stop-order-guard (11), me-trip-departure (12),
  trip-field-office (25), trip-field-authorship (5), event-location-stamp (23), delivered-moment (18), trip-cancel-releases-notes (9),
  trip-lifecycle (6), occurrence-driver-lock (4), occurrence-duplicate-request (4), stop-occurrence-photo (9),
  trip-occurrence-attachment (6), address-arrival-correction (16), next-stop-offer (7), trip-retire-stop (2),
  trip-crew-transfer (16), whatsapp-driver-flow-actions (4).

### CI do PR 566

- **Catálogo do painel:** `apps/frontend-transportada/src/modules/shared/jobCatalog.constant.ts` ganhou
  `driver.stop-reminder.dispatch` (a T1.2 só o pusera na API e no worker; o painel não tem rótulo por rotina em locale).
  `bun run typecheck`, eslint e prettier limpos; `bun run test`: 1493 pass, 0 fail. A cron mantém subconjunto próprio
  (`bun run test` 101 pass).
- **`make smoke-driver` / `DEMO_API_NOT_READY_ON_53912`:** não é regressão desta mudança. A API de demonstração é
  `apps/frontend-driver/scripts/driver-preview-api.ts`, que só importa módulos do próprio frontend-driver (nada de
  `api-transportada`), e o PR não toca `apps/frontend-driver`. Falharam 2 de 66 testes de Playwright, ambos na espera de 20 s
  do `startDemoApi` (`conversation-smoke.helper.ts:52`) com o processo em `stdio: 'ignore'`; o log não traz erro do processo.
  Os outros 64 passaram, inclusive os que usam a mesma API de demo. Hipótese: partida lenta de `bun run` no runner carregado.
  Não reproduzido localmente; se repetir no re-run, aumentar `DEMO_BOOT_TIMEOUT_MS` ou deixar o stderr do filho visível.

## Revisão PR 566 — médios

Três itens médios da revisão do PR 566. Cada um nasceu de um teste vermelho.

| #   | Item                                                           | Correção                                                                                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | Remover a parada apaga o lembrete pendente sem trilha de fecho | Fechar antes do `DELETE` seria um `UPDATE` apagado pela cascata (`driver_stop_reminders_company_trip_stop_fk ON DELETE CASCADE`), então o rastro vai ao log estruturado: `driver_stop_reminder_discarded_with_stop` com `companyId`, `reminderId`, `stage`, `tripStopId`, `reason: 'stop_removed'` (sem PII) |
| A2  | Chegada marcada junto com baixa que não fecha a parada         | A chegada marcada junto agora abre `settlement`; a baixa que fecha a parada a fecha com `stop_closed` na mesma transação (fica uma linha `closed`, é o histórico). Ver suposição abaixo                                                                                                                      |
| A3  | `open()` engolia qualquer erro e logava só o nome              | Só falha do banco (SQLSTATE em `errno`, no erro ou no `cause`) é engolida, e o log ganha `sqlState`; qualquer outro erro propaga                                                                                                                                                                             |

**A1, o que foi plugado:** `createTripStopReconciliationPort(transaction, logger?)` chama `logStopRemindersRemovedWithStop` antes do
`DELETE`. O logger chega por `DrizzleTripRepository` (`releaseDocumentWithin`, o desvínculo em viagem despachada). Os outros
chamadores do porto (`drizzle-delivery-address-override`, `trip-document-review-link`) não têm logger hoje e seguem sem log —
sem regressão, mas sem rastro; plugar quando um deles passar a atuar em viagem com lembrete. O `DELETE` de
`releaseUnloadedDocuments` (`drizzle-trip-route.repository.ts`) roda dentro da própria transição para despachada, antes de
qualquer saída, e portanto antes de existir lembrete: não ganhou log.

**Suposição (reversível):** chegada marcada junto com uma baixa que **não** fecha a parada abre `settlement` (o motorista segue na
parada com documentos pendentes); só não fica aberta quando a baixa fecha a parada (RF2). Reverter é voltar a condição
`event.recordedTogether ||` em `decideArrival`.

### Vermelho → verde

- A1: `remover a parada pelo desvínculo registra no log o lembrete que a cascata apaga` (por `reconcileStopOnUnlink`, viagem
  despachada com `arrival` pendente): `Expected` 1 entrada de log, `Received` `[]`. Verde: 22 pass.
- A2: contrato `arrived marcada junto com a baixa fecha arrival e abre settlement`: 23 pass / 1 fail; integração
  `...baixa que não fecha a parada abre a entrega` e `...que fecha a parada deixa a entrega fechada`: 2 fail. Verde:
  contrato 24 pass; integração 23 pass.
- A3: contrato `driver-stop-reminder-open-failure.contract.ts`: log sem `sqlState` e `Received promise that resolved` para o erro
  de programação. Verde: 2 pass.

## T2.1 — 2026-11-07

**Pré-requisito conferido:** o suporte de menção do grupo (PR #564 `work/group-mention`, merge `00920a499`) está na base deste
branch e em `origin/staging`. Nada foi reimplementado.

- `withGroupMention` extraída (função pura) em `src/whatsapp/application/whatsapp-group-mention.service.ts`; o
  `evolution-group-reply.gateway.ts` passou a usá-la, sem mudar comportamento (`one-reply-one-message` e
  `group-request-session` seguem verdes).
- `createGroupStopReminderSender` (porta `group-stop-reminder-sender.port.ts` + adaptador
  `group-stop-reminder-sender.gateway.ts`): lê o número do motorista **atual** da viagem na hora do envio
  (`readCurrentDriverNumber`, implementação real fica para a T2.2), aplica `withGroupMention` e chama
  `createEvolutionDocumentSender().sendText({ mentionNumber })`, que devolve o id do provedor e lança se falhar. Fora de qualquer
  turno, então nunca é fundido em outra resposta.
- Contrato `group-stop-reminder-sender.contract.ts`: pede a menção do motorista atual e o corpo traz `@<número>`; troca de
  tripulação marca o atual; sem telefone válido sai sem marca; falha sobe. Vermelho: `Cannot find module` (0 pass / 1 fail).

### Gates (de `apps/api-transportada`)

- `bun run typecheck`: limpo. eslint e prettier nos 14 arquivos tocados (A e B): limpos.
- `bun run test`: 14299 pass, 35 skip, 0 fail.
- `bun --env-file=../../.env.test test --timeout 120000`: 14308 pass, 26 skip, 0 fail.
- Integração (cada arquivo isolado, `--env-file=../../.env.test`): driver-stop-reminders 23, trip-lifecycle 6, trip-repository 5,
  stop-event-sequence 10; todos 0 fail. Os mesmos gates valem para a seção "Revisão PR 566 — médios" (rodados uma vez, sobre as
  duas mudanças).

## T2.2 — 2026-11-07

Portão "pergunta aberta" extraído, entrega do lembrete e rota do robô. Arquivos novos em `apps/api-transportada/src/`:
`whatsapp-commands/{domain/driver-open-question.policy,application/driver-open-question.port,infrastructure/driver-open-question.adapter}.ts`,
`driver-stop-reminders/{application/{deliver-driver-stop-reminder.use-case,driver-stop-reminder-delivery.port,reminder-prompt-opener.port},domain/driver-stop-reminder.error,infrastructure/{drizzle-driver-stop-reminder-delivery.repository,current-trip-driver.query,group-reminder-prompt-opener},presentation/driver-stop-reminders.routes}.ts`.

**Movimentação (pure move):** `RouteOfferGate` e `canAskRouteOffer` saíram de `whatsapp-driver-route-offer.policy.ts` (20 linhas
removidas, nada mais mudou ali) para `driver-open-question.policy.ts` com o mesmo corpo; `whatsapp-driver-prompts.service.ts`,
`whatsapp-group-driver-flow.service.ts` e `test/whatsapp-commands/route-offer.contract.ts` só trocaram o caminho do import. Os três
pontos que montam o portão da oferta ficam como estavam. Contratos da 294 (`route-offer`) verdes sem alteração de asserção.

**Vermelho antes** (testes escritos primeiro; a implementação já existia no disco, então o vermelho foi medido tirando do lugar
`deliver-driver-stop-reminder.use-case.ts` e `driver-stop-reminders.routes.ts`): `bun test ./test/driver-stop-reminders.contract.test.ts`
→ `Cannot find module '.../presentation/driver-stop-reminders.routes.js'`, 0 pass / 1 fail / 1 error. Com os arquivos de volta: 133 pass.

**Decisões da execução:**

- **Chave desligada** (global ou da empresa): `deferred` com o `dueAt` atual e **nenhuma escrita** (a consulta do worker, T2.4, só traz
  empresa ligada; a corrida é rara e não precisa de reagendar).
- **Escalada não passa pelo portão de horário/pergunta/vaga**: ela não manda nada ao motorista. A ordem é: fechar se a parada andou →
  escalar se `attempts >= maxAttempts` → adiar (horário, pergunta, vaga) → enviar. `escalated` só grava `status` e `escalated_at`.
- **Sem grupo vinculado** ao motorista atual: adia pelo intervalo (`reason: no_group`), sem reservar. Individual/template e "só escala"
  são T3.2. O grupo é o do motorista **atual** da viagem (a troca de tripulação leva junto o grupo e a marca).
- **Motorista atual** = primeiro da tripulação com papel `driver` por `position` (`current-trip-driver.query.ts`); é o que a marca do
  grupo e o nome da mensagem usam. `readCurrentDriverNumber` agora é real (`toWhatsAppPhone` da ficha).
- **Reserva**: `UPDATE … SET version = version + 1, dispatching_until WHERE id AND company_id AND version AND status='pending' AND
(dispatching_until IS NULL OR <= now)`. Quem perde devolve `deferred` sem enviar. Gravar a tentativa (`attempts + 1`, `last_*`,
  próximo prazo) e devolver/fechar/escalar usam `WHERE id AND company_id AND status='pending'` (não repetem a versão: o refino do OSRM
  pode ter bumpado a versão no meio). Falha do provedor: `release` com `due_at = agora + 5 min`, tentativa não consumida.
- **Mensagem**: nós `fala_lembrete_chegada`, `_chegada_sem_previsao`, `_entrega` em `BOT_SPEECH_DEFAULTS` (chaves `lembreteChegada`,
  `lembreteChegadaSemPrevisao`, `lembreteEntrega`), publicados pelo `buildBotSpeechNodes` (o mesmo que o
  `whatsapp-flow-publish.ts` já usa; nada publicado em nenhum ambiente). Nome e parada passam por `plainText` (RF34). A marca
  `@<telefone>` do grupo é o prefixo do suporte de menção (`withGroupMention`, T2.1): o texto sai `@5516… 👋 Oi, Fulano! …`, e não
  `Oi, @… Fulano` como o desenho do RF9; mudar isso é mudar o suporte de menção. A linha "Saída às …" usa negrito (`*14:05*`) nos dois
  modelos: o `_14:05_` do RF9 na versão sem previsão é o `prettier` reescrevendo `*` em prosa no `spec.md`.
- **`ReminderPromptOpener`**: porta + abridor do grupo que não grava nada (`group-reminder-prompt-opener.ts`); a T2.3 o liga ao
  `GROUP_STEP_REGISTRY`. A porta é chamada **depois** da reserva e **antes** do envio.
- **Composição** (`main.ts`): `whatsappBotAudio`, `whatsappGroupTurns` e `whatsappGroupAudio` nascem em `bootstrap()` e vão por
  parâmetro a `createAnonymousRoutes` → `createEvolutionWebhook` (mesmos objetos, nenhuma cópia de estado); o envio do lembrete passa
  por `whatsappGroupTurns.send` (nunca ultrapassa o que um turno aberto guardou). O leitor da pergunta aberta usa `SessionRepository`
  do módulo da Meta (`getContext`, com as duas formas do número) e `hasPendingInConversation` do áudio (individual e `group:<jid>`).
- **Permissão** `trip.stop-reminder-dispatch` em `TRANSPORTADA_PERMISSIONS`, `COMPANY_ROLE_PERMISSIONS.automation`,
  `SERVICE_ONLY_PERMISSIONS`, `useAuthMe.query.ts`, `identity{,.en}.locale.json` e nos quatro contratos de permissão
  (`authorization`, `tenant-context`, `role-permissions`, `permission-matrix` do painel).
- **Feriado como dia fechado (RF8.2) NÃO ligado**: o calendário de feriados é por cidade (IBGE) e a empresa não tem cidade no
  cadastro; o repositório recebe um `readHolidayDates` injetável que hoje devolve `[]`. Decisão pendente do dono (qual cidade vale:
  a do endereço da empresa ou a da parada).
- **Risco já registrado** (T0.1): o áudio pendente é por processo; com mais de uma réplica da API o portão só enxerga o da réplica
  que atendeu.

**Gates (de `apps/api-transportada`):**

- `bun run typecheck`: limpo. `eslint --max-warnings=0` e `prettier --check` nos arquivos tocados: limpos.
- `bun run test`: 14337 pass, 35 skip, 0 fail.
- `bun --env-file=../../.env.test test --timeout 120000`: 14346 pass, 26 skip, 0 fail.
- Integração, cada arquivo isolado (`--env-file=../../.env.test`): `driver-stop-reminder-delivery` 9 pass (novo, na lista do
  `test:integration`), `driver-stop-reminders` 23, `next-stop-offer` 7, `whatsapp-driver-journey-group` 2,
  `whatsapp-driver-journey-direct` 2, `whatsapp-evolution-webhook` 3, `whatsapp-driver-flow-actions` 4; todos 0 fail.
  Cobrem: envia (corpo exato e marca do motorista atual, inclusive depois da troca de tripulação), adia por horário, por pedido
  aberto e por vaga, fecha se a parada andou, duas entregas enviam uma vez, escalada, 404 de outra empresa.
  O 403 para `trip.manage` está no contrato `driver-stop-reminder-routes.contract.ts` (a rota exige token de serviço).
- Matrizes `group-{flow,inbound}-isolation` e `literal-message-text` fazem parte do `bun run test` (verdes).
- `apps/frontend-transportada` (espelhos de permissão): `bun run typecheck` limpo, `eslint` nos arquivos tocados limpo,
  `bun run test` 1493 pass, 0 fail.

## Publicação — Fases 0 e 1 em staging (2026-11-07)

- PR #566 com merge em `staging` (`a7c300dd2`), feito com CI todo verde (21 checks, inclusive `integration-api` 1–8) e a revisão independente aprovando. Dono autorizou "pode seguir para staging com isso ligado".
- Deploy de staging `42325897310`: todos os serviços com `success`.
- `DRIVER_REMINDERS_ENABLED=true` ligado em staging no `api` e no `worker` (`railway variables --set`). Os dois redeploys terminaram em `SUCCESS`, e o log mostra `api_started`/`worker_started` sem erro.
- A chave da empresa segue desligada e o envio é da Fase 2, então nenhuma mensagem sai.

## T2.3 — 2026-11-07

Passo `reminder.stage` no `GROUP_STEP_REGISTRY` (dono `reminder`, prefixo `reminder.`), abridor real do grupo e adiamento.
Arquivos novos em `apps/api-transportada/src/`: `whatsapp/application/whatsapp-group-reminder-flow.service.ts`;
`driver-stop-reminders/{application/{driver-stop-reminder-postponement.port,postpone-driver-stop-reminder.use-case},infrastructure/{drizzle-driver-stop-reminder-postponement.repository,stop-note-number.query}}.ts`.

**Vermelho antes** (testes escritos primeiro): `bun test ./test/driver-stop-reminders.contract.test.ts ./test/whatsapp.contract.test.ts`
→ `Cannot find module '.../whatsapp-group-reminder-flow.service.js'`, 0 pass / 2 fail / 2 errors. Depois: 1071 pass nos três
entrypoints tocados (os dois acima e `message-text-boundary`), 0 fail.

**Decisões da execução:**

- **Delegação sem regra nova:** as opções 1–3 chamam `runJourneyAction` (o mesmo que o menu de ações): 1 de chegada →
  `stop.begin(arrive)` (com o pedido de localização da RF24), entregou → `delivery.begin`, não entregou → `return.begin`, 3 →
  `occurrence.start`. A nota é a primeira ainda aberta da parada lida na hora da resposta (`stop-note-number.query.ts`), não
  guardada no estado; parada sem nota aberta cai no "nada a registrar" do menu. O estado do pedido é só
  `{reminderId, stage, tripStopId}`.
- **Opção numerada** vem de `resolveStopReminderChoice` (a mesma lista de ações que monta a mensagem) e do `spokenOptionNumber`
  ("2", "opção dois", áudio confirmado). Fora de 1–4: `not_understood` com a fala `lembreteOpcaoInvalida` (conta tentativa do
  pedido, 3 e encerra, como todo passo).
- **"4":** `postpone-driver-stop-reminder.use-case.ts` usa `decideStopReminderPostponement` (T1.3). Adia: `attempts = max(attempts-1, 0)`,
  `postponements + 1`, `due_at = agora + intervalo da empresa`, `WHERE status='pending' AND postponements = <lido>`. Esgotado (3):
  nada é gravado, o prazo já era o do envio e o lembrete segue até a escalada. Lembrete que já não está pendente: fala
  "já foi encerrado". Em todos os casos o pedido fecha (`done`, sem despedida).
- **Falas** (`BOT_SPEECH_DEFAULTS`, nós `fala_lembrete_*`): `lembreteAdiado`, `lembreteAdiamentoEsgotado`, `lembreteEncerrado`,
  `lembreteOpcaoInvalida`. Nenhum texto literal no código.
- **"cancelar"** não tem cancelamento próprio: a sessão fecha o pedido como `cancelled` ("não registrei nada"), o lembrete segue
  pendente com o mesmo prazo (integração). **Comando digitado** ("cheguei", "entreguei 17234") escapa para `flow.start`, como o
  menu de ações.
- **Abridor** (`group-reminder-prompt-opener.ts`): abre o pedido pelo índice único parcial do grupo, com `state` (o repositório
  ganhou `state` opcional em `open`), dono = telefone do motorista atual (sem telefone válido, dono vazio: só quem marca o bot
  responde). Grupo ocupado → `ReminderPromptBusyError`: a entrega devolve a reserva (`release` +5 min, tentativa não consumida)
  e **não envia**. Envio que falha depois de aberto → `discard` fecha o pedido que este lembrete abriu.
- **Matrizes:** `group-flow-isolation` e `group-inbound-isolation` enumeram `PENDING` à mão; o passo foi acrescentado (chegada e
  entrega) e o dono `reminder` pode abrir só `begin`/`start` dos outros fluxos, nunca `answer`. As partes que iteram o registro
  (`cancelar`) pegam o passo sozinhas. `bun test ./test/whatsapp.contract.test.ts -t "reminder.stage"`: 34 pass.
- **Risco já conhecido:** o pedido do lembrete vive o tempo do `group_request_timeout_seconds`; sem resposta, a próxima tentativa
  vê "pedido aberto" e adia 5 min até ele vencer (a escalada não passa pelo portão). Não alterei o prazo do pedido.

**Gates (de `apps/api-transportada`):**

- `bun run typecheck`: limpo. `eslint --max-warnings=0` e `prettier --check` nos 27 arquivos tocados: limpos.
- `bun run test`: 14405 pass, 35 skip, 0 fail.
- `bun --env-file=../../.env.test test --timeout 120000`: 14414 pass, 26 skip, 0 fail.
- Integração, cada arquivo isolado: `driver-stop-reminder-group-step` 4 pass (novo, na lista do `test:integration`),
  `driver-stop-reminder-delivery` 9, `driver-stop-reminders` 23, `whatsapp-evolution-webhook` 3,
  `whatsapp-driver-journey-group` 2, `whatsapp-driver-journey-direct` 2; todos 0 fail. O novo cobre, pela entrada real do grupo
  (evento → entrada → sessão → roteador → registro): entregue + "1" grava a chegada e fecha o lembrete (`arrived`) e o pedido;
  "4" três vezes (tentativa devolvida, adiamentos 1/2/3, prazo avança) e a quarta conta como sem resposta; "cancelar" fecha o
  passo e o lembrete segue; pedido aberto no meio → não envia e devolve a reserva.

## Correções pós-T2.3 — 2026-11-07

**Defeito (risco aberto da T2.3):** o pedido de grupo do próprio lembrete (`reminder.stage`) ficava aberto até
`group_request_timeout_seconds`; a tentativa seguinte do mesmo lembrete lia "pedido aberto" e adiava 5 min repetidamente.

**Vermelho antes** (testes escritos primeiro): integração `driver-stop-reminder-group-step` (novo caso: tentativa 1 enviada, sem
resposta, relógio +31 min) → `outcome: 'deferred'` em vez de `sent`; contratos do abridor e da entrega → 3 fail
(`hasOwnOpen`/`replaces` ausentes).

**Correção:** `ReminderPromptOpener.hasOwnOpen` reconhece o pedido aberto no passo `reminder.stage` com o mesmo `reminderId`; a
entrega o desconta de `hasOpenGroupRequest` (as outras perguntas abertas e o pedido de outro fluxo/lembrete seguem adiando). O
`open` do abridor passa `replaces: {id, version}` e o repositório do grupo fecha o antigo (`cancelled`) e abre o novo **numa
transação** (versão mudou → `null` → `ReminderPromptBusyError`, nada enviado).

**Verde:** `driver-stop-reminder-group-step` 5 pass (um só pedido aberto depois da 2ª tentativa; o antigo `cancelled`), contrato do
reminder 151 pass, `driver-stop-reminder-delivery` 9, `driver-stop-reminders` 23, `whatsapp-evolution-webhook` 3,
`whatsapp-group-request-repository` 5, `whatsapp-driver-journey-group` 2; typecheck, eslint e prettier limpos nos arquivos tocados.
Gate completo (`bun run test` e o contrato com `--env-file`) fechado ao fim, na seção T2.5.

### Feriado nacional fecha o horário (RF8.2) — decisão do dono, 2026-11-07

**Decisão:** feriado como dia fechado = **só nacional**; estadual e municipal não fecham a cobrança (resolve a pendência da T2.2,
"qual cidade vale"). O calendário nacional é lei e mora no código (`business-calendar/domain/national-holiday.policy.ts`,
`listNationalHolidays`), sem consulta ao banco nem fornecedor externo; as tabelas `municipal_holidays`/`state_holidays` não são lidas.

**Vermelho antes:** contrato `national-holiday-dates` → módulo ausente; integração `driver-stop-reminder-delivery` (Natal,
sexta 2026-12-25, horário seg–sex 08–18) → `sent` em vez de `deferred`.
**Implementação:** `readNationalHolidayDates` (ano corrente e o seguinte, no fuso da empresa) é o padrão do
`DrizzleDriverStopReminderDeliveryRepository`. **Verde:** contrato 155 pass; integração: feriado nacional adia para segunda
2026-12-28 08:00 (-03), feriado só municipal (`municipal_holidays` na sexta 2026-11-13) envia; `driver-stop-reminder-delivery` 11 pass.
`spec.md` RF8.2 e `plan.md` (§ horário) reescritos para "feriado nacional (dono, 2026-11-07)".

## T2.6 — não se aplica

A T2.6 (OpenAPI gerado e teste "toda rota aparece") parte de uma premissa errada: `apps/api-transportada` não tem OpenAPI
("Sem OpenAPI nesta API" em `apps/api-transportada/CLAUDE.md`), não há documento gerado nem teste de "toda rota aparece"; o
contrato da rota é o arquivo de rotas mais o schema Zod. Conferido pelo coordenador em 2026-11-07.

## T2.5 — 2026-11-07

Escolha do canal (D5), conforme a T0.1 (evidência 1): grupo = `max(whatsapp_group_requests.last_activity_at)` do grupo do
motorista; individual = `last_inbound_at` da sessão da Meta (`SessionRepository.getContext`, com as duas formas do número); o
mais recente vence, empate ou nenhum → grupo; o uso do app não é fonte. Tudo por `companyId`.

**Vermelho antes:** contrato `driver-reminder-channel-resolver` e casos de canal da entrega → módulo ausente; integração
`driver-reminder-channel-resolver` → módulo ausente.

**Arquivos novos** (`apps/api-transportada/src/driver-stop-reminders/`): `application/driver-reminder-channel-resolver.{port,service}.ts`
(porta `DriverReminderChannelResolver` + `DirectReminderSender` + composição das fontes) e
`infrastructure/drizzle-driver-reminder-channel.resolver.ts` (adaptador Drizzle). `sessionPhoneCandidates` passou a ser exportado
do adaptador da pergunta aberta. `main.ts` liga o resolvedor à entrega.

**Desvio da Fase 3 (documentado no código, ramo real e testado):** a entrega recebe `directSender?`. Canal `direct` com remetente
envia no individual e grava `direct_text`/`direct_template`; **sem remetente (hoje, até a Fase 3) ou com `unavailable`, cai no
grupo na mesma tentativa** (uma só reserva); sem remetente e sem grupo, adia como antes (`no_group`); `unavailable` sem grupo
devolve a reserva e adia. A Fase 3 passa a implementação do `DirectReminderSender` e o desvio deixa de ser alcançado.

**Limite conhecido (D5/T0.1):** o pedido que o próprio bot abre para o lembrete (`reminder.stage`) também grava
`last_activity_at`, então um lembrete sem resposta no grupo puxa o canal para o grupo (o padrão). Aceito pela decisão da T0.1; se
for um problema na prática, a saída é desconsiderar pedidos `reminder.stage` sem resposta do motorista.

**Gates (de `apps/api-transportada`):**

- `bun run typecheck`: limpo. `eslint --max-warnings=0` e `prettier --check` nos arquivos tocados: limpos.
- `bun run test`: 14426 pass, 35 skip, 0 fail.
- `bun --env-file=../../.env.test test --timeout 120000`: 14435 pass, 26 skip, 0 fail.
- Integração, cada arquivo isolado (`--env-file=../../.env.test`): `driver-stop-reminder-delivery` 11, `driver-stop-reminders` 23,
  `driver-stop-reminder-group-step` 5, `driver-reminder-channel-resolver` 5 (novo, na lista do `test:integration`),
  `whatsapp-evolution-webhook` 3, `whatsapp-group-request-repository` 5, `whatsapp-driver-journey-group` 2; todos 0 fail.
  O contrato do resolvedor cobre grupo mais novo, individual mais novo, empate, nenhum, fonte ausente e dado de outra empresa; a
  integração cobre também "o uso do app depois não muda o canal" e a atividade do mesmo grupo noutra empresa.
- Os totais acima valem para o estado final dos três commits desta rodada (correção pós-T2.3, feriado nacional e T2.5).

## T2.4 — 2026-11-07

Rotina do worker que entrega os lembretes vencidos. Novos em `apps/worker-transportada/src/driver-stop-reminders/`:
`application/{driver-stop-reminder.routine,driver-stop-reminder-api.port,driver-stop-reminder-api.error,driver-stop-reminder-queue.port}.ts`,
`domain/driver-stop-reminder.constant.ts`, `infrastructure/{driver-stop-reminder-api.gateway,drizzle-driver-stop-reminder-queue.repository}.ts`.
Registrada em `main.ts` junto de `trip.canhoto.read` (só com o crachá do worker); `DRIVER_REMINDERS_ENABLED=false` fecha `succeeded` sem ler.
O gateway chama `POST /driver-stop-reminders/:id/delivery` (sem prefixo de versão, como as demais rotas do robô) e lê `{ data: { outcome, nextDueAt } }`.
Contadores do ciclo: `sent/deferred/closed/escalated`, `requestRejected`, `apiUnauthorized`, `apiUnreachable`, `unexpectedErrors`; API fora ou crachá
recusado encerra o ciclo com `api_unreachable` (único vocabulário do catálogo). Log só com ids de correlação e números.

**Desvio do plano (RF7 "reserva `dispatching_until`"):** o worker **não** grava a reserva. A entrega da API reserva pela mesma coluna
(`reserveAttempt` exige `dispatching_until` nulo ou vencido, e cobra `version`); uma reserva prévia do worker faria toda entrega responder
`deferred/already_reserved`. A seleção só **descobre**: `pending`, `due_at <= now`, reserva ausente ou vencida, e só empresa com
`company_driver_reminder_settings.enabled = true` (sem linha = desligada). `FOR UPDATE SKIP LOCKED` fora de transação não protege nada, então
não entrou; a exclusão mútua é o cadeado da API. Lote 50, teto 200 por ciclo, ids já vistos excluídos no ciclo.

**Despausa:** a 248 T4.10 não despausou por migration (o operador liga no painel); aqui a migration aditiva
`20261107041501_driver_stop_reminder_dispatch_unpause` faz `enabled=true` só onde `paused_origin='system'` (pausa de gente fica). `rollback.sql`
devolve a pausa do sistema. `db:generate` → `no_changes`. Entrou na lista de `static-migration.contract.ts`.

**Vermelho antes:** `bun test ./test/driver-stop-reminders.contract.test.ts` com `src/driver-stop-reminders` fora do lugar → `Cannot find module` (0 pass / 1 fail).
**Verde:** 20 pass (rotina 11, gateway 9).

### Gates

- worker: `bun run typecheck` limpo; eslint e prettier nos arquivos tocados limpos; `bun run test` 3057 pass / 0 fail.
- `make worker-integration`: 405 pass / 0 fail (a fila nova: 6 testes — vencidos por ordem, fechado, empresa desligada/sem linha, reserva da API, não escreve reserva, limite/exclusão).
- api: `bun run typecheck` limpo; `bun run test` 14426 pass / 35 skip / 0 fail; paridade do catálogo e do frontend não tocados.
- `make migration-test`: 230 pass / 1 fail — o teste "applies, constrains, rolls back, and reapplies" estoura o **timeout fixo de 30 s** (linha 659)
  nesta máquina, também sem a migration nova (medido: mesmo vermelho tirando a pasta). Com o timeout elevado a 600 s só nesta medição (revertido):
  192 pass / 0 fail, incluindo o rollback e a reaplicação da nova.

## Revisão PR 567 — correções

Teste primeiro, vermelho registrado, depois a correção.

- **M1 (pergunta aberta entre portão e envio, RF8.3):** vermelho na entrega (`deliver-driver-stop-reminder.contract.ts`, 6 falhas antes da correção, entre elas "pergunta aberta só na segunda leitura"). Correção: depois da reserva, `driverOpenQuestions.read` é lida de novo (ignorando o pedido do próprio lembrete) e, com algo aberto, `release` com a espera de 5 min e `deferred` sem enviar. A releitura fica antes da bifurcação de canal, então vale também para `sendDirect`. Teste do canal direto incluído.
- **M2 (envio ok, registro falha):** o envio e o registro foram separados. Falha do provedor segue como antes (devolve a tentativa, descarta o pedido, 5 min). Depois do envio, `recordSent` tem até 3 tentativas com espera de 200 ms x tentativa; na falha final o pedido fica aberto, a reserva é devolvida com o intervalo normal e há log `driver_stop_reminder_record_failed` (só ids). Janela que sobra: o processo morrer depois de o provedor aceitar e antes de qualquer gravação deixa a reserva expirar em 2 min e o lembrete vence de novo, com um segundo envio; não há como fechar isso sem idempotência no provedor. Na falha final de registro a tentativa também não é contada (um envio a mais é possível no limite de `maxAttempts`).
- **L1 (versão):** `reserveAttempt` devolve a nova versão; `recordSent`, `release` e `close` gravam só com `version` igual. Antes da reserva (fechar/adiar do portão) vale a versão lida. Integração: escritor com versão velha não grava nada.
- **L2:** `applyPostponement` só age com `dispatching_until` nulo ou vencido. Integração cobre as duas situações.
- **L4:** o dono vazio não casa na política de mensagem (rejeita `unknown_sender` e `not_addressed`), mas `handleLocation` (vermelho: avançava o pedido com remetente vazio) e `isOwner` aceitavam `'' === ''`; ambos agora tratam dono vazio como sem dono. `as never` em `SessionRepository` removido do `main.ts`: o tipo já bate, uma instância única `reminderSessions` serve aos dois consumidores.

Gates (de `apps/api-transportada`): `tsc --noEmit` sem erros; eslint e prettier nos arquivos tocados sem achados; `bun run test` 14434 pass / 0 fail; `bun --env-file=../../.env.test test --timeout 120000` 14443 pass / 0 fail; integração `driver-stop-reminder-delivery` 13/0, `driver-stop-reminder-group-step` 5/0, `driver-stop-reminders` 23/0, `driver-reminder-channel-resolver` 5/0, `whatsapp-evolution-webhook` 3/0, `whatsapp-driver-journey-group` 2/0. Observação honesta: os testes de integração L1/L2 foram escritos junto da correção (a integração leva ~2 min), então o vermelho registrado é o dos contratos M1, M2 e L4.

Vermelho de L1 e L2 (correção revertida só na hora do teste, depois restaurada por `git checkout`):

- L1, sem `version` no WHERE de `recordSent`/`release`/`close`: `expect(received).toMatchObject(expected)` falha (`Expected - 4 / Received + 25`: a linha foi gravada pelo escritor com versão velha). `(fail) ... (L1)`.
- L2, sem a guarda `dispatching_until` em `applyPostponement`: `expect(received).toBe(expected)`, `Expected: false`, `Received: true`. `(fail) ... (L2)`.

Os dois testes verdes de novo com a correção restaurada; nenhum dos dois é trivial.

## Bloco da parada na cobrança — 2026-11-07

Decisão do dono: a cobrança traz o bloco completo da parada (o mesmo da "Chegada registrada", 294 RF28), sem "Próximo passo" e sem "Depois desta". Falas `lembreteChegada`, `lembreteChegadaSemPrevisao` e `lembreteEntrega` ganharam `{{blocoParada}}`; a variável `{{parada}}` ("NF … +N · Cliente") saiu, com seus casos de contrato. O nó fala*\* nasce do catálogo do código, então o grafo raiz acompanha; não há catálogo de variáveis de `fala*\*` no painel para atualizar.

- Reuso: `describeStopCard` (`whatsapp-stop-card.policy.ts`) e `WhatsAppStopCardReader` (injetado como `stopCards` no use case de entrega, lido no envio com `companyId`, motorista atual e `tripStopId`). O dado de terceiro mantém o `plainText` que o bloco já aplica.
- Melhor esforço (como a 294): leitor ausente, `null` ou com falha envia o lembrete sem o bloco, sem linha em branco sobrando.
- Vermelho registrado antes da implementação: 15 falhas nos contratos `stop-reminder-message` e `deliver-driver-stop-reminder` (texto sem o bloco, variável `parada` ainda presente).
- Verde: contratos 14446 pass / 0 fail; `bun run test` 14437 pass / 0 fail; integração `driver-stop-reminder-delivery` com o corpo exato abaixo.

```text
@5516999990001 👋 Oi, Motorista Um! Já chegou na parada?
Saída às *12:00*

*Parada 1 de 1*
*NF <número>* · R$ 10.000,00
📍 Centro, 100

*1* - Cheguei
*2* - Já entreguei (mande a foto do canhoto)
*3* - Tive um problema (abrir ocorrência)
*4* - Ainda estou a caminho
```

## Hotfix — catálogo do cron (2026-11-07)

**Causa.** O catálogo do cron (`apps/cron-transportada/src/shared/job-catalog.constant.ts`) não tinha `driver.stop-reminder.dispatch`, que existe no worker, na API e no painel. Em `publishDueJob`, `schedules.start()` abre a linha em `job_executions` e só depois `jobRunEnvelopeV1Schema.parse` (job: `z.enum` do catálogo do cron) lançava `ZodError` **fora** do `try/catch` que fecha a execução com `publish_failure`. A linha ficava aberta (tudo NULL), bloqueava a rotina até a varredura de abandono de 900 s e o ciclo se repetia.

**Evidência em staging.** Execução `902dfcc5…` aberta desde 12:55:32 UTC; `cron_tick_job_still_running` às 13:02:31.

**Correção.** (1) o `parse` do envelope entrou no `try/catch`, e a execução é fechada com `unexpected_error` (`JOB_TICK_PUBLISH_FAILURE_OUTCOME`) e contada em `failedCount`; (2) entrada copiada do catálogo do worker (ordem, piso, vocabulário); (3) contrato entre apps `test/job-catalog-parity.contract.test.ts` (raiz, ligado ao job `format` do `ci.yml`) compara as quatro cópias entrada a entrada.

**Vermelho → verde.**

- `apps/cron-transportada/test/tick/parse-failure.contract.ts`: vermelho com a linha da execução aberta (`finishedAt: undefined`, `outcome: undefined`); verde depois de mover o `parse`.
- `test/job-catalog-parity.contract.test.ts`: vermelho com `summarize(cron)` sem a entrada `driver.stop-reminder.dispatch` (`Expected - 7`); verde depois de acrescentá-la.
