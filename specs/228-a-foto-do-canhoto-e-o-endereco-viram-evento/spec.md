# Feature 228 — A foto do canhoto e o endereço viram evento

## Problema e resultado

A spec 227 abriu a nota inteira, e a seção _Eventos desta entrega_ lê `GET /trips/:id/timeline?documentId=`
(227 T5.1/T5.3). Faltam nela dois acontecimentos que o canvas aprovado mostra e que o usuário decidiu criar
(227 D12, N5: _"Cria os dois eventos"_):

1. **"Foto do canhoto"** — o momento em que o motorista (ou o escritório, em nome dele) tirou a foto do
   canhoto, com o ponto onde estava;
2. **"Endereço da parada geocodificado"** — o momento em que a coordenada do endereço da parada mudou.

**Resultado**: os dois aparecem na linha do tempo da viagem e em _Eventos desta entrega_, na ordem certa, com a
mesma regra de posição dos outros eventos (spec 196), sem coordenada para quem não tem `trip.event-location`.

A 227 D12 estimou "tipo novo em `TRIP_STOP_EVENT_KINDS`, CHECK, migration, escrita nas rotas do motorista e no
geocodificador". A leitura do código (abaixo) mostra que a **foto do canhoto não precisa de nada disso** e
que o **endereço só precisa** se a resposta da N1 for "sim".

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
  foto vigente; o evento mostra o instante **dela**. Guardar substituições é outra spec.
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
  comprovante antigo ou de canal sem leitura do aparelho. O item diz qual foi (`location` nulo, estado
  `null`/`unavailable`) sem inventar.
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
    tempo precisa dizer por quê.
  - **O que fica de fora sem a N1**: a primeira geocodificação automática, o refino automático (ADR-0062) e o
    backfill. Eles gravam em `geocoded_addresses`, que é global, sem empresa, e cujo `geocoded_at` é
    reescrito — não há evento a derivar, e usar `geocoded_at` mostraria o instante de uma ação de **outra**
    empresa (ou de antes da viagem existir). Ver N1.
- **D5 — Um endereço corrigido aparece uma vez por viagem.** Sem filtro, se duas paradas da viagem têm a mesma
  `address_key`, o item vai com a de **menor** `sequence` (`distinct on` pelo id da correção). O keyset
  `(occurredAt, prioridade, id)` exige id único na lista: dois itens com o mesmo id e o mesmo instante fariam a
  página seguinte pular um. Com `?documentId=`, só a parada da nota (`trip_documents.stop_id`); nota sem
  parada não recebe evento de endereço.
- **D6 — Vocabulário e prioridade.** Dois `kind`s novos, acrescentados ao **fim** de `TRIP_TIMELINE_KINDS`:
  | `kind` | fonte | prioridade | por quê |
  | ----------------------- | ---------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------- |
  | `document.canhoto_photo` | `trip_delivery_proofs` (`kind = 'photo'`) | **4** | a mesma de `document.delivered`; empate exato exigiria a hora do aparelho e a do servidor no mesmo microssegundo — o `id` desempata |
  | `stop.address_corrected` | `geocoded_address_corrections` + `geocoding_refinement_requests` (`refined`) | **2** | acima de `stop.occurrence` (1): a correção é efeito do relato de endereço errado (195) — efeito acima da causa (158 D8) |
  Prioridade é `::int` e **nenhuma existente é renumerada** — cursor em voo continua válido (206 D12).
- **D7 — Posição só com `trip.event-location`, e nenhum texto de endereço.**
  - Foto: `location` é o ponto da foto, com `distanceMeters` contra o ponto vivo da parada (mesma conta de
    `trip-timeline-stop.query.ts`); `locationState` é o da foto.
  - Endereço: `location` é o **ponto novo** do endereço (`accuracyMeters = null`, `capturedAt = created_at`,
    `distanceMeters = null`); `locationState = null` ("não se aplica" — não é posição de pessoa).
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
  - `stop.address_corrected` → ícone `edit`, tom neutro, rótulo conforme N1 (ver abaixo), com a origem
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
- **CA06** O corpo da resposta não contém `address_key`, logradouro, CEP, `receiverName`, `receivedBy` nem URL
  de objeto (contrato por `JSON.stringify` e `not.toContain`).
- **CA07** Painel antigo (sem os `kind`s novos) recebendo a API nova: a página **não** é recusada (o item é
  descartado) — contrato no painel com o validador atual.
- **CA08** Print de _Eventos desta entrega_ com os dois eventos, 1280 e 375 px, dark e light, sem transbordo
  (227 RF10), e comparado com a prancha do canvas da 227 (web.md §15).

## Perguntas abertas

- **[NEEDS CLARIFICATION] N1 — "Endereço geocodificado" inclui a geocodificação automática?** Hoje só dá para
  mostrar, **sem migration**, quando **alguém desta empresa** mudou a coordenada (correção do contratante,
  motorista ou escritório; refino de precisão pedido no painel). O momento em que **o sistema** achou a
  coordenada sozinho (primeira geocodificação, refino automático da ADR-0062, rotina de população) **não
  deixa rastro por empresa nem por parada** — `geocoded_addresses` é global e o `geocoded_at` é sobrescrito.
  Mostrá-lo exige tabela nova de eventos de geocodificação por (empresa, parada), escrita no worker (sugestão
  de rota e rotina de população) e na API (geocodificação do depósito/comparação), **com migration**.
  **Pergunta**: a linha do tempo deve mostrar também quando o sistema geocodificou o endereço sozinho?
  - **Não (recomendado)** — o evento é "**Endereço da parada corrigido**" (correção e refino pedido por gente).
    Sem migration; Fases 1–3 e 5 resolvem. Para a pessoa que investiga uma entrega, o que importa é "o ponto
    mudou e por quem"; a primeira geocodificação quase sempre é anterior à viagem (o endereço é reaproveitado
    entre viagens e empresas, ADR-0044 §3) e viraria um evento repetido sem informação.
  - **Sim** — o rótulo vira "**Endereço da parada geocodificado**", e a Fase 4 (migration 🧠) entra, com a
    tabela, as escritas no worker e na API, a entrada no expurgo ou na lista de exclusões do 196 D8, e a
    decisão de o que gravar quando o endereço **já** tinha coordenada antes da parada nascer.

Nenhuma outra pergunta: D1–D10 decidem o resto com evidência.

## Riscos

1. **Duplicar a 195.** Mitigado pela D4: a 228 lê o **efeito** (`geocoded_address_corrections`), a 195 grava o
   **relato** (`stop.occurrence`). Contrato de paridade dos `kind`s do painel prende o vocabulário.
2. **Keyset com fonte de instante calculado** (`coalesce`) — sem índice dedicado; a consulta é escopada por
   viagem (poucas linhas), como as fontes atuais. Medir com `EXPLAIN` na integração, não supor.
3. **Ordem de publicação** — resolvida pelo descarte de `kind` desconhecido (D8); o contrato CA07 a prende.
4. **Permissão** — a fonte do endereço é tabela **fora** da lista fechada de leitores; o recorte do caso de uso
   é genérico, mas um contrato específico prova que o `kind` novo também é recortado.
