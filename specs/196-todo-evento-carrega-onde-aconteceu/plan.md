# Plano técnico — Feature 196

## Contexto e premissas

- A regra de hoje está na ADR-0045 §3 e aparece em três lugares: `trip_stop_events` (chegada,
  entrega, devolução), `trip_delivery_proofs` (foto do canhoto, ADR-0070) e o expurgo do worker
  (`apps/worker-transportada/src/trip-location-purge/`). Esta spec **estende** a regra a todo toque
  do motorista; não inventa uma segunda.
- `locationSchema` (`api-transportada/src/trips/presentation/me-trip.schema.ts:25-33`) e
  `toReportedLocation` são reaproveitados: inteiro ou nada, `.strict()`, precisão como texto decimal
  para a coluna `numeric`. `toReportedLocation` passa a reduzir a precisão ao teto da coluna (RF3).
- Na app, `readCurrentLocation` (`frontend-driver/.../shared/driverLocation.service.ts`, 8 s,
  `maximumAge: 0`), `reportWithLocation` (`useDriverTrip.hook.ts:415-437`) e `applyReportLocation`
  (`offlineQueue.service.ts:209-219`) já fazem "grava primeiro, completa depois" para chegada,
  entrega e devolução.
- A linha do tempo (`GET /trips/:id/timeline`) junta seis fontes com cursor
  `(occurred_at µs, prioridade, id)`; tipos em `trips/application/trip-timeline.types.ts`, consultas em
  `trips/infrastructure/trip-timeline.query.ts`, `trip-timeline-status.query.ts`,
  `trip-timeline-stop.query.ts` e `trip-timeline-document.query.ts`.
- `trip_status_events` tem um escritor de transição só, `recordTripStatusChange`
  (`trip-status-event.persistence.ts`), chamado de cerca de dez lugares; o despacho do motorista passa
  por `dispatchTrip` (o mesmo do escritório, do operador pelo WhatsApp e do gatilho automático,
  `main.ts:3036-3048`), e "Iniciar rota"/"Conferir carga" por `startFieldTrip` →
  `repository.updateStatus`.
- A autorização da rota é por **permissão** (`context.scope.permissions`), nunca por papel. O
  recorte por permissão numa leitura já existe: `canReadDriverContact` (`trip.routes.ts:1137`),
  provado por `test/trip-http/driver-redaction.contract.ts`.

## Ordem de deploy

A app nova contra a API antiga perde evento: os schemas `.strict()` (`me-trip.schema.ts:42-55`,
`occurrence.schema.ts:37`) respondem `400` ao corpo com `location`, e a fila tira o item recusado
(`offlineQueue.service.ts:165-167,186`). O `start-route` antigo nem lê o corpo
(`me-trip.routes.ts:319`). O painel antigo, por sua vez, recusa item da linha do tempo com chave nova
(`tripResponse.validation.ts`, `hasExactKeys`). Por isso, três pushes para `staging`, cada um com os
gates, e verificação entre eles:

1. **Painel tolerante** (T4.0): o validador aceita `location`/`locationState` como **opcionais**. Não
   muda tela. Se a T0.2 da 192 (ignorar `kind` desconhecido) ainda não estiver em `origin/staging`,
   as duas mudanças do mesmo validador saem juntas, sem reimplementar uma sobre a outra.
2. **Banco, worker e API** (Fases 1–4). Depois do deploy, antes de qualquer app:
   - conferir que a migration aplicou (o pre-deploy reprova migration pendente) e que o ciclo do
     expurgo rodou sem `42703` nos logs do worker;
   - **a sonda**, sem efeito colateral: `POST /me/trips/current/dispatch` com
     `{ tripId: <uuid inexistente>, location: {...} }` e um token de motorista de teste. A API antiga
     responde `400` (a chave `location` é desconhecida); a nova passa do parse e responde
     `404`/`409`/`422`. Idem em `POST .../stops/<uuid>/occurrences`. Registrar as duas respostas em
     `evidence.md`.
3. **App do motorista e tela do painel** (Fases 5–6), só depois da sonda e do ok do usuário nos prints.
   Numa task final (T6.4), o validador do painel passa a **exigir** as duas chaves.

**Rollback:** com a app nova no ar, **a API não volta** para antes desta spec — o `400` derrubaria da
fila as ocorrências, despachos e saídas com ponto. Reverte-se a app primeiro (a versão antiga monta o
corpo campo a campo e não manda `location`; os itens que ficaram no IndexedDB saem sem ele), e só
depois a API. O `rollback.sql` da migration só roda com a API já revertida.

**Worker antes da migration:** o Railway sobe os serviços do mesmo push em paralelo, e o worker pode
rodar o expurgo antes de o pre-deploy da API aplicar a migration — a consulta às colunas novas dá
`42703`. A T2.2 confirma que a rotina captura o erro **por tabela** e segue para o próximo ciclo sem
derrubar o processo; o log diz qual tabela falhou. Se não capturar, o worker sai num push seguinte ao
da API.

## Arquitetura e arquivos afetados

### Banco (API + cópia no worker)

- `apps/api-transportada/src/database/trip.schema.ts`:
  - `trip_status_events`, `trip_stop_occurrences`, `trip_document_occurrences`: `latitude`,
    `longitude` (`numeric(10,7)`), `accuracy_meters` (`numeric(10,2)`), `captured_at`
    (`timestamptz`), `location_state` (`varchar(16)`), todas anuláveis, sem default;
  - `trip_stop_events`: só `location_state`;
  - helpers `buildEventLocationColumns()` e `buildEventLocationChecks(table, prefix)` em
    `database/event-location.schema.ts`, para as três tabelas novas não repetirem o bloco;
  - `EVENT_LOCATION_STATES = ['captured', 'unavailable', 'expired'] as const`.
- `drizzle/<timestamp>_event_location_stamp/{migration.sql,rollback.sql,snapshot.json}`.
- `apps/worker-transportada/src/database/trip-execution.schema.ts` (cópia por valor): hoje tem
  `tripStopEvents`, `tripDeliveryProofs` e `tripLocationPings`. Passa a **declarar** as três tabelas
  novas, só com as colunas que o expurgo usa (`id`, a coluna de tempo, as quatro de posição e
  `location_state`), e `location_state` em `tripStopEvents`.

### API — escrita

- `trips/domain/event-location-stamp.policy.ts` (novo, puro):
  `resolveEventLocationStamp({ channel, location, isDriverTap }): EventLocationStampColumns`:
  - `driver_app` + toque → `captured` com as quatro colunas, ou `unavailable`;
  - `whatsapp` + toque do motorista → `unavailable`;
  - o resto (escritório, backoffice, operador pelo WhatsApp, derivado) → tudo `null`.

  Tipos em `trips/domain/event-location-stamp.types.ts`.

- `trips/presentation/me-trip.schema.ts`: `parseDispatchCurrentTripRequest` devolve
  `{ tripId, location }`; `parseFieldTripStepRequest` (novo) lê corpo **opcional** `{ location? }`
  com `parseOptionalBody`; o schema da ocorrência da parada ganha `location`; `toReportedLocation`
  reduz `accuracyMeters` ao teto (`EVENT_LOCATION_ACCURACY_MAX_METERS = 99_999_999.99`, o teto de
  `numeric(10,2)`).
- `trips/presentation/occurrence.schema.ts`: `parseRegisterOccurrenceRequest` (usada **só** pela rota
  do motorista — conferido: `parseRegisterOccurrenceMultipartRequest` é a do escritório) ganha
  `location`.
- `trips/presentation/me-trip.routes.ts`: `dispatch`, `confirm-load`/`start-route` (o `parse` deixa de
  ser `() => undefined`), `stops/:stopId/occurrences` e `documents/:documentId/occurrences` passam
  `location` adiante.
- Casos de uso e repositórios: `dispatchDriverTrip` → `dispatchTrip` (parâmetro opcional
  `locationStamp`), `startFieldTrip` → `updateStatus` (idem), `reportStopOccurrence` →
  `drizzle-driver-field-report.repository.ts:791`, `registerDriverOccurrence` →
  `delivery-proof-read.support.ts:341`, e `reportArrival`/`reportDelivery`/`reportReturn` →
  `drizzle-driver-field-report.repository.ts:572` (só o `location_state` novo).
- `trip-status-event.persistence.ts` / `trip-status-event.types.ts`: `RecordTripStatusChangeParams`
  ganha `locationStamp?: EventLocationStampColumns`; ausente grava tudo `null` (D4).
- WhatsApp: só as três ações de `driverWhatsAppFlowActions` (`main.ts:833-873` —
  `registerOccurrence`, `reportDelivery`, `reportReturn`) passam `isDriverTap: true` com canal
  `whatsapp` e gravam `unavailable`. `operatorWhatsAppFlowActions` (`main.ts:886,951,990` —
  `dispatchTrip` e a ocorrência de separação) não muda e grava `null`.
- `identity/domain/authorization.policy.ts`: permissão nova `trip.event-location` em
  `company-admin`, `operator`, `fiscal` e `viewer` (os papéis com `fleet.read`, menos `separator`). O
  catálogo de permissões e os contratos que o enumeram (`finance-read.contract.ts`,
  `separator-role.contract.test.ts` e o que listar permissões por papel) são atualizados, não
  contornados. Conferir se o realm (`realm/`) carrega lista de permissões; se carregar, a permissão
  entra lá também.

### API — leitura

- `trip-timeline.types.ts`: `TripTimelineItem` ganha `location: TripTimelineLocation | null` e
  `locationState: EventLocationState | null`.
- `trip-timeline-status.query.ts`, `trip-timeline-stop.query.ts`, `trip-timeline-document.query.ts`:
  selecionam as colunas das quatro fontes com ponto (`trip_status_events`, `trip_stop_events`,
  `trip_stop_occurrences`, `trip_document_occurrences`); as outras fontes devolvem `null`/`null`. A
  conversão `numeric` → texto decimal e da precisão para número fica nos **mappers**, não na
  consulta.
- A rota da linha do tempo (`trip.routes.ts`) passa
  `canReadEventLocation: context.scope.permissions.has('trip.event-location')` ao caso de uso, que
  zera `location` sem a permissão e mantém `locationState` — o molde de `canReadDriverContact`.
- **Leitores permitidos (RF12)**: `trips/application/event-location-readers.constant.ts` lista os
  módulos que podem selecionar as colunas (as três consultas da linha do tempo e os da 195:
  detalhe da sugestão e feed, este só `location_state`). Um contrato estático varre `src/` por
  referência a `<tabela>.latitude|longitude|accuracyMeters|capturedAt|locationState` das cinco
  tabelas e reprova arquivo fora da lista (o worker tem a sua própria lista, a do D8; os escritores
  da Fase 3 entram na lista como escritores).
- Auditoria de leitura antes da migration: os leitores das tabelas tocadas —
  `contractor-occurrence.query.ts`, `trip-occurrence-feed.query.ts`,
  `drizzle-occurrence-case.repository.ts`, `occurrence-case-marker.query.ts`,
  `drizzle-occurrence-statement.repository.ts`, `drizzle-occurrence-settlement*.repository.ts`,
  `drizzle-redelivery-*.repository.ts`, `drizzle-office-occurrence-batch.repository.ts`,
  `drizzle-occurrence-attachment.repository.ts`, `dispatch-readiness.query.ts` — são conferidos contra
  `select()` sem projeção e contra spread da linha na resposta.

### Worker — expurgo

- `trip-location-purge/domain/trip-location-purge.constant.ts`: `TRIP_LOCATION_STAMPED_TABLES`
  (as cinco, com a coluna de tempo de cada uma: `created_at`, ou `recorded_at` em
  `trip_status_events`) e `TRIP_LOCATION_UNSTAMPED_TABLES` (as exclusões do D8, com o motivo).
- `trip-location-purge/application/trip-location.port.ts` e
  `infrastructure/drizzle-trip-location.repository.ts`: um redator por tabela nova, no molde de
  `createDrizzleRedactTripLocations` — `id` em lote pelo índice parcial, zera as quatro colunas e marca
  `location_state = 'expired'`; o de `trip_stop_events` passa a marcar `expired` também.
- `trip-location-purge.routine.ts` (hoje o teto é global, `:61,129`): teto de lotes **por tabela**
  (`TRIP_LOCATION_PURGE_MAX_BATCHES` por tabela), `exhausted` por tabela, erro de uma tabela não
  impede as outras, e o log traz `redactedByTable` e `exhaustedTables`.

### App do motorista (`apps/frontend-driver`)

- `shared/driverTrip.types.ts`: `location: DriverReportedLocation | null` nos itens `occurrence` e
  `documentOccurrence`.
- `shared/offlineQueue.service.ts`: `applyReportLocation` perde a exceção da ocorrência (o comentário
  junto); `withLegacyLocation(report)` devolve `location: null` para item antigo sem o campo (RF7).
- `shared/driverLocation.service.ts`: `readCurrentLocation` continua como está (fila);
  `readDirectTapLocation({ now?, timer? })` faz uma leitura com
  `{ enableHighAccuracy: false, maximumAge: DIRECT_TAP_POSITION_MAX_AGE_MS }` (300 000) em
  `Promise.race` com `setTimeout(DIRECT_TAP_POSITION_BUDGET_MS)` (3 000) da própria app, e resolve
  `null` no que vencer primeiro. A precisão é reduzida ao teto (a mesma função de
  `clampProofAccuracyMeters`, generalizada).
- `shared/driverTripClient.service.ts`: `reportBody('occurrence')` e `sendDocumentOccurrence` levam
  `location`; `dispatchTrip({ tripId, location })` e `startRoute({ location })` mandam corpo;
  `registerDocumentOccurrence` sai do cliente (D5).
- `hooks/useDriverTrip.hook.ts`: a ocorrência da parada e a ocorrência de nota direta passam por
  `reportWithLocation`; o "Não entreguei" completa a posição nas **duas** chaves.
- `pages/DriverTripWorkspace.page.tsx`: `onDocumentOccurrence` enfileira (`documentOccurrence` sem
  foto, `note: ''`) em vez do `POST` direto; `dispatchTrip`/`startRoute` chamam
  `readDirectTapLocation()` antes do `POST`.
- Nenhuma mudança visual na app: o toque continua igual, e a tela `/fila` é da spec 193.
- API de demonstração do preview: hoje fora do repositório
  (`/private/tmp/claude-502/.../scratchpad/driver-preview-api.ts`). A T5.0 a versiona em
  `apps/frontend-driver/scripts/driver-preview-api.ts` e aponta o `.claude/launch.json` para lá.

### Painel (`apps/frontend-transportada`)

- `modules/trip/shared/trip.types.ts` e `tripResponse.validation.ts`: as duas chaves novas, primeiro
  opcionais (T4.0), depois obrigatórias (T6.4). O validador continua recusando chave desconhecida.
- `test/trip-timeline-smoke.helper.ts` e `test/trip/timeline-smoke-payload.contract.ts`: o payload do
  smoke ganha as duas chaves.
- `modules/trip/shared/tripTimelineLocation.service.ts` (novo, puro):
  `resolveTimelineLocationView(item)` → `captured` (com ou sem coordenada), `unavailable` (com
  `viaWhatsApp`), `expired` ou `none`.
- `modules/trip/shared/tripTimelineDetail.service.ts`: `hasTripTimelineExpandableDetail` passa a contar
  `captured` com coordenada.
- `modules/trip/components/TripTimelineLocation.component.tsx` (novo): a linha com ícone `map-pin` e o
  botão "Ver no mapa"; `TripTimelineLocationMap.component.tsx` (novo, `lazy`) usa o mapa que o
  `TripRouteMap` já carrega (`AssemblyVectorMap`, `TripRouteMap.component.tsx:39-41`) com dois pontos.
- `modules/trip/locales/trip.locale.json` e `trip.en.locale.json`: `timeline.location.*`.

### Documentação

- `docs/adr/0081-todo-toque-do-motorista-carimba-onde-aconteceu.md`: D1–D10, emenda da ADR-0045 §3 e
  da spec 158.
- `docs/SECURITY.md`: a entrada de retenção de localização lista as cinco tabelas, o
  `location_state`, a permissão `trip.event-location` e o que o provedor do mapa base vê.
- `CLAUDE.md` da API, do worker, do painel e da app do motorista: o parágrafo de posição de cada um.

## Contratos/API/eventos

```text
POST /me/trips/current/dispatch                     { tripId, location? }
POST /me/trips/current/start-route                  { location? } | corpo vazio
POST /me/trips/current/confirm-load                 { location? } | corpo vazio
POST /me/trips/current/stops/:stopId/occurrences    { description?, documentId?, kind, distanceMeters?, location? }
POST /me/trips/current/documents/:id/occurrences    { note, occurrenceTypeId, productCode, attachmentObjectId?, location? }

location = { latitude: number, longitude: number, accuracyMeters?: number, capturedAt: ISO } | null
```

Respostas não mudam. `400` para `location` parcial ou chave desconhecida. `distanceMeters` continua
aceito e continua sem uso pela app: a fonte da distância é o carimbo.

```text
GET /trips/:id/timeline → data[].location      { latitude: "-23.5505200", longitude: "-46.6333090",
                                                 accuracyMeters: 12.5, capturedAt: ISO } | null
                                                 (null sem trip.event-location)
                        → data[].locationState 'captured' | 'unavailable' | 'expired' | null
```

### Exceções do inventário do D9

| Rota `POST /me/trips/current/**`                 | Por que não aceita `location`                                      |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `/location`                                      | é a posição ao vivo com consentimento (ADR-0050 §5), não um toque  |
| `/documents/:id/proof`                           | multipart com os próprios campos de posição (ADR-0070)             |
| `/documents/:id/occurrence-uploads` e `/confirm` | anexo, não evento (D6)                                             |
| `/stop-order-suggestions` (spec 192)             | coordenada efêmera do solver (ADR-0077 §10), quando a rota existir |

O contrato decide "aceita `location`" **pelo comportamento**: para cada rota da tabela de amostras
(corpo mínimo válido por rota), manda o corpo com um `location` válido e exige que a resposta não
seja `400` com `details[].field` começando em `location`; com um `location` parcial, exige `400` em
`location`. Rota `POST` sob `/me/trips/current` que não esteja nem nas amostras nem nas exceções
reprova — a lista de rotas vem de `createMeTripRoutes`, não de texto.

## Dados, migration e rollback

Uma migration, `drizzle/<timestamp>_event_location_stamp/`, aditiva:

```sql
-- para cada <t> em trip_status_events, trip_stop_occurrences, trip_document_occurrences
ALTER TABLE <t> ADD COLUMN latitude numeric(10,7), ADD COLUMN longitude numeric(10,7),
  ADD COLUMN accuracy_meters numeric(10,2), ADD COLUMN captured_at timestamptz,
  ADD COLUMN location_state varchar(16);
ALTER TABLE <t> ADD CONSTRAINT <t>_coordinates_check
  CHECK ((latitude IS NULL) = (longitude IS NULL));
ALTER TABLE <t> ADD CONSTRAINT <t>_latitude_range_check  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90);
ALTER TABLE <t> ADD CONSTRAINT <t>_longitude_range_check CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180);
ALTER TABLE <t> ADD CONSTRAINT <t>_accuracy_check        CHECK (accuracy_meters IS NULL OR latitude IS NOT NULL);
ALTER TABLE <t> ADD CONSTRAINT <t>_coordinates_channel_check
  CHECK (latitude IS NULL OR channel = 'driver_app');
ALTER TABLE <t> ADD CONSTRAINT <t>_location_state_check
  CHECK (location_state IS NULL OR location_state IN ('captured','unavailable','expired'));
ALTER TABLE <t> ADD CONSTRAINT <t>_location_state_channel_check
  CHECK (location_state IS NULL OR channel IN ('driver_app','whatsapp'));
ALTER TABLE <t> ADD CONSTRAINT <t>_location_state_consistency_check
  CHECK (location_state IS NULL OR ((location_state = 'captured') = (latitude IS NOT NULL)));
CREATE INDEX <t>_located_<tempo>_idx ON <t> (<created_at|recorded_at>) WHERE latitude IS NOT NULL;

-- trip_stop_events: só o estado (as coordenadas já existem)
ALTER TABLE trip_stop_events ADD COLUMN location_state varchar(16);
UPDATE trip_stop_events SET location_state = 'captured' WHERE latitude IS NOT NULL;
-- + _location_state_check, _location_state_channel_check e _location_state_consistency_check
```

- `ADD COLUMN` anulável sem default é só catálogo. Os CHECKs validam as linhas existentes, que têm
  tudo `null` nas colunas novas — passam. O `UPDATE` de `trip_stop_events` toca só as linhas com
  coordenada dos últimos 90 dias (o expurgo apagou o resto) — medir a contagem em staging e produção
  antes (T1.2) e registrar; acima de 100 mil linhas, sai em lotes num script à parte, fora da
  transação da migration.
- As linhas antigas de `trip_stop_events` com coordenada e canal `whatsapp`/`office` não existem
  (conferir na T1.2 com uma consulta; se existirem, o CHECK de canal do estado não entra nessa tabela
  e o achado vai para `evidence.md`).
- `rollback.sql`: `DROP INDEX`, `DROP CONSTRAINT` e `DROP COLUMN` na ordem inversa. Destrói o ponto
  gravado depois da migration; é manual, só com a API já revertida (§ Ordem de deploy), e o aviso fica
  no topo do arquivo.
- `snapshot.json` gerado pelo `db:generate` (migration à mão sem snapshot é proibida,
  `test/database-migration/schema-snapshot.contract.ts`), e `db:generate` = `no_changes` depois.
- Numeração: conferir `origin/staging` antes do push — 192, 193 e 195 também trazem migration.

## Segurança e tenant

- `companyId` do contexto, como hoje. Os contratos de isolamento da linha do tempo
  (`test/trip-schema/trip-timeline-query-tenant-safety.contract.ts`) continuam valendo e passam a
  cobrir as colunas novas.
- A coordenada é dado pessoal (LGPD art. 5º, I): nunca em log (API, worker, preview), nunca no payload
  de fila do RabbitMQ (`security.md` §6), nunca no portal. No IndexedDB do aparelho ela já vive em
  claro, com dono (`subHash`), como a das chegadas hoje (`docs/SECURITY.md`).
- Coordenada só com `trip.event-location` (D7). O mapa base é o PMTiles da instalação
  (`vectorBasemap.service.ts:67`, `BASEMAP_URL` = `VITE_MAP_TILES_URL` ou `/map-tiles/area.pmtiles`);
  as requisições por faixa de bytes revelam a área consultada a quem hospeda o arquivo. A T7.3 confere
  onde `VITE_MAP_TILES_URL` aponta em staging e produção e se esse host guarda log de acesso, e
  registra no `docs/SECURITY.md`. Nenhuma URL leva a coordenada em query string.
- `security.md` §10: o carimbo **não** é trilha de auditoria nova — é atributo do evento que já é
  trilha.

## Idempotência e concorrência

- Ocorrências usam a chave de `trip_field_reports`: o reenvio devolve o primeiro resultado, com o
  ponto (ou a falta dele) do primeiro envio. Evento é append-only; o ponto não é corrigido depois.
- "Despachar" e "Iniciar rota" continuam idempotentes pelo estado: `changed: false` não grava evento
  (D4). A corrida de dois despachos (`DispatchAlreadySettledSignal`) não muda: quem perde não grava.
- O ponto vai na mesma transação do evento; não há escrita separada que possa ficar pela metade.

## Observabilidade

- API: se algum log de rota registrar o toque, registra `locationState`, nunca coordenada.
- Worker: o log do ciclo de expurgo traz `redactedByTable`, `exhaustedTables` e a tabela que falhou,
  se falhar.
- Medição do D5 (T7.6), consulta só de agregado, sem dado pessoal:

  ```sql
  SELECT to_status, location_state, count(*)
    FROM trip_status_events
   WHERE channel = 'driver_app' AND location_state IS NOT NULL
     AND recorded_at > now() - interval '7 days'
   GROUP BY 1, 2 ORDER BY 1, 2;
  ```

  Critério: se `unavailable / (captured + unavailable)` passar de **30%** em `in_transit` ou
  `dispatched`, o relógio sobe para 5 s (constante, sem migration) e a medição repete na semana
  seguinte; se ficar abaixo de 10%, fica como está.

## Estratégia de testes

Teste antes da implementação, em cada fase. Toda suíte nova só roda se estiver importada pelo
entrypoint (ou listada no `package.json`), e o aceite de cada task inclui **"a contagem de testes
subiu em N"**, com N declarado.

| Camada                     | Suíte                                                                                                                                              | Entrypoint que a importa                                                                    |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Política (API)             | `test/trip-domain/event-location-stamp.contract.ts`                                                                                                | `test/trip-domain.contract.test.ts`                                                         |
| HTTP (API)                 | `test/trip-http/event-location-request.contract.ts`, `.../event-location-redaction.contract.ts`, `.../driver-location-stamp-inventory.contract.ts` | `test/trip-http.contract.test.ts`                                                           |
| Schema (API)               | `test/trip-schema/events.contract.ts` (estende), `.../event-location-readers.contract.ts`                                                          | `test/trip-schema.contract.test.ts`                                                         |
| Integração (API, Postgres) | `test/integration/event-location-stamp.integration.ts`                                                                                             | linha nova no script `test:integration` do `package.json`                                   |
| Migration                  | —                                                                                                                                                  | `make migration-test`                                                                       |
| Worker                     | `test/trip-location-purge/*.contract.ts`; integração estendida                                                                                     | `test/trip-location-purge.contract.test.ts`; `test/trip-location-purge.integration.test.ts` |
| App do motorista           | `test/driver-trip/event-location-queue.contract.ts`, `.../direct-tap-location.contract.ts`                                                         | `apps/frontend-driver/test/driver-trip.contract.test.ts`                                    |
| Painel                     | `test/trip/timeline-location.contract.ts`, `test/trip/timeline-smoke-payload.contract.ts` (estende)                                                | `apps/frontend-transportada/test/trip.contract.test.ts`                                     |
| Smoke                      | `apps/frontend-driver/test/driver-app.smoke.spec.ts` (GPS permitido, negado e mudo)                                                                | script `smoke` da app                                                                       |

⚠️ Integração da API é o segundo comando, com `--env-file` (sem ele, pula).

## Riscos

1. **App nova contra API antiga** perde evento (`400` → item sai da fila). Mitigação: a ordem de deploy
   com a sonda (§ Ordem de deploy) é gate da T7.4, e a API não é revertida com a app nova no ar.
2. **Leitor que devolve a linha inteira** passaria a vazar coordenada assim que a migration sobe.
   Mitigação: a auditoria (T1.3) vem antes de qualquer escrita de ponto, e o contrato dos leitores
   permitidos (RF12) fica vigiando depois.
3. **Painel antigo recusa a linha do tempo nova.** Mitigação: T4.0 publicada antes da API.
4. **Colisão de migration** com 192/193/195. Mitigação: conferir `origin/staging`, renumerar,
   `db:generate` = `no_changes` antes do push.
5. **O CHECK de canal** quebra teste antigo que monte linha com canal `office` e coordenada — é a
   intenção. Mitigação: os dois comandos de teste da API na fase do banco.
6. **Worker antes da migration** (`42703`). Mitigação: erro capturado por tabela (T2.2) ou worker num
   push seguinte.
7. **3 s não bastam** num pátio coberto. Aceito com `maximumAge` de 5 min e precisão de rede, e medido
   pela T7.6 com critério escrito.
8. **Despachar e Iniciar rota sem rede** continuam falhando no pátio sem sinal — defeito de hoje, fora
   desta spec. Continuação sugerida: pôr os dois na fila com o ponto, decidida à parte.
9. **Arquivos em disputa com a 192 e a 193** (`useDriverTrip.hook.ts`, `driverTrip.types.ts`,
   `DriverTripWorkspace.page.tsx`, `tripResponse.validation.ts`, `TripTimeline.component.tsx`).
   Mitigação: `git log origin/staging` do arquivo antes de cada task das Fases 4–6.
10. **A API de demonstração é compartilhada** com as sessões da 192 e da 193 (mesmo arquivo no
    scratchpad). Mitigação: a T5.0 copia a versão atual para o repositório e registra no
    `evidence.md` de onde veio; quem mexer depois mexe no arquivo versionado.
