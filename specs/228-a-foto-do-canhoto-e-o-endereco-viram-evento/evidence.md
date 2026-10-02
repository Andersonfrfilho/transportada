# Evidence — 228 A foto do canhoto e o endereço viram evento

Spec escrita em 2026-10-02 (227 T5.0), a partir da leitura do código em `HEAD` 0ebe811d5. Número 228 conferido
livre em `origin/staging` (último: `225-a-viagem-terminada-nao-foi-movida`) e em `origin/main`.

N1 respondida pelo usuário em 2026-10-02 ("Só correção humana (Recomendado)") →
spec D11; nenhum `[NEEDS CLARIFICATION]` aberto, nenhuma migration.

## T0.1 — Conferência contra o HEAD 6fab0fc23 (2026-10-02)

Cada linha da tabela "O que já existe" foi aberta no código. **Todos os fatos se mantêm; nenhuma divergência
muda o desenho** (D1–D12 intactas, sem migration). Só a numeração de linhas deslocou — a spec cita as de
`0ebe811d5`, e a 227 mexeu depois em arquivos vizinhos.

| Fato da spec                                                                                | Estado em 6fab0fc23                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `trip_delivery_proofs` por (evento de baixa, tipo), unique                                  | confere: `trip.schema.ts:1670` (tabela), `:1868` (unique `trip_delivery_proofs_company_event_kind_unique`)                                                                                           |
| `photo`/`signature`/`cargo`                                                                 | confere: `trip.schema.ts:1572` (a spec cita `:1572-1575`; o vocabulário é a linha única `:1572`)                                                                                                     |
| ponto da foto (`latitude`, `longitude`, `accuracy_meters`, `captured_at`, `location_state`) | confere: `:1728-1731` (a spec cita `:1722-1732`)                                                                                                                                                     |
| `actor_user_id`, `channel`, `on_behalf_of_driver_id`, `late_registration`                   | confere: `:1707`, `:1720`, `:1744`; o `channel` está logo após o `actor_user_id`/`created_at`                                                                                                        |
| `received_by` nunca na linha do tempo                                                       | confere: `:1699` (a spec cita `:1697`), com o aviso D10 da 193 no comentário                                                                                                                         |
| `tripDeliveryProofs` na lista de leitores; expurgo mantém `captured_at`                     | confere: `event-location-readers.constant.ts:22`; o expurgo (`drizzle-trip-location.repository.ts:~140-165`) zera latitude/longitude/precisão e põe `expired`, não toca `captured_at`                |
| parada sem coordenada, casa por `address_key`                                               | confere: `trip.schema.ts:662` + comentário `:681-686`                                                                                                                                                |
| `geocoded_addresses` sem `company_id`                                                       | confere: `geocoding.schema.ts:26`                                                                                                                                                                    |
| `geocoded_at` reescrito; worker faz `onConflictDoNothing`                                   | confere: API `drizzle-geocoded-address.repository.ts:52` (`now()`); worker `drizzle-geocoded-address.repository.ts:55` (`onConflictDoNothing`); refino `drizzle-pending-refinement.repository.ts:97` |
| `geocoded_address_corrections` append-only com empresa/ator/origem/previous/created_at      | confere: `geocoded-address-correction.schema.ts:51-78`; gravada só quando `applied` (`drizzle-geocoded-address-correction.repository.ts:~68-76`)                                                     |
| `geocoding_refinement_requests` com `company_id`, ator, `outcome`, `created_at`             | confere: `geocoding-refinement.schema.ts:29-41`; índice `(company_id, created_at)` em `:54`                                                                                                          |
| `Promise.all` das fontes + ordenação `(occurredAt, prioridade, id)` e `::int`               | confere: `trip-timeline.query.ts:112-120` (sete fontes); `trip-timeline-condition.helper.ts:43` e `:72` (`::int`)                                                                                    |
| prioridades                                                                                 | confere: `TRIP_TIMELINE_KIND_PRIORITY` em `trip-timeline.types.ts` — `document.delivered = 4`, `stop.occurrence = 1`; **2 já é de `document.occurrence`** (ver nota)                                 |
| filtro `?documentId=` deixa passar `trip_document_id is null`                               | confere: `trip-timeline-stop.query.ts:113` (a spec cita `:104-106`); a 227 T5.1 acrescentou `documentStopId` em `ReadTripTimelineParams`                                                             |
| sem `trip.event-location` o caso de uso zera `location`                                     | confere: `read-trip-timeline.use-case.ts` (recorte logo após `canReadEventLocation`)                                                                                                                 |
| `trip_documents.stop_id` anulável                                                           | confere: `trip.schema.ts:773`                                                                                                                                                                        |
| nada impede duas paradas com a mesma `address_key`                                          | confere: só `(company, trip, sequence)` é único (`:710`)                                                                                                                                             |
| painel descarta `kind` desconhecido e reprova chave a mais                                  | confere: `tripResponse.validation.ts:1041` (descarta por `hasUnknownTimelineKind`), `isTimelineItem` em `:1483` com `hasKeys`; chaves em `trip.constant.ts:482-505`                                  |
| ícone/tom por `kind` exaustivos; `camera` e `edit` existem                                  | confere: `tripTimelineRow.service.ts:21` (`satisfies Record<TripTimelineKind, IconName>`); `icon.tsx:14`, `:31`                                                                                      |

**Notas que não mudam o desenho (para quem implementar):**

1. **Prioridade 2 já existe** (`document.occurrence`). A D6 põe `stop.address_corrected = 2` "acima de
   `stop.occurrence` (1)". Empatar com `document.occurrence` é inofensivo (instante exato + `id` desempata, e
   nunca aparecem ligados por causa-efeito), então a D6 segue. Nada renumerado.
2. **O vocabulário no painel tem mais de uma tabela exaustiva por `kind`** além das citadas no plano: o mapa
   `TIMELINE_MAP_CATEGORY_BY_KIND` (`tripTimelineMap.constant.ts`) e o `switch` de título em
   `tripTimeline.service.ts`. As duas travam no typecheck e entram na T1.2. Categoria nova do mapa exigiria
   cor em `TIMELINE_EVENT_CATEGORY_COLOR` (contrato `timeline-map-colors`) — a T1.2 reaproveita categorias
   existentes e deixa a decisão visual para a T4.1.
3. **`TRIP_TIMELINE_ITEM_OPTIONAL_KEYS` (painel) só tem `lateRegistration`**: `addressChange` entra ali como
   opcional, condicionado ao `kind` novo no `isTimelineItem`.
4. **Specs vizinhas**: 195 em 0/26 (nada implementado; `geocoded_address_corrections` é o alvo da gravação,
   spec 195 `spec.md:300`, `:463` — não há tabela própria); 196 em 13/34; 206 em 12/35. Nenhum código fora de
   `routing/infrastructure/drizzle-geocoded-address-correction.repository.ts` e
   `drizzle-geocoding-refinement.repository.ts` escreve nas duas trilhas.

Divergências que mudam o desenho: **nenhuma**.
