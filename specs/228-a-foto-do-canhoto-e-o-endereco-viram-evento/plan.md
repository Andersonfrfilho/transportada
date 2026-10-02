# Plano — 228 A foto do canhoto e o endereço viram evento

## Ordem das fatias

```
F0 conferência ──► F1 vocabulário (API + painel, mesma lista) ──► F2 foto do canhoto (API)
                                                              └─► F3 endereço corrigido (API) ──► F5 painel
                                                                    (espera N1)          ▲
                                                 F4 migration — só se N1 = sim, 🧠 ─────┘
F5 painel ──► F6 documentação, portões, revisão
```

F2 não depende da N1. F3 depende dela só no rótulo e no nome do `kind` (se N1 = sim, o `kind` passa a cobrir
também a geocodificação automática; o nome `stop.address_corrected` é revisto **antes** da F1 publicar).

## F1 — Vocabulário

- API: `TRIP_TIMELINE_KINDS` e `TRIP_TIMELINE_KIND_PRIORITY` (`src/trips/application/trip-timeline.types.ts`)
  ganham os dois `kind`s **no fim** da lista, com as prioridades da D6; `TripTimelineItem` ganha
  `addressChange?: TripTimelineAddressChange` (opcional, só no `kind` do endereço — D8).
- Painel: cópia por valor em `src/modules/trip/shared/trip.types.ts:283`, `ICON_BY_KIND` e `NEUTRAL_KINDS`
  (`tripTimelineRow.service.ts`), título em `tripTimeline.service.ts`, locales `trip.locale.json` /
  `trip.en.locale.json`, validador (`isTimelineItem` aceita `addressChange` **só** no `kind` novo).
- A paridade `apps/frontend-transportada/test/trip/timeline.contract.ts` obriga as duas listas a mudarem no
  mesmo commit.

## F2 — Foto do canhoto (API)

- Arquivo novo `src/trips/infrastructure/trip-timeline-proof.query.ts` com `listCanhotoPhotoRows`:
  `trip_delivery_proofs` ⨝ `trip_stop_events` (por `(company_id, stop_event_id)`) ⨝ `trip_stops` (viagem) ⨝
  `trip_documents` (número/série) ⟕ `geocoded_addresses` (ponto vivo, para `distanceMeters`), filtro
  `kind = 'photo'`, `company_id` nas **quatro** tabelas, keyset com
  `coalesce(captured_at, created_at)` e prioridade constante 4, filtro `?documentId=` em
  `trip_stop_events.trip_document_id = :documentId` (estrito, D3).
- Entra no `Promise.all` de `listTripTimeline` (`trip-timeline.query.ts:112-120`) e na lista de leitores
  (`event-location-readers.constant.ts`, D9).
- Reaproveitar o mapeamento de posição de `trip-timeline-stop.query.ts` (sem copiar a conta: se a função não
  for exportável, extrair para `trip-timeline-location.mapper.ts` — é o terceiro uso).

## F3 — Endereço corrigido (API)

- Arquivo novo `src/trips/infrastructure/trip-timeline-address.query.ts` com `listAddressCorrectedRows`:
  `union all` de `geocoded_address_corrections` (origem da linha) e `geocoding_refinement_requests`
  (`outcome = 'refined'`, origem `refinement`), ⨝ `trip_stops` por `(company_id, address_key)`, com
  `created_at >= trip_stops.created_at`, `distinct on (id)` pela menor `sequence` (D5); com `?documentId=`,
  `trip_stops.id = (select stop_id from trip_documents where company_id = :c and trip_id = :t and id = :d)`.
- `displacementMeters` pela mesma função de distância (`addresses/domain/coordinate-distance.js`), arredondada.
- ⚠️ `trip_stops` não tem índice por `(company_id, address_key)`; as correções têm por `address_key`
  (`geocoded_address_corrections_address_key_idx`). Começar das paradas da viagem (poucas) e casar pela chave.
  Medir com `EXPLAIN` na integração.

## F4 — Só se N1 = sim (🧠, migration — PARAR E PERGUNTAR)

Esboço, a validar com `architect` em `opus` antes de escrever:

- Tabela `stop_geocoding_events` (`id`, `company_id`, `stop_id`, `address_key`, `source`, `precision`,
  `latitude`, `longitude`, `created_at`), FK composta para `trip_stops`, `rollback.sql`.
- Escrita: no worker (sugestão de rota e rotina de população) **quando a coordenada da chave muda** e há
  parada aberta com aquela chave — fan-out por empresa dona da parada; na API, idem no upsert.
- Decidir: o que gravar quando o endereço **já** tinha coordenada antes da parada nascer (nada? um evento
  sintético no nascimento da parada?).
- Entrar na lista de exclusões do 196 D8 com motivo (é endereço) ou no expurgo — decisão da task.

## F5 — Painel

- `TripTimelineEntry` (reaproveitada pela 227 T5.3) com os dois rótulos; _Eventos desta entrega_ sem mudança
  de estrutura — os itens chegam pelo mesmo `useTripDocumentTimelineQuery`.
- Na linha do tempo da viagem, a foto leva o rótulo da nota (como `document.delivered`).

## Estratégia de testes

- Contrato **antes** da implementação em cada fatia, e toda asserção nova **provada por mutação**.
- API: unitário do mapeamento, estático do SQL (tenant nas quatro tabelas, filtro de nota, leitores),
  rota (recorte de posição), **integração em Postgres real** (`test/integration/trip-timeline.integration.ts`,
  bloco novo) — a task só fecha com o **segundo** comando da API (CLAUDE.md da raiz).
- Painel: paridade de `kind`, validador (CA07), rótulo/ícone, smoke de prints em 1280 e 375.

## Riscos e mitigação

Ver `spec.md` § Riscos. O maior é a F4: ela só existe com "sim" do usuário e é 🧠.
