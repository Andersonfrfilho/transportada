# Plano — 299 O bot cobra o motorista na hora certa

## Contexto e premissas (levantamento em `origin/staging` `42e63ccbc`, 2026-11-06)

- **Eventos da parada**: `trip_stop_events` (`kind ∈ {arrived, delivered, returned, occurrence, departed,
departure_cancelled}`, `recorded_together` da 294) gravados por `recordEvent`
  (`drizzle-driver-field-report.repository.ts`). Saída em `trips/application/report-stop-departure.use-case.ts`
  (marca `trip_stops.en_route_since`), chegada em `report-stop-arrival.use-case.ts`, baixa em
  `document-outcome-steps.service.ts`; os passos comuns em `stop-event-steps.service.ts` (294 T2.2). Os três canais
  da tripulação (app, grupo, individual) e o escritório chegam a esses mesmos use cases.
- **Roteamento**: `trips/infrastructure/osrm-route-geometry.gateway.ts` (`createOsrmRouteGeometryGateway`) devolve
  pernas com `distanceMetres`/`durationSeconds`, `null` quando o OSRM falha. A 294 já o usa no bloco da parada
  (`whatsapp-stop-card.reader.ts`, origem = último evento com coordenada).
- **Grupo (Evolution)**: um pedido aberto por grupo em `whatsapp_group_requests` (`step`, `state`, `status='open'`,
  `expires_at`); passos no `GROUP_STEP_REGISTRY`; matrizes `test/whatsapp/group-{flow,inbound}-isolation.contract.ts`
  iteram o registro. O envio é `channel.sendText(to, body)` do `@adatechnology/evolution-whatsapp-provider@0.3.0`
  (o SDK não tem menção; a da PR #564 chama o Evolution direto — ver "Menção no grupo" abaixo). A vaga do intervalo mínimo é `whatsapp_evolution_settings.next_send_at` (289).
- **Individual (Meta)**: fluxo do `meta-whatsapp-module`; falas do bot são nós `fala_*` do grafo raiz
  (`whatsapp-commands/domain/whatsapp-bot-speech.constant.ts`, 286 T8); teste de arquitetura
  `test/message-text-boundary/literal-message-text.contract.ts` reprova literal.
- **Jornada**: `whatsapp-driver-journey.policy.ts`, `whatsapp-stop-card.policy.ts`, e a prova ponta a ponta
  `test/integration/whatsapp-driver-journey-{group,direct}.integration.ts` (respostas em
  `test/fixtures/driver-journey-*.expected.ts`).
- **Rotinas do worker**: catálogo `apps/worker-transportada/src/shared/job-catalog.constant.ts` (cópia na API, com
  contrato de paridade), `JOB_TICK_INTERVAL_SECONDS` (5 min), registro em `apps/worker-transportada/src/main.ts`.
  `trip.canhoto.read` (`canhoto-read/application/canhoto-read.routine.ts`) é o molde: o worker descobre e **reporta à
  API** por gateway (`canhoto-review-api.gateway.ts`), e a API decide, numa rota de robô com permissão própria só no
  papel `automation` (`trip.canhoto-auto-review`).
- **Chave global**: `MDFE_AUTO_ISSUE_ENABLED` em `config/environment.schema.ts` da API (`:236`, vazio = ausente,
  padrão `'false'`) e do worker (`:110`, `worker.types.ts:131`).
- **Agenda das rotinas**: `job_schedules(job, interval_seconds, next_run_at)`, semeada por migration que também
  reescreve os `CHECK` de `job_executions_job_check`/`job_schedules_job_check` (gerados de `SCHEDULED_JOBS` em
  `database/job-schedule.schema.ts:71`). Molde atual (T0.1): `apps/api-transportada/drizzle/20261013010226_occurrence_contractor_reply_alert_job`
  — um `ALTER TABLE … DROP CONSTRAINT …, ADD CONSTRAINT …` por tabela com a lista inteira (21 rotinas, a última
  `occurrence.contractor-reply.alert`, igual às 21 do `JOB_CATALOG`) e o `INSERT` com `enabled`/`paused_at`/`paused_origin`
  (rotina que nasce pausada pela origem `system`). O `20261002120000_trip_canhoto_read_job` é o molde antigo. `trip.canhoto.read` só é registrada quando a credencial do
  worker existe (`MDFE_AUTO_ISSUE_KEYS`); rotina não registrada fecha `job_run_routine_missing`.
- **Pendências**: `pending-items/application/pending-item-source.port.ts` (`PendingItemKind`, uma fonte por tipo:
  `pending-items/infrastructure/*.source.ts`, registradas em `main.ts` no `createListPendingItemsUseCase`). O painel
  valida a resposta com `pendingItemsResponse.validation.ts` (estrito): tipo novo entra lá também.
- **Sino do painel**: `notifications.useCases.sendNotification.execute({ category, companyId, dedupeKey, locale,
payload, recipientUserId, templateKey })`; molde `createDriverOccurrenceNotifier` (275,
  `trips/application/driver-occurrence-notifier.service.ts`), chaves em `notification/domain/notification-catalog.constant.ts`.
- **"Tem pergunta aberta em qualquer fluxo"** (T0.1 conferiu): não existe consulta única. O portão da 294 é a política
  pura `RouteOfferGate` / `canAskRouteOffer` (`whatsapp-commands/domain/whatsapp-driver-route-offer.policy.ts:65-79`,
  quatro booleanos: `hasOpenCollection`, `hasOpenStopChoice`, `hasPendingAudio`, `hasPendingPrompt`), mas cada um dos
  **três** pontos que o montam preenche só o que cabe no contexto dele — de propósito:
  - `whatsapp-command-driver.service.ts:471-479` (`offerNextRoute`, individual depois da prova): coleta aberta
    (`intake.preparations.hasOpen`), nó `DRIVER_FLOW_NODE.stopEntry`, áudio (`botAudio.hasPending`, conversa
    `user:<telefone>`) e `driverPrompts.pending(context)`;
  - `register-driver-flow-actions.ts:518-525` (baixa pelo fluxo individual): entrega em preparo **ou** rascunho de
    ocorrência (sem a pergunta do canhoto) e `readDriverPrompt(context, now)`; áudio e escolha de parada `false`;
  - `whatsapp/application/whatsapp-group-driver-flow.service.ts:210-215` (`settleDelivery`, grupo): só
    `delivery.hasOpen(turn)` — o pedido do grupo **é** o próprio turno, por isso não entra.
    Nenhum dos três lê `whatsapp_group_requests` (o levantamento anterior dizia que sim). As leituras que existem:
    coleta composta `combineWhatsAppDriverCollections(...).hasOpen` (`whatsapp-occurrence-draft.service.ts:599`:
    rascunho de ocorrência + entrega em preparo + pergunta do canhoto, por `companyId`+`driverId`, os dois canais);
    pedido do grupo `createDrizzleWhatsAppGroupRequestRepository(...).findOpen({ companyId, groupJid, now })`; contexto da
    sessão individual `sessions.getContext(companyId, phone)` (`readDriverPrompt`, `currentNodeId`); áudio
    `WhatsAppBotAudio.hasPending({ companyId, conversation, owner })` (`whatsapp/application/whatsapp-bot-audio.service.ts:258`,
    **em memória da API**, duas instâncias: individual em `main.ts:2167`, grupo dentro de `createEvolutionWebhook`
    em `main.ts:2489-2496`). O lembrete usa essas mesmas leituras pela porta da § Portão (sem segunda lista de tabelas).
- **Origem grupo × individual do evento** (T0.1, D5): **não fica gravada**. `trip_stop_events.channel` só distingue
  `driver_app | office | whatsapp | backoffice` (`TRIP_FIELD_CHANNELS`, `database/trip.schema.ts:119`); os dois canais de
  WhatsApp gravam `whatsapp` (`main.ts:1496-1527`). Só as tabelas de coleta guardam `origin_channel` (`group|individual`,
  `WHATSAPP_DELIVERY_PREPARATION_CHANNELS`), e só para o que abriu coleta. O que existe por canal: grupo =
  `whatsapp_group_requests` (`driver_id`, `last_activity_at`; toda mensagem aceita abre ou entra num pedido —
  `whatsapp-group-request.service.ts:296-330` — e "toda mensagem do grupo é do motorista dono do grupo",
  `fleet_driver_whatsapp_groups`, 292 T1); individual = `meta_whatsapp.sessions.last_inbound_at` do pacote (por telefone).
- **Permissões** (T0.1, `identity/domain/authorization.policy.ts`): ler viagens = `trip.read`, gerir = `trip.manage`
  (singular; não existe `trips.manage`). `trip.read` está nos papéis `driver`, `aggregate` e `helper` (`:269-284`): uma
  pendência com `trip.read` mostraria a todo motorista o motorista que não respondeu. A pendência da 294
  (`drizzle-address-correction-suggestion-pending-item.source.ts:111`) usa `trip.manage`. Robô: `trip.canhoto-auto-review`
  mora em `TRANSPORTADA_PERMISSIONS` (`:101`, com o porquê), em `COMPANY_ROLE_PERMISSIONS.automation` (`:297-302`) e em
  `SERVICE_ONLY_PERMISSIONS` (`:406-412`, não concedível por grupo); o realm não lista permissão (só papel). Espelhos:
  `frontend-transportada/src/modules/identity/queries/useAuthMe.query.ts:81`, `identity{,.en}.locale.json`, e os contratos
  `test/authorization.contract.test.ts`, `test/tenant-context.contract.test.ts`,
  `test/user-administration-application/role-permissions.contract.ts`, `frontend-transportada/test/identity/permission-matrix.contract.ts`.
- **Menção no grupo** (T0.1): já em `origin/staging` (PR #564, `00920a499`). `GroupReplySenderPort.send({ companyId,
groupJid, mentionNumber?, texts })` (`whatsapp/application/whatsapp-group-request.port.ts:125`), implementado em
  `createEvolutionGroupReplySender` (`whatsapp/infrastructure/evolution-group-reply.gateway.ts`): abre a primeira mensagem
  com `@<número>` e chama `sendEvolutionTextWithMention` (`evolution-mention-text.gateway.ts`, `POST /message/sendText`
  com `mentioned`) pelo `createEvolutionDocumentSender(...).sendText({ mentionNumber })`
  (`evolution-document-sender.gateway.ts:116`), que passa pelo espaçador da 289 e devolve `providerMessageId`. O `send` do
  porto é **fogo-e-esquece** (erro só vai a log, sem `providerMessageId`). Número do motorista para a marca:
  `toWhatsAppPhone(fleet_drivers.phone)` (`whatsapp-commands/domain/whatsapp-phone.policy.ts:17`).
- **Uma resposta, uma mensagem** (PR #561, `whatsapp-commands/application/whatsapp-turn-replies.service.ts`): o turno é a
  mensagem recebida (`withinTurn`, só no webhook). `send` **fora** de turno entrega na hora, depois de esvaziar o que um
  turno aberto já guardou para a mesma chave (`${companyId}|${groupJid}`) — a fala de fora nunca passa na frente. A
  instância do grupo (`groupTurns`) nasce dentro de `createEvolutionWebhook` (`main.ts:2413`).
- **Transações dos eventos da parada** (T0.1): saída `reportStopDeparture` (`trips/application/report-stop-departure.use-case.ts:40`,
  passo `applyStopDeparture` em `stop-event-steps.service.ts:96`); chegada `reportStopArrival` (`report-stop-arrival.use-case.ts:48`,
  passo `applyStopArrival` em `stop-event-steps.service.ts:147`); chegada marcada junto com a baixa `recordSkippedSteps`
  (`recorded-together-steps.service.ts:83`, chamada de `recordStepsBeforeOutcome` em `document-outcome-steps.service.ts:170`,
  dentro da transação da baixa); baixa `runDocumentOutcome` (`document-outcome.service.ts:62`, parada/viagem fechadas em
  `closeStopAndTrip`, `document-outcome-steps.service.ts:216`); cancelamento de saída `cancelStopDeparture`
  (`cancel-stop-departure.use-case.ts:44`, evento em `:114`); ocorrência de parada `reportStopOccurrence`
  (`report-stop-occurrence.use-case.ts:162`), de nota `registerDriverOccurrence` (`register-driver-occurrence.use-case.ts:65`),
  do escritório em lote `registerOfficeDocumentOccurrences` (`register-office-document-occurrences.use-case.ts:50`). Todos
  recebem `transaction: DriverFieldReportTransactionPort` (`drizzle-driver-field-report.repository.ts`). Encerramento e
  cancelamento da viagem **não** passam por ele: a transação mora no repositório — `DrizzleTripRepository.close`
  (`trips/infrastructure/drizzle-trip.repository.ts:206`, chamado de `createTripUseCases().close`, `trip.use-case.ts:188`;
  o "encerrar a rota" do grupo chega aqui) e `DrizzleTripRouteRepository.markCancelled` (`drizzle-trip-route.repository.ts:329`,
  de `cancel-trip.use-case.ts`). Parada removida: `DrizzleTripRepository.retireStop` (`:1050`) e `deleteStop` da reconciliação
  (`reconcile-trip-stops.use-case.ts:91`). Troca de tripulação: `transferCrew` (`:469`).
- **Individual (pedidos tipados)**: `whatsapp-driver-prompts.service.ts` + `whatsapp-driver-prompt.policy.ts`
  (`DRIVER_PROMPT_KIND`: `journey_actions | location | out_of_order | route_offer | stop_choice`; TTL 2 h; 3 tentativas).
- **Janela de 24 h**: mora no pacote (`meta_whatsapp.sessions.last_inbound_at`, `ConversationSession.lastInboundAt` de
  `meta-whatsapp-contracts`). Nosso código tem `decideWhatsAppWindowExpiry` (`occurrence-conversation/domain/
whatsapp-window-expiry.policy.ts`) **sem chamador**. Template: `createMetaWhatsAppSendingChannel(...).sendTemplate`
  (`whatsapp/infrastructure/meta-whatsapp-sending.gateway.ts`); não há registro de templates de motorista.
- **Envio proativo do worker ao grupo já existe** (`whatsapp-group-boleto-return-dispatcher.adapter.ts`, com
  `createEvolutionSendPacer`). Não foi o molde escolhido: o portão depende de estado que só a API tem (áudio pendente em
  memória, sessões do individual).
- **Origem do trajeto**: ponto compartilhado = lat/lng do `departed` em `trip_stop_events` (o armazém em memória de 5 min
  é consumido nesse evento); parada anterior e paradas em geral = `geocoded_addresses` por `address_key`; empresa =
  `company_route_optimization_settings.origin_address_key` (lido por `readDepot`, `trips/infrastructure/route-depot.query.ts`),
  que também tem o `timezone` da empresa.
- **Horário de funcionamento não existe** em lugar nenhum (só `departure_time_seconds` do roteiro, o calendário de dias
  úteis e a janela de recebimento por cliente). Nasce na configuração desta spec.
- **Configurações**: uma tabela `company_*_settings` por assunto; abas em `COMPANY_SETTINGS_TAB_IDS`
  (`frontend-transportada/src/modules/company-settings/shared/companySettingsTabs.service.ts:303`, 13 abas). T0.1: a aba
  `automations` ("Automações") monta hoje um painel só, autocontido, `ContractorAutomationsPanel` (285, fluxo semanal do
  contratante; `CompanySettings.page.tsx:261`, registro `contractorAutomations` em `companySettingsTabs.service.ts:233`);
  a aba `whatsapp` é o cadastro do Evolution (número, limites, QR — `WhatsAppEvolutionPanel`), sem o canal da Meta.
- **Migrations**: última em `origin/staging` (conferida na T0.1 em `00920a499`) `20261106120034_nfe_access_key_lookups`, em
  `apps/api-transportada/drizzle/`; pasta com `migration.sql`, `rollback.sql`, `snapshot.json`.
- 292/293 nunca tiveram pasta em `specs/` (`git log --all -- 'specs/292*' 'specs/293*'` vazio): as decisões delas estão
  no código, nos commits e no `apps/api-transportada/CLAUDE.md`.

## Arquitetura

```text
 evento da parada (app | grupo | individual | painel)
   └─ use case de saída / chegada / baixa / ocorrência / cancelamento (mesma transação)
        └─ DriverStopReminderService.onStopEvent  → abre / fecha / substitui linha em driver_stop_reminders
                                                    (cálculo: stop-reminder-schedule.policy.ts + OSRM fora da transação)

 worker: rotina driver.stop-reminder.dispatch (5 min)
   └─ lista vencidos por empresa (chave global + da empresa)
        └─ POST /driver-stop-reminders/:id/delivery   (robô, permissão trip.stop-reminder-dispatch, só automation)
             └─ API: confere RF8 → abre o passo (grupo: reminder.stage | individual: stop_reminder)
                    → envia (grupo com @menção | individual texto livre ou template) → grava tentativa
                    → ou escalated: fonte de pendência + notificação no sino
```

A decisão mora na API (como a 222): o worker é só o relógio. Assim as regras de isolamento, a leitura do pedido aberto
e o envio usam o mesmo código do bot, e o worker não ganha acesso ao Evolution/Meta para esta rotina.

### API (`apps/api-transportada`)

- **Políticas puras** em `src/driver-stop-reminders/domain/`:
  - `stop-reminder-schedule.policy.ts` — `{ stage, anchorAt, travelSeconds | null, settings }` → `{ expectedAt, dueAt }`
    (D1–D3; `travelSeconds` nulo → `DRIVER_STOP_REMINDER_FALLBACK_TRAVEL_SECONDS`, 45 min, em `.constant.ts`).
  - `stop-reminder-origin.policy.ts` — ponto compartilhado nesta perna › parada anterior › endereço da empresa; devolve
    também `isSharedPoint` (decide se a previsão aparece, RF6).
  - `stop-reminder-gate.policy.ts` — RF8: `send | close | defer(until, reason)` a partir de estado da parada, horário
    de funcionamento, pedido aberto e vaga.
  - `stop-reminder-transition.policy.ts` — evento × lembrete aberto → `open | close(reason) | supersede | none`.
  - `stop-reminder-message.policy.ts` — monta as variáveis das falas (`fala_*`) e as opções por etapa.
- **Serviço** `driver-stop-reminder.service.ts` (`onStopEvent`), chamado pelos use cases de saída, chegada, baixa,
  ocorrência, cancelamento de saída e encerramento, **dentro** da transação deles para fechar; a abertura grava a
  linha com `due_at` provisório (reserva) e o OSRM roda **depois do commit**, atualizando `expected_at`/`due_at` por
  `id` + `version` (o roteamento nunca segura a transação nem derruba o evento). Pontos de ligação (T0.1, § Contexto
  "Transações"): a escrita é um método novo do `DriverFieldReportTransactionPort` (o lembrete grava pela mesma
  transação), chamado em `applyStopDeparture` e `applyStopArrival` (`stop-event-steps.service.ts:96,147`, que cobrem
  app, grupo, individual e escritório, inclusive a chegada marcada junto — `recordSkippedSteps` repassa que foi junto,
  e aí não abre `settlement`), em `closeStopAndTrip` (`document-outcome-steps.service.ts:216`), em
  `cancelStopDeparture` (`:114`) e nos três use cases de ocorrência. Encerramento/cancelamento da viagem e parada
  removida fecham por `UPDATE … WHERE trip_id/trip_stop_id AND status='pending'` dentro da transação do repositório
  (`DrizzleTripRepository.close` `:216`, `DrizzleTripRouteRepository.markCancelled`, `retireStop`, `deleteStop`); o RF8.1
  na entrega é a segunda rede. Troca de tripulação (`transferCrew`) não fecha: a entrega lê o motorista atual da viagem.
- **Use case** `deliver-driver-stop-reminder.use-case.ts` + rota `POST /driver-stop-reminders/:id/delivery`
  (robô) → `{ outcome: 'sent' | 'deferred' | 'closed' | 'escalated', nextDueAt? }`.
- **Grupo**: passo `reminder.stage` em `GROUP_STEP_REGISTRY` com handler que mapeia 1–4 para os fluxos que já existem
  (cheguei, entreguei/entrega em preparo, não entreguei, ocorrência) — nenhum fluxo novo de registro.
- **Portão "pergunta aberta"** (desenho da T0.1): a decisão pura **move** de arquivo sem mudar — `RouteOfferGate` e
  `canAskRouteOffer` saem de `whatsapp-driver-route-offer.policy.ts` para `whatsapp-commands/domain/driver-open-question.policy.ts`,
  junto com o tipo e a decisão novos; os importadores (`whatsapp-driver-prompts.service.ts`,
  `whatsapp-group-driver-flow.service.ts` e os testes da 294) só trocam o caminho. Os três pontos que montam o portão da
  oferta **ficam como estão** (cada um preenche o que o contexto dele permite; preencher tudo mudaria a oferta — no
  grupo o pedido aberto é o próprio turno). A porta é a leitura completa, sem contexto de turno, para quem pergunta de fora:

  ```ts
  // whatsapp-commands/domain/driver-open-question.policy.ts
  export type DriverOpenQuestions = RouteOfferGate & { readonly hasOpenGroupRequest: boolean }
  export function hasDriverOpenQuestion(questions: DriverOpenQuestions): boolean // !canAskRouteOffer(q) || q.hasOpenGroupRequest
  // whatsapp-commands/application/driver-open-question.port.ts
  export type DriverOpenQuestionPort = {
    read(input: {
      readonly companyId: string
      readonly driverId: string
      readonly now: Date
    }): Promise<DriverOpenQuestions>
  }
  ```

  Adaptador `whatsapp-commands/infrastructure/driver-open-question.adapter.ts`, montado em `main.ts`, compõe as leituras
  que já existem: `hasOpenCollection` = `whatsappDriverCollections.hasOpen` (`main.ts:1673`, inclui a pergunta do canhoto);
  `hasOpenGroupRequest` = grupo do motorista (`DrizzleDriverWhatsappGroupRepository.find`) → `findOpen({ companyId,
groupJid, now })`; `hasPendingPrompt`/`hasOpenStopChoice` = `sessions.getContext(companyId, phone)` →
  `readDriverPrompt(context, now) !== undefined` / `currentNodeId === DRIVER_FLOW_NODE.stopEntry`, com o telefone de
  `toWhatsAppPhone(fleet_drivers.phone)` e as variantes do nono dígito (`brazilianPhoneCandidates`); `hasPendingAudio` =
  áudio individual (`conversation: user:<telefone>`, `owner: telefone`) **ou** do grupo (`group:<jid>`, qualquer dono —
  o "1" do ajudante também colide). O porto do áudio ganha `hasPendingInConversation({ companyId, conversation })`
  (lê a mesma `Map` por chave, sem dono); o `hasPending` atual não muda. Para o use case alcançar o áudio e o turno do
  grupo, `main.ts` sobe as instâncias que hoje nascem dentro de `createEvolutionWebhook` (`groupAudio` `:2489`,
  `groupTurns` `:2413`) e a individual (`:2167`) para o escopo da composição e as passa por parâmetro — mesmo
  objeto, nenhuma cópia de estado. O áudio continua por processo: com mais de uma réplica da API a leitura vale só para a
  réplica que atendeu (mesma limitação que a confirmação do áudio já tem).

- **Individual**: `DRIVER_PROMPT_KIND` ganha `stop_reminder` (TTL e tentativas da política que já existe) + nós
  `fala_lembrete_*` no grafo raiz (publicado por `scripts/whatsapp-flow-publish.ts`, que pede aprovação por ambiente).
  Janela de 24 h: porta de leitura de `lastInboundAt` da sessão (pacote) + `decideWhatsAppWindowExpiry`, que hoje não
  tem chamador. Fora da janela, `sendTemplate` com o modelo do módulo de Notificações (canal `whatsapp`,
  `whatsappTemplateName` = template aprovado na Meta, regra da 286), chaves `driver.stop-reminder.arrival` e
  `driver.stop-reminder.settlement`.
- **Último canal (D5)** (T0.1: a origem grupo × individual do evento não é gravada em lugar nenhum): deriva-se na
  entrega, sem coluna nova, da **última mensagem de entrada** do motorista por canal — grupo =
  `max(whatsapp_group_requests.last_activity_at)` do `group_jid` do motorista (`fleet_driver_whatsapp_groups`; usa o índice
  `whatsapp_group_requests_company_group_opened_idx`); individual = `sessions.last_inbound_at` do pacote para o telefone
  dele (mesma porta de leitura da janela de 24 h). Vence o mais recente; nenhum → grupo. O uso do app não entra (D5).
  Porta `DriverLastChannelPort.read({ companyId, driverId }) → 'group' | 'direct' | null` no módulo do lembrete.
- **Escalada**: `drizzle-driver-stop-reminder-pending-item.source.ts` (`PendingItemKind` ganha
  `driverStopReminderEscalated`, `requiredPermission: 'trip.manage'` — T0.1: `trip.read` está nos papéis de motorista,
  agregado e ajudante; mesmo critério da pendência da 294) e `sendNotification` com a chave
  nova `trip.driver-stop-reminder-escalated` no catálogo, molde `createDriverOccurrenceNotifier` (275), `dedupeKey`
  `<chave>:<reminderId>:<etapa>:<userId>`, destinatários = lista efetiva de responsáveis da empresa (267/271).
- **Configuração**: `GET/PUT /settings/driver-stop-reminders` (`settings.manage`), Zod `.strict()`.
- **Permissão do robô** `trip.stop-reminder-dispatch` (T0.1): entra em `TRANSPORTADA_PERMISSIONS` logo depois de
  `trip.canhoto-auto-review` (com o comentário do porquê), em `COMPANY_ROLE_PERMISSIONS.automation` e em
  `SERVICE_ONLY_PERMISSIONS`; espelhos em `useAuthMe.query.ts`, `identity{,.en}.locale.json` e nos quatro contratos de
  permissão listados no § Contexto. Sem mudança no realm (lá só existe o papel).

### Menção no grupo (D7, RF15)

**Pré-requisito, fora desta spec.** O dono decidiu (2026-11-06) que, no grupo, o bot marca a pessoa com quem fala: toda
resposta marca quem mandou o pedido (motorista, ajudante ou atendente) e as mensagens proativas marcam o motorista. Esse
suporte de menção do grupo é entregue **antes** da 299, logo depois do PR #561 (uma resposta, uma mensagem), e é dono de:
`sendText` com `mentioned` (hoje o `evolution-whatsapp-provider@0.3.0` só tem `sendText(to, body)`), o `@<número>` no
texto e a junção de textos numa mensagem só preservando a menção.

Aqui o lembrete só **usa** esse suporte, passando o motorista da viagem como a pessoa a marcar (RF15). Se ele ainda não
estiver em `origin/staging` quando a Fase 2 começar, a T2.1 para e pergunta — não reimplementa a menção.

**T0.1: o suporte já está em `origin/staging`** (PR #564, `00920a499`; § Contexto "Menção no grupo"). Como o lembrete o
chama: o `GroupReplySenderPort.send` é fogo-e-esquece, e a entrega precisa do resultado (gravar
`last_provider_message_id`; falha do provedor devolve a tentativa). Então o envio do lembrete no grupo é um adaptador
pequeno que:

1. monta o corpo com a marca pela **mesma** regra do remetente do turno — o prefixo `@<número>` e a validação de 8–15
   dígitos saem de `createMentionOnFirstMessage` (`evolution-group-reply.gateway.ts`) para uma função pura exportada
   ali mesmo (`withGroupMention(body, mentionNumber)`), usada pelos dois; número inválido ou ficha sem telefone → sai sem
   marca, nunca falha (regra da #564);
2. entrega por `groupTurns.send({ key, body, deliver })` (chave `<companyId>|<groupJid>`, a mesma do remetente do turno) com `deliver` aguardando
   `createEvolutionDocumentSender(...).sendText({ companyId, number: groupJid, body, mentionNumber })`, que devolve
   `providerMessageId` e lança `ContractorReplyWhatsAppSendError` na falha. A requisição do robô não está em turno
   nenhum, então o lembrete **nunca é juntado** à resposta de outro turno (é mensagem própria) e, pela regra da #561, sai
   **depois** do que um turno aberto do mesmo grupo já guardou — a fala de fora não passa na frente. Fora de turno o
   `send` propaga o erro do `deliver` (só dentro do turno ele vai a log).
3. usa o espaçador da API (`evolutionSendPacer`, `main.ts:3757`, espera até 20 s); a vaga é conferida antes pelo RF8.4
   (`next_send_at`), e ocupada além da espera → adia.

### Worker (`apps/worker-transportada`)

- Rotina `driver.stop-reminder.dispatch` no catálogo (as duas cópias + paridade), `minimumIntervalSeconds:
JOB_TICK_INTERVAL_SECONDS`, vocabulário de falha `['api_unreachable']`; linha em `job_schedules` (300 s) semeada pela
  migration A, que reescreve os `CHECK` de `job_executions`/`job_schedules` (molde
  `20261013010226_occurrence_contractor_reply_alert_job`: as 21 rotinas atuais + `driver.stop-reminder.dispatch`, e o
  `INSERT` com as colunas de pausa).
- `driver-stop-reminder.routine.ts`: lê vencidos (`status='pending' AND due_at <= now()` com `FOR UPDATE SKIP LOCKED`,
  lote 50, reserva `dispatching_until = now() + 2 min`) e chama a API por gateway (molde `canhoto-review-api.gateway.ts`,
  mesma credencial de robô).
- Registrada sempre que a credencial do worker existe (como `trip.canhoto.read`, para não cair em
  `job_run_routine_missing`); com `DRIVER_REMINDERS_ENABLED=false` o ciclo fecha `succeeded` sem ler nada.
  ⚠️ T0.1: isso contradiz o texto do RF20 ("o worker não registra a rotina") — **pendente do dono** (`evidence.md` § T0.1).

### Painel (`apps/frontend-transportada`)

- Configurações → bloco "Cobrança do motorista" (shadcn/ui, `.locale.json`, `.validation.ts`) na aba **`automations`**
  (T0.1): painel autocontido `DriverStopReminderPanel` ao lado do `ContractorAutomationsPanel` na mesma aba
  (`CompanySettings.page.tsx:261` passa a montar os dois) e entrada `driverStopReminders` com `tab: 'automations'` em
  `settingsPanelsOf`. Sem aba nova (já são 13); a aba `whatsapp` é só o cadastro do Evolution e o lembrete também usa a Meta.
- `/pendencias` → tipo "Motorista sem resposta" com atalho para a viagem e "Dispensar".

## Dados, migration e rollback

Migration A aditiva (`db:generate` → `no_changes` depois; `make migration-test`):

- **`driver_stop_reminders`**: `id uuid pk`, `company_id`, `trip_id`, `trip_stop_id`, `driver_id`,
  `stage varchar` (`arrival|settlement`), `status varchar` (`pending|closed|escalated|cancelled`),
  `anchor_at` (saída ou chegada), `origin_kind varchar` (`shared_point|previous_stop|company|fallback`),
  `travel_seconds int null`, `expected_at null`, `due_at`, `attempts int`, `postponements int`, `last_sent_at null`,
  `last_channel varchar null` (`group|direct_text|direct_template`), `last_provider_message_id text null`,
  `dispatching_until null`, `closed_reason varchar null`, `closed_at null`, `escalated_at null`,
  `dismissed_by_user_id null`, `version bigint`, `created_at`, `updated_at`.
  - Único parcial `(trip_stop_id, stage) WHERE status = 'pending'`; índice `(status, due_at)`; FK composta por empresa.
  - `CHECK` de lista para `stage`, `status`, `origin_kind`, `last_channel`, `closed_reason` (`inList`).
- **`company_driver_reminder_settings`** (uma linha por empresa; sem linha = desligado e padrões):
  `enabled bool default false`, `max_attempts`, `interval_minutes`, `grace_min_minutes`, `grace_percent`,
  `dwell_minutes`, `operating_hours jsonb` (`[{ weekday, start, end }]`, fuso da empresa). Horário de funcionamento não existe
  hoje (levantamento); sem linha ou faixa vazia = sempre aberto. Feriado **nacional** (dono, 2026-11-07;
  `listNationalHolidays`, no código) conta como fechado; estadual e municipal não.
- Rollback: as duas tabelas são novas; derrubar = `DROP` em migration B com aprovação — não previsto.

## Contratos / API

- `POST /driver-stop-reminders/:id/delivery` — robô; 200 `{ data: { outcome, nextDueAt } }`; 404 de outra empresa.
- `GET/PUT /settings/driver-stop-reminders` — `settings.manage`; 400 com todos os erros de validação.
- `GET /pending-items` — novo `kind`; `POST /driver-stop-reminders/:id/dismissal` (`trip.manage`, T0.1; a dispensa da sugestão de endereço da 294 é
  `/address-correction-suggestions/:suggestionId/dismiss` com o mesmo `trip.manage` — aqui fica o substantivo, regra de API).
- OpenAPI gerado das rotas (regra do repositório) e teste de que as rotas novas aparecem.

## Segurança e tenant

- `companyId` do contexto; a rota do robô confere que o lembrete é da empresa do token (BOLA).
- Permissão do robô `trip.stop-reminder-dispatch` só no papel `automation` e em `SERVICE_ONLY_PERMISSIONS`, não herda
  `trip.manage` (molde 222).
- Log: `companyId`, `reminderId`, `tripStopId`, `stage`, `attempt`, `outcome`, `reason`. Nunca telefone, nome, cliente,
  coordenada ou texto da mensagem. O `mentioned` leva o número só no corpo do envio, nunca no log.

## Idempotência e concorrência

- Abrir/fechar na transação do evento; reenvio do evento acha o único parcial e não duplica.
- Envio: a API reserva a tentativa com `UPDATE … WHERE id = $1 AND version = $2 AND status = 'pending'`; dois robôs não
  enviam a mesma tentativa. A mensagem só sai depois da reserva; falha do provedor devolve a tentativa
  (`attempts` não sobe, `due_at = now + 5 min`).
- O passo do grupo e o pedido individual nascem só se não houver pedido aberto (RF8.3, índice único que já existe).

## Observabilidade

- `job_runs` da rotina com contagem `sent/deferred/closed/escalated` e motivo de adiamento.
- Linha do tempo da parada não ganha evento novo; a escalada aparece em `/pendencias` e no sino.

## Estratégia de testes

- Contratos (antes do código) das quatro políticas, com relógio injetado: tabelas de etapa × evento, folga, origem,
  portão (horário, pedido aberto, vaga), opções por etapa.
- Contrato do passo `reminder.stage` nas matrizes de isolamento (entra sozinho por iterar o registro; T2 confere).
- Contrato de que o lembrete do grupo pede a menção do motorista ao suporte de menção (o suporte em si é testado na entrega dele).
- Integração: saída abre, chegada fecha e abre `settlement`, baixa fecha, ocorrência fecha, cancelamento cancela;
  reenvio não duplica; duas entregas concorrentes da mesma tentativa enviam uma.
- **Jornada com relógio falso** (Fase 5) em `whatsapp-driver-journey-{group,direct}.integration.ts`: saída → o tempo
  passa → lembrete → cada resposta 1–4; com cada fluxo aberto (ocorrência, entrega em preparo, escolha de parada,
  oferta da próxima rota, localização) o lembrete espera; três sem resposta → pendência e sino.
- Worker: contrato da rotina (descobre, reserva, chama o gateway, conta) e da chave global.
- Painel: bloco de configuração e o tipo novo em `/pendencias` (script `test`).

## Riscos

- Template da Meta precisa de aprovação antes da Fase 3 em produção (dias). Mitigação: sem template, cai no grupo.
- Suporte de menção do grupo (pré-requisito) atrasar: a Fase 2 espera; as Fases 1, 3 e 4 seguem.
- Cobrança demais incomoda o motorista: padrão desligado por empresa, horário de funcionamento e adiamento por pedido
  aberto.
- Réplicas da API: o armazém da localização compartilhada é por processo (já documentado); o lembrete não depende dele —
  a origem é o evento `departed` com coordenada gravado no banco.
