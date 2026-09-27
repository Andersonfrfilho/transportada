# Feature 192 — O motorista muda a ordem

Decisão do usuário (2026-09-25): **"o motorista muda a ordem, com aviso da carga"**. Revisada depois
da crítica (opus) no mesmo dia. Esta é a spec do **núcleo**:

- dados, trava, versão, evento e planta fixada;
- aviso de carga e o `PUT`;
- a linha do tempo no painel;
- o modo de ordem na app.

O resto saiu para specs irmãs:

- **200** — mapa da carga na app do motorista;
- **201** — teclado no arraste do painel e o aceite da sugestão que perde a ordem;
- **202** — "Sugerir ordem" com a posição do motorista (ADR-0084).

Desenho na **ADR-0077**.

## Problema e resultado

Medido no código em 25/09/2026:

1. **Reordenar é só do escritório, e só antes do despacho.**
   - A rota é `PATCH /trips/:id/stops/order` (`trip.routes.ts:1645-1660`, `trip.manage`; corpo
     `{ stopIds }` `.strict()`, `trip-request.schema.ts:209-214`; cliente em
     `tripClient.service.ts:1258-1265`).
   - A viagem despachada é recusada (`reorder-trip-stops.use-case.ts:59-60` →
     `trip-state.policy.ts:128-134`).
   - O conjunto de paradas tem de ser o mesmo, senão `422 TRIP_STOP_SET_MISMATCH` (:62-68).
2. **Quatro decisões proíbem o motorista de reordenar:**
   - ADR-0043 §2 (`0043:67-72`);
   - ADR-0059 §4 (`0059:53-57`, :78);
   - spec 082 RF-3.4 (`spec.md:71`, :146-148);
   - spec 057, fora de escopo (`spec.md:23`).
3. **O motorista já entrega fora de ordem.** O ETA desloca pelo recorte `arrived_at is null`, porque "o
   motorista pula parada e volta" (`drizzle-driver-field-report.repository.ts:277`). A ordem, o ETA do
   portal e a conta prevista continuam no plano da véspera.
4. **Reordenar não deixa rastro, e a trava é ingênua.**
   - `reorderStops` (`drizzle-trip-route.repository.ts:349-361`) só escreve a sequência.
   - As precondições são lidas fora da transação (:329-346).
   - Chegada, entrega e despacho escrevem `trip_stops` antes de travar `trips`
     (`report-stop-arrival.use-case.ts:78-98`; `drizzle-driver-field-report.repository.ts:417-470`).
     Uma reordenação que trave na ordem inversa faz deadlock com a drenagem da fila.
5. **O recongelamento apaga e perde a escolha.**
   - Com OSRM `unavailable`, a rota vira nula (`freeze-trip-planned-route.use-case.ts:127-132`, :148).
   - `writePlannedRoute` põe `null` em distância, rota e pedágio, fora da transação
     (`drizzle-trip-planned-route.repository.ts:85-111`).
   - O reorder cai em `cheapest` e ignora o `criterion` gravado (`main.ts:1921-1943`).
   - Falha é engolida (`reorder-trip-stops.use-case.ts:76-81`).
   - O ETA não muda com a ordem (`trip.schema.ts:573`).
   - `distance_from_previous_meters`/`duration_from_previous_seconds` nunca são gravadas (:575-576).
6. **A planta recalcularia de um carregamento que não aconteceu.**
   - O hash inclui a sequência (`cargo-layout-hash.policy.ts:55`).
   - O detalhe lê pelo hash atual, sem olhar status (`drizzle-trip.repository.ts:1251-1259`).
   - A linha é compartilhada, reabre e é expurgada (`trip-cargo-layout.schema.ts:41`, :73;
     `cargo-layout-request.support.ts:144-156`; `drizzle-trip-cargo-layout-purge.repository.ts:19-37`).
   - O despacho forçado libera notas e apaga paradas (`drizzle-trip-route.repository.ts:753-823`).
   - Não existe função que confira uma planta pronta contra outra ordem.
7. **O painel quebra com chave ou tipo novo** (spec 078 D2).
   - O detalhe usa `hasKeys` com `allowed` fechado (`tripResponse.validation.ts:386-393`; aviso em
     `trip.constant.ts:259-263`; `TRIP_DETAIL_OPTIONAL_KEYS` em :300).
   - O item da linha do tempo usa `hasExactKeys` (`tripResponse.validation.ts:1276-1277`; chaves em
     `trip.constant.ts:418-433`).
   - Tipo desconhecido recusa a lista inteira (:898-906, :1285).
   - A resposta do `PATCH` é tolerante (`reorderTripStopsResultFromApi`, :790-792) e não muda.
8. **A app do motorista não reordena.** Ela usa a ordem do array (`DriverTripWorkspace.page.tsx:543-544`)
   e não tem `@dnd-kit` nem diálogo. O `DriverStopCard.component.tsx` tem 798 linhas, e "Não entreguei"
   já existe (`55ed0986e`, spec 179 T302).

**Resultado:**

- Na app do motorista, "Mudar ordem" abre as paradas não concluídas. Dá para mover arrastando pela
  alça, pelos botões ↑/↓ ou pelo teclado.
- Antes de gravar, a app avisa se a ordem nova deixa carga de uma parada debaixo ou atrás da carga de
  uma posterior, e diz quais. O motorista pode confirmar mesmo assim.
- O escritório vê a mudança na linha do tempo:
  - quem mudou, quando e por qual canal;
  - de qual ordem para qual;
  - o que a carga bloqueou;
  - quanto a rota prevista mudou.
- A rota, a conta prevista e o ETA acompanham a ordem nova, e a planta fica fixada no carregamento.

## Decisões

Uma linha cada. O detalhe está na ADR-0077.

- **D1 — Quem reordena.** `driver`/`aggregate` com `trip.report`, só na própria viagem, só em
  `dispatched`/`in_transit`/`on_delivery_route`, e só paradas **não concluídas** (inclui a que tem
  chegada: "cliente ausente, volto depois").
- **D2 — O escritório.** Segue reordenando só antes do despacho. "Em nome do motorista" é seguimento.
  _(Decisão do planejador, mostrada ao usuário.)_
- **D3 — A porta.** `PUT /me/trips/current/stop-order`:
  - a viagem sai das paradas;
  - `Idempotency-Key` no ledger;
  - `expectedStopOrderVersion`;
  - `location?` (ADR-0081).
- **D4 — Sequência final.** Primeiro as concluídas, na ordem relativa atual; depois as não concluídas,
  na ordem nova.
- **D5 — Trava.** `trip_stops ... FOR UPDATE ORDER BY id`, depois `trips ... FOR NO KEY UPDATE`.
  `40P01`/`40001` repete a transação duas vezes e depois devolve `409`.
- **D6 — Duas fases.** Ordem, versão e evento vão na transação curta. Rota, ETA e pernas vão fora,
  com compare-and-set por versão, e o desfecho fica em linha filha.
- **D7 — Rota.** O congelador ganha `keepPreviousOnUnavailable`, reproduz o `criterion` e registra
  `choiceReproduced`. Sem rota nova, a distância nova é nula.
- **D8 — ETA.** Recalculado a partir de agora, e a âncora `eta_departure_at` é regravada. Sem rota
  nova, o ETA fica nulo.
- **D9 — Planta.** Cópia fixada no despacho (ou pelo worker, quando ficar `ready`, ou na primeira
  reordenação). A cópia filtra as notas liberadas e nunca recalcula depois do despacho.
- **D10 — Aviso.** A matriz nota × nota é calculada na fixação, e a leitura faz O(pares). Nota
  devolvida sai no depósito. O aviso cobre só o que a ordem nova acrescenta; sem confirmação exata,
  `409`.
- **D11 — Rastro.** Toda escrita de ordem grava evento, com `source`, ator e canal, e carrega o carimbo
  da ADR-0081. Tipo novo na linha do tempo: `trip.stops_reordered`.
- **D12 — Sem rede, não reordena.** O botão também fica desligado com fila drenável. _(Decisão do
  planejador, mostrada ao usuário.)_
- **D13 — MDF-e, portal e papel.** O MDF-e e o portal não mudam. A divergência com o romaneio e a
  planta já impressos é registrada.
- **D14 — Deploy.** O painel passa a tolerar a chave e o tipo novos **antes** de a API emiti-los.

## Interseções

Specs escritas no mesmo dia por outras sessões. Quem chega depois ao `origin/staging` acrescenta o
que falta.

| Spec                                       | Onde toca a 192                                                                                                                                                                                                                                               | Regra                                                                                                                                                                                                                                                                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **196** / ADR-0081 (carimbo de posição)    | `trip_stop_order_events` leva as colunas de posição, `channel`, os CHECKs e o índice parcial; o trigger append-only libera o `UPDATE` do expurgo; `PUT` aceita `location?`; o item `trip.stops_reordered` leva `location`/`locationState`.                    | Se a 196 já estiver em staging, a T1.1 põe a tabela em `TRIP_LOCATION_STAMPED_TABLES` e copia o redator no worker. Se não estiver, a 192 cria as colunas e a 196 põe a tabela na lista dela. O `PUT` é `PUT`, e o inventário da 196 só varre `POST`; o contrato da 192 cobre o `location`. |
| **198** / ADR-0083 (quanto falta)          | Todo congelamento grava `depot.endKind`, **inclusive o desta spec**. RF9 `isFromPreviousStopOrder`. Os mesmos arquivos do snapshot (`find-current-driver-trip.use-case.ts`, `drizzle-current-driver-trip.repository.ts`, `driverTripResponse.validation.ts`). | A 192 usa o mesmo `freezeTripPlannedRoute` (sem segundo caminho de escrita). A 198 deve ler o desfecho `kept_previous` da versão atual em vez de comparar horários; a T2.3 da 192 expõe isso. Conflito de texto no snapshot se resolve no rebase.                                          |
| **195** / ADR-0080 (endereço errado)       | Muda `geocoded_addresses` ao vivo; acrescenta `addressSuggestionStatus` ao item `stop.occurrence`; botão no `DriverStopCard`.                                                                                                                                 | A reordenação recongela com o pino atual (ADR-0077 §5). A tolerância da T0.2 cobre a chave dela também.                                                                                                                                                                                    |
| **193** / ADR-0079 (quem recebeu)          | `DriverStopCard`, `useDriverTrip`, fila offline (`proofReceiver`), `captureRegistry` (`proof-form`).                                                                                                                                                          | O editor de ordem é componente novo; no cartão, a 192 só acrescenta um selo.                                                                                                                                                                                                               |
| **197** / ADR-0082 (parada é do cliente)   | A parada vira o par (cliente, endereço): mais paradas, mesma `address_key`, pernas de 0 m.                                                                                                                                                                    | A matriz e o bloqueio são por nota e agregam por parada, sem depender de endereço. O recálculo de ETA tem de aceitar perna de 0 m. As fixtures da T1.2 incluem duas paradas no mesmo endereço.                                                                                             |
| **199** (coordenada da parada no snapshot) | `GET /me/trips/current` passa a ler `geocoded_addresses`.                                                                                                                                                                                                     | Não toca ordem; só conflito de texto no mesmo repositório.                                                                                                                                                                                                                                 |
| **200**, **201**, **202**                  | Irmãs desta.                                                                                                                                                                                                                                                  | A 200 e a 202 dependem da 192 em staging. A 201 é independente, menos a T3 (versão).                                                                                                                                                                                                       |

**Ordem de publicação proposta:**

1. 196 (API → apps).
2. **192 T0.2** — tolerância no painel, que serve às 193, 195, 196 e 198.
3. **192 API** (Fases 1–2).
4. 198 (API → app).
5. 195.
6. **192 app** (Fase 3, depois do preview).
7. 202, depois 200.

- A 193 corre em paralelo, na cadeia da 194.
- A 197 e a 199 são independentes. Se a 197 subir antes da T1.2, as fixtures já a refletem.
- A 201 sobe quando estiver pronta; a T3 dela só depois da 192 API.

## Fora do escopo

- Mapa da carga na app (spec 200).
- "Sugerir ordem" e a posição do motorista (spec 202).
- Teclado no `TripStopList` e aceite da sugestão com ordem (spec 201).
- Reordenar em nome do motorista pelo escritório depois do despacho.
- Notificação no sino.
- Enfileirar a ordem sem rede.
- Recalcular ou redesenhar a planta depois do despacho.
- Usar a simulação da 118 no aviso.
- Reemitir ou encerrar MDF-e.
- Expor a ordem no portal.
- A reentrega (164) recalcular rota e ETA. O CA7 da 164 promete isso e o código não faz; fica
  registrado.

## Histórias priorizadas

### P1 — Mudar a ordem na rua

**Given** a viagem `in_transit` com 4 paradas não concluídas **When** o motorista abre "Mudar ordem",
move a Parada 4 para o topo e salva **Then**:

- a ordem nova vale para ele e para o escritório;
- a rota prevista e o ETA são recalculados;
- a linha do tempo registra a mudança "pelo motorista (aplicativo)".

### P2 — Aviso da carga

**Given** a planta fixada põe a carga da Parada 4 na frente da carga da 2 **When** ele leva a 4 para
depois da 2 e salva **Then** a app lista "Parada 2 — N caixas atrás ou embaixo da carga da Parada 4".
Ele pode voltar ou confirmar, e a confirmação fica no evento.

### P3 — Cliente ausente, volto depois

**Given** ele chegou na Parada 2 e o cliente não está **When** move a 2 para o fim **Then** a ordem
grava, mesmo com `arrived_at` preenchido.

### P4 — Sem rede

**Given** sem rede, ou com chegada na fila **When** ele olha as paradas **Then** "Mudar ordem" fica
desabilitado e diz por quê, e ele entrega em qualquer ordem.

## Requisitos funcionais

### API

- **RF1 — `PUT /me/trips/current/stop-order`.**
  - Permissão `trip.report`; `Idempotency-Key` obrigatória.
  - Corpo `.strict()`:
    `{ stopIds: uuid[2..200], expectedStopOrderVersion: int ≥ 0, acknowledgedBlockedStopIds?: uuid[], location?: LocationStamp | null }`.
    A lista traz as não concluídas, na ordem nova.
  - `200 { data: { tripId, stopOrderVersion, routeOutcome, stops: [{ id, sequence, estimatedArrivalAt, cargoBlockedBy }] } }`.
  - `routeOutcome` vale `recomputed`, `kept_previous` ou `superseded`.
- **RF2 — Erros.** Cada um tem código em `shared/errors/codes.ts` e classe de domínio.
  - `404 TRIP_NOT_FOUND`: parada fora de viagem vinculada, ou de duas viagens.
  - `409 STATE_TRANSITION_NOT_ALLOWED`: viagem fora da rua.
  - `422 TRIP_STOP_SET_MISMATCH`.
  - `409 STOP_ORDER_VERSION_CONFLICT { currentVersion }`.
  - `409 STOP_ORDER_BLOCKS_CARGO { blockedStops: [{ stopId, blockingStopIds, boxCount }] }`.
  - `409 STOP_ORDER_CONCURRENT_UPDATE`.
  - `409 TRIP_FIELD_REPORT_KEY_REUSED`, que já existe.
  - `400` para formato inválido.
- **RF3 — Ordem das checagens.** Posse, estado, conjunto, **mesma ordem**, versão e bloqueio.
  - Mesma ordem que a atual: `200` com o estado atual, sem evento e sem versão nova.
  - O `recall` do ledger devolve sempre o estado atual da ordem, no formato do `200`.
  - Erro não consome a chave.
- **RF4 — Trava e repetição.** Conforme D5. Cobre a chegada, a entrega da fila e a baixa da 156.
- **RF5 — Toda escrita de ordem sobe `stop_order_version` e grava evento.**
  - Vale para o escritório, o aceite de sugestão e a reentrega. O adaptador
    `createTripStopOrderWriter` passa a levar o ator.
  - O `PATCH` do escritório aceita `expectedStopOrderVersion?`, com a mesma trava.
  - `GET /trips/:id` e `GET /me/trips/current` devolvem `stopOrderVersion`.
- **RF6 — Fase 2 (fora da trava), em compare-and-set por versão:**
  - rota pelo congelador com `keepPreviousOnUnavailable` e o `criterion` reproduzido;
  - ETA das não concluídas;
  - âncora `eta_departure_at`/`estimated_arrival_frozen_at` em agora;
  - `distance_from_previous_meters`/`duration_from_previous_seconds` pelas pernas.
  - O desfecho vai em `trip_stop_order_outcomes`, com distância e pedágio antes e depois e
    `choiceReproduced`.
  - Versão já superada: `superseded`, sem escrita.
  - OSRM fora: `kept_previous`, ETA nulo e log `warn` sem PII.
- **RF7 — Planta fixada por cópia.** Conforme D9.
  - Depois do despacho, nenhum gatilho enfileira planta nova para a viagem.
  - `GET /trips/:id` devolve a cópia filtrada e remapeada: `stopSequence`, `rows[].sequence` e
    `coversStops`.
- **RF8 — `GET /me/trips/current`**, com campos aditivos.
  - Por viagem: `stopOrderVersion`, `canReorderStops` e `hasLoadedCargoPlan`.
  - Por parada: `cargoBlockedBy: { fromOrderChange: stopId[], fromLoading: stopId[] }`.
- **RF9 — Linha do tempo: `trip.stops_reordered`.**
  - Ator, canal, `source`, `stopOrder: { previous: [{ id, label }], next: [...] }` e os bloqueios
    confirmados.
  - Desfecho da rota: distância e pedágio, antes e depois, em decimal como string; `choiceReproduced`.
  - `location`/`locationState` da ADR-0081, quando ela estiver em staging.
  - O item leva **todas** as chaves comuns do `TripTimelineItem` (`trip-timeline.types.ts:79-101`),
    mais `stopOrder`, que é `null` nos outros tipos.

### Painel

- **RF10 — Tolerância (T0.2, primeiro push):**
  - `stopOrderVersion` entra em `TRIP_DETAIL_OPTIONAL_KEYS`;
  - o item de tipo conhecido **exige as chaves obrigatórias e ignora as extras** (troca
    `hasExactKeys` por `hasKeys`);
  - item de tipo desconhecido é descartado, e a lista sobrevive.
- **RF11 — Linha do tempo.**
  - Título "Ordem das paradas mudou".
  - Autoria por `resolveFieldAuthorshipText`.
  - Detalhe com "de → para", bloqueios confirmados e a diferença de distância e pedágio, com as cores
    `--color-ready`/`--color-alert`.
  - "Rota não recalculada" no `kept_previous`.
- **RF12 — Planta fixada no painel.** Mostra "marcas da ordem do carregamento" quando a viagem tem
  cópia e a ordem já mudou.

### App do motorista

- **RF13 — "Mudar ordem".**
  - Aparece com `canReorderStops`, com rede e com `getDrainable() === 0`.
  - O modo de ordem mostra as concluídas fixas no topo e as não concluídas com alça, ↑/↓ (≥ 44 px) e
    teclado (`KeyboardSensor` + `sortableKeyboardCoordinates`), com anúncios traduzidos.
  - O rascunho é local até "Salvar ordem".
- **RF14 — `'stop-order'` no `captureRegistry`.**
- **RF15 — Salvar.**
  - `PUT` direto, fora da fila, com chave e `location?` (a leitura pontual da ADR-0081, se ela estiver
    em staging).
  - No `409 STOP_ORDER_BLOCKS_CARGO` abre o aviso:
    - `role="alertdialog"`, foco preso, `Esc` volta;
    - uma linha por parada bloqueada;
    - a nota "conforme a planta do carregamento";
    - os botões "Voltar e ajustar" e "Mudar mesmo assim".
  - Confirmar reenvia com a lista e **uma chave nova**.
- **RF16 — Versão, conjunto ou concorrência.** Descarta o rascunho, recarrega e diz "A viagem mudou
  enquanto você arrumava. Confira a ordem de novo."
- **RF17 — Sem rede ou com fila drenável.** O botão fica desabilitado, com o motivo e a lembrança de
  que dá para entregar em qualquer ordem.
- **RF18 — Selo "Carga atrás da Parada N".** Aparece quando `cargoBlockedBy.fromOrderChange` não está
  vazio. É legível sem rede, pelo snapshot.

## Requisitos não funcionais

- O `GET /me/trips/current` com planta fixada de ~1.400 caixas tem **p95 ≤ 50 ms** a mais na
  integração.
- O painel aceita as chaves e os tipos novos antes de a API emiti-los (spec 078 D2).
- Nenhuma coordenada, rótulo de parada ou nome de cliente vai para o log.
- O teste com banco do worker roda por `make worker-integration`, sem `describe.skip`
  (`trip-cargo-layout-purge.integration.test.ts:16-17`), e a contagem de testes executados vai para o
  `evidence.md`.

## Casos extremos e falhas

- **Chegada ou entrega da fila no meio do `PUT`.** A trava serializa as duas. Se o conjunto mudou, a
  resposta é `422`. Deadlock repete a transação e, se persistir, devolve `409`.
- **Duas versões seguidas com OSRM lento.** A fase 2 da versão velha termina `superseded` e não
  escreve.
- **Planta `queued` no despacho.** O worker fixa a planta quando ela fica `ready`. Até lá não há aviso.
- **Despacho forçado com nota deixada para trás.** As caixas dela saem da leitura da cópia.
- **Nota devolvida numa parada concluída.** A caixa continua no baú e bloqueia como se saísse no
  depósito.
- **Viagem antiga sem cópia.** A fixação acontece na primeira reordenação, com o hash atual
  (`pinned_by = first_reorder`). Pode não ser o carregamento, se a entrada mudou depois do despacho.
- **Reordenar em `dispatched` e depois "Iniciar rota".** O ETA não desloca de novo: o deslocamento
  por âncora mora no despacho (`drizzle-trip-route.repository.ts:516`, :717-751), e a âncora já é
  agora.
- **Critério `alternative` que sumiu.** Cai em `cheapest` com `choiceReproduced = false`.

## Critérios de aceite

- **CA01** — Reordenar 4 paradas em `in_transit`: sequência nova e versão +1. O escritório vê a mesma
  ordem.
- **CA02** — Parada de outra viagem, de outro motorista ou de outra empresa: `404` e nada muda.
- **CA03** — Viagem `route_planned` ou `completed`: `409 STATE_TRANSITION_NOT_ALLOWED`.
- **CA04** — Lista com parada concluída, faltando ou repetida: `422`. Parada com chegada e sem
  conclusão **entra**.
- **CA05** — Duas escritas com a mesma versão: uma recebe `409`, em integração com duas transações.
- **CA06** — **Chegada concorrente com reorder** (integração): sem 40P01 exposto, e o resultado é
  `422` ou `200`, coerente.
- **CA07** — Mesma chave de novo: mesma resposta e um evento só. Mesma ordem: `200`, sem evento e sem
  versão nova.
- **CA08** — Bloqueio novo: `409` com a lista. Com a lista exata, `200` e a confirmação no evento. Com
  lista diferente, `409` de novo. Bloqueio pré-existente não avisa.
- **CA09** — `open` não bloqueia. `rear_and_side` com `sideReachable` só bloqueia em cima. Nota
  devolvida bloqueia como depósito.
- **CA10** — Depois do despacho, reordenar não cria linha em `trip_cargo_layouts` nem na outbox, e o
  detalhe devolve a cópia remapeada.
- **CA11** — **Despacho forçado com nota deixada para trás**: a cópia não mostra as caixas dela, e a
  matriz as ignora.
- **CA12** — Planta `queued` no despacho: o worker fixa a cópia quando ela fica `ready`.
- **CA13** — **Viagem `no_toll` reordenada continua `no_toll`** (`choiceReproduced = true`). Com OSRM
  fora: rota anterior intacta, `kept_previous` e distância nova nula.
- **CA14** — **Fase 2 de versão velha nunca sobrescreve a nova** (integração: duas reordenações
  seguidas, a primeira com OSRM atrasado).
- **CA15** — ETA das não concluídas recalculado, `eta_departure_at` = agora, e o portal reflete.
  **Reordenar em `dispatched` e depois "Iniciar rota" não desloca o ETA.**
- **CA16** — Pernas `distance_from_previous_meters`/`duration_from_previous_seconds` gravadas, com
  perna de 0 m aceita.
- **CA17** — O `GET /me/trips/current` com ~1.400 caixas fica em p95 ≤ 50 ms a mais.
- **CA18** — Painel:
  - detalhe com `stopOrderVersion` passa;
  - item conhecido com chave extra passa;
  - item de tipo desconhecido é descartado e o resto aparece.
- **CA19** — Linha do tempo com "pelo motorista X (aplicativo)" e `backoffice` para o escritório.
- **CA20** — App:
  - alça, ↑/↓ e teclado produzem o mesmo rascunho;
  - concluídas não se movem;
  - alvos ≥ 44 px em 375 px.
- **CA21** — App: aviso, confirmação e "Voltar e ajustar". Versão, conjunto e concorrência descartam o
  rascunho e recarregam.
- **CA22** — App sem rede, ou com item drenável: botão desabilitado com o motivo.
- **CA23** — Prints 375 e 768 do modo de ordem, do aviso, do selo e da linha do tempo, vistos pelo
  usuário no preview local antes de staging.

## Dúvidas

Nenhuma bloqueante. D2 e D12 são decisões do planejador, já mostradas ao usuário.
