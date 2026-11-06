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
  (sem menção). A vaga do intervalo mínimo é `whatsapp_evolution_settings.next_send_at` (289).
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
  reescreve os `CHECK` de `job_executions_job_check`/`job_schedules_job_check`
  (`drizzle/20261002120000_trip_canhoto_read_job`). `trip.canhoto.read` só é registrada quando a credencial do
  worker existe (`MDFE_AUTO_ISSUE_KEYS`); rotina não registrada fecha `job_run_routine_missing`.
- **Pendências**: `pending-items/application/pending-item-source.port.ts` (`PendingItemKind`, uma fonte por tipo:
  `pending-items/infrastructure/*.source.ts`, registradas em `main.ts` no `createListPendingItemsUseCase`). O painel
  valida a resposta com `pendingItemsResponse.validation.ts` (estrito): tipo novo entra lá também.
- **Sino do painel**: `notifications.useCases.sendNotification.execute({ category, companyId, dedupeKey, locale,
payload, recipientUserId, templateKey })`; molde `createDriverOccurrenceNotifier` (275,
  `trips/application/driver-occurrence-notifier.service.ts`), chaves em `notification/domain/notification-catalog.constant.ts`.
- **"Tem pergunta aberta em qualquer fluxo"**: não existe consulta única; a 294 monta o portão `RouteOfferGate` /
  `canAskRouteOffer` (`whatsapp-commands/domain/whatsapp-driver-route-offer.policy.ts`, montado em
  `whatsapp-command-driver.service.ts:466-480` e `register-driver-flow-actions.ts:519`) com: pedido aberto do grupo
  (`whatsapp_group_requests`), `whatsapp_delivery_preparations`, `whatsapp_occurrence_drafts`,
  `whatsapp_canhoto_questions` abertos, `context.driverPrompt` e nó `stopEntry` da sessão individual, e o áudio
  pendente do bot (`whatsapp-bot-audio.service.ts`, **em memória da API**). O lembrete **reusa esse portão**.
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
  (`frontend-transportada/src/modules/company-settings/shared/companySettingsTabs.service.ts:303`).
- **Migrations**: última em staging `20261106120034_nfe_access_key_lookups`; pasta com `migration.sql`, `rollback.sql`,
  `snapshot.json`.
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
  `id` + `version` (o roteamento nunca segura a transação nem derruba o evento).
- **Use case** `deliver-driver-stop-reminder.use-case.ts` + rota `POST /driver-stop-reminders/:id/delivery`
  (robô) → `{ outcome: 'sent' | 'deferred' | 'closed' | 'escalated', nextDueAt? }`.
- **Grupo**: passo `reminder.stage` em `GROUP_STEP_REGISTRY` com handler que mapeia 1–4 para os fluxos que já existem
  (cheguei, entreguei/entrega em preparo, não entreguei, ocorrência) — nenhum fluxo novo de registro.
- **Portão "pergunta aberta"**: extrair do `RouteOfferGate` (294) a leitura "o motorista tem pergunta aberta em algum
  fluxo" para uma porta só (`DriverOpenQuestionPort`), usada pela oferta da próxima rota **e** pelo lembrete — sem
  segunda cópia da lista de tabelas.
- **Individual**: `DRIVER_PROMPT_KIND` ganha `stop_reminder` (TTL e tentativas da política que já existe) + nós
  `fala_lembrete_*` no grafo raiz (publicado por `scripts/whatsapp-flow-publish.ts`, que pede aprovação por ambiente).
  Janela de 24 h: porta de leitura de `lastInboundAt` da sessão (pacote) + `decideWhatsAppWindowExpiry`, que hoje não
  tem chamador. Fora da janela, `sendTemplate` com o modelo do módulo de Notificações (canal `whatsapp`,
  `whatsappTemplateName` = template aprovado na Meta, regra da 286), chaves `driver.stop-reminder.arrival` e
  `driver.stop-reminder.settlement`.
- **Último canal (D5)**: o último evento de campo do motorista com canal WhatsApp (`authorship='whatsapp'` + origem
  grupo/individual, T0.1 confere onde a origem fica gravada) ou a última mensagem de entrada dele; sem nenhum → grupo.
- **Escalada**: `drizzle-driver-stop-reminder-pending-item.source.ts` (`PendingItemKind` ganha
  `driverStopReminderEscalated`, permissão de leitura de viagens — T0.1 confere o nome) e `sendNotification` com a chave
  nova `trip.driver-stop-reminder-escalated` no catálogo, molde `createDriverOccurrenceNotifier` (275), `dedupeKey`
  `<chave>:<reminderId>:<etapa>:<userId>`, destinatários = lista efetiva de responsáveis da empresa (267/271).
- **Configuração**: `GET/PUT /settings/driver-stop-reminders` (`settings.manage`), Zod `.strict()`.

### Menção no grupo (D7, RF15)

**Pré-requisito, fora desta spec.** O dono decidiu (2026-11-06) que, no grupo, o bot marca a pessoa com quem fala: toda
resposta marca quem mandou o pedido (motorista, ajudante ou atendente) e as mensagens proativas marcam o motorista. Esse
suporte de menção do grupo é entregue **antes** da 299, logo depois do PR #561 (uma resposta, uma mensagem), e é dono de:
`sendText` com `mentioned` (hoje o `evolution-whatsapp-provider@0.3.0` só tem `sendText(to, body)`), o `@<número>` no
texto e a junção de textos numa mensagem só preservando a menção.

Aqui o lembrete só **usa** esse suporte, passando o motorista da viagem como a pessoa a marcar (RF15). Se ele ainda não
estiver em `origin/staging` quando a Fase 2 começar, a T2.1 para e pergunta — não reimplementa a menção.

### Worker (`apps/worker-transportada`)

- Rotina `driver.stop-reminder.dispatch` no catálogo (as duas cópias + paridade), `minimumIntervalSeconds:
JOB_TICK_INTERVAL_SECONDS`, vocabulário de falha `['api_unreachable']`; linha em `job_schedules` (300 s) semeada pela
  migration A, que reescreve os `CHECK` de `job_executions`/`job_schedules` (molde `20261002120000_trip_canhoto_read_job`).
- `driver-stop-reminder.routine.ts`: lê vencidos (`status='pending' AND due_at <= now()` com `FOR UPDATE SKIP LOCKED`,
  lote 50, reserva `dispatching_until = now() + 2 min`) e chama a API por gateway (molde `canhoto-review-api.gateway.ts`,
  mesma credencial de robô).
- Registrada sempre que a credencial do worker existe (como `trip.canhoto.read`, para não cair em
  `job_run_routine_missing`); com `DRIVER_REMINDERS_ENABLED=false` o ciclo fecha `succeeded` sem ler nada.

### Painel (`apps/frontend-transportada`)

- Configurações → bloco "Cobrança do motorista" (shadcn/ui, `.locale.json`, `.validation.ts`).
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
  hoje (levantamento); sem linha ou faixa vazia = sempre aberto. Feriado do calendário de dias úteis
  (`company_business_calendar_settings` + feriados) conta como fechado.
- Rollback: as duas tabelas são novas; derrubar = `DROP` em migration B com aprovação — não previsto.

## Contratos / API

- `POST /driver-stop-reminders/:id/delivery` — robô; 200 `{ data: { outcome, nextDueAt } }`; 404 de outra empresa.
- `GET/PUT /settings/driver-stop-reminders` — `settings.manage`; 400 com todos os erros de validação.
- `GET /pending-items` — novo `kind`; `POST /driver-stop-reminders/:id/dismissal` (permissão de gestão de viagens, T0.1 confere o nome).
- OpenAPI gerado das rotas (regra do repositório) e teste de que as rotas novas aparecem.

## Segurança e tenant

- `companyId` do contexto; a rota do robô confere que o lembrete é da empresa do token (BOLA).
- Permissão do robô só no papel `automation`, não herda `trips.manage` (molde 222).
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
