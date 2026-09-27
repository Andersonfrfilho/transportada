# Plano técnico — 206 A rota começa em cada parada

> **Revisão 2, 2026-09-26.** A troca de parada saiu; entrou o bloqueio na tela e a recusa
> `409 TRIP_HAS_STOP_EN_ROUTE` na API (spec.md § "Revisão 2", D4). O que isso muda aqui: o caso de uso
> **não escreve em duas paradas**, some a etapa de "troca", nasce
> `TripHasStopEnRouteError` em `trips/domain/trip.error.ts`, e a trava das paradas fica com outra
> justificativa (serializar a leitura de "alguma a caminho?", para o perdedor receber `409` e não `500`
> do índice único).
>
> **Revisão 3, 2026-09-26.** A Q4 foi respondida ("Desfazer sempre, com registro") e nasceu o
> **"Cancelar rota"** (spec D18/D19): rota `POST .../stops/:stopId/cancel-departure`, kind novo
> `departure_cancelled` na **mesma** migration, `TripStopDepartureNotCancellableError`
> (`409 TRIP_STOP_DEPARTURE_NOT_CANCELLABLE`), item de fila `cancelDeparture`, kind
> `stop.departure_cancelled` na linha do tempo, e na Fase 7 o aviso de cancelamento com supressão dentro
> dos 2 min e vaga reservada no teto. **Continua não existindo `UPDATE` em duas paradas.**
>
> **Revisão 4, 2026-09-26.** Decisão do usuário: **cada Iniciar rota avisa o cliente**, inclusive depois
> de um cancelamento. A unicidade do aviso passa a
> `(company_id, stop_id, email_hash, kind, departure_event_id)`, e a reserva de vaga no teto virou
> `sent + outstanding < cap` (uma vaga por obrigação em aberto) — a forma antiga, `sent < cap - 1`,
> reservava uma vaga só para a instalação inteira e quebrava com várias paradas a caminho ao mesmo tempo.
> **Q5 aberta:** teto de avisos por parada e endereço (o pior caso está nos casos extremos da spec).
>
> **Revisão 5, 2026-09-26.** Decisão do usuário: a Fase 7 é **implementada e nasce desligada por
> configuração de empresa**, e o aviso passa a ser um evento com destinos (spec D20). O que isso muda
> aqui: `RECIPIENT_NOTICE_ENABLED` (env) **sai**; nascem `company_recipient_notice_settings` com
> `en_route_notice_enabled` e `email_channel_enabled` (ambos `default false`); nasce a porta
> `RecipientNoticePort` com o adaptador `recipient-notice-email.gateway.ts`; a outbox e o registro ganham
> `channel`; o contador de teto passa a ser por `(company_id, channel)`; e a **Q5 deixa de ser
> bloqueante** — desligado, o pior caso é zero e-mail. A Fase 7 pode subir em produção **sem efeito
> nenhum**.

## Contexto e premissas

Conferidas em 2026-09-25 na árvore `work/driver-app`, HEAD `19f8a2afd`, com trabalho não commitado de
outras sessões.

- **A branch está atrás de `origin/staging`:** 106 commits no momento da conferência.
- **A T0.1 confere tudo de novo** contra `origin/staging` e anota arquivo:linha no `evidence.md`.
- **O HEAD anda durante o dia:** a crítica viu `4aa0a1c6f`. A T0.1 usa o do momento.

1. **Tipos de evento da parada.** `TRIP_STOP_EVENT_KINDS` é `arrived|delivered|returned|occurrence`,
   e `kind` é `text` com CHECK (`apps/api-transportada/src/database/trip.schema.ts:986-987`, `:997`,
   `:1104-1107`). O contrato do CHECK está em
   `test/database-migration/trip-constraints.assertion.ts:486-492`.
2. **Idempotência.**
   - Mora em `trip_field_reports` (`trip.schema.ts:1289-1354`, unique `(company_id, idempotency_key)`).
   - É consumida por `withFieldReport` (`trips/application/trip-field-report.port.ts:50-84`).
   - O `recall` devolve só o id.
3. **`start-route`.**
   - Ignora o corpo (`me-trip.routes.ts:299-326`).
   - `startFieldTrip` → `updateStatus` **abre a própria transação**
     (`drizzle-current-driver-trip.repository.ts:166-203`).
4. **Chegada.**
   - Exige a viagem em `TRIP_ON_ROAD_STATUSES` (`drizzle-driver-field-report.repository.ts:59`,
     `:163-192`).
   - Grava `arrived_at` só na primeira vez (`:257-272`).
   - Leva `dispatched` a `in_transit` por `markTripInTransit` (`:310-343`), dentro da transação do
     evento.
5. **Os dois únicos escritores de `arrived_at` e `completed_at` em `trip_stops`:**
   - `markStopArrived` (`:263-264`);
   - `completeStopIfSettled` (`:386-431`), que com `fillMissingArrival` (`:420-424`) também grava
     `arrived_at`, chamado por `document-outcome-steps.service.ts:165`.

   Os outros `update(tripStops)` (`drizzle-trip-route.repository.ts:240`, `:379`, `:385`, `:735`) não
   tocam essas colunas.

6. **App.**
   - Manda `start-route` direto e sem corpo (`driverTripClient.service.ts:260-262`).
   - O "Cheguei" entra na fila (`DriverTripWorkspace.page.tsx:717-722`; `useDriverTrip.hook.ts:439-466`).
   - A drenagem real é `drainQueueWithAttachments` (`offlineAttachments.service.ts:261-330`), que
     **mantém o item recusado** e o pula na drenagem automática.
7. **Painel.** Recusa a página da linha do tempo quando há um kind desconhecido
   (`tripResponse.validation.ts:901-911`, `:1299-1325`). O cursor da linha do tempo compara a
   prioridade como `::int` (`trip-timeline-condition.helper.ts:43`).
8. **"Cheguei libera a entrega" e o escape da 205.**
   - Estão no commit `3e3730732`, **local, ainda não em `origin/staging`**
     (`DriverStopCard.component.tsx:235-241`, `:369-375`, `:472`).
   - A API da 205 continua sem commit. A migration dela é `20260926003822_late_registration`.
   - A Fase 4 desta spec **só começa** com os dois em `origin/staging`.
9. **A 196 não está implementada:** `location_state` não existe no `src`. A D1 cobre as duas ordens.
10. **O e-mail do destinatário não é gravado** (`nfe.schema.ts:356-370`). A Fase 7 depende da 193
    T6.5.
11. **As rotas `/me` de parada não têm teto de requisição.** O interruptor da leitura do canhoto está
    em `company-delivery-proof-settings.schema.ts:59`.

## Arquitetura e arquivos afetados

### API (`apps/api-transportada`)

- `src/database/trip.schema.ts`:
  - `departed` e `departure_cancelled` em `TRIP_STOP_EVENT_KINDS`;
  - `trip_stop_events.tapped_at`;
  - `trip_stops.en_route_since` e `en_route_tapped_at`, com os dois CHECKs e o índice único parcial;
  - `trip_field_reports.result_changed`.
- `drizzle/<ts>_stop_departure/`:
  - `migration.sql`, `rollback.sql` e `snapshot.json`;
  - `test/database-migration/stop-departure-rollback.assertion.ts` (novo).
- `src/trips/application/report-stop-departure.use-case.ts` (novo), no molde de
  `report-stop-arrival.use-case.ts`:
  - `withFieldReport` com `stop.depart`;
  - trava das paradas;
  - leitura da decisão;
  - as recusas e os no-ops na ordem da D2 (`404` → no-op → no-op por `tappedAt` → `409`);
  - evento e `markStopEnRoute` **da própria parada, e só dela**;
  - `markTripOnDeliveryRoute`.
- `src/trips/application/cancel-stop-departure.use-case.ts` (novo), no molde do de cima e com as
  mesmas travas:
  - `withFieldReport` com `stop.cancel-departure`;
  - decisões na ordem da D18 (`404` → no-op por `tappedAt` → `409` → no-op);
  - evento `departure_cancelled` e `clearStopEnRoute` **da própria parada**;
  - **sem** transição de status: não chama `markTripOnDeliveryRoute` nem toca `trips`.
- `src/trips/domain/trip.error.ts`:
  - `TripHasStopEnRouteError`, código `TRIP_HAS_STOP_EN_ROUTE`, status `409`, com
    `{ enRouteStopId, enRouteStopSequence }` no contexto, no molde de `TripDocumentNotReachableError`
    (`:376`) e ao lado de `TRIP_HAS_UNLOADED_DOCUMENTS` (`:264`) e `TRIP_HAS_UNSCHEDULED_STOPS` (`:288`);
  - `TripStopDepartureNotCancellableError`, código `TRIP_STOP_DEPARTURE_NOT_CANCELLABLE`, status `409`,
    com `{ reason: 'arrived' | 'completed' }` (grafia `cancellable`, a do repositório —
    `trip.error.ts:181` usa `cancelled`).
- `src/trips/application/trip-field-report.port.ts`: o guard grava `result_changed` e o `recall`
  devolve `{ id, changed }`. O no-op liquida a chave com `result_id = null` e
  `result_changed = false`.
- `src/trips/application/driver-field-report.port.ts` e
  `src/trips/infrastructure/drizzle-driver-field-report.repository.ts`:
  - `lockTripStops`;
  - `readDepartureDecision` (parada, a atual a caminho, e o último `departed.tapped_at` e `arrived`
    da viagem);
  - `markStopEnRoute`;
  - `clearStopEnRoute` (só a própria parada, para o cancelamento);
  - `markTripOnDeliveryRoute`, no molde de `markTripInTransit`, `:310-343`;
  - `markStopArrived` com `clearEnRoute: 'trip' | 'stop'` pelo canal (D7);
  - `completeStopIfSettled` zerando `en_route_*` no mesmo `UPDATE`.
- `src/trips/presentation/me-trip.schema.ts`: `parseDepartureRequest`, `.strict()`, com
  `{ location?, tappedAt }` — **o mesmo parser serve ao cancelamento**, que tem corpo idêntico.
- `src/trips/presentation/me-trip.routes.ts`: `STOP_DEPART_PATH`, `STOP_CANCEL_DEPARTURE_PATH` e as duas
  rotas.
- `src/trips/domain/departure-order.policy.ts` (novo): a comparação do `tappedAt` com tolerância e a
  janela do `tappedAt`.
- `src/trips/infrastructure/drizzle-current-driver-trip.repository.ts` (`listStops`/`toDriverStop`) e
  a serialização: `enRouteSince` e `enRouteTappedAt`.
- `src/trips/application/trip-timeline.types.ts` e
  `src/trips/infrastructure/trip-timeline-stop.query.ts`: `stop.departed` e
  `stop.departure_cancelled`, prioridade 0 nos dois.
- `src/trips/domain/stop-travel-sample.policy.ts`, `src/trips/application/stop-travel-sample.port.ts`
  e `src/trips/infrastructure/drizzle-stop-travel-samples.query.ts`, todos novos.
- `src/main.ts`: composição.

### Worker (`apps/worker-transportada`)

- `src/database/trip-execution.schema.ts`: a cópia de `trip_stop_events` ganha `tapped_at`.
- O expurgo de 90 dias já zera o ponto de qualquer `kind` e não precisa de mudança.
- A Fase 7 acrescenta o relay do aviso, **por canal**: ele lê a outbox filtrando `channel = 'email'` e
  ignora canal que não tem adaptador aqui.

### Fase 7 — a porta e o único adaptador (Revisão 5)

- `src/trips/application/recipient-notice.port.ts`: `RecipientNoticePort` e `RecipientNoticeEvent`
  (`kind: 'en_route' | 'cancelled'`, empresa, parada, `departureEventId`, notas, previsão,
  destinatário). O caso de uso recebe a porta por construtor (code-standart §6).
- `src/trips/infrastructure/recipient-notice-email.gateway.ts`: o **único** adaptador — grava a outbox
  com `channel = 'email'`. O provedor (Resend/SMTP) continua onde está, no worker.
- `src/trips/shared/recipient-notice.constant.ts`:
  `RECIPIENT_NOTICE_CHANNELS = ['email', 'whatsapp', 'partner_webhook'] as const` e
  `RECIPIENT_NOTICE_IMPLEMENTED_CHANNELS = ['email'] as const`. O `PUT` recusa ligar canal fora da
  segunda lista (`422 RECIPIENT_NOTICE_CHANNEL_UNAVAILABLE`), e é isso que impede configuração morta.
- `src/database/company-recipient-notice-settings.schema.ts`: PK `company_id`,
  `en_route_notice_enabled` e `email_channel_enabled`, `boolean not null default false`, no molde de
  `company-delivery-proof-settings.schema.ts:59`. **Sem coluna para canal que não tem adaptador.**
- `src/main.ts`: o mapa canal → adaptador, com uma entrada.
- **Não nascem:** registro de plugins, fábrica genérica de canais, tabela de canais. Canal novo = uma
  coluna, um `.gateway.ts` e uma linha no mapa.

### App do motorista (`apps/frontend-driver/src/modules/driver-trip`)

- `shared/driverTrip.types.ts`: `kind: 'depart'` e `kind: 'cancelDeparture'`, os dois com `stopId` e
  `tappedAt`; `enRouteSince` e `enRouteTappedAt` na parada.
- `shared/driverTripResponse.validation.ts`: as duas chaves opcionais. **Ausente é diferente de
  `null`** (D17).
- `shared/driverTripClient.service.ts`: `reportPath`/`reportBody` do `depart` e do `cancelDeparture`.
  Saem `startRoute` e a interface (`:125-126`, `:260-262`).
- `shared/eventQueueView.service.ts`: `stopId` no `depart` e no `cancelDeparture`.
- `shared/enRouteStop.service.ts` (novo):
  - `resolveEnRouteStopId({ stops, queueView })`, que ignora os recusados;
  - `canReportArrival({ stop, enRouteStopId, hasSiblingArrived, isLegacyApi })`;
  - `canStartRouteAtStop`, que devolve o bloqueio com `blockingStopId` (spec D9), não um booleano.
- `shared/driverTripView.service.ts`: `findCurrentStop` lê a parada a caminho; sai `canStartRoute`.
- `components/DriverStopCard.component.tsx`:
  - "Iniciar rota";
  - o selo "A caminho";
  - o **botão bloqueado** com o motivo em texto (os três caminhos de saída) e o atalho para a parada
    aberta;
  - **"Cancelar rota"** na parada a caminho, com a confirmação que diz o efeito no cliente;
  - o "Cheguei" condicionado.
- `pages/DriverTripWorkspace.page.tsx`: sai o botão de viagem; entram `onDepart` e
  `onCancelDeparture`, no molde de `onArrive`, levando `tappedAt`; entra `onFocusStop(stopId)`, que rola até o cartão e põe o foco nele
  (`scrollTo` da referência + `focus()`, `web.md` §11.3), usado pelo atalho do cartão e pelo da fila.
- `pages/DriverEventQueue.page.tsx`: o rótulo com o N lido do snapshot (RF8), e o item recusado por
  `TRIP_HAS_STOP_EN_ROUTE` com o motivo e o atalho (RF8b).
- Locales pt/en:
  - entram `depart`, `enRoute.*`, `departBlocked.*` (motivo, atalho e o texto da fila) e
    `cancelDeparture.*` (botão, confirmação com o efeito no cliente, rótulo e recusa na fila);
  - saem `startRoute.start`, `startRoute.done` e `startRoute.failed`;
  - **não** nascem chaves de troca (`departSwitch.*` não existe).
- API de demonstração **versionada** em `apps/frontend-driver/scripts/driver-preview-api.ts`:
  - se a 196 T5.0 ainda não o criou, a T4.5 cria, a partir da cópia do scratchpad, e aponta o
    `.claude/launch.json` para ela;
  - acrescenta a rota `depart` e as duas chaves.

### Painel (`apps/frontend-transportada/src/modules/trip`)

`shared/trip.types.ts` (`TRIP_TIMELINE_KINDS`), `shared/tripResponse.validation.ts` (a tolerância, se
a 192 T0.2 não tiver chegado), `shared/tripTimeline.service.ts`,
`components/TripTimeline.component.tsx` e os locales `trip`.

## Contratos/API/eventos

```text
POST /me/trips/current/stops/:stopId/depart
Headers: Authorization, Idempotency-Key (≤ 200)
Body (.strict()):
  { tappedAt: ISO-8601,
    location?: { latitude, longitude, accuracyMeters?, capturedAt } | null }
201 { data: { id, changed: true } }
200 { data: { id: null, changed: false } }       (também no replay de um no-op)
400 corpo inválido | chave ausente | chave extra
401 sem token
404 TRIP_STOP_NOT_REACHABLE   (viagem fora da rua; parada de outra viagem ou motorista)
409 TRIP_FIELD_REPORT_KEY_REUSED
409 TRIP_HAS_STOP_EN_ROUTE    { enRouteStopId, enRouteStopSequence }
                              (outra parada da viagem está a caminho; nada é gravado, e a chave
                               não é liquidada — o reenvio depois de fechar a parada é aceito)

POST /me/trips/current/stops/:stopId/cancel-departure
Headers: Authorization, Idempotency-Key (≤ 200)
Body (.strict()): o mesmo do depart — { tappedAt, location? }
201 { data: { id, changed: true } }
200 { data: { id: null, changed: false } }       (parada sem "a caminho", ou toque velho; e no replay)
400 corpo inválido | chave ausente | chave extra
401 sem token
404 TRIP_STOP_NOT_REACHABLE
409 TRIP_FIELD_REPORT_KEY_REUSED
409 TRIP_STOP_DEPARTURE_NOT_CANCELLABLE  { reason: 'arrived' | 'completed' }
                              (depois do Cheguei o caminho é entregar ou "Registrar entrega
                               depois"; a chave não é liquidada, como no outro 409)

GET /me/trips/current   … stops[].enRouteSince, stops[].enRouteTappedAt: string | null (aditivos)
GET /trips/:id/timeline … kinds 'stop.departed' e 'stop.departure_cancelled',
                          stop { id, sequence }   (aditivo; emenda 158 D6 só na lista de kind)
POST /me/trips/current/start-route   inalterado, idempotente, sem consumidor na app nova
```

**ADR-0081 §7** (rota `POST` nova de `/me/trips/current/**` aceita `location`): o contrato só existe
quando a 196 T2.x chegar. A T2.1 afirma que o schema aceita `location` e acrescenta o `depart` à lista
do contrato **se** ela existir. Senão, a 196 herda a rota.

## Dados, migration e rollback

`drizzle/<ts>_stop_departure/migration.sql`, aditiva:

```sql
alter table trip_stop_events drop constraint trip_stop_events_kind_check;
alter table trip_stop_events add constraint trip_stop_events_kind_check
  check (kind in ('arrived','delivered','returned','occurrence','departed','departure_cancelled'))
  not valid;
alter table trip_stop_events validate constraint trip_stop_events_kind_check;
alter table trip_stop_events add column tapped_at timestamptz;
alter table trip_stops add column en_route_since timestamptz;
alter table trip_stops add column en_route_tapped_at timestamptz;
alter table trip_stops add constraint trip_stops_en_route_open_check
  check (en_route_since is null or (arrived_at is null and completed_at is null));
alter table trip_stops add constraint trip_stops_en_route_tapped_check
  check (en_route_tapped_at is null or en_route_since is not null);
create unique index trip_stops_one_en_route_per_trip_idx
  on trip_stops (company_id, trip_id) where en_route_since is not null;
alter table trip_field_reports add column result_changed boolean;
```

As colunas novas de `trip_stops` nascem nulas, então os CHECKs valem para todas as linhas. A T1.3
mede `trip_stops` e `trip_stop_events` em produção para confirmar o `VALIDATE` e o índice sem
`concurrently`.

`rollback.sql`, à mão, **destrutivo para o dado de trajeto** (registrado aqui e no `evidence.md`):

```sql
drop index if exists trip_stops_one_en_route_per_trip_idx;
alter table trip_stops drop constraint if exists trip_stops_en_route_tapped_check;
alter table trip_stops drop constraint if exists trip_stops_en_route_open_check;
alter table trip_stops drop column if exists en_route_tapped_at;
alter table trip_stops drop column if exists en_route_since;
delete from trip_stop_events where kind in ('departed','departure_cancelled');
alter table trip_stop_events drop column if exists tapped_at;
alter table trip_stop_events drop constraint trip_stop_events_kind_check;
alter table trip_stop_events add constraint trip_stop_events_kind_check
  check (kind in ('arrived','delivered','returned','occurrence'));
alter table trip_field_reports drop column if exists result_changed;
delete from drizzle.__drizzle_migrations where created_at = <o when do journal desta migration>;
```

- **Sobrevivem ao rollback** as linhas de `trip_field_reports` com `operation = 'stop.depart'`: elas
  não têm FK para o evento. Uma app velha nunca reusa a chave, então isso é inofensivo.
- **A asserção** `stop-departure-rollback.assertion.ts`, no molde de
  `trip-status-event-rollback.assertion.ts`, semeia um `departed` **e um `departure_cancelled`**, roda o
  rollback, prova o `DELETE` dos dois, o CHECK antigo e a linha do journal removida.

## Segurança e tenant

- **Escopo pelo vínculo:** `findStopForDriver` e `lockTripStops` filtram por `company_id` e pelo
  motorista. Parada de outra viagem ou empresa responde `404`.
- **Contratos negativos** em `test/*-schema/tenant-safety.contract.ts` para as consultas novas:
  `lockTripStops`, `readDepartureDecision`, `markStopEnRoute`, `clearStopEnRoute` e as amostras.
- **Ponto:** a coordenada do `departed` tem o mesmo leitor e o mesmo expurgo da ADR-0081 §6–§7.
- **Fase 7:**
  - o endereço nunca vai para log, payload de fila nem métrica;
  - hash com HMAC e segredo;
  - token de descadastro com HMAC;
  - webhook com Svix;
  - rotas públicas com limite por IP;
  - segredos validados no boot (`security.md` §2–§4);
  - **o `departure_event_id` na unicidade do aviso é id opaco** (o `trip_stop_events.id` do `departed`),
    não entra em e-mail nem em log, e cai com a parada pelo `on delete cascade` que a D1 já descreve;
  - **a base legal é do evento, não do provedor** (D13, D20): ligar outro canal não amplia o que se
    compartilha, e canal que exigisse dado a mais é decisão nova, com ADR própria. O `docs/SECURITY.md`
    (T7.1) diz isso com essas palavras;
  - **desligado não guarda nada**: sem linha de aviso, sem outbox, sem token de descadastro. Menos dado
    parado é menos superfície (`security.md` §1).

## Idempotência e concorrência

- **A chave de idempotência é reservada na transação,** e o desfecho (`result_id`,
  `result_changed`) é liquidado nela, inclusive no no-op. Na **recusa** (`409`) a transação aborta, e a
  reserva cai com ela.
- **Ordem das travas (ADR-0068 §2 e 192 D5):**
  1. `trip_stops` da viagem, `for no key update order by id`;
  2. `trips for no key update`, só se houver transição.

  Os escritores de nota (baixa) travam nota, depois parada, depois viagem, e a ordem parada → viagem
  é a mesma.

- **A trava não serve mais a uma troca** (Revisão 2): ela serializa a leitura de "alguma parada desta
  viagem está a caminho?". Sem ela, dois `depart` concorrentes em paradas diferentes leriam "nenhuma" e
  o perdedor bateria no índice único parcial — `500` em vez do `409` (CA4).
- **A decisão é lida depois da trava.** Não há `catch` de `23505`. O índice único é a rede de
  segurança, e uma violação vira `500` com log.
- **O caso de uso escreve numa parada só.** Não existe caminho que atualize duas linhas de
  `trip_stops`, e o contrato estático dos escritores (spec D4) continua vigiando quem grava
  `arrived_at`/`completed_at`.
- **Casos cruzados** cobertos em CA4: mesma parada em dois celulares; paradas diferentes (uma a
  caminho, a outra `409`); `depart` × baixa do escritório.

## Observabilidade

- `info` `trip.stop.departed` com `tripId`, `stopId`, `changed` e `reason` (`applied`, `already`,
  `settled`, `stale_tap`, `blocked`), sem coordenada e sem dado pessoal.
- `info` `trip.stop.departure_cancelled` com os mesmos campos e `reason` em `applied`, `not_en_route`,
  `stale_tap`, `arrived`, `completed`. Cancelamento é fato de operação, não erro: fica em `info`.
  - `blocked` é a recusa `409` e leva `blockingStopId` (id opaco). Não existe mais
    `switchedFromStopId`, porque não existe troca.
  - A recusa é **esperada** no fluxo offline: fica em `info`, não em `warn`, para não criar ruído.
- `debug` da política de amostra: descartes por motivo.

## Estratégia de testes

**Contrato antes da implementação, em toda fase.**

- **API, os dois comandos, e nenhum cobre o outro:**
  - contratos, com `bun --env-file=../../.env.test test --timeout 120000`:
    - `test/driver-trip/stop-departure.contract.ts` (rota e caso de uso com dublê, **as duas rotas:
      `depart` e `cancel-departure`**), importado em `test/driver-trip.contract.test.ts`;
    - `test/trip-application/stop-travel-sample.contract.ts` e
      `test/trip-application/departure-order.contract.ts`, importados em
      `test/trip-application.contract.test.ts`;
    - `test/trip-schema/stop-en-route-writers.contract.ts` (contrato estático dos escritores de
      `arrived_at`/`completed_at`), no entrypoint de `trip-schema`;
  - integração, com `bun --env-file=../../.env.test run test:integration`:
    - `test/integration/me-trip-departure.integration.ts` (saída **e** cancelamento) e
      `test/integration/stop-travel-samples.integration.ts`, **acrescentados à mão** à lista de
      `test:integration`;
    - mais casos em `test/integration/trip-timeline.integration.ts`.
- **Migration:**
  - `trip-constraints.assertion.ts:486-492` ganha `departed` aceito e o CHECK novo de `trip_stops`;
  - `stop-departure-rollback.assertion.ts`;
  - `schema-snapshot.contract.ts`;
  - `make migration-test`.
- **App:**
  - `test/driver-trip/en-route-stop.contract.ts` e `test/driver-trip/stop-departure.contract.ts`
    (novos, importados em `test/driver-trip.contract.test.ts`);
  - `dispatch.contract.ts:168-200` reescrito;
  - smoke `test/driver-app.smoke.spec.ts`.
- **Painel:** `test/trip/timeline.contract.ts` e `test/trip/timeline-view.contract.ts`.

## Ordem de publicação e reversão

A regra é a da ADR-0081 §9: **a API não é revertida com a app nova no ar.**

- **Subida:**
  1. painel tolerante;
  2. banco e API, com a sonda da T2.6;
  3. app.
- **Reversão:**
  1. a app volta primeiro. O `/start-route` segue aceito, e a app velha funciona com a API nova;
  2. depois a API;
  3. por último o banco. O `rollback.sql` é destrutivo e só roda antes de haver uso real ou com
     aprovação humana.
- **A app nova contra a API antiga:**
  - `depart` → `404`, e o item fica recusado e visível, sem ser descartado;
  - o snapshot sem `enRouteSince` libera o Cheguei (D17).
- **Fase 7: sobe por último e sobe sem efeito** (Revisão 5). Ela é separada não só pela dependência da
  193 T6.5 — agora também porque **pode ir a produção sem mandar um único e-mail**. A migration cria as
  colunas desligadas, o relay não encontra outbox, e o efeito aparece **depois**, quando uma
  transportadora liga o aviso e o canal no `/company-settings/recipient-notices`. Isso muda o que o deploy
  dela precisa:
  - não há janela de risco de envio indevido no deploy, então ela não exige acompanhamento de envio;
  - a **primeira** empresa a ligar é que exige atenção: é o momento da Q5, do teto medido (T7.0) e de
    conferir o subdomínio e a supressão em produção;
  - reversão sem drama: desligar a chave da empresa para o aviso, e só depois pensar em tirar código.

## Convivência e conflito de arquivos

- **Fonte:** contagem em `specs/19{2,3,5,6,7,8}-*/*.md`, `specs/20{0,3,4,5,7,9}-*/*.md` e
  `git status` desta árvore, em 2026-09-25.
- **Regra:** quem chega depois a `origin/staging` se ajusta.
- **Conferência:** a T0.1 e cada push rodam `git diff --name-only origin/staging...HEAD` e anotam no
  `evidence.md` o que já chegou.

| Arquivo                                                        | 192 | 193 | 195 | 196 | 197 | 198 | 200 | 203 | 204 | 205 / `3e3730732` | 207 | 209 |
| -------------------------------------------------------------- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :---------------: | :-: | :-: |
| api `database/trip.schema.ts`                                  |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |     |     |  ✓  |         ✓         |  ✓  |     |
| api `drizzle/` (migration; `db:generate` = no_changes)         |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |     |     |     |  ✓  |         ✓         |  ✓  |     |
| api `presentation/me-trip.routes.ts`                           |  ✓  |  ✓  |  ✓  |  ✓  |     |  ✓  |  ✓  |     |  ✓  |         ✓         |     |  ✓  |
| api `presentation/me-trip.schema.ts`                           |  ✓  |     |  ✓  |  ✓  |     |     |     |     |  ✓  |         ✓         |  ✓  |  ✓  |
| api `application/report-stop-arrival.use-case.ts`              |  ✓  |     |     |     |  ✓  |  ✓  |     |     |  ✓  |                   |  ✓  |     |
| api `application/document-outcome-steps.service.ts`            |     |     |     |     |     |     |     |     |     |         ✓         |     |     |
| api `infrastructure/drizzle-driver-field-report.repository.ts` |  ✓  |     |  ✓  |  ✓  |  ✓  |  ✓  |     |     |  ✓  |         ✓         |     |     |
| api `application/driver-field-report.port.ts`                  |     |     |     |     |     |     |     |     |  ✓  |         ✓         |     |     |
| api `infrastructure/drizzle-current-driver-trip.repository.ts` |  ✓  |     |  ✓  |     |  ✓  |  ✓  |     |     |     |                   |  ✓  |     |
| api `application/trip-timeline.types.ts`                       |  ✓  |     |     |  ✓  |     |     |     |     |     |         ✓         |     |     |
| api `infrastructure/trip-timeline-stop.query.ts`               |     |     |  ✓  |  ✓  |     |     |     |     |  ✓  |         ✓         |     |     |
| driver `components/DriverStopCard.component.tsx`               |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |     |     |  ✓  |  ✓  |         ✓         |  ✓  |  ✓  |
| driver `pages/DriverTripWorkspace.page.tsx`                    |  ✓  |  ✓  |     |  ✓  |     |  ✓  |     |  ✓  |  ✓  |         ✓         |  ✓  |  ✓  |
| driver `shared/driverTrip.types.ts`                            |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |     |     |  ✓  |         ✓         |  ✓  |  ✓  |
| driver `shared/driverTripClient.service.ts`                    |  ✓  |  ✓  |  ✓  |  ✓  |     |     |     |     |  ✓  |         ✓         |  ✓  |  ✓  |
| driver `shared/driverTripResponse.validation.ts`               |  ✓  |  ✓  |  ✓  |     |  ✓  |  ✓  |  ✓  |     |     |                   |  ✓  |     |
| driver `shared/offlineQueue.service.ts`                        |     |  ✓  |  ✓  |  ✓  |     |     |     |     |  ✓  |                   |     |  ✓  |
| driver `shared/offlineAttachments.service.ts` (só leitura)     |     |  ✓  |     |     |     |     |     |  ✓  |     |         ✓         |     |     |
| driver `shared/eventQueueView.service.ts`                      |     |     |     |     |     |     |     |     |     |         ✓         |     |  ✓  |
| driver `shared/driverTripView.service.ts` (`findCurrentStop`)  |  ✓  |     |     |     |     |     |     |     |     |         ✓         |  ✓  |     |
| driver `hooks/useDriverTrip.hook.ts`                           |  ✓  |  ✓  |  ✓  |  ✓  |     |     |     |  ✓  |  ✓  |         ✓         |  ✓  |  ✓  |
| driver locales `driverTrip*.locale.json`                       |  ✓  |  ✓  |     |     |  ✓  |  ✓  |     |  ✓  |  ✓  |         ✓         |  ✓  |     |
| driver `scripts/driver-preview-api.ts`                         |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |  ✓  |     |     |  ✓  |                   |  ✓  |     |
| painel `trip/shared/tripResponse.validation.ts`                |  ✓  |  ✓  |     |  ✓  |     |  ✓  |     |     |  ✓  |         ✓         |     |     |
| painel `trip/shared/trip.types.ts` / `trip.constant.ts`        |  ✓  |     |     |  ✓  |  ✓  |     |     |     |  ✓  |         ✓         |     |     |
| painel `trip/components/TripTimeline.component.tsx`            |  ✓  |     |     |  ✓  |     |     |     |     |  ✓  |                   |     |     |

**Decisões cruzadas, e não só conflito de texto:**

- **192.**
  - A T0.2 dela (tipo desconhecido descartado) resolve a tolerância da D12. Se chegar primeiro, a
    T0.3 daqui encolhe.
  - As duas travam `trip_stops ... order by id` antes de `trips`, na mesma ordem (192 D5).
  - A prioridade 0 da 206 não colide com o `trip.stops_reordered` da 192.
  - `findCurrentStop` é da 206 (D9).
- **193.** A T6.5 (o e-mail do destinatário) é pré-requisito da Fase 7. A fila no cabeçalho mostra o
  `depart` como qualquer item.
- **195.** A correção de endereço lê a distância do ponto das ocorrências e não lê o `departed`. O
  conflito é só de texto em `me-trip.*`, na fila e no cartão.
- **196.**
  - O `start-route` ganharia `{ location? }` (196 RF1). A app nova não o chama mais: a 196 T5.3 perde
    a metade "Iniciar rota" da app, e **o teste de 3,2 s do toque direto perde o alvo**.
  - A T0.1 daqui avisa isso na 196 (`tasks.md`) e emenda a tabela de Finalidade da ADR-0081
    ("Iniciar rota": base do tempo de trajeto **da parada**).
  - O `departed` já nasce com o carimbo pela fila.
- **197.**
  - `sameAddressStopIds` decide o Cheguei da irmã e esconde o "Iniciar rota" (D6).
  - A 197 mexe em `report-stop-arrival.use-case.ts` (deslocamento da irmã). A 206 só muda o
    `markStopArrived`.
- **198.** A amostra de trajeto usa a mesma regra de relógio e não entra no quadro.
- **200.** Só `me-trip.routes.ts` e o validador da app têm campos aditivos, e não há decisão
  cruzada.
- **203.** O attach nunca descarta a foto. A 206 não toca o attach, e o cartão e o hook têm conflito
  só de texto.
- **204.** A espera da 204 D11 mede do primeiro `arrived` até a ocorrência. O `departed` não muda
  essa conta.
- **205 e `3e3730732`.**
  - A 206 **depende** deles: a trava da entrega é o degrau 2 do fluxo.
  - A Fase 4 reescreve só o bloco de ações do cabeçalho do cartão (`DriverStopCard.component.tsx:369-385`).
  - O caso (b) da T2.2 pode revelar o defeito `completed_requires_arrived` da 205.
- **207.**
  - **É consumidora da D9:** `resolveEnRouteStopId`, `enRouteSince` e `enRouteTappedAt`, com
    `enRouteTappedAt` como âncora.
  - Não existe `resolveApproachStop`.
  - As duas mexem em `drizzle-current-driver-trip.repository.ts` e no cartão. Quem chegar depois
    encaixa o próprio campo.
- **209.** A foto da ocorrência não vira canhoto. O conflito é só de texto na fila, no cliente e no
  cartão.

## Riscos

- **R1 — App nova contra API antiga.**
  - O `depart` responde `404`, e o item fica **recusado na fila, não descartado**.
  - O Cheguei continua disponível pelo D17.
  - Mitigações: a ordem da D16 e a sonda da T2.6.
- **R2 — O motorista não toca Iniciar rota e fica sem Cheguei.**
  - O cartão diz o que fazer.
  - O "Registrar entrega depois" cobre, **mas a foto obrigatória conta como atrasada e abaixa a nota
    dele** (205 D2).
  - A revisão de design mede o texto com o usuário no preview.
- **R3 — Amostra contaminada pela drenagem junta.** Com o relógio `recorded_at` nos dois extremos, a
  amostra cai no piso de 60 s. A Q3 calibra.
- **R4 — Rollback destrutivo** (apaga os `departed`). É aceito e fica escrito, e só roda antes de uso
  real ou com aprovação humana.
- **R5 — A Fase 7 consome a cota de outros e-mails.** Mitigações:
  - **nasce desligada** (Revisão 5): sem ninguém ligar, o consumo é zero;
  - a fatia pequena, medida na T7.0;
  - `429` de cota tratado como limite, sem retry;
  - supressão de bounce;
  - subdomínio próprio.

- ~~**R6 — O motorista fica preso na parada que abriu sem querer**~~ **resolvido** pela resposta da Q4
  (Revisão 3): o "Cancelar rota" (D18) é a saída, a qualquer momento antes do Cheguei, e não passa pela
  nota do motorista.
- **R7 — O cliente recebe "estou chegando" e nunca o "não vou mais"** (Fase 7). O caso ruim é o teto
  estourar entre os dois e-mails. Mitigação escrita na D19: o aviso de "a caminho" só sai com uma vaga
  livre **por obrigação em aberto** (`sent + outstanding < cap`). A forma antiga (`sent < cap - 1`)
  reservava uma vaga só para a instalação inteira e quebrava com várias paradas a caminho ao mesmo tempo.
  Resto: supressão, opt-out e o `429` de cota tratados como na D15.
- **R9 — Motorista indeciso come a fatia do dia** (Fase 7, Revisão 4). Com a unicidade por saída, cada
  ciclo lento (esperar os 2 min, deixar o aviso sair, cancelar) custa **2 e-mails**, e nada limita as
  voltas além do teto diário. Com a proposta de 30/dia por instalação: **até 15 voltas, 30 e-mails no
  mesmo endereço, e a fatia inteira do dia consumida** — nenhuma outra parada da transportadora avisa
  ninguém até a virada. O ciclo rápido (cancelar dentro dos 2 min) custa zero. É a **Q5**: falta decidir
  um teto por parada e endereço (proposta: 3) ou por viagem. Sem resposta, vale a decisão do usuário: sem
  teto por parada. **Deixou de ser bloqueante** com a Revisão 5: desligado, o pior caso é zero e-mail, e
  a pergunta vai ao usuário **quando a primeira transportadora for ligar o aviso**.
- **R10 — A chave desligada virar código morto** (Revisão 5). Código que nunca roda apodrece: o adaptador
  poderia quebrar sem ninguém notar. Mitigação: **o caminho ligado é contrato** (CA15) — dublê da porta
  provando a chamada, o `429`, o teto e a supressão —, e `make worker-integration` confere o e-mail no
  Mailpit local com a chave ligada. Nenhum desses testes depende de produção estar ligada.
- **R11 — Preparar canal e nunca ter o segundo** (Revisão 5). Risco de abstração vazia. Mitigação: **uma**
  porta, **um** adaptador, uma constante de catálogo e uma coluna `channel`. Nenhum registro de plugins,
  nenhuma coluna para canal sem adaptador, e o `PUT` recusa ligar canal que não existe — se o segundo
  canal nunca vier, o que sobra é uma interface e um `.gateway.ts`, que seriam necessários de todo jeito
  pela code-standart §6.
- **R8 — Cancelamento virar hábito e sumir informação de operação.** O evento **fica** na linha do tempo
  (`stop.departure_cancelled`), então o escritório vê quantas vezes cada motorista desiste. Nenhuma
  penalidade nasce nesta spec — medir primeiro, decidir depois (198 D17, ADR-0070).
