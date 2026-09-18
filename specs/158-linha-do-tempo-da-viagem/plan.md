# Plano técnico — Spec 158

## Contexto e premissas

Levantamento feito em `origin/staging` (1e918a29) antes de escrever a spec:

- `trip_stop_events` (`trip.schema.ts:742`): `kind` ∈ `arrived|delivered|returned|occurrence`,
  `stopId`, `tripDocumentId` (nulo na chegada), `createdAt` (hora do fato), `recordedAt` (hora do
  registro, só na baixa retroativa), `actorUserId`, `channel`, `onBehalfOfDriverId`. Sem `tripId`:
  a leitura por viagem entra por `trip_stops` (`trip_stops_company_trip_idx`, `:361`).
- `trip_field_reports` não tem `tripId` nem payload: **não** serve de fonte.
- `trip_document_events` (`:516`): só o fluxo manual grava; canal cai no default `driver_app`.
- `trip_dispatch_snapshots` (`:613`): único registro com autor do despacho.
- Start-route: `drizzle-current-driver-trip.repository.ts:139-158` (`update trips set status`, sem
  ator, sem `updatedAt`); escritório audita em `audit_logs` por
  `drizzle-trip-field-office-audit.gateway.ts`.
- 14 `update(trips)` em `src/trips/infrastructure/` (lista na T1).
- Molde de leitura multi-fonte: `trip-occurrence-feed.query.ts` (aliases de ator/motorista em
  `:49-51`, junções `:197-212`, `mergeOccurrenceFeed` `:363-393`).
- Front: `TripDetail.component.tsx`, `useTripWorkspace.hook.ts`, `tripClient.service.ts`,
  `tripResponse.validation.ts` (`hasKeys` recusa chave desconhecida),
  `fieldOccurrenceAuthorship.service.ts`. Precedente visual: `NfeDocumentEventHistoryDrawer` (spec
  149). Classes `.timeline*` órfãs em `trip.module.css:2403-2484` (spec 110 D4) — reaproveitar ou
  apagar na T8.

## Arquitetura e arquivos afetados

**API**

- `src/database/trip.schema.ts` — `tripStatusEvents`; `TRIP_FIELD_CHANNELS.backoffice`.
- `drizzle/NNNN_trip_status_events.sql` — tabela, FKs compostas, check, índice; `backoffice` nas
  checks de `channel`.
- `src/trips/infrastructure/trip-status-event.persistence.ts` — `recordTripStatusChange(tx, params)`,
  usada por cada escritor de `trips.status` dentro da transação existente.
- Os 14 escritores (T1 decide quais mexem em `status`).
- `drizzle-trip-document.repository.ts`, `drizzle-trip-document-batch.repository.ts` — `channel`
  vindo do chamador (`backoffice`/`whatsapp`).
- `src/trips/application/read-trip-timeline.use-case.ts` — `createReadTripTimelineUseCase`: resolve a
  viagem da empresa (404), repassa ao leitor, monta o cursor.
- `src/trips/application/trip-timeline.types.ts` — `TripTimelineItem`, `ReadTripTimelineParams`,
  `ReadTripTimelineResult`.
- `src/trips/infrastructure/trip-timeline.query.ts` — uma função por fonte + `mergeTripTimeline`.
- `src/trips/presentation/trip.routes.ts` — `GET /trips/:id/timeline` com `TRIP_FIELD_READ_POLICY`.
- `src/main.ts` — ligação.

**Frontend**

- `shared/trip.types.ts` — `TripTimelineItem`, canal `backoffice`.
- `shared/tripResponse.validation.ts` — `tripTimelineFromApi`.
- `shared/tripClient.service.ts` — `readTripTimeline`.
- `hooks/useTripTimeline.hook.ts` — `useInfiniteQuery` pelo cursor.
- `shared/fieldAuthorship.service.ts` (renomeado de `fieldOccurrenceAuthorship.service.ts`, D7).
- `components/TripTimeline.component.tsx` + `.module.css` (ou classes órfãs de `trip.module.css`).
- `locales/*.locale.json` — `timeline.*`, `authorship.*`.

## Contratos/API/eventos

```
GET /trips/:id/timeline?cursor=<opaco>&limit=100
200 { "data": { "items": TripTimelineItem[], "nextCursor": string | null } }
404 TRIP_NOT_FOUND · 403 sem permissão · 400 TRIP_TIMELINE_CURSOR_INVALID / limit fora de 1..200
```

`TripTimelineItem` conforme spec D6. Cursor = base64url de `{ occurredAt, id }`, validado por Zod.

## Dados, migration e rollback

- Aditiva: `create table trip_status_events`, `alter ... drop constraint / add constraint` da check de
  `channel` com o valor novo (a check antiga é subconjunto: nenhuma linha viola).
- Rollback: `drop table trip_status_events`; a check volta ao vocabulário antigo **só se** não houver
  `backoffice` gravado — o down script falha alto se houver, em vez de apagar dado.
- D3 (a) exigiria `update trip_document_events set channel='backoffice'` — backfill não destrutivo,
  mas só se a ADR escolher (a) com a medição da T1.

## Segurança e tenant

- `companyId` do contexto autenticado; `where` com `company_id` em cada fonte; toda junção começa por
  `and(eq(X.companyId, …))`, exceção única documentada para o perfil de identidade (sem `company_id`,
  depois do vínculo já escopado).
- Viagem de outra empresa → 404 antes de qualquer fonte.
- Campos proibidos na resposta (aceite 8) e nos logs.

## Idempotência e concorrência

- O evento de status só é gravado quando o `update ... where status = <lido>` afetou linha
  (`changed=true`): repetir o start-route não duplica.
- Leitura sem estado; cursor estável por `(occurredAt desc, id desc)`.

## Observabilidade

Log `info` da rota com `tripId`, contagem de itens por `kind` e duração; nada do conteúdo.

## Estratégia de testes

- Contrato unitário do caso de uso e do `mergeTripTimeline` (ordem, desempate, cursor).
- Contrato estático de tenant (junções) e de escritores de `trips.status` (aceite 9).
- Integração contra Postgres (`bun --env-file=../../.env.test test --timeout 120000`): aceites 1–7 e o
  p95.
- `make migration-test`.
- Front: validador (aceita a resposta, recusa chave desconhecida e `channel` fora do vocabulário),
  frases de autoria (seis canais/estados), componente (vazio, erro, carregar mais).
- Smoke Playwright da seção na tela da viagem.

## Riscos

- **Escritor de `trips.status` esquecido** → buraco silencioso na linha do tempo. Mitigação: contrato
  estático (aceite 9).
- **Custo da leitura** em viagem grande → índices por `company_id` + fonte, medição de p95.
- **Rótulo de histórico** (D3) errado → decidido com dado, não com palpite.
