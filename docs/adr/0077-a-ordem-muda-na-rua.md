# ADR-0077 — A ordem muda na rua

- **Status:** proposta (2026-09-25; revisada no mesmo dia após a crítica). Passa a `aceita` na T0.1
  da spec 192, conferida contra o código.
- **Data:** 2026-09-25
- **Decisores:**
  - usuário, em 2026-09-25: "o motorista muda a ordem, com aviso da carga";
  - orquestrador, na revisão do `critic`: divisão em 192 (núcleo), 200 (mapa da carga na app), 201
    (painel) e 202 (sugestão com posição, ADR-0084);
  - o desenho é desta ADR.
- **Spec:** `specs/192-o-motorista-muda-a-ordem/`
- **Revisa:**
  - ADR-0043 §2: a ordem das paradas **não concluídas** deixa de congelar no despacho, mas só para
    quem dirige. O snapshot do despacho continua imutável, e "nenhuma nota entra, nenhuma nota sai"
    segue valendo;
  - ADR-0059 §4: o guia continua sem decidir ordem. Quem decide passa a ser o motorista, por ação
    explícita e fora do guia;
  - spec 082 RF-3.4, e o fora de escopo da 057 ("alteração da ordem das paradas pelo motorista");
  - spec 153, fora de escopo "recalcular rota depois do despacho": passa a recalcular, só por esta
    porta;
  - ADR-0063: depois do despacho, a planta deixa de recalcular e fica fixada **por cópia**.
- **Aplica sem revisar:**
  - ADR-0045: rota `/me` sem id de viagem, sem permissão nova;
  - ADR-0068: canal e autoria. A ordem de trava segue o costume do código: linhas filhas antes de
    `trips`;
  - ADR-0049 §5 e spec 177: a previsão acompanha a rota, o realizado não;
  - spec 079 T024: número velho nunca ao lado de ordem nova;
  - ADR-0081: o toque de salvar carimba a posição.

## Contexto

Hoje só o escritório reordena, e só antes do despacho. A rota `PATCH /trips/:id/stops/order`
(`trip.routes.ts:1645-1660`, `trip.manage`) recusa viagem despachada
(`reorder-trip-stops.use-case.ts:59-60` → `trip-state.policy.ts:128-134`).

O motorista já entrega fora de ordem. A API desloca o ETA pelo recorte `arrived_at is null` justamente
porque "o motorista pula parada e volta" (`drizzle-driver-field-report.repository.ts:277`). Mas a ordem
que o escritório vê, o ETA do portal e a conta prevista continuam descrevendo o plano da véspera.

A ADR-0043 §2 congelou a ordem para que "o roteiro que o motorista levou" fosse o que se cobra dele.
Esse argumento continua certo sobre **guardar** o roteiro despachado e está errado sobre **proibir** a
mudança. Quem vê a rua fechada, a loja que só abre às 14 h ou o cliente ausente é o motorista.
Proibir não impede que a ordem mude; só faz a mudança ficar invisível.

O que o código torna perigoso, medido em 25/09/2026:

1. **A carga está arrumada para a ordem antiga.** A planta enche o baú da testeira para a porta, com a
   última entrega no fundo (spec 114 D1). Ela proíbe "entrega mais tardia em cima de uma mais cedo, ou
   entre ela e a porta" (114 D4).
2. **A planta recalcula pelo hash, e o hash inclui a sequência** (`cargo-layout-hash.policy.ts:55`).
   O detalhe da viagem lê a planta pelo hash atual, sem olhar status
   (`drizzle-trip.repository.ts:1251-1259`). Além disso, a linha de `trip_cargo_layouts` é
   compartilhada e mutável:
   - a unique é `(company_id, input_hash)` e `trip_id` pode ser nulo (`trip-cargo-layout.schema.ts:41`,
     :73);
   - o upsert reabre a linha (`cargo-layout-request.support.ts:144-156`);
   - o expurgo do worker apaga as linhas sem viagem
     (`drizzle-trip-cargo-layout-purge.repository.ts:19-37`).
3. **O recongelamento de rota apaga em vez de manter.** Com OSRM `unavailable`,
   `freezeTripPlannedRoute` grava rota nula (`freeze-trip-planned-route.use-case.ts:127-132`, :148). O
   `writePlannedRoute` põe `null` em distância, duração, rota e pedágio
   (`drizzle-trip-planned-route.repository.ts:85-111`), fora da transação (`this.database`). O reorder
   chama o congelador sem escolha, então o critério cai em `cheapest` (`main.ts:1921-1943`;
   `freeze-trip-planned-route.use-case.ts:29`, :123) e perde o `criterion` gravado.
4. **Reordenar não deixa rastro** (`drizzle-trip-route.repository.ts:349-361`), e a trava é ingênua.
   - Chegada, entrega e despacho escrevem `trip_stops` antes de travar `trips`
     (`report-stop-arrival.use-case.ts:78-98`; `drizzle-driver-field-report.repository.ts:417-470`;
     `drizzle-trip-route.repository.ts:819-821` × :481-486).
   - Uma reordenação que trave `trips` primeiro e depois atualize todas as paradas faz deadlock com a
     drenagem da fila.

## Decisão

### 1. Quem reordena, e o quê

- Podem reordenar `driver` e `aggregate`, com a permissão que já têm (`trip.report`, ADR-0045).
  **Nenhuma permissão é criada**, e nenhum dos dois ganha `trip.manage`.
- Só a **própria** viagem, pelo vínculo `trip_drivers` e pelo filtro `field-trip-target.query.ts:19-23`.
- Só em `dispatched`, `in_transit` ou `on_delivery_route` (`TRIP_ON_ROAD_STATUSES`,
  `trip-state.policy.ts:114-118`). Antes do despacho, a ordem é do escritório.
- Entram as paradas **não concluídas** (`completed_at is null`), **inclusive aquela em que ele já
  chegou**. É o caso "cliente ausente, volto depois", que o recorte por `arrived_at` deixaria de fora.
  - Parada concluída fica onde está.
  - A sequência final é esta: primeiro as concluídas, na ordem relativa atual; depois as não
    concluídas, na ordem nova.
- **O escritório não ganha reordenação depois do despacho.** Os dois escritores não se sobrepõem por
  estado. "Reordenar em nome do motorista" (molde da spec 156, operação `office.stop_order`) fica como
  seguimento.

### 2. A porta: `PUT /me/trips/current/stop-order`

- Não leva id de viagem (ADR-0045): **a viagem sai das paradas**. Todas as `stopIds` pertencem a uma
  única viagem vinculada ao motorista. Parada alheia devolve `404`.
- `Idempotency-Key` é obrigatória, no ledger `trip_field_reports`, operação `stop_order`
  (`trip-field-report.port.ts:33-84`).
- A mesma ordem que a atual é conferida **antes** da versão e devolve `200` sem efeito.
- O `recall` do ledger devolve o **estado atual** da ordem, no mesmo formato do `200`.
- O corpo aceita `location?`, no `locationSchema` da ADR-0081 (inteiro ou nada). É o carimbo do toque.

### 3. Trava e concorrência

- `trips.stop_order_version` sobe em **toda** escrita de ordem. A subida mora em `writeStopOrder`, por
  onde passam o escritório, o aceite de sugestão e a reentrega (164).
- **Ordem de trava: as linhas filhas antes de `trips`**, como fazem chegada, entrega e despacho. A
  transação trava `trip_stops` da viagem com `FOR UPDATE ORDER BY id` e depois `trips` com
  `FOR NO KEY UPDATE`.
- `40P01`/`40001` repete a transação até 2 vezes. Se persistir, devolve
  `409 STOP_ORDER_CONCURRENT_UPDATE` e a app recarrega. É o molde de reconferência da 164.
- Erros:
  - versão diferente: `409 STOP_ORDER_VERSION_CONFLICT`;
  - conjunto diferente (ele concluiu uma parada, ou o escritório deu baixa por ele, 156):
    `422 TRIP_STOP_SET_MISMATCH`.
- A versão vai no corpo, não em `If-Match`, porque é o precedente das specs 004, 047 e 088.

### 4. Duas fases: a ordem é atômica, a rota vem depois

- **Transação curta, sob a trava:** ordem, versão e evento em `trip_stop_order_events`. Nada de OSRM
  sob trava.
- **Fora da trava:**
  - a rota é recalculada;
  - o ETA também;
  - `distance_from_previous_meters` e `duration_from_previous_seconds` são gravados. Hoje ninguém grava
    esses campos (`trip.schema.ts:575-576`).
- Cada escrita dessa fase é compare-and-set por `stop_order_version`: **a rota de uma versão velha
  nunca sobrescreve a da nova**.
- O desfecho vai numa linha filha append-only, `trip_stop_order_outcomes`, com um destes valores:
  - `recomputed`;
  - `kept_previous` (OSRM fora);
  - `superseded` (outra versão chegou antes).
- `trip_dispatch_snapshots` segue append-only e é "o roteiro que ele levou".

### 5. Rota e conta: a previsão acompanha

- O congelador ganha o modo `keepPreviousOnUnavailable`. Com OSRM fora, devolve `routeFrozen: false` e
  **não escreve**. Depois do despacho, a previsão não se apaga.
- O recálculo **reproduz o critério gravado** (`planned_route.criterion`: `cheapest`, `fastest`,
  `no_toll` ou `alternative`, `route-choice.policy.ts:29`).
  - Critério que não existe mais na resposta (uma `alternative` que sumiu) cai em `cheapest`.
  - O desfecho registra `choiceReproduced`.
- Usa o pino atual de `geocoded_addresses`, inclusive um corrigido pela 195 depois do despacho: a
  reordenação é uma escrita nova, e a ADR-0080 §4 só impede que o **aplicar** refaça a rota sozinho.
- A conta de viagem aberta é previsão (ADR-0049 §5; 177: "a previsão acompanha; o realizado, não").
- O desfecho guarda distância e pedágio de antes e de depois.
- **Sem rota nova, a distância nova é nula**, nunca a velha ao lado da ordem nova (079 T024).

### 6. ETA

- Com rota nova, o ETA das não concluídas é calculado a partir de agora:
  - a origem é a última parada concluída, ou o depósito;
  - soma as pernas da rota;
  - soma o tempo de parada (`routing/domain/service-time.policy.ts`).
- Na mesma escrita, `trips.eta_departure_at` e `estimated_arrival_frozen_at` passam a **agora**. A
  âncora fica coerente com os ETAs novos (spec 107 D3/109 D2).
- Sem rota nova, o ETA das não concluídas fica **nulo** e o portal mostra "sem previsão".
- O deslocamento por atraso na chegada (109 D3) continua valendo por cima.

### 7. A planta fica fixada por cópia

- No despacho, a última planta `ready` da viagem é **copiada** para `trip_loaded_cargo_layouts`. Vale
  para todas as portas: cabeçalho do escritório, `POST /me/trips/current/dispatch` e o automático da
  ADR-0074. A cópia leva:
  - o jsonb inteiro;
  - o mapa `sequência → stopId`;
  - o `source_layout_id`, **sem FK**, porque a linha de origem é compartilhada, reabre e pode ser
    expurgada.
- Planta `queued`/`running` no despacho é fixada **pelo worker** quando ficar `ready`, se a viagem
  ainda não tiver cópia e o hash for o do despacho.
- Viagem despachada antes desta ADR é fixada na primeira reordenação, antes de a sequência mudar
  (`pinned_by = first_reorder`).
- O despacho forçado libera notas e apaga paradas vazias (`drizzle-trip-route.repository.ts:753-823`).
  A leitura da cópia **filtra as caixas das notas liberadas**, pelo `documentId` do `PlacedBox`.
- Depois do despacho a planta não recalcula: nem pelo gatilho eager (ADR-0063 D7), nem pelo lazy do
  detalhe. As leituras devolvem a cópia com as sequências remapeadas para a ordem atual.
- Os motivos das caixas (`overEarlierDelivery`, `needsRehandling`, 148 D5/120) ficam **como estavam no
  carregamento**. A tela diz "marcas da ordem do carregamento". O bloqueio de agora sai do §8, não
  delas.

### 8. O aviso da carga: matriz na fixação, conta barata na leitura

- **Na fixação**, uma função pura (`unload-blocking.policy.ts`) calcula a matriz esparsa **nota ×
  nota**. Uma caixa da nota B **cobre** uma caixa da nota A quando:
  - (a) está em cima dela, com sobreposição no piso e base na altura do topo; ou
  - (b) está entre ela e a porta: mais perto da porta, sobrepondo na largura e na altura.
- O acesso à carga muda a regra:
  - `open`: nada cobre (085 R5);
  - `rear_and_side` com a parada `sideReachable`: só vale (a).
- Caixa sem `documentId` usa a parada como chave.
- É a regra da 114 D4, declarada e conservadora, **não** a simulação da 118.
- **Na leitura**, A está bloqueada por B quando todas estas condições valem:
  - B cobre A;
  - A ainda precisa sair numa parada, ou seja, a nota não está entregue nem devolvida;
  - B ainda está no baú, ou seja, não foi entregue nem liberada;
  - B sai depois de A, pela ordem. **Nota devolvida sai no depósito**: a caixa continua no baú até o
    fim.
- A conta é O(pares) por leitura. A app refaz o `GET` a cada 30 s (`useDriverTrip.hook.ts:73`, :235),
  e o alvo é p95 ≤ 50 ms.
- A leitura separa dois tipos de bloqueio:
  - `fromLoading`: o que já vinha na ordem do despacho;
  - `fromOrderChange`: o que a ordem atual acrescentou.
- O aviso do `PUT` é só o que a ordem **nova acrescenta sobre a atual**. Bloqueio pré-existente (os
  116/421 pares `needsRehandling` medidos na 120) não é culpa da mudança.
- Bloqueio novo sem confirmação devolve `409 STOP_ORDER_BLOCKS_CARGO`, com a lista. O reenvio leva
  `acknowledgedBlockedStopIds` igual ao conjunto calculado; conjunto diferente dá `409` de novo. A
  confirmação vai para o evento.
- Sem planta fixada, não há aviso, e a tela diz "sem planta para conferir a carga".
- A app **não** calcula bloqueio.

### 9. Rastro e carimbo

- Toda escrita de ordem grava `trip_stop_order_events`: ator, canal, `source` e ordem anterior e
  nova. Os valores de `source` são:
  - `manual`;
  - `order_suggestion` (202);
  - `route_suggestion` (aceite no painel);
  - `redelivery` (164).
- O adaptador `createTripStopOrderWriter` (`trip-stop-order.adapter.ts:18-22`) passa a carregar o
  ator.
- O canal é `driver_app` na app e `backoffice` no painel (ADR-0068 §3), com CHECK próprio.
- A tabela nasce com as cinco colunas de posição da ADR-0081, `channel` e os CHECKs dela. O trigger
  append-only **permite só** o `UPDATE` do expurgo: posição para `NULL` e `location_state`
  `captured → expired`.
- A linha do tempo ganha `trip.stops_reordered`.

### 10. Sem rede, não reordena

- O arraste exige rede. O botão também fica desligado enquanto a fila tem item drenável
  (`getDrainable() > 0`), porque uma chegada na fila mudaria o conjunto por baixo da ordem.
- Entregar fora de ordem continua possível sem rede.
- Enfileirar a ordem foi descartado:
  - o aviso depende do servidor;
  - a versão envelheceria;
  - a ordem não tem efeito de campo, só de plano.

### 11. O que não muda

- **MDF-e.** `infMunDescarga` é por município, na ordem dos documentos (`mdfe-payload.builder.ts:125-146`);
  não há `infPercurso`; o DAMDFE não mostra parada (`damdfe.types.ts:5`). O manifesto autorizado não
  é tocado. Esta ADR não cria regra fiscal.
- **Portal.** Não expõe ordem (`contractor-delivery.query.ts:24-94`). O ETA dele acompanha pelo §6.
- **Romaneio impresso e planta impressa.** Mostram "Parada N" com a sequência de quando foram
  impressos (`DriverLoadSheet.component.tsx:98`; `TripCargoLayers.component.tsx:353`). Papel
  impresso antes da mudança diverge da tela, e a divergência é aceita e registrada.
- **O guia (ADR-0059).** Segue a ordem atual.

## Alternativas rejeitadas

- **Manter a proibição.** O motorista já pula parada. Proibir só esconde a mudança.
- **Pedido que o escritório aprova.** Traz latência justo quando ele está parado na rua.
- **Bloquear a mudança quando a carga fica presa.** Vai contra a decisão do usuário ("com aviso").
- **Recalcular a planta depois do despacho.** Descreve um carregamento que não aconteceu.
- **FK para a linha da planta.** A linha é compartilhada, reabre e é expurgada. Por isso a cópia.
- **Calcular o bloqueio na app.** Seria uma segunda implementação, que diverge em silêncio.
- **Cache do bloqueio por `(layoutId, versão)`.** Uma parada concluída muda o bloqueio sem mudar a
  versão. Por isso a matriz por nota.
- **Tudo numa transação só, com OSRM dentro.** Seria trava longa sob rede externa.
- **Travar `trips` primeiro.** Deadlock com a drenagem, que escreve paradas antes.
- **Enfileirar a ordem sem rede.** Ver §10.
- **`If-Match`/ETag.** Não há precedente para viagem.

## Consequências

- A ordem atual pode divergir da despachada. O painel mostra a atual, e a linha do tempo conta a
  diferença.
- "Parada N" de parada concluída pode mudar de rótulo quando ele pulou parada.
- A conta prevista de uma viagem na rua muda sem o escritório tocar nela. O desfecho diz quanto mudou
  e por quê.
- O painel precisa tolerar chave e tipo novos **antes** de a API emiti-los (spec 078 D2). É o
  primeiro push da 192.
- A 198 (RF9) pode ler "a rota é da ordem anterior" direto do desfecho `kept_previous`, sem comparar
  horários.

## Seguimentos

- Reordenar em nome do motorista (escritório, `office.stop_order`).
- Aviso no sino quando a ordem muda na rua.
- Trocar a regra do §8 pela simulação da 118, se o `cargo-placement` passar a exportá-la.
- Sugerir ao motorista mover a parada quando a reentrega (164) é autorizada em viagem despachada.
