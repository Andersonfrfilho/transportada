# Feature 228 — A foto do canhoto e o endereço viram evento

## Problema e resultado

A spec 227 abriu a nota inteira, e a seção _Eventos desta entrega_ lê `GET /trips/:id/timeline?documentId=`
(227 T5.1/T5.3). Faltam nela dois acontecimentos que o canvas aprovado mostra e que o usuário decidiu criar
(227 D12, N5: _"Cria os dois eventos"_):

1. **"Foto do canhoto"** — o momento em que o motorista (ou o escritório, em nome dele) tirou a foto do
   canhoto, com o ponto onde estava;
2. **"Endereço da parada corrigido"** — o momento em que alguém desta empresa mudou a coordenada do endereço
   da parada (pedido original: "endereço geocodificado"; o nome final vem da D11).

**Resultado**: os dois aparecem na linha do tempo da viagem e em _Eventos desta entrega_, na ordem certa, com a
mesma regra de posição dos outros eventos (spec 196), sem coordenada para quem não tem `trip.event-location`.

A 227 D12 estimou "tipo novo em `TRIP_STOP_EVENT_KINDS`, CHECK, migration, escrita nas rotas do motorista e no
geocodificador". A leitura do código (abaixo) mostra que a **foto do canhoto não precisa de nada disso** , e que o
**endereço** também não, depois que o usuário escolheu só a correção humana (D11).

## O que já existe (medido em 2026-10-02, `HEAD` 0ebe811d5)

| Fato                                                                                                                                                                                                     | Onde                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O comprovante já é uma linha por (evento de baixa, tipo), ligada à nota pelo `stop_event_id`                                                                                                             | `apps/api-transportada/src/database/trip.schema.ts:1670-1675`, unique `:1868`                                                                                                                                    |
| O canhoto é o tipo `photo`; `signature` e `cargo` são outros                                                                                                                                             | `trip.schema.ts:1572-1575`                                                                                                                                                                                       |
| A foto já carrega **onde e quando foi tirada**: `latitude`, `longitude`, `accuracy_meters`, `captured_at`, `location_state` (ADR-0070 §2-4, spec 196 D2)                                                 | `trip.schema.ts:1722-1732`                                                                                                                                                                                       |
| Ela já tem `actor_user_id`, `channel`, `on_behalf_of_driver_id` e `late_registration`                                                                                                                    | `trip.schema.ts:1707-1720`, `:1744`                                                                                                                                                                              |
| `received_by` **nunca** vai para a linha do tempo (spec 193 D10)                                                                                                                                         | `trip.schema.ts:1697`                                                                                                                                                                                            |
| `tripDeliveryProofs` já está na lista fechada de tabelas com posição, e o expurgo de 90 dias já a varre — apaga o ponto, **mantém** `captured_at`                                                        | `src/trips/application/event-location-readers.constant.ts:21-27`; `apps/worker-transportada/src/trip-location-purge/infrastructure/drizzle-trip-location.repository.ts:148-161`                                  |
| A parada **não guarda coordenada**: ela casa `geocoded_addresses` pela `address_key`                                                                                                                     | `trip.schema.ts:662`, comentário `:681-686`                                                                                                                                                                      |
| `geocoded_addresses` **não tem `company_id`** ("a coordenada de um endereço não é de ninguém")                                                                                                           | `src/database/geocoding.schema.ts:26-29`                                                                                                                                                                         |
| `geocoded_at` é **reescrito** a cada mudança — upsert da API, refino automático do worker — e o worker que geocodifica primeiro faz `onConflictDoNothing`: não há histórico, só o último instante global | `src/routing/infrastructure/drizzle-geocoded-address.repository.ts:52`; worker `drizzle-geocoded-address.repository.ts:55`; worker `geocoding-refine/infrastructure/drizzle-pending-refinement.repository.ts:97` |
| A **correção humana** de coordenada é trilha append-only **com** `company_id`, ator, origem (`contractor`/`driver`/`operator`), ponto anterior e novo, e `created_at` — gravada só quando aplicada       | `src/database/geocoded-address-correction.schema.ts:25`, `:50-78`; `src/routing/infrastructure/drizzle-geocoded-address-correction.repository.ts:70-73`                                                          |
| O **refino pago pedido por gente** (spec 069) é trilha append-only **com** `company_id`, ator, `outcome` e `created_at`; só `refined` mudou a coordenada                                                 | `src/database/geocoding-refinement.schema.ts:11-41`                                                                                                                                                              |
| A linha do tempo junta fontes em `Promise.all` e ordena por `(occurredAt, prioridade, id)` decrescente; a prioridade é `::int`                                                                           | `src/trips/infrastructure/trip-timeline.query.ts:112-120`; `src/trips/infrastructure/trip-timeline-condition.helper.ts:37-44`; `src/trips/application/trip-timeline.types.ts` (`TRIP_TIMELINE_KIND_PRIORITY`)    |
| O filtro `?documentId=` da 227 T5.1 deixa passar o que é da parada (`trip_document_id is null`)                                                                                                          | `src/trips/infrastructure/trip-timeline-stop.query.ts:104-106`                                                                                                                                                   |
| Sem `trip.event-location` o caso de uso zera `location` de **todo** item e mantém `locationState`                                                                                                        | `src/trips/application/read-trip-timeline.use-case.ts:37-38`, `:75-78`                                                                                                                                           |
| A nota sabe a parada dela (`trip_documents.stop_id`, anulável)                                                                                                                                           | `trip.schema.ts:773`                                                                                                                                                                                             |
| Nada impede duas paradas da mesma viagem com a mesma `address_key` (só `(trip, sequence)` é único)                                                                                                       | `trip.schema.ts:709-716`                                                                                                                                                                                         |
| O painel **descarta** item de `kind` desconhecido (206 T0.3) e reprova a página por **chave a mais** em item conhecido                                                                                   | `apps/frontend-transportada/src/modules/trip/shared/tripResponse.validation.ts:1029-1040`, `:1460`, `:1481`                                                                                                      |
| Ícone e tom por `kind` são mapa exaustivo; `camera` e `edit` existem                                                                                                                                     | `tripTimelineRow.service.ts:21-40`; `src/components/ui/icon.tsx:14`, `:31`                                                                                                                                       |

### Specs do mesmo assunto, conferidas para não duplicar decisão

- **158 / 171** (13/13, fechadas) — o molde da linha do tempo e a prioridade como desempate. Seguido aqui.
- **196** (13/34) — todo evento carrega onde aconteceu; lista fechada de leitores (D7) e expurgo único (D8).
  A foto do canhoto **já** é uma das cinco tabelas; nada a acrescentar ao expurgo. `geocoded_address_corrections`
  e `geocoded_addresses` estão nas **exclusões** do D8 ("endereço ou cadastro, não posição de pessoa",
  `specs/196-todo-evento-carrega-onde-aconteceu/spec.md:186-196`).
- **206** (12/35) — dona do `stop.departed`; inaugurou "kind novo entra no vocabulário antes da fonte" e a
  prioridade compartilhada (`stop.departed = 0`). Seguido aqui.
- **195** (0/26, não implementada) — a **denúncia** de endereço errado vira `stop.occurrence` com rótulo
  "Correção de endereço" (RF21, `specs/195-…/spec.md:380-381`). **Não é o mesmo evento**: a 195 é o relato
  (alguém diz que está errado); a 228 é a **coordenada mudar**. Quando a 195 aplicar uma sugestão, ela grava
  `geocoded_address_corrections` com `origin = 'driver'` — e a 228 mostra esse efeito sem ler nada da 195.
- **084** (9/40) e **150** (20/20) — donas de `geocoded_address_corrections` (084 RF4) e do pedido à
  contratante. A 228 só **lê** a trilha.
- **069** (27/27) — dona de `geocoding_refinement_requests`. A 228 só **lê** a trilha.
- **194 / 220 / 222 / 224** — conferência e leitura do canhoto. O veredito (`canhoto_review`) é o selo da
  seção _Comprovante_ (227 D4); a 228 **não** o repete no evento.
- **218** (30/30) — modos do comprovante por contratante. Não muda a foto nem o ponto.

## Fora do escopo

- Mudar quando, como ou por quem a foto é tirada (app do motorista, 218/220).
- Redesenhar a geocodificação, o refino automático (ADR-0062) ou a agenda de endereços (084).
- Histórico de fotos **substituídas**: o unique `(empresa, evento, tipo)` (`trip.schema.ts:1868`) guarda só a
  foto vigente. O upsert **não regrava `created_at`** (`buildProofUpsertSet`,
  `drizzle-delivery-proof.repository.ts:496-519`): foto substituída sem `captured_at` mostra o instante da
  **primeira**; com envelope de posição a substituição troca o `id` (`:525`). Guardar substituições é outra spec.
- A foto da mercadoria (`cargo`, spec 220) e a assinatura. O pedido é "Foto do canhoto".

## Decisões

- **D1 — A foto do canhoto é evento derivado na leitura, sem tabela nem coluna nova.** A linha de
  `trip_delivery_proofs` com `kind = 'photo'` **é** o fato: tem instante, ponto, estado do ponto, autor, canal,
  expurgo e lista de leitores. Gravar um `trip_stop_events.kind = 'canhoto_photo'` copiaria `captured_at` e o
  ponto para uma segunda tabela — duas fontes da mesma verdade, que divergem na primeira substituição. Isto
  **cumpre** a 227 D12 ("passam a ser eventos de verdade"): o evento existe no vocabulário da linha do tempo
  (`document.canhoto_photo`), com ordem, ponto e permissão próprios; o que se evita é só a cópia. Revisa a
  **estimativa** da D12 (tipo em `TRIP_STOP_EVENT_KINDS` + migration), não a decisão.
- **D2 — O instante da foto é `coalesce(captured_at, created_at)`.** `captured_at` é a hora do aparelho
  quando a foto foi tirada (ADR-0070 §2) e sobrevive ao expurgo; `created_at` é a chegada ao servidor, para o
  comprovante antigo ou de canal sem leitura do aparelho. O item só diz qual dos dois foi quando há
  `location` (com `captured_at` o instante é o do aparelho); sem posição não há como distinguir. Foto
  substituída sem `captured_at` mostra o `created_at` da primeira (o upsert não o regrava).
- **D3 — A foto é da nota.** Ela pertence ao evento de baixa (`stop_event_id` → `trip_stop_events.trip_document_id`).
  Com `?documentId=`, só a foto **daquela** nota passa — nunca a de outra nota da mesma parada.
- **D4 — O evento do endereço é da parada, e nasce quando a coordenada do endereço dela muda por ação desta
  empresa.** Respostas à pergunta que a 227 D12 deixou:
  - **De quem é**: da **parada** (`stop` preenchido, `document = null`), porque a coordenada é do endereço e a
    parada é quem o carrega (`trip_stops.address_key`). Toda nota da parada o vê.
  - **Quando nasce (derivado, sem migration)**: a cada linha de `geocoded_address_corrections` (correção
    humana: contratante, motorista, operador — 084, 150 e, no futuro, 195 aplicada) e de
    `geocoding_refinement_requests` com `outcome = 'refined'` (refino pago pedido por gente — 069), **da mesma
    empresa**, com a mesma `address_key` da parada e `created_at >= trip_stops.created_at`.
  - **Sem limite superior**: a distância de cada evento é medida contra o ponto **vivo** do endereço
    (`trip-timeline-stop.query.ts:156`); uma correção depois da entrega muda a distância exibida, e a linha do
    tempo precisa dizer por quê. **Limite inevitável**: correção de **outra** empresa também muda o ponto vivo
    e a distância, sem gerar evento aqui (`geocoded_addresses` é global).
  - **Parada recriada**: `trip_stops.created_at` pode ser mais novo que a viagem se a parada for recriada
    (`reconcileStopOnLink`); correção entre a criação da viagem e a recriação some. Aceitável.
  - **O que fica de fora (D11)**: a primeira geocodificação automática, o refino automático (ADR-0062) e o
    backfill. Eles gravam em `geocoded_addresses`, que é global, sem empresa, e cujo `geocoded_at` é
    reescrito — não há evento a derivar, e usar `geocoded_at` mostraria o instante de uma ação de **outra**
    empresa (ou de antes da viagem existir).
- **D5 — Um endereço corrigido aparece uma vez por viagem.** Sem filtro, se duas paradas da viagem têm a mesma
  `address_key`, o item vai com a de **menor** `sequence` (`distinct on` pelo id da correção). O keyset
  `(occurredAt, prioridade, id)` exige id único na lista: dois itens com o mesmo id e o mesmo instante fariam a
  página seguinte pular um. Com `?documentId=`, só a parada da nota, via `documentStopScope` (o caso de uso já resolve
  `documentStopId` com escopo de empresa e viagem); nota sem parada não recebe evento de endereço.
- **D6 — Vocabulário e prioridade.** Dois `kind`s novos, acrescentados ao **fim** de `TRIP_TIMELINE_KINDS`:
  | `kind` | fonte | prioridade | por quê |
  | ----------------------- | ---------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
  | `document.canhoto_photo` | `trip_delivery_proofs` (`kind = 'photo'`) | **3** | logo abaixo de `document.delivered` (4). O empate foto×entrega **não é raro**: o comprovante é gravado na mesma transação da baixa (`drizzle-driver-field-report.repository.ts:889`) e os dois `created_at` são `defaultNow()` (mesmo `now()`); com `captured_at` nulo empatam em instante e prioridade e o `id` (uuid v4) decidiria ao acaso — a prioridade 3 fixa a ordem |
  | `stop.address_corrected` | `geocoded_address_corrections` + `geocoding_refinement_requests` (`refined`) | **2** | acima de `stop.occurrence` (1): a correção é efeito do relato de endereço errado (195) — efeito acima da causa (158 D8) |
  Prioridade é `::int` e **nenhuma existente é renumerada** — cursor em voo continua válido (206 D12); nenhuma fonte
  emitia a foto ainda, então não há cursor com prioridade da foto em voo.
- **D7 — Posição só com `trip.event-location`, e nenhum texto de endereço.**
  - Foto: `location` é o ponto da foto, com `distanceMeters` contra o ponto vivo da parada (mesma conta de
    `trip-timeline-stop.query.ts`); `locationState` é o da foto.
  - Endereço: `location` é o **ponto novo** da `geocoded_address_corrections` (`new_latitude`/`new_longitude`;
    `accuracyMeters = null`, `capturedAt = created_at`, `distanceMeters = null`); no **refino** `location = null`
    (não há ponto guardado, e o ponto vivo pode ter sido gravado por outra empresa); `locationState = null` ("não se aplica" — não é posição de pessoa).
  - O recorte do caso de uso (`read-trip-timeline.use-case.ts:75-78`) zera `location` dos dois sem
    `trip.event-location`; nenhum dos dois leva logradouro, número, CEP ou `address_key` em campo nenhum.
- **D8 — O endereço leva um campo próprio, só nos itens do `kind` novo.** `addressChange: { origin,
displacementMeters }`, com `origin ∈ contractor | driver | operator | refinement` e `displacementMeters`
  (haversine entre o ponto anterior e o novo; `null` se não havia ponto antes ou se é refino, que não guarda o
  anterior). A chave **só existe** nos itens `stop.address_corrected`: o painel antigo descarta o `kind`
  desconhecido **antes** de validar as chaves (`tripResponse.validation.ts:1038`), então a API pode publicar
  antes do painel sem apagar a linha do tempo. Em qualquer outro `kind` a chave **não aparece** (nem `null`) —
  pôr a chave em todo item reprovaria a página inteira no painel antigo. `displacementMeters` **não** é
  recortado: metros não revelam onde.
- **D9 — Leitores e expurgo.** A consulta nova da foto entra em `EVENT_LOCATION_READERS` com as cinco colunas
  e motivo escrito (o contrato `test/trip-schema/event-location-readers.contract.ts` reprova sem isso). O
  expurgo não muda: a foto já está nele, e as tabelas do endereço estão nas exclusões do 196 D8.
- **D10 — Nada de PII em log.** As consultas não logam; erro propaga para o filtro do Router (code-standart
  §7), que não serializa linha. Nenhum log novo carrega coordenada, `address_key`, nome de quem recebeu
  (193 D10) ou URL de foto. A foto **não** leva URL assinada nem contagem (161 T11: quem quer a imagem abre o
  comprovante).

## Requisitos funcionais

- **RF1** `GET /trips/:id/timeline` devolve `document.canhoto_photo` para cada comprovante `photo` da
  viagem, com `document`, `stop`, `actorName`, `channel`, `onBehalfOfDriverName`, `lateRegistration`,
  `location` e `locationState` da foto (D1–D3, D7).
- **RF2** Devolve `stop.address_corrected` para cada correção/refino aplicado ao endereço de uma parada da
  viagem, pela mesma empresa, a partir da criação da parada, uma vez por viagem (D4, D5), com
  `addressChange` (D8).
- **RF3** Com `?documentId=`, a foto passa só se for daquela nota; o endereço passa só se for da parada da
  nota (D3, D5). Nota de outra empresa ou viagem continua `404 TRIP_DOCUMENT_NOT_FOUND` (227 T5.1).
- **RF4** A paginação por cursor não repete nem pula item das fontes novas, inclusive no empate de instante.
- **RF5** Sem `trip.event-location`, os dois `kind`s saem com `location = null`; com ela, com o ponto (D7).
- **RF6** O painel conhece os dois `kind`s (lista de paridade), com ícone, tom e rótulo:
  - `document.canhoto_photo` → ícone `camera`, tom neutro, **"Foto do canhoto"** (na linha do tempo da
    viagem: "Foto do canhoto — NF-e {número}/{série}");
  - `stop.address_corrected` → ícone `edit`, tom neutro, **"Endereço da parada corrigido"**, com a origem
    ("pelo contratante", "pelo motorista", "pelo escritório", "refino de precisão") e o deslocamento quando
    houver ("deslocado 45 m").
- **RF7** _Eventos desta entrega_ (227 T5.3) mostra os dois na ordem cronológica, com "Ver no mapa" só quando
  há `location` (spec 196).

## Critérios de aceite

- **CA01** Viagem com duas notas na mesma parada, cada uma com canhoto: `?documentId=A` traz só a foto de A.
- **CA02** Foto sem ponto (`location_state = 'unavailable'`, ou `null` no comprovante antigo) aparece com o estado e sem mapa; foto
  expurgada (`expired`) aparece com o instante e sem ponto.
- **CA03** Correção de **outra empresa** na mesma `address_key` **não** aparece; correção anterior à criação
  da parada **não** aparece; refino `not_improved`/`provider_not_configured` **não** aparece.
- **CA04** Duas paradas com a mesma `address_key`: a correção aparece **uma** vez, e o cursor em páginas de 1
  não repete nem pula.
- **CA05** Sem `trip.event-location`: nenhum dos dois traz `location`; `addressChange.displacementMeters`
  continua.
- **CA06** O corpo da resposta não contém `address_key`, logradouro, CEP, `receiverName`, `receivedBy`, `reason`,
  `requestedBy`, `objectId`, `thumbnailObjectId`, `canhotoRead*` nem URL de objeto (contrato por
  `JSON.stringify` e `not.toContain`), e um contrato estático prende que os arquivos das fontes novas não citam
  as colunas proibidas.
- **CA07** Painel antigo (sem os `kind`s novos) recebendo a API nova: a página **não** é recusada (o item é
  descartado) — contrato no painel com o validador atual.
- **CA08** Print de _Eventos desta entrega_ com os dois eventos, 1280 e 375 px, dark e light, sem transbordo
  (227 RF10), e comparado com a prancha do canvas da 227 (web.md §15).

## Decisões do usuário

- **D11 — Só correção humana (N1, respondida pelo usuário em 2026-10-02: "Só correção humana (Recomendado)").**
  O evento do endereço é **"Endereço da parada corrigido"**, `kind` `stop.address_corrected`, derivado de
  `geocoded_address_corrections` (contratante, motorista, escritório) e de `geocoding_refinement_requests` com
  `outcome = 'refined'` (refino de precisão **pedido por uma pessoa** no painel, spec 069). A geocodificação
  feita pelo sistema sozinho — primeira geocodificação, refino automático da ADR-0062, rotina de população —
  **não** vira evento: não deixa rastro por empresa nem por parada (`geocoded_addresses` é global e o
  `geocoded_at` é sobrescrito), e mostrá-la exigiria tabela e migration. **Esta spec não tem migration.**
  Razão registrada: para quem investiga uma entrega, o que importa é "o ponto mudou e por quem"; a primeira
  geocodificação quase sempre é anterior à viagem (o endereço é reaproveitado entre viagens e empresas, ADR-0044
  §3).
- **D12 — Ressalva sobre a 227 D12: a foto do canhoto é evento derivado.** O usuário escolheu "Cria os dois
  eventos" (227 N5) **contra** a recomendação "derivar a foto da leitura do comprovante, sem evento novo". A 228
  D1 **entrega** o evento — `document.canhoto_photo` existe na linha do tempo e em _Eventos desta entrega_, com
  ordem, ponto e permissão próprios —, mas **sem tabela nova**: ele é lido de `trip_delivery_proofs`, que já é o
  fato. Isso **não** é pergunta bloqueante; é ponto a **confirmar com o usuário na T6.1 da 227**, junto dos prints.
  Se ele quiser a cópia em `trip_stop_events`, é outra spec (com migration).

Nenhum `[NEEDS CLARIFICATION]` aberto.

## Riscos

1. **Duplicar a 195.** Mitigado pela D4: a 228 lê o **efeito** (`geocoded_address_corrections`), a 195 grava o
   **relato** (`stop.occurrence`). Contrato de paridade dos `kind`s do painel prende o vocabulário.
2. **Keyset com fonte de instante calculado** (`coalesce`) — sem índice dedicado; a consulta é escopada por
   viagem (poucas linhas), como as fontes atuais. Medir com `EXPLAIN` na integração, não supor: tabelas de teste
   minúsculas fazem Seq Scan de qualquer jeito, então a evidência usa `SET LOCAL enable_seqscan = off` dentro de
   transação. **Pressão no pool**: o risco não é uma
   requisição, é a soma delas. Nove consultas (dez também) cabem em `DATABASE_POOL_MAX=10`; o que esgota é a
   concorrência **entre** requisições — a linha do tempo da viagem e "Eventos desta entrega" abrem juntas 18
   consultas, e o prazo de 8 s (`DATABASE_QUERY_TIMEOUT_MS`) conta desde a fila, então a consulta que não pega
   conexão a tempo vira 503. Por isso o endereço é **uma** consulta (`union all`), não duas.
   O refino não tem índice por `address_key`: se pesar em volume real, a saída é migration (índice
   `(company_id, address_key)`) — **parar e perguntar**, não criar.
3. **Ordem de publicação** — resolvida pelo descarte de `kind` desconhecido (D8); o contrato CA07 a prende.
4. **Permissão** — a fonte do endereço é tabela **fora** da lista fechada de leitores; o recorte do caso de uso
   é genérico, mas um contrato específico prova que o `kind` novo também é recortado.
