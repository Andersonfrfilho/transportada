# Evidence — 228 A foto do canhoto e o endereço viram evento

Spec escrita em 2026-10-02 (233 T5.0), a partir da leitura do código em `HEAD` 0ebe811d5. Número 228 conferido
livre em `origin/staging` (último: `225-a-viagem-terminada-nao-foi-movida`) e em `origin/main`.

N1 respondida pelo usuário em 2026-10-02 ("Só correção humana (Recomendado)") →
spec D11; nenhum `[NEEDS CLARIFICATION]` aberto, nenhuma migration.

## T0.1 — Conferência contra o HEAD 6fab0fc23 (2026-10-02)

Cada linha da tabela "O que já existe" foi aberta no código. **Todos os fatos se mantêm; nenhuma divergência
muda o desenho** (D1–D12 intactas, sem migration). Só a numeração de linhas deslocou — a spec cita as de
`0ebe811d5`, e a 233 mexeu depois em arquivos vizinhos.

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
| filtro `?documentId=` deixa passar `trip_document_id is null`                               | confere: `trip-timeline-stop.query.ts:113` (a spec cita `:104-106`); a 233 T5.1 acrescentou `documentStopId` em `ReadTripTimelineParams`                                                             |
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

## T1.2 (revisão) — foto com prioridade 3

`TRIP_TIMELINE_KIND_PRIORITY['document.canhoto_photo']` passou de 4 para 3 (parecer do architect: foto e baixa
saem da mesma transação e empatam em instante). O painel não guarda cópia de prioridade (conferido: nenhuma
ocorrência de `priority` nos módulos/testes de linha do tempo do painel), então só a API mudou. Contrato
`trip-timeline-vocabulary.contract.ts` refeito (tabela inteira com 3 e asserção de que a foto é menor que a baixa).
Mutação 3→4: 2 testes vermelhos; restaurado, 6 verdes.

## T2.1 — Contratos (vermelhos antes da implementação)

Commit `d55cd3c72`. Arquivos: `test/trip-application/trip-timeline-proof.contract.ts` (unitário do mapeamento e
recorte de posição pelo caso de uso), `test/trip-schema/trip-timeline-proof-query.contract.ts` (estático do SQL,
leitores, Promise.all), bloco novo em `test/integration/trip-timeline.integration.ts` (CA01, CA02, RF4 com
`created_at` forçado igual e `captured_at` nulo, RF4 por microssegundo, ordem por `captured_at`, outra
empresa/viagem, CA06 por `JSON.stringify`). Vermelho confirmado: o módulo `trip-timeline-proof.query.js` não existia.

## T2.2 — `trip-timeline-proof.query.ts`

- `trip-timeline-proof.query.ts` novo: `listCanhotoPhotoRows` (uma consulta), `toCanhotoPhotoTimelineRow` (puro).
  `PHOTO_INSTANT = coalesce(captured_at, created_at)` é **uma** constante usada no filtro do keyset, na ordem e na
  chave em texto; `occurredAt` monta-se em JS (`capturedAt ?? createdAt`). `kind = 'photo'` literal; filtro por nota
  `trip_document_id = :doc AND documentStopScope(params)`. Sem `catch` (erro de fonte propaga).
- `trip-timeline-stop.query.ts`: `toTimelineLocation` e `documentStopScope` passaram a `export` (nenhuma outra mudança).
- `trip-timeline-condition.helper.ts`: `formatTimelineTimestampKey` aceita `SQLWrapper` (`to_char((expr) at time zone ...`).
- `trip-timeline.query.ts`: oitava fonte no `Promise.all` (foto 8 consultas simultâneas; pool máx. 10).
- `event-location-readers.constant.ts`: entrada da foto com as cinco colunas e motivo.
- Divergência do parecer: nenhuma. O `recordedAt` do canal `office` sai de `created_at` do comprovante (o comprovante
  não tem `recorded_at`), pelo mesmo limiar de 60 s das fontes vizinhas.

### EXPLAIN (`SET LOCAL enable_seqscan = off` em transação, banco descartável)

Massa: 15 viagens da mesma empresa, 450 paradas/notas/eventos de baixa/fotos (30 por viagem); consulta da viagem 1.
Página 1 e página com cursor produzem o mesmo caminho, 0,55 ms de execução:

```text
Index Scan using trip_stop_events_company_stop_created_at_idx on trip_stop_events (rows=450)
  Bitmap Index Scan on trip_stops_company_trip_idx -> Bitmap Heap Scan on trip_stops (rows=30)
  Index Scan using trip_delivery_proofs_company_event_kind_unique on trip_delivery_proofs (loops=30, rows=1)
  Index Scan using trip_documents_pkey / nfe_documents_pkey / user_company_memberships_user_id_idx
  Index Scan using geocoded_addresses_pkey (referência, depois do escopo)
Execution Time: 0.549 ms
```

Com 30 linhas numa empresa só, o planejador começa pela prova (`Index Cond: company_id AND kind = 'photo'`, o
índice parcial casa por causa do literal) e junta por hash com as paradas da viagem. Nenhum Seq Scan; nenhuma
migration necessária.

### Mutações (cada edição aplicada, suíte rodada, arquivo restaurado por regravação; 17/17 mortas)

| Mutação                                                      | Suíte que matou                                      |
| ------------------------------------------------------------ | ---------------------------------------------------- |
| `kind = 'photo'` vira `true`                                 | integração (assinatura) + estático                   |
| prioridade da foto na consulta vira a da baixa (4)           | integração (RF4)                                     |
| filtro de nota sem `trip_document_id = :doc`                 | integração + estático                                |
| filtro de nota sem `documentStopScope`                       | integração + estático                                |
| keyset por `created_at` em vez de `PHOTO_INSTANT`            | integração + estático                                |
| `order by created_at`                                        | integração                                           |
| chave em texto por `created_at`                              | integração + estático                                |
| `occurredAt = createdAt`                                     | unitário                                             |
| `locationState: null`                                        | unitário                                             |
| `location: null`                                             | unitário + integração                                |
| sem `eq(proofs.companyId, ...)` / `eq(stops.companyId, ...)` | estático (equivalência comportamental pelas junções) |
| sem `eq(stops.tripId, ...)`                                  | integração + estático                                |
| fonte fora do `Promise.all`                                  | integração + estático                                |
| `formatTimelineTimestampKey` sem parênteses                  | estático                                             |
| recorte do caso de uso zera também `locationState`           | unitário                                             |
| entrada de `EVENT_LOCATION_READERS` com caminho errado       | leitores + estático                                  |

### Portões da T2.2 (apps/api-transportada)

- `bun run typecheck`: limpo. `bun run lint` (`--max-warnings=0`): limpo.
- `bun --env-file=../../.env.test test --timeout 120000`: **8689 pass / 23 skip / 0 fail** (192 arquivos).
- `bun --env-file=../../.env.test run test:integration` (completo, Postgres 65432 do `.env.test`):
  **847 pass / 8 skip / 0 fail**, 855 testes em 151 arquivos, 1050 s. Os 8 skips são pré-existentes
  (variantes que dependem de infra ausente), não do bloco novo (6 testes novos em `trip-timeline.integration.ts`, todos verdes).
- Painel não tocado nesta task (nenhuma prioridade copiada no painel).

## T3.1 + T3.2 — endereço corrigido na linha do tempo (API)

Contratos antes (commit `ce7ce2f4a`, vermelhos: o arquivo da fonte não existia e os 7 testes de integração novos
falhavam contra o Postgres) e implementação depois. Sem migration, sem índice novo.

### O que foi entregue

- `trip-timeline-address.query.ts`: **uma** consulta (`union all` de `geocoded_address_corrections` e do refino
  `refined`, ambas por `company_id`), `distinct on (changes.id)` num subselect (parada de menor `sequence`),
  `created_at >= trip_stops.created_at`, membro/perfil do ator por `company_id`, keyset `(created_at, 2, id)`, ordem
  e `limit` na consulta externa. **Nenhum** join com `geocoded_addresses`. O ponto novo vem de
  `new_latitude/new_longitude` da correção; o refino sai com `location = null`.
  `addressChange { origin, displacementMeters }` só no `kind` `stop.address_corrected` (haversine entre o ponto
  anterior e o novo, arredondado; `null` sem ponto anterior e no refino). Sem `catch`: erro de fonte propaga.
- Nunca selecionados: `reason`, `requested_by`, `address_key`, `previous_source/precision`, `new_source/precision`.
- `documentStopScope` já estava exportado de `trip-timeline-stop.query.ts` (T2.2); a fonte o usa no filtro por nota.
- Ligada ao `Promise.all` de `listTripTimeline`: **agora 9 consultas contra `DATABASE_POOL_MAX = 10`** (sete
  anteriores + foto + endereço). Uma décima esgotaria o pool — por isso o endereço é uma consulta só; comentário do
  orquestrador atualizado.
- Rota e `mergeTripTimeline` já repassavam `addressChange` (a rota devolve `timeline.items` como saiu do caso de uso;
  o recorte só zera `location`). Faltava só o contrato de rota, agora em
  `test/trip-http/event-location-redaction.contract.ts` (com `trip.event-location`: `addressChange` + ponto; sem ela:
  `location null`, `displacementMeters` mantido, latitude/longitude fora do JSON inteiro; outro `kind` não ganha a chave).
- Retoques de teste feitos na T3.2, achados ao rodar a T3.1 contra o código: `readAllPages` virou helper de módulo
  (era local do bloco da foto); `geocoded_address_corrections` é append-only (trigger), então o `created_at` com µs é
  inserido já no `insert` (`${iso}::timestamptz`), não por `update`; o contrato estático usa `') matched'` como
  delimitador do subselect (`' matched'` casava antes, e a fatia vazia passava sem provar nada).

### Divergências do parecer do architect

1. **Semi-join por `address_key` na trilha da correção** (acrescentado, não estava no parecer): o `EXPLAIN` mostrou que
   o planejador, com o `join` contra o `union all`, lia **toda** a trilha da empresa (30 000 linhas) e juntava por hash;
   com `and address_key in (select address_key from trip_stops where company_id = … and trip_id = …)` no ramo da
   correção ele passa a usar `geocoded_address_corrections_address_key_idx` (180 linhas). Semanticamente redundante com
   o join externo; preso por contrato estático e mutação (M17).
2. A fatia de `distinct on`: o parecer pedia `order by (id, sequence asc)`; mantido. Nada mais divergiu.

### EXPLAIN (Postgres 18 nativo, `explain (analyze, buffers, costs off)`)

Massa: 2 empresas × (30 000 correções + 30 000 refinos, 1/3 `refined`) em 5 000 `address_key`, viagem com 30 paradas
(`k1..k30`), `analyze` feito. Mesma consulta, página 1 (`limit 101`), 240 linhas intermediárias, 101 devolvidas.

| Planejador                                  | Trilha da correção                                                   | Trilha do refino                                                                                               | Tempo   |
| ------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------- |
| padrão (antes do semi-join)                 | Seq Scan, 30 000 linhas lidas, `Rows Removed by Filter: 30000`       | Seq Scan, 10 000 `refined` lidas, 50 000 descartadas                                                           | 13,1 ms |
| padrão (com semi-join, o código entregue)   | `Index Scan using geocoded_address_corrections_address_key_idx`, 180 | Seq Scan, 10 000 `refined` lidas, 50 000 descartadas                                                           | 8,4 ms  |
| `SET LOCAL enable_seqscan = off` (entregue) | `Index Scan using geocoded_address_corrections_address_key_idx`, 180 | Bitmap Index Scan em `geocoding_refinement_requests_company_created_idx` (30 000 da empresa, filtra `outcome`) | 7,8 ms  |

Paradas por `trip_stops_company_trip_idx`; membro por `user_company_memberships_user_company_unique`; perfil por
`identity_user_profiles_pkey`. **Leitura**: a trilha da correção custa o que a viagem tem (índice por chave); a do
**refino** custa o que a empresa já refinou/tentou (não há índice por `address_key` em
`geocoding_refinement_requests`, só `(company_id, created_at)`) — ~3 ms por 30 000 linhas da empresa. Não pesa no
volume real (refino é compra paga e tem teto por janela, spec 069), então **nenhuma migration foi criada**. Se o
volume do refino crescer ordens de grandeza, a saída é um índice `(company_id, address_key)` em
`geocoding_refinement_requests` — **migration, a perguntar ao usuário**, não feita aqui.

### Mutações (edição aplicada, suíte rodada, arquivo restaurado por regravação; 17/17 mortas)

| Mutação                                                   | Quem matou                                           |
| --------------------------------------------------------- | ---------------------------------------------------- |
| M1 trilha da correção sem `company_id`                    | estático + integração (CA03)                         |
| M2 sem `created_at >= trip_stops.created_at`              | estático + integração (CA03)                         |
| M3 refino sem `outcome = 'refined'`                       | estático + integração (CA03)                         |
| M4 `trip_stops.sequence desc`                             | estático + integração (CA04 e filtro por nota)       |
| M5 sem `distinct on`                                      | estático + integração (CA04)                         |
| M6 sem `documentStopScope`                                | estático + integração (filtro por nota)              |
| M7 sem keyset                                             | integração (CA04 e empate)                           |
| M8 origem fixa em `operator`                              | unitário + integração                                |
| M9 deslocamento sem `Math.round`                          | unitário + integração (inclui CA05)                  |
| M10 prioridade errada no keyset (`stop.occurrence`)       | integração (CA04 e empate com `document.occurrence`) |
| M11 `location` sem checar `null` (refino com ponto)       | unitário                                             |
| M12 rota descarta `addressChange`                         | contrato de rota                                     |
| M13 recorte do caso de uso zera `addressChange`           | unitário + contrato de rota                          |
| M14 membro do ator sem `company_id`                       | estático                                             |
| M15 seleciona `address_key`                               | estático                                             |
| M16 parada sem `company_id`                               | estático                                             |
| M17 trilha da correção sem restringir às chaves da viagem | estático                                             |

### Portões da T3.2 (apps/api-transportada)

- `bun run typecheck`: limpo. `bun run lint` (`--max-warnings=0`): limpo. Prettier nos arquivos tocados: limpo.
- `bun --env-file=../../.env.test test --timeout 120000`: **8714 pass / 23 skip / 0 fail** (192 arquivos).
- `DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65434/postgres bun --env-file=../../.env.test run
test:integration` (completo): **861 pass / 1 skip / 0 fail**, 862 testes em 151 arquivos, 609 s. O Postgres do
  `.env.test` (65432, Docker) não respondia (`pg_isready`: nenhuma resposta); rodou-se num Postgres 18 nativo
  descartável em 65434 (`initdb` no scratchpad), e as migrations rodam em banco descartável por teste. 7 testes novos
  em `trip-timeline.integration.ts`. Não verificado contra o Postgres 65432/17 da CI.
- Painel não tocado nesta task.

## T4.1 — Painel: os dois eventos na linha do tempo e em _Eventos desta entrega_

### O que mudou (apps/frontend-transportada)

- `shared/tripTimelineAddressChange.service.ts` (novo): `resolveTripTimelineAddressChange` devolve a frase da origem
  (`contractor`/`driver`/`operator`/`refinement`) e a do deslocamento, na unidade de `formatTripTimelineDistance` (m ou km,
  como a distância do resto do painel); `null` fora do `stop.address_corrected` e sem `addressChange`.
- `TripTimelineEntry` (a mesma linha serve à linha do tempo e a _Eventos desta entrega_) escreve origem e deslocamento
  na `itemMeta`, junto da autoria. Ator: a frase de autoria já existente.
- `tripTimelineDetail.service.ts`: o endereço corrigido chega com ponto e **sem** `locationState` (D7); com o ponto na mão
  ele é lido como `captured` (mapa e "Ver no mapa"), sem ponto fica sem nada (refino, ou sem `trip.event-location`). A
  exceção é só do `kind` do endereço.
- Locales pt-BR/en: `eventTimeline.addressChange.origin.*` e `.displacement.{meters,kilometers}`.

### Decisão do pino (mapa da linha do tempo)

Nenhuma cor nova (`TIMELINE_EVENT_CATEGORY_COLOR` e o contrato de cor intactos).

- `document.canhoto_photo` -> `delivered` (verde, check): a foto é parte da entrega, tirada no mesmo lugar; pinos do mesmo
  lugar e mesma categoria já viram um só com contador.
- `stop.address_corrected` -> `status` (cinza neutro, relógio): não é alarme nem entrega. Só tem pino quando há ponto novo;
  o refino não tem ponto e não aparece no mapa.
- Pendência de design: o rótulo da legenda de `status` é "Mudança de situação", impreciso para o endereço corrigido. Não
  renomeado aqui (muda texto de outro evento); fica para a revisão de design da T4.2.

### Contratos (antes do código; vermelhos: unitário não carregava o módulo, DOM 6 falhas)

- `test/trip/timeline-address-change.contract.ts` (12; entrypoint `test/trip.contract.test.ts`).
- `test/trip-hooks/timeline-canhoto-address.contract.ts` (DOM, 11; entrypoint `test/trip-hooks.contract.test.ts`).

### Mutações (edição aplicada, suíte rodada, arquivo restaurado por regravação; 12/12 mortas)

M1 serviço sem checar o `kind` · M2 deslocamento nulo vira texto · M3 unidade sempre metros · M4 origem fixa em `operator` ·
M5 exceção do `locationState` vale para qualquer `kind` · M6 sem a exceção do endereço · M7 exceção sem checar `location` ·
M8 foto com pino `status` · M9 componente sem a origem · M10 componente sem o deslocamento · M11 en quebrado · M12 pt quebrado.

### Portões

- `bun run typecheck`: limpo. `bun run lint`: 0 erros, 16 avisos (os pré-existentes). Prettier nos arquivos tocados: limpo.
- `bun run test`: 6378 pass / 0 fail (contratos) e 318 pass / 0 fail (hooks com DOM).
- Não verificado: 375 px sem rolagem horizontal e print (T4.2); o fixture de prints não foi atualizado com os dois eventos.

## T5.1 — documentação viva

- `docs/ai-context/api-transportada.md`: nova seção "Spec 228" (as duas fontes, prioridades 3 e 2, `PHOTO_INSTANT`,
  `EVENT_LOCATION_READERS`, uma consulta `union all` para o pool de 10, `distinct on` em subselect, refino sem ponto,
  colunas proibidas, erro de fonte propaga, limite da correção de outra empresa).
- `docs/ai-context/frontend-transportada.md`: nova seção (ícones, títulos, pinos, origem e deslocamento, "Ver no mapa"
  só com `location`, pendência da legenda "Mudança de situação").
- Ponteiros de 3 a 4 linhas nos `CLAUDE.md` das duas apps, dentro das seções da 233.
- 233: `tasks.md` e `evidence.md` registram que a Fase 5 recebeu os eventos; a ressalva D12 segue na T6.1 da 233.
- Nomes conferidos contra o código com `ls`/`grep`. Só documentação; nada executado além do `prettier`.

## Revisão opus da spec 228 — achados tratados

Cada achado foi conferido no código antes de mexer. Contratos escritos antes do código; mutação = edição aplicada,
suíte rodada, arquivo restaurado por regravação (cópia), nunca `git checkout`.

| Achado | Conferido em                                                                                                                                    | Veredito                                                                                                                                                                                                                                                                                                                                   | Commit    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| M1     | `TripTimelineLocationMap.component.tsx` (rótulo `eventPin`, legenda `legend`), `tripTimelineDetail.service.ts` (`capturedAt` = "Lida em")       | **Confirmado.** O ponto do endereço dizia "onde o motorista tocou". Agora `TripTimelineLocationView.pin` (`address`/`device`) escolhe `addressPin` ("Novo ponto do endereço"), `legendAddress`/`legendAddressEventOnly` e `addressCorrectedAt` ("Corrigido em {{moment}}"); a foto mantém o texto antigo. pt/en em paridade, pt acentuado. | e5b05c601 |
| M2     | `tripTimelineMap.constant.ts` (`address_corrected: 'status'`), `resolveTimelineMapView`                                                         | **Confirmado.** A tabela por kind agora é `Record<TripTimelineKind, null \| TimelineMapCategory>`; `stop.address_corrected: null` explícito (kind novo sem decisão não compila). O endereço sai de pino, trajeto, "X min do anterior", contagem e "sem posição"; o "Ver no mapa" do item segue.                                            | e5b05c601 |
| M3     | `TripTimeline.component.tsx` (spans sem classe, `== null`)                                                                                      | **Confirmado.** `summary` ("{{origin}} · {{displacement}}", chave `addressChange.summary`) num único `<span className={styles.itemAddressChange}>` (`overflow-wrap: anywhere`, sem estilo inline); `== null` do trecho trocado. O texto mantém "deslocado 45 m" (não "45 m" seco) por clareza.                                             | e5b05c601 |
| M4     | `countByCategory` e `clusterPoints`                                                                                                             | **Confirmado.** A foto não conta mais em `delivered`; cluster só com fotos usa glifo `camera` e o rótulo "Foto do canhoto" (chave existente), com a cor de `delivered` (sem token novo). Foto fundida na entrega continua fundida (`hasOnlyPhotos`).                                                                                       | e5b05c601 |
| B1     | `tripTimeline.service.ts:115-123`                                                                                                               | **Confirmado.** Em `isOwnDelivery` o título da foto é "Foto do canhoto" (`canhotoPhotoUnknownDocument`); a linha do tempo da viagem mantém "— NF-e n/série".                                                                                                                                                                               | e5b05c601 |
| B2     | `trip.types.ts` x `TRIP_TIMELINE_KIND_PRIORITY` da API (foto 3, endereço 2)                                                                     | **Confirmado.** Comentário agora "3 e 2".                                                                                                                                                                                                                                                                                                  | e5b05c601 |
| B3     | `trip-timeline.query.ts`, `spec.md` (Riscos 2); `DATABASE_POOL_DEFAULTS` (`max: 10`, `queryTimeoutMs: 8000`, prazo inclui a espera por conexão) | **Confirmado**, com um número corrigido: o `Promise.all` tem **9** consultas (não 10); 9 (e 10) cabem em `max=10`. O risco real é a soma entre requisições (linha do tempo da viagem + "Eventos desta entrega" = 18) com o prazo de 8 s contando desde a fila (503). Só texto.                                                             | 84363e7cc |
| B4     | `trip-timeline-address-query.contract.ts` (fatias `selectList`/`subselect`)                                                                     | **Confirmado.** `indexOf !== -1`, fim > início e `length > 20` antes de qualquer `not.toContain`.                                                                                                                                                                                                                                          | e62770b5e |
| B5     | `timeline.contract.ts`, laço "recusa addressChange em qualquer kind"                                                                            | **Confirmado.** Controle negativo: o mesmo kind sem `addressChange` não lança.                                                                                                                                                                                                                                                             | 7e0537b40 |
| B6     | —                                                                                                                                               | **Aceito como está**, por instrução. Registrado como decisão de produto pendente; nada alterado.                                                                                                                                                                                                                                           | —         |
| Refino | `trip-timeline-address.query.ts` (ramo `geocoding_refinement_requests` sem `address_key in (...)`)                                              | **Aplicado** o mesmo semi-join, sem migration. Contrato estático novo prende o ramo e a contagem (2 semi-joins).                                                                                                                                                                                                                           | e62770b5e |

### EXPLAIN do refino (Postgres 18 nativo descartável em 65437, `explain (analyze, buffers, costs off)`)

Massa: 2 empresas × (30 000 correções + 30 000 refinos, 1/3 `refined`) em 5 000 `address_key`; viagem com 30 paradas
(`k1..k30`) e outra de 300 paradas; `analyze`; página 1 (`limit 101`).

| Planejador                                      | Refino antes do semi-join                                                                                   | Refino com o semi-join (entregue)                   | Tempo antes → depois |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | -------------------- |
| padrão                                          | Seq Scan, 10 000 `refined`, `Rows Removed by Filter: 50000`, 10 000 linhas na junção                        | Seq Scan idêntico (3,8 ms), **60 linhas** na junção | 8,10 → 6,64 ms       |
| `SET LOCAL enable_seqscan = off` (em transação) | Bitmap Index Scan em `geocoding_refinement_requests_company_created_idx` (30 000 da empresa), 10 000 linhas | Mesmo Bitmap Index Scan, **60 linhas** na junção    | 7,55 → 7,37 ms       |

**Leitura honesta:** o semi-join **não muda o caminho de acesso** do refino. Sem índice por `address_key` em
`geocoding_refinement_requests` (só `(company_id, created_at)`), o Postgres ainda lê tudo o que a empresa refinou e só
depois filtra pela viagem; o ganho é a junção/`distinct on` receber 60 linhas em vez de 10 000 (~1,5 ms no padrão,
ruído no `seqscan off`). A trilha da correção segue em `Index Scan using geocoded_address_corrections_address_key_idx`.
Eliminar a leitura do refino exige o índice `(company_id, address_key)` — **migration, a perguntar ao usuário**; não
criada (instrução: sem migration).

### Mutações (todas mortas)

| Mutação                                                 | Quem matou                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| M1 `pin` sempre `device`                                | contrato `timeline-address-change` (pin do endereço)                           |
| M1 legenda sempre `legend`                              | DOM `timeline-canhoto-address` (legenda do mapa expandido)                     |
| M1 rótulo do pino sempre `eventPin`                     | contrato estático do componente do mapa                                        |
| M1 tooltip sempre `capturedAt`                          | contrato `timeline-address-change`                                             |
| M2 `address_corrected: 'status'`                        | 3 testes do `timeline-address-change` (tabela, pino, pino entre dois)          |
| M3 `summary` sempre só a origem                         | contrato `timeline-address-change` + DOM; smoke 375 (frase "· deslocado 45 m") |
| M3 sem `className` no span                              | contrato estático do DOM                                                       |
| M4 foto contada na legenda                              | 2 testes de mapa (isolada, fundida)                                            |
| M4 `hasOnlyPhotos: false`                               | teste da foto isolada (glifo/rótulo)                                           |
| M4 fusão sobrescreve `hasOnlyPhotos`                    | teste da foto fundida                                                          |
| B1 sem o ramo da foto em `isOwnDelivery`                | 2 testes de "Eventos desta entrega"                                            |
| B5 validação rejeita `stop.arrived` sem `addressChange` | controle negativo do `timeline.contract`                                       |
| Refino sem semi-join                                    | contrato estático novo                                                         |
| B4 marcador do select list com espaço (fatia vazia)     | **novo** reprova; o contrato antigo (`git show HEAD:`) **passava vazio**       |
| B4 marcadores do subselect                              | novo reprova                                                                   |

### Fixture e smoke dos prints (sem regerar os prints finais)

`test/trip-note-accordion.fixture.ts` (modo `note-accordion`) ganhou `document.canhoto_photo` (com `location`) e
`stop.address_corrected` (origem contratante, 45 m, com `location`) na timeline da nota; `spec-233-prints.smoke.spec.ts`
afirma "Foto do canhoto", "Endereço da parada corrigido" e "Corrigido pelo contratante · deslocado 45 m" em "Eventos
desta entrega" (o teste já exige sem transbordo em 375 via `expectNothingEscapes` e `expectNoHorizontalOverflow`).
`PLAYWRIGHT_FRONTEND_PORT=53225 PLAYWRIGHT_TEST_MATCH=spec-233-prints.smoke.spec.ts bun run smoke`: **13 passed**
(mutação do `summary` derrubou o teste 375 dark). Os PNGs regenerados foram restaurados com `git restore` (arquivos de
saída, sem outra edição); os prints finais da T4.2 dependem do ok do usuário.

### Portões

- Painel: `bun run typecheck` limpo; `bun run lint` 0 erros / 16 avisos (os pré-existentes); `bun run test`
  **6385 pass / 0 fail** + hooks **322 pass / 0 fail**; prettier limpo nos arquivos tocados.
- API: `bun run typecheck` limpo; `bun run lint` (`--max-warnings=0`) limpo;
  `bun --env-file=../../.env.test test --timeout 120000`: **8715 pass / 23 skip / 0 fail** (192 arquivos).
- Integração (toca SQL): `DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65437/postgres bun --env-file=../../.env.test test ./test/integration/trip-timeline.integration.ts --timeout 120000`: **42 pass / 0 fail**.
  O Postgres 65432 do `.env.test` respondia, mas é infra compartilhada; rodou-se num Postgres 18 nativo descartável
  (65437, `initdb` no scratchpad), **parado e apagado no fim**. Não verificado contra o Postgres 17 da CI.

### Não verificado

- Aparência real do mapa expandido (pino/legenda do endereço) no navegador: coberto por DOM (legenda) e estático
  (rótulo do pino), não por captura; o rótulo do pino vive dentro do mapa vetorial lazy.
- A legenda do minimapa não mostra entrada para a foto isolada (só o pino com câmera e a lista de pontos): decisão
  mínima do M4, a revisar no design.
- Prints finais (T4.2), integração completa (só o arquivo tocado) e a CI.

## T4.2 / T5.2 / T5.3 — fechamento (2026-10-02)

T4.2: prints aprovados pelo usuário junto da T6.1 da 233. T5.2: portão da raiz verde (format:check, lint, typecheck, build,
test); integração completa da API 853 pass / 1 fail por timeout de 30 s sob carga em `trip-occurrence-item-quantity`
(5/5 isolado). T5.3: revisão opus “aprovada com pendências”, achados tratados em `fixes-228`.
