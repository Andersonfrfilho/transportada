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

| Nó | Quando | Variáveis |
| --- | --- | --- |
| `fala_lembrete_chegada` | etapa `arrival`, `isSharedPoint` | `nome`, `parada`, `saida`, `previsao` |
| `fala_lembrete_chegada_sem_previsao` | etapa `arrival`, sem ponto compartilhado (RF6) | `nome`, `parada`, `saida` |
| `fala_lembrete_entrega` | etapa `settlement` | `nome`, `parada`, `chegada` |

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
- API `bun run test:integration` (`--env-file=../../.env.test`): **não concluído** nesta sessão. Rodou mais de 1 h sem terminar (pid 3907729, log `/tmp/claude-1000/-home-miyazaki-Documents-personal-transportada/4aacf520-d202-44a6-b36e-4909184c8327/api-integration2.log`, banco de teste ativo). Os arquivos de integração tocados só mudaram fixture (`driverRemindersEnabled: false`); o typecheck os cobre.
- Worker `bun run typecheck`: 0 erros. Worker eslint e prettier nos arquivos tocados: limpos.
- Worker `bun run test`: 3037 pass, 0 fail, 115 arquivos.
- `make config` (raiz): exit 0.
