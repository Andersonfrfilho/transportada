# Plano técnico — Spec 192

## Contexto e premissas

- Decisão do usuário (2026-09-25). O desenho está na **ADR-0077**, revisada depois da crítica.
- Specs irmãs: 200 (mapa), 201 (painel) e 202 (sugestão, ADR-0084). As interseções com 193, 195, 196,
  197, 198 e 199 estão em `spec.md` § "Interseções".
- A T0.1 confere as premissas antes de qualquer código. Se alguma divergir, **pare e pergunte**.
  1. Todas as portas de despacho passam por `dispatch()` em `drizzle-trip-route.repository.ts`
     (:456-541, com `releaseUnloadedDocuments` em :471 e `shiftEstimatedArrivals` em :516).
  2. `withFieldReport` (`trip-field-report.port.ts:33-84`) reserva a chave na transação do chamador e
     exige `recall(resultId)`.
  3. O worker tem schema Drizzle próprio para `trip_stops`, `trip_cargo_layouts` e as tabelas novas
     (nenhuma app importa código de outra).
  4. O estado da 196 em `origin/staging`: `TRIP_LOCATION_STAMPED_TABLES`, `locationSchema` e
     `trip.location.purge`.
  5. O estado do validador do painel: há mudança **não commitada** da spec 179 T304 em
     `tripResponse.validation.ts`, `trip.types.ts` e `trip.constant.ts` (`isFieldOccurrenceType` passou
     a `hasKeys`). Rebase antes da T0.2.
- Fatos conferidos que o plano usa:
  - o deslocamento de ETA por âncora mora no **despacho**, não no "Iniciar rota"
    (`drizzle-trip-route.repository.ts:516`, :717-751);
  - o aceite de sugestão de viagem única **não grava ETA** (só o compositor multi-veículo,
    `main.ts:2674`);
  - `trip_stops.distance_from_previous_*` nunca é gravada;
  - o DAMDFE não mostra parada.

## Arquitetura e arquivos afetados

### API (`apps/api-transportada`)

**Domínio 🧠**

- `src/trips/domain/unload-blocking.policy.ts` (novo). Funções puras:
  - `buildCoverMatrix({ boxes, loadingAccess, sideReachableStopIds })` → pares
    `{ coveredKey, coveringKey, boxCount }`, com a chave = `documentId` ou `stop:<id>`;
  - `resolveBlockedStops({ matrix, documentState, stopOrder })` → por parada, `blockingStopIds` e
    `boxCount`;
  - `resolveAddedBlockedStops({ current, next })`.
  - Usa `EDGE_TOLERANCE_M` de `@adatechnology/cargo-placement`.
  - Tipos em `domain/types/unload-blocking.types.ts`.
- `src/trips/domain/stop-order.policy.ts` (novo):
  - `composeFieldStopOrder` (D4);
  - `checkFieldStopOrderAllowed` (`TRIP_ON_ROAD_STATUSES`);
  - `isSameStopOrder`.
- `src/trips/domain/trip.error.ts` + `src/shared/errors/codes.ts`:
  - `StopOrderVersionConflictError`;
  - `StopOrderBlocksCargoError` (contexto tipado `blockedStops`);
  - `StopOrderConcurrentUpdateError`.

**Aplicação**

- `reorder-field-stops.use-case.ts` (novo, 🧠), fase 1. Sem try/catch, salvo a repetição por
  `40P01`/`40001`, que é _retry_ com limite (`code-standart` §7).
- `complete-stop-order-outcome.service.ts` (novo, 🧠), fase 2 com compare-and-set.
- `reorder-trip-stops.use-case.ts`: trava nova, `expectedStopOrderVersion?`, evento `backoffice`. O
  `catch {}` sai, e a fase 2 é a mesma do motorista.
- `freeze-trip-planned-route.use-case.ts`:
  - modo `keepPreviousOnUnavailable`, que devolve `routeFrozen: false` sem escrever;
  - `routeChoice` vindo de `planned_route.criterion`;
  - `choiceReproduced`.
- `pin-loaded-cargo-layout.service.ts` (novo): cópia, mapa, filtro de notas liberadas e a matriz.
- `recompute-pending-etas.service.ts` (novo): pernas mais `routing/domain/service-time.policy.ts`,
  âncora em agora.
- `trip-timeline.types.ts`: `trip.stops_reordered`, `stopOrder` em `TripTimelineItem`.
- `routing/infrastructure/trip-stop-order.adapter.ts`: o ator passa pelo `createTripStopOrderWriter`
  (`source = route_suggestion`).
- `drizzle-redelivery-application.repository.ts`: evento com `source = redelivery`.

**Infraestrutura**

- `drizzle-trip-route.repository.ts`:
  - `writeStopOrder` sobe a versão;
  - a trava `trip_stops FOR UPDATE ORDER BY id` → `trips FOR NO KEY UPDATE` sai de uma função única
    (`lockTripForStopOrder`), usada pelo escritório, pelo motorista e pela reentrega (hoje ela trava
    `trips` primeiro: `drizzle-redelivery-application.repository.ts:95-116`);
  - `dispatch()` chama a fixação depois de `releaseUnloadedDocuments`.
- `drizzle-trip-planned-route.repository.ts`: escrita com compare-and-set
  (`where stop_order_version = $v`) e dentro da transação recebida, não `this.database`.
- `readTripDetail` (`drizzle-trip.repository.ts:942`, leitura em :1251-1259) e
  `eager-cargo-layout-request.support.ts`: viagem despachada com cópia lê a cópia e não enfileira.
- Novos:
  - `drizzle-loaded-cargo-layout.repository.ts`;
  - `drizzle-stop-order-event.repository.ts`;
  - `trip-timeline-stop-order.query.ts` (oitava consulta de `trip-timeline.query.ts:69-100`).
- `drizzle-current-driver-trip.repository.ts` e `find-current-driver-trip.use-case.ts`: RF8.

**Apresentação**

- `me-trip.routes.ts` + `me-trip.schema.ts`: `PUT /stop-order`, reusando o `locationSchema`
  (`me-trip.schema.ts:25-33`), quando a 196 estiver em staging.
- `trip.routes.ts` + `trip-request.schema.ts`: `expectedStopOrderVersion?` e `stopOrderVersion` no
  detalhe.
- `main.ts`: composição. O canal é `driver_app` na rota `/me` e `backoffice` no painel.

### Worker (`apps/worker-transportada`)

- O `trip-cargo-layout` do worker, ao marcar a planta `ready`, fixa a cópia se a viagem estiver
  despachada, ainda sem cópia, e o hash for o do despacho. A fixação usa a mesma regra da API, copiada
  por valor com o cabeçalho e um contrato de paridade.
- Schema local espelhando as tabelas e as colunas novas.

### Painel (`apps/frontend-transportada`)

- **T0.2:**
  - `trip.constant.ts:300` (`TRIP_DETAIL_OPTIONAL_KEYS` + `stopOrderVersion`);
  - `tripResponse.validation.ts:1276-1277` (item exige as obrigatórias e ignora as extras);
  - :898-906 e :1285 (descarta tipo desconhecido).
- **T4.1:**
  - `trip.types.ts:257-267`;
  - `tripTimeline.service.ts:99-150`;
  - locales `trip`;
  - `TripTimeline.component.tsx`;
  - selo "marcas da ordem do carregamento" no painel de carga (RF12).

### App do motorista (`apps/frontend-driver`)

- `package.json`: `@dnd-kit/core` `^6.3.1`, `@dnd-kit/sortable` `^10.0.0` e `@dnd-kit/utilities`
  `^3.2.2`, as mesmas versões do painel.
- Novos:
  - `components/DriverStopOrderEditor.component.tsx`;
  - `components/DriverCargoBlockingDialog.component.tsx`;
  - `hooks/useDriverStopOrder.hook.ts`;
  - `shared/driverStopOrder.service.ts` (puro).
- Alterados:
  - `driverTripClient.service.ts` (`PUT`);
  - `driverTripResponse.validation.ts` e `driverTrip.types.ts` (campos opcionais, 078 D2);
  - `captureRegistry.service.ts:11-15` (`'stop-order'`);
  - `DriverStopCard.component.tsx` (só o selo);
  - `DriverTripWorkspace.page.tsx` (botão acima da lista, :543);
  - locales.

## Contratos/API/eventos

```
PUT /me/trips/current/stop-order                        trip.report · Idempotency-Key
  body  { stopIds: uuid[2..200], expectedStopOrderVersion: int>=0,
          acknowledgedBlockedStopIds?: uuid[], location?: LocationStamp|null }  .strict()
  200   { data: { tripId, stopOrderVersion, routeOutcome: recomputed|kept_previous|superseded,
                  stops: [{ id, sequence, estimatedArrivalAt|null,
                            cargoBlockedBy: { fromOrderChange: uuid[], fromLoading: uuid[] } }] } }
  400 formato · 404 TRIP_NOT_FOUND · 409 STATE_TRANSITION_NOT_ALLOWED · 422 TRIP_STOP_SET_MISMATCH
  409 STOP_ORDER_VERSION_CONFLICT { currentVersion } · 409 STOP_ORDER_CONCURRENT_UPDATE
  409 STOP_ORDER_BLOCKS_CARGO { blockedStops: [{ stopId, blockingStopIds, boxCount }] }
  409 TRIP_FIELD_REPORT_KEY_REUSED

PATCH /trips/:id/stops/order        trip.manage · body { stopIds, expectedStopOrderVersion? }
  resposta inalterada ({ tripStatus }, validada por reorderTripStopsResultFromApi, tolerante)
```

- **Ordem das checagens:** posse → estado → conjunto → mesma ordem (`200` sem efeito) → versão →
  bloqueio. O `recall` devolve o estado atual.
- **`GET /me/trips/current`:**
  - por viagem, `stopOrderVersion`, `canReorderStops` e `hasLoadedCargoPlan`;
  - por parada, `cargoBlockedBy`.
- **`GET /trips/:id`:** `stopOrderVersion`.
- **Item da linha do tempo:** todas as chaves comuns, mais
  `stopOrder: { previous, next, source, acknowledgedBlockedStops, outcome: { status, plannedDistanceMeters: {previous,next}, plannedToll: {previous,next}, choiceReproduced } } | null`.
  É `null` nos outros tipos.

**Ordem de deploy:**

1. T0.2 (painel tolerante).
2. API (Fases 1–2).
3. App (Fase 3, depois do preview).
4. T4.1 (painel, depois do preview).

## Dados, migration e rollback

Uma migration aditiva, `apps/api-transportada/drizzle/<ts>_driver_stop_order/`, com `rollback.sql`,
`make migration-test` e `db:generate` = `no_changes`. VARCHAR + CHECK, sem ENUM nativo. Antes do
push, conferir o timestamp contra as migrations da 193, 195 e 196 em `origin/staging`.

**`trips.stop_order_version integer not null default 0`.**

**`trip_stop_order_events`**

- Colunas:
  - `id`, `company_id`, `trip_id` (FK composta, `restrict`);
  - `actor_user_id not null`;
  - `channel varchar(16)`, com CHECK `driver_app|backoffice`;
  - `source varchar(24)`, com CHECK `manual|order_suggestion|route_suggestion|redelivery`;
  - `suggestion_id uuid null`;
  - `previous_stop_ids jsonb`, `next_stop_ids jsonb`;
  - `acknowledged_blocked_stop_ids jsonb default '[]'`;
  - `stop_order_version int`, `occurred_at`.
- Carimbo da ADR-0081:
  - `latitude numeric(10,7)`, `longitude numeric(10,7)`, `accuracy_meters numeric(10,2)`,
    `captured_at timestamptz`, `location_state varchar(16)`;
  - os sete CHECKs, entre eles `latitude IS NULL OR channel = 'driver_app'`;
  - índice parcial `WHERE latitude IS NOT NULL`.
- Índice `(company_id, trip_id, occurred_at)`.
- Trigger append-only no molde de `trip_dispatch_snapshots`
  (`drizzle/20260824204913_trip_dispatch_snapshots/migration.sql`). Ele recusa `DELETE` e todo
  `UPDATE`, **exceto** o do expurgo: as quatro colunas de posição para `NULL` e `location_state`
  `captured → expired`, com todo o resto igual.

**`trip_stop_order_outcomes`** (append-only)

- `event_id` (FK, unique);
- `status varchar(16)`, com CHECK `recomputed|kept_previous|superseded`;
- `previous_distance_meters`, `next_distance_meters`, `previous_toll numeric(12,2)`,
  `next_toll numeric(12,2)`;
- `criterion varchar(16)`, `choice_reproduced boolean`;
- `recorded_at`.

**`trip_loaded_cargo_layouts`** (append-only, uma linha por viagem)

- `company_id`, `trip_id` (unique);
- `source_layout_id uuid` **sem FK**;
- `input_hash`;
- `layout jsonb` (a cópia);
- `stop_id_by_sequence jsonb`;
- `cover_matrix jsonb`;
- `pinned_by varchar(16)`, com CHECK `dispatch|worker|first_reorder`;
- `pinned_at`.

**Ledger.** `trip_field_reports.operation` é `text` (`trip.schema.ts:1290`, :1338). `stop_order`
entra só na constante, sem migration.

**Rollback.** O `rollback.sql` derruba as três tabelas, os triggers e a coluna. O rastro novo se perde
no rollback; a ordem em `trip_stops` fica. Não há backfill.

## Segurança e tenant

- O `companyId` vem do contexto. A viagem sai das paradas filtradas por empresa **e** por vínculo do
  motorista.
- Contratos negativos: outra empresa, outro motorista, parada de viagem não vinculada.
- Nenhuma permissão nova.
- O carimbo segue a ADR-0081: só `driver_app` tem ponto, e o expurgo é o `trip.location.purge` da 196.
- Os logs levam só ids e contagens.

## Idempotência e concorrência

- O `PUT` usa o ledger com a operação `stop_order`. O `result_id` é o id do evento (ou da viagem, no
  caso sem efeito). O `recall` lê o estado atual.
- A confirmação do aviso usa chave nova.
- **Trava única:** `lockTripForStopOrder` trava `trip_stops FOR UPDATE ORDER BY id` e depois
  `trips FOR NO KEY UPDATE`. É a mesma ordem da chegada, da entrega e do despacho.
- `40P01`/`40001` repete até 2 vezes; depois devolve `409 STOP_ORDER_CONCURRENT_UPDATE`.
- **Fase 2** roda fora da trava. Cada escrita (rota, ETA, pernas) é
  `UPDATE ... WHERE stop_order_version = $v`. Se zero linhas forem afetadas, o desfecho é
  `superseded`.
- `writeStopOrder` é o único lugar que sobe a versão.

## Observabilidade

- `info`:
  - reordenação: `tripId`, versão, `channel`, `source` e contagem de bloqueios confirmados;
  - fixação: `pinned_by`;
  - desfecho: `status`.
- `warn`:
  - `kept_previous`;
  - repetição por `40P01`.
- Nunca coordenada, rótulo ou cliente.

## Estratégia de testes

**Domínio (contrato, sem banco)**

- Matriz e bloqueio, com fixtures pequenas **e** uma caixa real `needsRehandling`/
  `overEarlierDelivery` do fixture `real-mixed-cargo` (120 e 148 D5).
- Aceite numérico da T1.2 (ver tasks).
- `composeFieldStopOrder`, `isSameStopOrder`.

**Integração (Postgres)**, pelo **segundo** comando (`test:integration` com `--env-file`):

- CA01–CA16;
- CA06: chegada concorrente, com duas conexões;
- CA14: fase 2 superada;
- CA11: despacho forçado.

**Worker:** `make worker-integration`, com a contagem de testes executados (não pulados) no
`evidence.md`.

**Painel:** CA18 (validador) e CA19 (título e detalhe).

**App (contrato sem DOM + smoke Playwright):** CA20–CA22.

**Medição:** CA17 (p95), anotado no `evidence.md`.

**Prints:** 375 e 768 no preview local (T5.1).

## Riscos

- **Aviso impreciso.** A regra da 114 D4 não é a simulação da 118, e a carga real pode diferir da
  planta. É aviso, não trava, e o texto diz "conforme a planta do carregamento".
- **Pré-existentes aos montes.** Uma Atego tem centenas de pares `needsRehandling` (120 evidence:
  421). Mitigação: `fromLoading` × `fromOrderChange`; o selo só mostra o segundo.
- **Deadlock residual.** `shiftPendingStops` da chegada atualiza várias paradas sem ordem definida.
  Mitigação: repetição limitada e CA06. Se aparecer em produção, ordenar também aquele `UPDATE`.
- **Planta de viagem antiga** fixada na primeira reordenação pode não ser a do carregamento
  (`pinned_by` mostra).
- **Papel impresso.** O romaneio e a planta impressos mostram a sequência de quando saíram.
- **Viagem interestadual.** A última descarga pode divergir da `UFFim` do MDF-e já autorizado. Não há
  regra fiscal nova.
- **Arquivos disputados** com 193, 195, 196 e 198 (`DriverStopCard`, `useDriverTrip`, snapshot,
  validador do painel). Mitigação: componente novo, rebase antes de cada task, e a tolerância da T0.2
  primeiro.
- **Bundle:** `@dnd-kit` soma ~50 KB ao precache (teto de 1,5 MiB).
