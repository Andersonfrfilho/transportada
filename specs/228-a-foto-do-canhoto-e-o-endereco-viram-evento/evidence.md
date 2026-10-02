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

## T1.1 — Contrato do vocabulário (vermelho antes da implementação)

Arquivos: `apps/frontend-transportada/test/trip/timeline.contract.ts` (bloco "vocabulário da spec 228"),
`timeline-view.contract.ts` (bloco "títulos dos eventos da spec 228"), `timeline-event-row.contract.ts`
(ícone e tom); `apps/api-transportada/test/trip-application/trip-timeline-vocabulary.contract.ts` (novo,
registrado em `test/trip-application.contract.test.ts`). Todos já fazem parte das listas existentes.

Estado vermelho medido antes de qualquer código de produção:

- Painel: `bun test ./test/trip.contract.test.ts` → 2291 pass, **10 fail** (kinds ausentes do vocabulário,
  item aceito/recusado, títulos, locales, ícone/tom).
- API: `bun --env-file=../../.env.test test ./test/trip-application.contract.test.ts` → o arquivo não
  carrega (`TRIP_TIMELINE_ADDRESS_CHANGE_ORIGINS` não é exportado): 0 pass, 1 fail.

Duas asserções passam no vermelho **por construção** e só provam algo depois da T1.2 — a prova por mutação
delas está na T1.2: "recusa addressChange em qualquer kind que não seja o do endereço" (hoje a chave é
desconhecida para todos) e "o tom dos dois é progress".

## T1.2 — Vocabulário implementado (nenhuma fonte emite ainda)

Código: API `trip-timeline.types.ts` (`TRIP_TIMELINE_KINDS` +2 no fim, `TRIP_TIMELINE_KIND_PRIORITY`
`document.canhoto_photo = 4` e `stop.address_corrected = 2`, `TRIP_TIMELINE_ADDRESS_CHANGE_ORIGINS`,
`TripTimelineAddressChange`, `TripTimelineItem.addressChange?`). Painel: `trip.types.ts` (cópia por valor +
origens + tipo), `trip.constant.ts` (`addressChange` nas chaves opcionais, `TRIP_TIMELINE_ADDRESS_CHANGE_KEYS`),
`tripResponse.validation.ts` (`addressChange` obrigatório e exato em `stop.address_corrected`, **recusado** em
qualquer outro kind), `tripTimelineRow.service.ts` (`camera`/`edit`, tom neutro), `tripTimeline.service.ts`
(títulos), `tripTimelineMap.constant.ts` (categoria `status`, **provisória**: pino próprio exige cor nova em
`TIMELINE_EVENT_CATEGORY_COLOR`, decisão visual da T4.1), locales pt-BR e en.

Decisões a registrar:

- Título da foto segue a spec RF6 ("Foto do canhoto — NF-e {número}/{série}"), com chave própria
  `canhotoPhoto` (`{{invoice}}`) em vez do `documentLabel` ("Nota ..."), e `canhotoPhotoUnknownDocument` quando
  a nota não tem número legível.
- `addressChange` é **obrigatório** no kind do endereço no painel (a API nova sempre o manda; sem ele o item
  não tem o que mostrar) e **recusado** nos outros — a recusa é a mesma de "chave a mais", e CA07 não é afetado
  porque o kind desconhecido é descartado antes (`hasUnknownTimelineKind`).
- O repasse ao HTTP não foi tocado: nenhuma fonte emite; a rota e `mergeTripTimeline` (que carrega a linha
  inteira) serão conferidos na T3.2.

Gates (saídas literais abaixo no relatório da sessão):

- Painel (`apps/frontend-transportada`): `bun run typecheck` limpo; `bun run lint` 0 errors / 16 warnings
  (todos pré-existentes, em arquivos não tocados); `bun run test` → **6366 pass / 0 fail** (32 arquivos) +
  **307 pass / 0 fail** (hooks).
- API (`apps/api-transportada`): `bun run typecheck` limpo; `bun run lint` (`--max-warnings=0`) limpo;
  `bun --env-file=../../.env.test test --timeout 120000` → **8665 pass / 23 skip / 0 fail** (192 arquivos).
  Integração **não rodada**: a task não toca `test/integration/**`.

Mutação (cada edição aplicada, a suíte do lado rodada, arquivo restaurado por regravação; 21/21 mortas):

| Mutação                                                                | Resultado |
| ---------------------------------------------------------------------- | --------- |
| validador aceita `addressChange` em outro kind                         | morta     |
| validador dispensa `addressChange` no kind do endereço                 | morta     |
| origem sem checagem de vocabulário                                     | morta     |
| deslocamento negativo/`NaN` aceito                                     | morta     |
| deslocamento não numérico aceito                                       | morta     |
| chaves exatas do `addressChange` afrouxadas                            | morta     |
| ícone da foto trocado (`camera` → `check`)                             | morta     |
| ícone do endereço trocado (`edit` → `clock`)                           | morta     |
| foto / endereço fora dos neutros (2 mutações)                          | mortas    |
| tom da foto vira `done`; tom do endereço vira `problem`                | mortas    |
| título sem nota deixa de cair no fallback                              | morta     |
| locale pt da foto / do endereço alterado                               | mortas    |
| ordem dos kinds invertida (painel e API)                               | mortas    |
| API: prioridade da foto 4→5, do endereço 2→3, `document.returned` 3→33 | mortas    |
| API: origem inventada acrescentada ao vocabulário                      | morta     |

## Correções pós-parecer do architect (2026-10-02)

Parecer do architect (opus) sobre T2.2/T3.2 aplicado à spec: D6 (foto com prioridade **3**, não 4: o empate
foto×entrega não é raro — mesma transação, `created_at` ambos `now()`), D2 e fora do escopo (o upsert não regrava
`created_at`), D4 (limite de correção de outra empresa; parada recriada), D5 (`documentStopScope`), D7 (refino
com `location = null`), CA06 (colunas proibidas), Risco 2 (`enable_seqscan = off` e pressão no pool), plan F2/F3.
