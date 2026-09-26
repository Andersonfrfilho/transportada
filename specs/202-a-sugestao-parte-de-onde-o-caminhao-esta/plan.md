# Plano técnico — Spec 202

## Contexto e premissas

- O desenho está na ADR-0084. A spec depende da 192 em staging: `PUT` com `suggestionId`, a matriz de
  bloqueio e o editor de ordem.
- A T0 confere as premissas abaixo. Se alguma divergir, pare e pergunte.
  1. A leitura de pedido do worker em `drizzle-route-optimization.repository.ts` (:142-145, :190-195,
     :216-235, :488-503) está como a ADR descreve.
  2. A coordenada da última parada concluída vem de `geocoded_addresses` por `address_key`, a mesma
     fonte que a spec 199 passa a usar no snapshot. `trip_stops.latitude/longitude` nunca é gravada.
  3. O formato dos catálogos de job é `{ failureOutcomes, job, minimumIntervalSeconds }`, e existem
     quatro cópias.
  4. O molde da rotina é `worker-transportada/src/trip-cargo-layout-purge/*`, registrado em
     `worker/src/main.ts:1207-1213`.

## Arquitetura e arquivos afetados

**API**

- `trips/presentation/me-trip.routes.ts` + `me-trip.schema.ts`: as duas rotas, com `rateLimit`.
- `trips/application/request-stop-order-suggestion.use-case.ts` e
  `read-stop-order-suggestion.use-case.ts`, sobre a porta de `routing/application/route-suggestion.port.ts`.
- `routing/infrastructure/drizzle-route-suggestion.repository.ts`: grava `requested_via`,
  `requested_by_user_id`, `origin_*` e `origin_kind`.
- `shared/job-catalog.constant.ts`.

**Worker**

- `routing/infrastructure/drizzle-route-optimization.repository.ts`: recorte das paradas não
  concluídas, `origin` separado de `depot` e `departureEpochSeconds` = agora para `driver_app`.
- `routing/domain/depot-origin.policy.ts`: resolução da origem.
- `routing/application/route-optimization-handler.service.ts`: zera a coordenada na transação do
  resultado.
- `stop-order-suggestion-expire/` (novo, no molde de `trip-cargo-layout-purge`).
- `observability/sentry.service.ts`: `beforeBreadcrumb`.
- `routing/infrastructure/osrm-routing-matrix.gateway.ts`: log só do host.
- Schema local e `shared/job-catalog.constant.ts`.

**Cron e painel:** a constante do catálogo (paridade).

**App do motorista**

- `components/DriverStopOrderSuggestionSheet.component.tsx`.
- `hooks/useDriverStopOrderSuggestion.hook.ts` (consulta a cada 1 s, até 30 s).
- O botão no `DriverStopOrderEditor` da 192.
- Cliente e locales.

## Contratos/API/eventos

```
POST /me/trips/current/stop-order-suggestions        trip.report · Idempotency-Key · rateLimit
  body  { stopIds: uuid[2..200], origin: {latitude,longitude} | null } .strict()
  202   { data: { suggestionId } }
  404 · 409 STATE_TRANSITION_NOT_ALLOWED · 422 TRIP_STOP_SET_MISMATCH
  409 STOP_ORDER_SUGGESTION_IN_PROGRESS

GET /me/trips/current/stop-order-suggestions/:suggestionId       trip.report
  200   { data: { status, originKind, stopIds?, distanceMeters?, previousDistanceMeters?,
                  blockedStops?: [{ stopId, blockingStopIds, boxCount }] } }
```

A rota POST entra na lista de exceções do inventário de carimbo da 196 (motivo: "a posição é
`origin`, com finalidade própria — ADR-0084").

## Dados, migration e rollback

Migration aditiva `<ts>_stop_order_suggestion_origin`, com `rollback.sql` e `make migration-test`.

- **`route_suggestions`:**
  - `requested_via varchar(16) not null default 'office'`, com CHECK `office|driver_app`;
  - `requested_by_user_id uuid null`;
  - `origin_kind varchar(16) null`, com CHECK;
  - `origin_latitude numeric(9,4) null`, `origin_longitude numeric(9,4) null`, com CHECK de nulidade
    conjunta;
  - índice único parcial `(company_id, trip_id) WHERE requested_via='driver_app' AND status IN
('queued','running')`.
- **`trip_stop_order_events.origin_kind`:** entra aqui, se a 192 não a criou, com CHECK
  `driver_position|last_stop|depot`.

## Segurança e tenant

- Posse pela parada, igual à 192.
- A sugestão só é lida pelo usuário que a pediu, na viagem dele.
- A coordenada segue o `security.md` §1 e §6 e a LGPD art. 6º III.
- Entrada em `docs/SECURITY.md`: finalidade, retenção e a rotina que zera.

## Idempotência e concorrência

- O POST usa o ledger `trip_field_reports` com a operação `stop_order_suggestion`.
- Uma sugestão em voo por viagem, pelo índice parcial. A corrida de dois POSTs vira `409`.
- O zerar da coordenada é idempotente.

## Observabilidade

- `info`: pedido e desfecho (`suggestionId`, `originKind`, duração).
- `warn`: expiração pela rotina.
- Nunca coordenada.

## Estratégia de testes

- **Contrato:** rotas; `beforeBreadcrumb`; log do gateway; paridade dos catálogos.
- **Worker (`make worker-integration`):** CA01–CA04, com a contagem de executados.
- **Integração da API:** CA05 e CA09.
- **App:** CA08.
- **Preview:** CA10.

## Riscos

- Sugestão boa na estrada e ruim na carga. Mitigação: os bloqueios chegam junto, e o salvamento passa
  pelo aviso da 192.
- `beforeBreadcrumb` mal escrito pode apagar breadcrumbs úteis. Mitigação: o contrato cobre só o
  caminho do OSRM.
- Fila do worker cheia: a app desiste aos 30 s, a rotina expira aos 2 min, e o motorista ainda pode
  arrastar à mão.
