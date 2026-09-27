# Feature 207 — A parada mostra quanto falta e o caminho

- **Status:** rascunho, revisão 3 (2026-09-26).
  - A crítica (`opus`) reprovou a revisão 1 com 11 achados MAJOR e 14 MINOR. A revisão 2 responde a
    todos (§ Resposta à crítica, no fim).
  - A revisão 3 corrige três premissas que a **T0.1 mediu como falsas** (§ T0.1 do `evidence.md`, que
    é a fonte): o P0 do ETA é a **spec 210 e já está em staging** (a T2.8 não está bloqueada);
    `vertexCount` **não** pode sair do `nodeIdsByLeg` do gateway, porque ele deduplica; e o **CAS por
    `stop_order_version` não é possível nesta spec**, porque a coluna é da 192.
- **Pedidos do usuário (2026-09-25),** no cartão de cada parada da app do motorista:
  1. "podemos ter informações de **tempo de chegada e distância**?"
  2. "poderia adicionar um **mapa da posição local até a rota como preview**?"
  3. "precisamos de informação se o **cliente é agendado ou não** e se estamos **próximo ao horário,
     com alerta**".
- **ADR:** `docs/adr/0087-a-parada-mostra-quanto-falta-e-o-caminho.md` (proposta).
- **Numeração.** Conferida em 2026-09-25 com `git fetch`, `git log --all -- 'specs/20*'`,
  `ls specs/` e os worktrees irmãos. A 206 ("a rota começa em cada parada") já existia, e esta ficou
  com a **207**. A ADR-0087 foi reservada por arquivo antes da escrita. A 0088 é da 206, e a 0085
  está reservada para a 203.
- **Pré-requisitos:**
  - spec 199 (`cc3495272`), que já está em `origin/staging` mas não em `work/driver-app` (HEAD
    `b36b0aea1`);
  - ~~o P0 do ETA multi-veículo~~ — **satisfeito.** É a **spec 210**
    ("cada veículo parte da mesma partida"), com 4 de 4 tasks feitas e em `origin/staging`
    (`9f4ad2009`). O `clockSeconds` já é declarado dentro do laço de veículos
    (`route-optimization.effect.ts:343`). A T2.8 **não está bloqueada** (D14);
  - a **206 em `origin/staging`**, para a T1.3b e a T2.2b.

## Problema e resultado

O cartão da parada mostra hoje:

- a hora marcada com o protocolo e a janela (`DriverStopCard.component.tsx:323-336`);
- uma linha com "Cheguei às…" e uma distância (`:343-356`).

O código mostra seis lacunas.

1. **A distância vem de uma leitura só, ao abrir a tela.**
   - O `readCurrentLocation()` roda uma vez, num `useEffect([])` (`DriverTripWorkspace.page.tsx:126`,
     `:161-169`).
   - As leituras dos toques (`useDriverTrip.hook.ts:454`, `:495`, `:549`) não alimentam essa
     distância.
2. **A distância não diz o que é.**
   - O cálculo é haversine (`driverStopDistance.service.ts:18-30`), mas a tela escreve só "3,2 km"
     (`:56-57`).
   - Até a 199, ela nem aparecia: a coordenada da parada vinha sempre nula.
3. **O snapshot não traz tempo de chegada.**
   - `trip_stops.estimated_arrival_at` (`trip.schema.ts:574`) é gravado só no aceite multi-veículo
     (`drizzle-trip-route.repository.ts:225-259`).
   - Ele é deslocado no despacho (`:717-750`) e na chegada (`report-stop-arrival.use-case.ts:154-168`),
     pela regra de `eta-anchor.policy.ts:20-33`.
   - O `GET /me/trips/current` não o seleciona (`drizzle-current-driver-trip.repository.ts:661-680`).
   - Até a spec 210 ele saía **inflado** a partir do 2º veículo, porque `clockSeconds` não zerava por
     veículo. **Corrigido:** a 210 está em `origin/staging` (`9f4ad2009`) e o `clockSeconds` nasce
     dentro do laço de veículos (`route-optimization.effect.ts:343`, laço de `:330`). O número do
     escritório pode ser usado como estimativa (D14).
4. **A estrada de cada perna foi calculada e não chega à parada.**
   - O congelamento (spec 153) grava `planned_route.legs` com distância e duração por perna
     (`parse-planned-route.policy.ts:10`).
   - Grava também `points`, o traçado simplificado com tolerância de 5 m
     (`read-route-geometry.use-case.ts:57`, `:425`).
   - Não grava de que parada cada perna parte.
   - `trip_stops.distance_from_previous_meters` e `duration_from_previous_seconds`
     (`trip.schema.ts:575-576`) são **colunas mortas**: a T0.1 levantou que **ninguém as escreve**. O
     único caminho que escreve em `trip_stops` depois do planejamento é `writeEstimatedArrivals`
     (`drizzle-trip-route.repository.ts:225-260`), e ele grava **só** `estimated_arrival_at` (`:241`);
     quem tem colunas de perna escritas é `route_suggestion_stops`, pelo worker
     (`drizzle-route-optimization.repository.ts:268-269`). O próprio código já registra a morte
     (`test/integration/trip-financial-end-to-end.integration.ts:533-534`). A 192 também as declara
     como suas (RF6, `specs/192-.../spec.md:225`; CA16 `:340`), mas tem **0 de 16 tasks feitas** —
     logo é a **207 que passa a gravá-las primeiro** (D3).
5. **O motorista não sabe se o cliente exige agendamento.**
   - O snapshot traz `schedule` em qualquer status (`drizzle-current-driver-trip.repository.ts:511-540`).
   - O cartão escreve "Hora marcada: —" com `scheduledAt` nulo (`DriverStopCard:95-96`).
   - `requires_scheduling` e `diverged_at` não chegam à app.
   - O despacho trava só `pending`, `refused` e divergente, e aceita `force`
     (`unscheduled-stop.query.ts:16-17`, `:79-83`). Por isso a viagem pode estar na rua com parada
     `requested` ou forçada.
6. **Nada avisa que a hora está perto.** A hora marcada e a janela são texto solto.

**Resultado.** Três partes, todas no cartão da parada e todas funcionando sem rede.

- **A — Quanto falta.** A parada a caminho mostra:
  - "chega ~14:35 (em 25 min)", calculado no aparelho a partir da perna de estrada congelada;
  - "3,2 km em linha reta", lida **no aparelho**. A posição só é lida com a permissão já concedida,
    e nunca sai dali;
  - "trecho de 8,4 km pela estrada · ~18 min sem trânsito".

  A parada a caminho é a da 206 (`resolveEnRouteStopId`); antes dela, a atual de uma viagem que já
  saiu. As outras pendentes mostram "no plano: 15:10" quando o escritório tem ETA.

- **B — O caminho.** Um desenho do trecho até a parada, com o ponto do motorista e o pino, em SVG,
  sem tile, ao lado do "Navegar" que já existe.
- **C — Agendamento e alerta.**
  - Cada parada ganha um selo: "Com agendamento · 14:30 · protocolo 123", "Sem agendamento" ou
    "Cliente exige agendamento — ainda sem horário confirmado".
  - A parada com limite ganha um alerta visível com o cartão fechado: "atenção: chega perto do
    limite", "vai atrasar" ou "horário passou".
  - Uma faixa no topo da viagem repete o risco da parada a caminho e da seguinte.

Sem dado, nada: nunca um número inventado (spec 082 D2).

## Fora do escopo

- Recalcular a chegada pela posição atual no servidor (D2).
- Mapa com ruas, com tiles vetoriais na app (D8). A condição para reabrir fica na ADR-0087.
- "Quanto falta" da viagem inteira, pela soma das pernas. A 198 já o recusa (`spec.md:315-316`).
- Trânsito em tempo real: o OSRM da instalação não tem (ADR-0044 §2).
- A regra do ETA do escritório, que é da 109 no código e da 192 D8. O defeito do `clockSeconds` no
  worker era da spec **210**, e já está corrigido em `origin/staging`.
- A dedup de `toNodeIdsByLeg` no gateway (é da 090; a 207 só **não a usa**, ver D3a).
- A escrita e a trava das pernas em reordenação, que são da 192 (D3).
- "A caminho": a 206 é dona do estado, da rota e de `resolveEnRouteStopId`.
- Margem configurável por empresa (D14) e notificação do celular por Web Push (D16), as duas para
  depois.
- Agendar pela app: quem agenda é o escritório ou o contratante (060 D3).
- Painel e portal.

## Decisões

Em uma linha cada, com a justificativa. O desenho completo está na ADR-0087.

### A — Quanto falta

- **D1 — Cada número tem fonte e rótulo.**
  - "chega ~14:35" vem da perna congelada somada à âncora (D5).
  - "no plano: 14:20" é `estimated_arrival_at`.
  - "3,2 km em linha reta" é haversine local.
  - "trecho de 8,4 km pela estrada" é a perna congelada.
  - Nenhum número aparece sem a palavra que diz de onde veio.
- **D2 — O servidor não recalcula pela posição atual.**
  - Custaria um `/route` por motorista a cada 30 s (`useDriverTrip.hook.ts:75`), com timeout de
    5 s (`osrm-route-geometry.gateway.ts:19`), em rota sem `rateLimit`.
  - A posição subiria sem toque, contra a ADR-0081 e a ADR-0084 §4.
  - O rastro `trip_location_pings` mudaria de finalidade.
  - Sem rede, não haveria resposta.
- **D3 — A 207 define a perna e cria a trava; o CAS é da 192.**
  - A 207 entrega a função pura `assignLegsToStops({ legs, leadingLegs, tracedStopIds })`, que
    devolve `{ stopId, fromStopId, distanceMeters, durationSeconds }` por parada do traçado, e o
    formato do jsonb (D3a).
  - A escrita em `trip_stops.distance_from_previous_*`/`duration_from_previous_*` acontece **sempre**
    dentro da trava única `lockTripForStopOrder`: `trip_stops FOR UPDATE ORDER BY id` →
    `trips FOR NO KEY UPDATE`, a ordem da 192 D5 (`specs/192-.../spec.md:99`; `plan.md:74`, `:238`).
  - **A 207 chega antes, e por isso ela CRIA `lockTripForStopOrder`.** Medido na T0.1:
    `grep -rn "lockTripForStopOrder" apps/` dá **0 ocorrências**, nesta árvore e em `origin/staging`;
    o nome só existe em prosa da 192 (`plan.md:75`, `:238`; `tasks.md:98`). A 207 o cria com a
    assinatura de `specs/192-.../plan.md:74-79` e escreve dentro da transação recebida. A 192 herda
    sem reescrever.
  - **O CAS por `stop_order_version` fica fora desta spec.** A coluna **não existe** (`grep` da T0.1:
    0 ocorrências), a migration que a criaria é da **192** (0 de 16 tasks feitas) e a 207 **proíbe
    migration**. A cláusula "CAS se a coluna existir" resolve-se em "não existe": a T1.2 entrega **só
    a trava**, e o CAS entra com a 192. A trava sozinha basta para serializar a escrita desta spec; o
    CAS é a defesa contra ordem trocada **fora** da transação, que é o caso da 192.
  - **Não se zera coluna nenhuma.** Com OSRM fora vale o `kept_previous` da 192 (RF6): rota e
    pernas anteriores ficam. A leitura só usa a perna quando `planned_route.tracedStopIds` existe e
    contém a parada (D4). Coluna órfã de rota nula é ignorada.
  - **Ressalva do `kept_previous` (T0.1):** como **ninguém** escreve as colunas de perna de
    `trip_stops` hoje, o valor anterior é sempre `null` em produção. A regra continua correta como
    invariante ("OSRM fora não zera"), mas **nenhum caminho de produção produz o valor anterior** —
    o contrato que a prova tem de **montar o estado anterior à mão**, ou passa sem provar nada.
- **D3a — O jsonb grava a origem e os limites de cada perna.**
  - `planned_route.tracedStopIds` é a ordem das paradas no traçado, sem as excluídas.
  - `planned_route.legPointStarts` é o índice em `points` onde cada perna começa.
  - Os limites saem do gateway **antes** de simplificar: `legs[].annotation.nodes`, que já vem com
    `annotations=nodes` (`osrm-route-geometry.gateway.ts:45`), dá o número de vértices de cada perna,
    como `nodes.length − 1`.
  - **`vertexCount` é uma leitura própria de `annotation.nodes` cru, sem passar pela dedup do
    `toNodeIdsByLeg`.** O gateway já monta `toNodeIdsByLeg` (`gateway.ts:123-152`) a partir do mesmo
    campo, mas ele **deduplica**, e reaproveitá-lo daria número errado **sem nada falhar**:
    - a premissa escrita no comentário do próprio gateway (`:115-118`, "o OSRM repete o nó da parada
      no fim de um trecho e no começo do seguinte") foi medida como **falsa** em rota real de staging:
      nos **três** limites de uma rota de 5 paradas **nenhum** nó se repete;
    - o que a dedup remove são repetições consecutivas **internas** a cada perna (15, 0, 37 e 11 nós),
      e por isso a soma de `nodeIdsByLeg` dá **2643** contra **2702** segmentos de geometria;
    - usá-lo desalinharia a fatia de `path` em **dezenas a centenas de pontos por perna**, e o desenho
      sairia errado em silêncio.
    - A premissa que **vale** é `sum(nodes.length − 1) === geometry.coordinates.length − 1`, medida em
      **34 de 34** rotas reais, incluindo alternativa e perna de 0 m.
  - **Perna de 0 m ocupa 1 vértice, não 0.** A perna de `distance: 0` medida veio com
    `nodes: [7182420907, 1816048051]` — dois nós **distintos** —, contribuindo `2 − 1 = 1` para a
    soma. Logo `legPointStarts` avança **1** nessa perna. Isso é caso de contrato (CA02).
  - A simplificação (5 m) passa a ser **por perna**, e os índices gravados são exatos. Não há
    heurística de proximidade.
  - Achado adjacente, **fora do escopo**: se o OSRM não repete o nó da parada, a dedup de
    `toNodeIdsByLeg` existe para um caso que não ocorre e, ao apagar repetições internas, pode estar
    subcontando praça de pedágio. Isso é da 090, e pede spec própria. A 207 **não** mexe nela.
  - É aditivo no jsonb: o parser atual ignora chave desconhecida (`parse-planned-route.policy.ts:24-40`).
- **D4 — A perna só vale se partir de onde o motorista partiu.**
  - Vale se `fromStopId` for a última parada concluída, ou `'depot'` com nenhuma concluída.
  - Isso cobre quatro casos:
    - `kept_previous` (a ordem mudou e a rota é a velha);
    - despacho forçado que apaga parada (`drizzle-trip-route.repository.ts:753-823`), em que o
      `fromStopId` aponta para parada que não existe mais e nunca casa;
    - parada geocodificada depois do congelamento, que fica fora de `tracedStopIds` e sem perna;
    - motorista fora de ordem.

  Fora disso, não há estrada, "chega ~" nem desenho. A reta continua.

- **D4a — O servidor manda a perna de toda parada pendente; a app escolhe qual mostrar.**
  - `stops[].leg = { fromStopId, distanceMeters, durationSeconds }` vai em toda parada pendente com
    origem gravada. É barato: três números.
  - `path` vai só nas **duas primeiras pendentes na sequência** e, se estiver fora delas, na que tem
    `en_route_since`.
  - A app escolhe a parada pela regra local, que enxerga a fila offline: `resolveEnRouteStopId` da
    206, que ignora os itens `rejected`. Antes da 206, vale a parada atual de
    `findCurrentStop` (`driverTripView.service.ts:27`), que também é da 206.
  - A 207 não cria função para escolher a parada, nem na API nem na app. Na API, a marca é
    `en_route_since`, usada só para decidir quem recebe `path`.
- **D5 — A âncora é a hora em que ele saiu para a parada, sempre no relógio do aparelho.**
  1. A hora do toque "Iniciar rota" da parada: `enRouteTappedAt`, que a 206 expõe no snapshot a
     partir de `tappedAt`/`captured_at`, ou a hora local do item `depart` ainda na fila e não
     `rejected`. A fila vale: é o mesmo relógio do "agora" da tela. **Nunca `en_route_since`**, que é
     hora do servidor.
     - **Divergência com a 206, resolvida aqui:** `206/spec.md:427` diz que a 207 usa
       `enRouteTappedAt` "e `enRouteSince` quando ele for nulo". **Vale a regra da 207** — o recuo é a
       hora local do item na fila, nunca `enRouteSince`, que é hora de servidor e cairia na proibição
       da § "Proibido nesta spec". A frase da 206 é descritiva e está desatualizada; a 207 **não edita
       spec irmã**, então quem executar a 206 tem de ser avisado, e a T2.2b recusa o recuo por
       `enRouteSince` se ele chegar.
  2. O último desfecho da parada de origem da perna (`fromStopId`): `captured_at` do servidor, ou
     hora local do item na fila.
  3. O "Iniciar rota" da viagem (`start-route`): só com `captured_at`, o que depende da 196, porque
     hoje a rota não tem corpo.

  **Nunca `recorded_at`.** Sem `captured_at` o degrau não vale: a ADR-0083 §3 recusa misturar
  `captured_at ?? recorded_at`, porque mistura o relógio do aparelho com a hora da drenagem.
  - O `captured_at` do servidor é do aparelho que tocou. Com o mesmo aparelho, o relógio casa com o
    "agora" da tela e não há desvio para corrigir.
  - **Limite declarado:** se o toque veio de outro aparelho, o desvio entre os dois relógios entra na
    conta. Não se corrige pelo cabeçalho `Date`, porque ele mediria o desvio do aparelho atual contra
    o servidor, e não contra o aparelho que tocou.
  - Sem âncora, não há "chega ~".

- **D6 — Passada a hora, a tela diz que passou.**
  - "previsto ~14:35 (há 5 min)".
  - Nunca minuto negativo, e a previsão nunca se estende sozinha.
- **D7 — A posição é lida no aparelho, só com permissão já concedida, e não sai dele.**
  - A leitura só acontece com `navigator.permissions.query({ name: 'geolocation' })` em `granted`.
    Sem a API ou com outro estado, a app não pede nada sozinha.
  - O pedido de permissão só parte de um gesto: o botão "Mostrar distância", no corpo da parada a
    caminho, ou os toques que já leem posição.
  - Parâmetros: `getCurrentPosition` com `enableHighAccuracy: false`, `timeout: 8000` e
    `maximumAge: 30000`, a cada 60 s, só com a app visível e com parada a caminho. Precisão acima de
    1000 m é descartada.
  - Com o compartilhamento do Perfil ativo, a app usa o último ponto do `watchPosition` dele em vez
    de ler de novo. O controlador ganha um `onLocalPosition` local, que não passa pelo `send`.
  - Na tela: "a distância usa sua posição só no aparelho".
  - **Proibido** reaproveitar esse ponto como carimbo de toque (ADR-0081). O carimbo continua sendo a
    leitura do próprio toque.
  - A ADR-0087 emenda a ADR-0045 §3 e a ADR-0050 §5: leitura local, sem envio, não é o rastreamento
    que pede consentimento.

### B — O caminho

- **D8 — O mapa é o trecho em SVG, ao lado do "Navegar": as opções (c) e (d).**
  - Não entra tile, biblioteca, CSP nova, nem nada no precache. Funciona sem rede.
  - **(a) Imagem do servidor: recusada.** Não há renderizador (nem sharp, nem canvas, nem
    maplibre-native). Seria serviço novo, e o ponto do motorista teria de subir.
  - **(b) MapLibre sob demanda: recusada agora.** Seriam ~800 KB mais os tiles no 3G, nada sem rede,
    emenda à ADR-0075 §4/§5 e ao `dist.contract.test.ts:21-22`, e a origem pública do `map-tiles`
    na `connect-src`.
  - A (b) reabre se o usuário pedir ruas no preview.
- **D8a — O ponto exato do barracão não sai.** Na perna de saída, `path` começa no segundo vértice. A
  ADR-0083 §1 (sem coordenada do barracão) continua valendo sem emenda. O desenho marca a origem como
  "saída", no primeiro ponto que sobrou.

### C — Agendamento e alerta

- **D9 — O selo de agendamento, e só ele, fala da hora marcada.**
  - "Com agendamento · 14:30 · protocolo 123": `confirmed`, com `scheduledAt` e `isDiverged = false`.
    A hora é garantida pelo CHECK (`delivery-client.schema.ts:317-318`).
  - "Cliente exige agendamento — ainda sem horário confirmado": `requiresScheduling` com a linha
    ausente, `pending`, `requested`, `refused` ou divergente. A linha de apoio diz qual: "pedido ao
    cliente", "recusado pelo cliente" ou "confirmado para outra data".
  - "Sem agendamento": o cliente não exige e não há confirmação.
  - Uma regra só (`resolveSchedulingBadge`) substitui a linha "Hora marcada: … · Protocolo …"
    (`DriverStopCard:323-330`). O cartão não repete a hora em dois lugares.
- **D10 — `requiresScheduling` sai do `listDocuments`, sem consulta nova.**
  - `listDocuments` já lê `recipientTaxId` (`drizzle-current-driver-trip.repository.ts:391`, `:706`).
  - Ganha `leftJoin` a `delivery_clients` por `(company_id, tax_id)`, a mesma regra de
    `unscheduled-stop.query.ts:51-66`.
  - A parada exige se alguma nota não liberada exige. Antes da 197, a parada misturada exige se
    qualquer cliente exigir.
- **D11 — O contrato cresce fora de `route`.**
  - Cada parada: `estimatedArrivalAt`, `requiresScheduling`, `schedule.isDiverged` e `leg`.
  - Até três paradas por viagem: `path`.
  - O negativo da 198 (CA01), que varre só `route` e `stopTime`, continua verde.
- **D12 — O limite é a hora confirmada; sem ela, o fim da janela; sem os dois, não há alerta.**
- **D13 — A estimativa vencida não é estimativa.**
  - A função trabalha com `estimativaEfetiva = estimate ≥ now ? estimate : null`.
  - Uma previsão que já passou sem chegada volta a "sem estimativa", e o estado sai só de
    `deadline − now`.
- **D14 — `resolveScheduleAlert({ now, estimate, deadline, marginMinutes })`: três estados e o
  silêncio.**
  - `past` ("horário passou"): `now > deadline`, sem chegada.
  - `late` ("vai atrasar"): estimativa efetiva > `deadline`.
  - `tight` ("atenção: chega perto do limite"): `deadline −` estimativa efetiva < margem. Sem
    estimativa, `deadline − now <` margem, com o texto "limite às 14:30, em 20 min", que não promete
    chegada.
  - **Sem risco, sem selo.** Não existe `on_time` verde. O pedido do usuário é o alerta, e "no
    horário" seria um selo a mais em todo cartão.
  - A estimativa da parada a caminho é o "chega ~" (D1).
  - Nas outras, é `estimatedArrivalAt`. O defeito do ETA multi-veículo **já está corrigido** (spec
    210, `9f4ad2009`, em `origin/staging`), então **não há bloqueio**: a T2.8 liga o
    `estimatedArrivalAt` no alerta e na faixa, na própria Fase 2. Até a T2.8 rodar, o ETA do
    escritório aparece só como "no plano" — é sequência de tasks (o parâmetro nasce desligado na
    T2.4), não espera por outra spec.
  - Com chegada registrada, não há alerta.
  - A margem é `SCHEDULE_ALERT_MARGIN_MINUTES = 30`, fixa e registrada como está.
    `max(30, 25% da duração restante)` foi considerado e recusado, porque a duração restante só
    existe para a parada a caminho. A configuração por empresa fica para spec própria.
  - **Limite conhecido:** chegar muito cedo (antes da janela) não gera alerta.
- **D15 — Ícone, texto e cor, nunca só cor. Há um tema só, o escuro.**

  | Estado               | Ícone   | Cor                                             | Texto                                                      |
  | -------------------- | ------- | ----------------------------------------------- | ---------------------------------------------------------- |
  | `tight`              | `clock` | âmbar `--color-caution` (#f2c14e), novo         | "atenção: chega perto do limite"                           |
  | agendamento pendente | `clock` | âmbar `--color-caution`                         | "Cliente exige agendamento — ainda sem horário confirmado" |
  | `late`               | `alert` | `--color-alert`                                 | "vai atrasar"                                              |
  | `past`               | `alert` | fundo `--color-alert`, texto em tinta `#10222c` | "horário passou"                                           |
  | "Com agendamento"    | `clock` | `--color-slate` (neutro)                        | "Com agendamento · 14:30 · protocolo 123"                  |
  | "Sem agendamento"    | —       | `--color-slate` (neutro)                        | "Sem agendamento"                                          |
  - O âmbar separa o `tight` do cobre de "Em andamento".
  - O vermelho fica só para `late` e `past`.
  - A T3.3 mede o contraste no tema escuro.

- **D16 — A faixa no topo da viagem.**
  - Considera a parada a caminho e **a seguinte na sequência atual**, isto é, a ordem da 192, que o
    motorista pode mudar. A seguinte é a primeira pendente depois da a caminho, excluída ela. A 206
    deixa escolher qualquer parada, mas a sequência continua sendo o plano do motorista.
  - Mostra o pior estado entre as duas, incluindo o agendamento pendente.
  - É um contêiner `role="status"` com texto estável, que envolve um `<button>` de ≥ 44 px. O toque
    abre a parada e rola até ela.
  - Web Push fica para depois. A app não tem push (`sw.ts:23` só escuta `message`; a 147 tem zero
    tasks feitas), e o aviso com a app fechada exigiria que o servidor soubesse a estimativa, que
    aqui é calculada no aparelho (D2). O caminho é a 147 mais uma spec própria que dispara pelo
    servidor a partir de `estimated_arrival_at` e da hora marcada.
- **D17 — O relógio é o do aparelho.** Um só relógio de 30 s alimenta o "chega ~", o selo, o alerta e
  a faixa. Funciona também sem rede.

## Histórias priorizadas

### P1 — O motorista sabe quando chega

**Given** a viagem em `in_transit`, a parada 2 a caminho, a perna de 1080 s com `fromStopId` igual à
parada 1, e a parada 1 concluída com `captured_at` 14:17, **when** ele abre a app às 14:20, **then** o
cabeçalho diz "chega ~14:35 · em 15 min".

**Given** que são 14:40 e não há chegada, **then** diz "previsto ~14:35 · há 5 min".

### P1 — A distância diz o que é, e a posição fica no aparelho

**Given** a permissão `granted`, **when** o caminhão anda 2 km em linha reta na direção da parada,
**then** em até 60 s "5,2 km" vira "3,2 km em linha reta", com "a distância usa sua posição só no
aparelho", e nenhuma requisição leva a posição.

**Given** a permissão `prompt`, **then** não aparece km, e sim o botão "Mostrar distância".

### P1 — O motorista sabe se o cliente é agendado

**Given** um cliente que exige agendamento, com status `requested`, **then** aparece "Cliente exige
agendamento — ainda sem horário confirmado · pedido ao cliente", em âmbar.

**Given** o status `confirmed` às 14:30, **then** aparece "Com agendamento · 14:30 · protocolo 123", e
a linha "Hora marcada" não se repete.

**Given** um cliente sem exigência, **then** aparece "Sem agendamento".

### P1 — O alerta avisa antes de estourar

**Given** a hora marcada às 14:30:

- com "chega ~14:10": "atenção: chega perto do limite";
- com "chega ~14:40": "vai atrasar";
- às 14:31 sem chegada: "horário passou";
- com "chega ~13:50": nenhum selo de alerta.

Em cada caso de risco, a faixa repete.

### P1 — O trecho vem do plano, e só quando é verdade

**Given** uma rota congelada com `tracedStopIds`, **then** aparece "trecho de 8,4 km pela estrada ·
~18 min sem trânsito".

**Given** uma rota antiga, ou `kept_previous` cuja perna não parte da última concluída, **then** não
aparece o trecho nem o "chega ~".

### P1 — O desenho mostra o caminho

**Given** a perna válida e `path`, **then** o desenho mostra o trecho, a saída, o pino e o ponto do
motorista, também sem rede.

**Given** o motorista fora do desenho, **then** o ponto encosta na borda com seta, e a legenda diz
"fora da área do desenho".

### P2 — Sem rede

**Given** que não há rede e há snapshot, **when** a hora marcada passa, **then** o alerta vira "horário
passou" pelo relógio do aparelho.

## Requisitos funcionais

### API

- **RF1** O `GET /me/trips/current` passa a devolver, por parada:
  - `estimatedArrivalAt` (`string | null`), na consulta de `listStops`;
  - `requiresScheduling` (`boolean`), pelo `leftJoin` do `listDocuments` (D10);
  - `schedule.isDiverged` (`boolean`), na consulta de `listSchedules`.
- **RF2** Por parada pendente com origem gravada (D4a):

  ```ts
  leg: {
    fromStopId: string | 'depot'
    distanceMeters: number // pela estrada, perna congelada
    durationSeconds: number // sem trânsito
    originOutcomeCapturedAt: string | null // captured_at do último desfecho de fromStopId (degrau 2)
    path: readonly (readonly [number, number])[] | null // só em até 3 paradas; [lat, lng], 5 casas, ≤ 200
  } | null
  ```

  O degrau 1 da âncora é `stops[].enRouteTappedAt`, que é da 206 e não desta spec. Na viagem entra
  `startRouteCapturedAt` (`string | null`), o degrau 3, depois da 196.

- **RF3** `assignLegsToStops` (pura) e a escrita das colunas e do jsonb, sempre dentro de
  `lockTripForStopOrder`, que a 207 **cria** (D3). **Sem CAS:** `stop_order_version` não existe e é da 192.
- **RF4** O gateway (`osrm-route-geometry.gateway.ts:175-188`, `toLegs`) passa a devolver a contagem
  de vértices por perna, `vertexCount = annotation.nodes.length − 1`, numa **leitura própria do
  campo cru** — **nunca** reaproveitando `toNodeIdsByLeg` (`:123-152`), que deduplica e daria 2643 em
  vez de 2702 na rota medida (D3a). `read-route-geometry.use-case.ts:425` simplifica por perna e
  devolve `legPointStarts`.
- **RF5** `path` sai de `points[legPointStarts[k] .. legPointStarts[k+1]]`, com teto de 200 pontos
  (a tolerância sobe até caber) e sem o primeiro ponto na perna de saída (D8a). Há cache em memória
  por `(tripId, stopId, plannedRouteFrozenAt)`.
- **RF6** `points` é lido só para as viagens com parada que recebe `path`, em lote.
- **RF7** O escopo não muda: `trip.read`, o motorista pelo vínculo e o `companyId` do contexto. O join
  com `delivery_clients` casa por `company_id`.
- **RF8** Nenhuma coordenada vai para log. `requiresScheduling` é booleano e não carrega CNPJ.

### App do motorista

- **RF9** `driverTripResponse.validation.ts` aceita os campos novos:
  - campo ausente (API antiga) vira `null` ou `false`;
  - `leg` ou `path` malformado vira `null` sem derrubar o snapshot.
- **RF10** `approachEstimate.service.ts` (pura): perna válida (D4), âncora (D5, incluindo os itens da
  fila) → `{ kind: 'upcoming' | 'overdue', arrivalAt, minutes }` ou `null`.
- **RF11** `localPosition.service.ts`: `createLocalPositionController({ geolocation, permissions,
setInterval, clearInterval, isVisible, onVisibilityChange, sharedPosition })`, no molde de
  `createLocationSharingController`. Aplica a D7 e não importa cliente HTTP nem fila.
- **RF12** `nowClock.service.ts`: `createNowClock({ setInterval, clearInterval, isVisible,
onVisibilityChange })`, um temporizador de 30 s. Os hooks (`useLocalPosition`, `useNow`) são só a
  cola com `useSyncExternalStore`.
- **RF13** O rótulo passa a ser "{{km}} km em linha reta", com a linha de privacidade. Parada
  concluída não mostra km.
- **RF14** `approachPath.service.ts` tem `projectApproachPath`: equirretangular com o cosseno da
  latitude média, e o ponto fora da caixa encosta na borda com seta.
  `DriverApproachPreview.component.tsx` desenha em SVG, com `role="img"` e `aria-label` em texto, só
  com tokens.
- **RF15** `schedulingBadge.service.ts` tem `resolveSchedulingBadge`, a fonte única do selo e da hora
  marcada (D9).
- **RF16** `scheduleAlert.service.ts` tem `resolveScheduleAlert` (D12–D14) e
  `resolveTripScheduleBanner` (D16).
- **RF17** Os textos ficam em blocos próprios (`approach.*`, `scheduling.*`, `scheduleAlert.*`), em
  pt-BR e en, sem reordenar o arquivo.

## Requisitos não funcionais

- **Peso.** Nenhuma dependência nova. O precache fica abaixo de 1,5 MiB (~657 KiB hoje), e o
  `dist.contract.test.ts` não muda.
- **Rede.** O snapshot cresce três números por parada pendente e até três `path` de ~5 KB por
  viagem. Não há requisição nova.
- **Sem rede.** Tudo sai do snapshot (24 h) e do relógio do aparelho.
- **Privacidade.** A posição do motorista não sai do aparelho por esta spec (D7). `path` é traçado
  entre endereços de clientes, sem o ponto do barracão (D8a).

## Casos extremos e falhas

| Caso                                        | Resultado                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Viagem `route_planned`                      | Sem parada a caminho; selo sim; alerta só por `deadline − now`                                    |
| Primeira rota com OSRM fora                 | Sem `tracedStopIds`: `leg: null` em tudo                                                          |
| Reordenação com OSRM fora (`kept_previous`) | Pernas antigas; vale só a que parte da última concluída (D4)                                      |
| Despacho forçado que apagou parada          | `fromStopId` inexistente nunca casa: sem perna para a seguinte                                    |
| Parada geocodificada depois do congelamento | Fora de `tracedStopIds`: sem perna                                                                |
| Rota congelada antes da 207                 | Sem `tracedStopIds`: `leg: null`                                                                  |
| Perna de 0 m (mesmo endereço, 197)          | "chega ~" = âncora; "no mesmo endereço"; sem desenho. `legPointStarts` avança **1**, não 0 (T0.1) |
| `depart` na fila, sem rede                  | Âncora = hora local do item (D5, degrau 1)                                                        |
| Desfecho gravado sem `captured_at`          | O degrau não vale; cai para o seguinte                                                            |
| Toque feito em outro aparelho               | Desvio de relógio entra na conta (limite declarado, D5)                                           |
| `estimate` já passou, sem chegada           | Sem estimativa (D13); `past` ou `tight` por `deadline − now`                                      |
| Confirmado, depois divergente               | Selo âmbar "confirmado para outra data"; sem alerta pela hora velha                               |
| Hora marcada e janela ao mesmo tempo        | O limite é a hora marcada                                                                         |
| Janela só com início                        | Sem limite, sem alerta; chegar cedo é limite conhecido                                            |
| Permissão `prompt` ou `denied`              | Sem km; em `prompt`, botão "Mostrar distância"                                                    |
| `permissions.query` indisponível            | Tratado como não concedido                                                                        |
| Precisão > 1000 m                           | Sem km                                                                                            |
| `path` com 1 ponto ou malformado            | Sem desenho; o resto segue                                                                        |

## Critérios de aceite

- **CA01** Contrato da API **vermelho** antes (`test/driver-trip/current-trip.contract.ts`,
  `me-routes.contract.ts`).
  - Os campos da RF1 e da RF2.
  - `path` em no máximo 3 paradas por viagem.
  - Negativos: nenhuma posição do motorista; nenhum `taxId`; o primeiro ponto do barracão ausente.
- **CA02** `assignLegsToStops` e os limites de perna, em contrato puro:
  - `leadingLegs` 0 e 1;
  - parada excluída no meio;
  - **perna de 0 m com `legPointStarts` avançando 1** (dois nós distintos), não 0;
  - `annotation.nodes` **cru** somando exatamente `points`, sem passar pela dedup do
    `toNodeIdsByLeg` — um caso que prova que a contagem deduplicada (2643 na medição) **não** é a
    usada;
  - `kept_previous`, com o **estado anterior montado à mão** no teste, porque nenhum caminho de
    produção escreve as colunas de perna hoje (D3);
  - despacho forçado que apaga parada;
  - parada geocodificada depois.
- **CA03** Integração com o congelamento (`test/integration/freeze-trip-planned-route.integration.ts`):
  - grava colunas e jsonb dentro de `lockTripForStopOrder`, que a 207 cria (sem CAS — a coluna é da
    192);
  - OSRM fora mantém o anterior, com o anterior **montado à mão** (D3);
  - **congelamento concorrente com chegada, em duas conexões, sem deadlock** e com o resultado
    consistente. É **rede de segurança**, não correção de defeito existente: a T0.1 levantou todo
    `.for(...)` de `src/trips/infrastructure/**` e **nenhum caminho de hoje trava linha de
    `trip_stops`** (os 12 pontos travam só `trips`), então a ordem nova `trip_stops` → `trips` não
    fecha ciclo com nada em produção e o `40P01` é improvável.
- **CA04** Integração com o snapshot (`test/integration/me-trip.integration.ts`):
  - `leg` nas pendentes com origem;
  - `path` em até 3;
  - `requiresScheduling` com um cliente que exige, um que não exige e a parada misturada;
  - `isDiverged`;
  - tenant (outra empresa não alcança);
  - **contagem de consultas por GET** igual à de antes, mais a leitura de `points`.
- **CA05** Contratos puros da app, vistos vermelhos antes:
  - `approachEstimate`: os degraus, a fila e "sem `captured_at` não vale";
  - `projectApproachPath`;
  - `resolveSchedulingBadge`: `pending`, `requested`, `refused`, divergente, `confirmed`,
    `not_required` e sem linha;
  - `resolveScheduleAlert`, com a **tabela de casos**:
    - cada estado;
    - as fronteiras: folga = margem, estimativa = limite, `now` = limite;
    - estimativa vencida (D13);
    - sem estimativa perto e longe do limite;
    - "sem risco, sem selo";
    - com chegada;
  - `resolveTripScheduleBanner`, com a seguinte na sequência;
  - a validação em `schedule.contract.ts`, com as suítes de `toDriverTripSnapshot` que já existem.
- **CA06** `createLocalPositionController` e `createNowClock`, com dublês:
  - `granted`, `prompt`, `denied` e API ausente;
  - 60 s só visível;
  - reuso do ponto compartilhado;
  - precisão descartada;
  - um temporizador só;
  - contrato de import sem cliente HTTP nem fila.
- **CA07** Smoke Playwright com geolocalização, permissão e `page.clock` fixos:
  - "chega ~", "em linha reta", o selo, o alerta e o desenho;
  - a faixa com o cartão fechado;
  - nenhuma requisição com coordenada do motorista (filtro de rede).
- **CA08** O `build` passa com o `dist.contract.test.ts` intacto, e o precache é anotado.
- **CA09** Preview na 53200 com a API de demonstração na 53901, prints em 375 e 768 px, e o **"pode
  subir"** do usuário.
- **CA10** Revisão de design com o contraste do âmbar, do vermelho e da tinta sobre o vermelho, no
  tema escuro.

## Preview

A parada a caminho, aberta, em 375 px. Colunas aproximadas.

```text
┌────────────────────────────────────────┐
│ [⚠ Parada 2 vai atrasar · limite 14:30]│  ← faixa (status + botão)
└────────────────────────────────────────┘
┌────────────────────────────────────────┐
│ PARADA 2                             ⌃ │
│ Rua das Flores, 120 · Centro           │
│ [● Em andamento] [⚠ vai atrasar]       │
│ [◷ Com agendamento · 14:30 · prot. 123]│
│ 3 notas para entregar                  │
│ chega ~14:40 · em 25 min               │
│ 3,2 km em linha reta                   │
├────────────────────────────────────────┤
│ ┌────────────────────────────────────┐ │
│ │  ○ saída                           │ │
│ │   ╲__                              │ │
│ │      ╲___      ◉ você              │ │
│ │          ╲____/                    │ │
│ │               ╲___                 │ │
│ │                   ╲__ 📍 parada 2  │ │
│ └────────────────────────────────────┘ │
│ trecho de 8,4 km pela estrada          │
│ ~18 min sem trânsito · no plano 14:20  │
│ a distância usa sua posição só no      │
│ aparelho                               │
│ [ ↗ Navegar ] [ ✓ Cheguei ]            │
│ [ ⚠ Deu problema ]                     │
└────────────────────────────────────────┘
```

Os estados do alerta no cabeçalho, com o cartão fechado:

```text
│ (sem selo)                             │  chega ~13:50, limite 14:30
│ [◷ atenção: chega perto do limite]     │  âmbar     · chega ~14:10
│ [◷ limite às 14:30, em 20 min]         │  âmbar     · sem previsão
│ [⚠ vai atrasar]                        │  vermelho  · chega ~14:40
│ [⚠ horário passou]                     │  fundo vermelho, texto tinta · 14:31
```

Cliente que exige agendamento, sem horário confirmado:

```text
┌────────────────────────────────────────┐
│ PARADA 4                             ⌄ │
│ Av. Brasil, 900 · Jardim               │
│ [Pendente]                             │
│ [◷ Cliente exige agendamento —         │
│    ainda sem horário confirmado]       │  âmbar
│ pedido ao cliente · no plano 15:10     │
│ 2 notas para entregar                  │
└────────────────────────────────────────┘
```

Sem permissão de posição, e fora de ordem (sem perna):

```text
┌────────────────────────────────────────┐
│ PARADA 3                             ⌃ │
│ Rua Ipê, 45 · Vila Nova                │
│ [● Em andamento] [Sem agendamento]     │
│ Janela até 17:00                       │
├────────────────────────────────────────┤
│ [ ◎ Mostrar distância ]                │
│ [ ↗ Navegar ] [ ✓ Cheguei ]            │
└────────────────────────────────────────┘
```

## Interseções com outras specs

| Spec          | Onde encosta                                                                   | Regra                                                                                                                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 192 (0/16)    | Pernas em `trip_stops`, `lockTripForStopOrder`, CAS, `kept_previous`           | **A 207 chega antes e CRIA `lockTripForStopOrder`** (não existe em lugar nenhum, T0.1), no molde de `192/plan.md:74-79`; a 192 herda. **O CAS por `stop_order_version` fica com a 192**, porque a coluna é dela e a 207 proíbe migration (D3)                                                                     |
| 206 (escrita) | `en_route_since`, `enRouteTappedAt`, `resolveEnRouteStopId`, `findCurrentStop` | A 207 usa os quatro, sem função paralela. Âncora do degrau 1 = `enRouteTappedAt`, nunca `en_route_since`. T1.3b/T2.2b bloqueadas até a 206 estar em `origin/staging`. **`206/spec.md:427` está desatualizada** ao dizer que a 207 recua por `enRouteSince`: vale a regra da 207 (D5) — avisar quem executar a 206 |
| 210 (staging) | `clockSeconds` por veículo no worker                                           | **Satisfeita** (`9f4ad2009`, 4/4 tasks). `estimatedArrivalAt` é confiável e a **T2.8 não está bloqueada** (D14). Segue aberto na 210, fora do escopo da 207: as pausas de jornada (`sinceBreakSeconds`, `route-fitness.policy.ts`, T004 da 210)                                                                   |
| 199 (staging) | Coordenada da parada                                                           | Base obrigatória (T0.1)                                                                                                                                                                                                                                                                                           |
| 198 (aberta)  | `excludedStopIds`, `route`                                                     | `tracedStopIds` é o mesmo conjunto. Quem chegar por último concilia os dois nomes                                                                                                                                                                                                                                 |
| 196           | `captured_at` dos toques; `start-route` sem corpo hoje                         | Degrau 3 só depois da 196                                                                                                                                                                                                                                                                                         |
| 197           | Parada por cliente                                                             | `requiresScheduling` fica exato                                                                                                                                                                                                                                                                                   |
| 060 D3        | Trava do despacho por agendamento                                              | Mesma regra de cliente; a app só mostra                                                                                                                                                                                                                                                                           |
| 147           | Web Push                                                                       | O aviso com a app fechada fica para spec própria (D16)                                                                                                                                                                                                                                                            |
| 204/205/206   | `DriverStopCard`, locales                                                      | Blocos próprios de chave. Conferir o `git log` do cartão antes de editar                                                                                                                                                                                                                                          |

## Dúvidas

Não há `[NEEDS CLARIFICATION]` aberto. As decisões que estavam faltando foram tomadas:

- o `depart` na fila vale como âncora (D5);
- "a seguinte" é a da sequência atual (D16).

**Medição pendente, nomeada (não bloqueia a Fase 1).** A taxa de limites de perna que **não fecham**
num **lote real** (≥ 20 viagens) **não foi medida**: faltou credencial do banco de staging para ler
coordenadas de paradas reais. O que houve foi **proxy sintético** — 25 requisições, 30 rotas
conferidas, 0 falhas — mais **34 rotas reais a favor** da premissa
`sum(nodes.length − 1) === coordinates.length − 1`. A medição fica na **T1.5**, já com a API em
staging: ler as coordenadas de ≥ 20 viagens planejadas por `GET` autenticado (ou consulta de leitura
ao Postgres de staging), repetir o laço contra o `/route` e registrar a taxa no `evidence.md`.
**Nenhum número é assumido aqui.** Se a taxa vier acima de zero, o caminho é o `path: null` que a spec
já prevê (RF4, § Riscos do plano) — não há decisão nova pendente.

Perguntas que **não bloqueiam**:

- **Q1 — Ruas no desenho.** Se o usuário pedir no preview, a opção (b) vira spec própria (D8).
- **Q2 — "no plano" ao motorista.** Mostra o que foi prometido ao cliente. Esconder é só mudança de
  tela.
- **Q3 — Margem de 30 min.** Muda a constante. Margem por empresa é spec própria.
- **Q4 — "Sem agendamento" em toda parada.** Se poluir no preview, a opção é mostrar só os outros dois
  estados.

## Resposta à crítica (revisão 2)

| Achado | Onde foi resolvido                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| M1     | D3, plan § Idempotência, T1.2 (trava da 192 e integração com duas conexões)                                                           |
| M2     | D3, § Interseções (dona da escrita; sem zerar; `kept_previous`)                                                                       |
| M3     | D3a (`tracedStopIds`), D4, CA02                                                                                                       |
| M4     | D4a, RF2 (`leg` em toda pendente, `path` em até 3; a API não escolhe a parada)                                                        |
| M5     | D4a, T1.3a/T1.3b, T2.2a/T2.2b                                                                                                         |
| M6     | D5 (nunca `recorded_at`, limite de relógio declarado, citação da 083 corrigida)                                                       |
| M7     | D13, D14 (sem `on_time`), CA05                                                                                                        |
| M8     | Pré-requisitos, D14, T2.8                                                                                                             |
| M9     | D7, ADR-0087 (emenda à 0045 §3 e à 0050 §5)                                                                                           |
| M10    | RF11, RF12, CA06                                                                                                                      |
| M11    | D3a, RF4, T0.1 (medição)                                                                                                              |
| m1–m14 | D15 (âmbar), D15 (tema único), D10, D9, D16, D8a, RF5, D14, D14, § Histórias, plan (citações), T1.5, § Base do tasks, plan § Rollback |

## Correções da revisão 3 (medição da T0.1)

A T0.1 rodou e mediu três premissas da revisão 2 como **falsas**. A fonte é a § `T0.1` do
`evidence.md`, com arquivo, linha e saída.

| Premissa da revisão 2                                    | Medido                                                                                     | Onde foi corrigido                                           |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| "O P0 do ETA está pendente; a T2.8 fica bloqueada"       | É a **spec 210**, 4/4 tasks, em `origin/staging` (`9f4ad2009`)                             | § Pré-requisitos, problema 3, D14, § Interseções, `tasks.md` |
| "`vertexCount` sai de `annotation.nodes`" (sem ressalva) | O `nodeIdsByLeg` do gateway **deduplica** (2643 vs 2702); o nó da parada **não** se repete | D3a, RF4, CA02                                               |
| "CAS por `stop_order_version` se a coluna existir"       | A coluna **não existe**; a migration é da 192 (0/16); a 207 proíbe migration               | D3, RF3, CA03, T1.2                                          |

Mais três, do mesmo relatório:

- **Ordem de trava sem ciclo.** Nenhum caminho de hoje trava linha de `trip_stops`; a ordem nova é
  segura e **nenhum caller precisa ser convertido nesta spec**. O teste de duas conexões fica como
  rede de segurança (CA03, T1.2).
- **`kept_previous` sem produtor.** Ninguém escreve as colunas de perna de `trip_stops`; o teste monta
  o estado anterior à mão (D3, CA02, CA03).
- **Taxa num lote real, ainda por medir.** Fica na T1.5 (§ Dúvidas), sem número assumido.
