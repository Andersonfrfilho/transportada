# ADR-0084 — A sugestão parte de onde o caminhão está

- **Status:** proposta (2026-09-25). Vira `aceita` na T0.1 da spec 202, depois de conferida contra o
  código.
- **Data:** 2026-09-25
- **Decisores:**
  - usuário, em 2026-09-25: "Sugerir ordem" recalcula as paradas que faltam a partir da posição atual
    do motorista, com uma leitura pontual feita com consentimento naquele toque, sem rastreamento;
  - orquestrador, na revisão do `critic`: a sugestão sai da 192 e vira spec própria;
  - o desenho é desta ADR.
- **Spec:** `specs/202-a-sugestao-parte-de-onde-o-caminhao-esta/`
- **Depende de:** ADR-0077, a ordem muda na rua (spec 192). A sugestão só grava pela porta dela.
- **Aplica:** ADR-0044 (o roteirizador roda no worker); ADR-0045 §3 (posição pontual por toque);
  ADR-0081 (carimbo). O `origin` **não** é carimbo: é outro dado, com outra finalidade e outra
  retenção. `security.md` §1, §3 e §6.

## Contexto

O roteirizador já existe e roda no worker. Hoje ele só atende o escritório, e a viagem ainda nem saiu.
Três pontos do código impedem usá-lo com o caminhão na rua:

- **Origem.** Parte sempre do depósito. `depot = readPoint(originAddressKey)` (worker
  `drizzle-route-optimization.repository.ts:190-195`) serve de origem e também de fim quando
  `endPolicy='depot'` (:230-235).
- **Janelas de entrega.** São relativas à partida do dia: `departureEpochSeconds` é o início do dia,
  mais a hora de saída configurada, mais o fuso (:142-145, :216-222). Às 15 h, a janela das 14 h
  estaria no futuro.
- **Paradas.** Carrega todas, inclusive as já entregues (:488-503). O corpo da API não aceita origem
  (`route-suggestion-request.schema.ts:19-29`), e viagem despachada é recusada
  (`drizzle-trip-route-gate.adapter.ts:18-31`).

A posição do motorista também não pode vazar por onde passam as coordenadas de hoje:

- o OSRM recebe as coordenadas no **caminho da URL** (`osrm-routing-matrix.gateway.ts:45-46`);
- nenhum app tem `beforeBreadcrumb` no Sentry (worker `sentry.service.ts:62-64` só redige `meta` por
  chave).

## Decisão

### 1. Mesmo solver, pedido novo

- Rotas: `POST /me/trips/current/stop-order-suggestions` (`202`) e
  `GET /me/trips/current/stop-order-suggestions/:suggestionId`, com `trip.report`.
- A viagem é deduzida das paradas enviadas (ADR-0045).
- O pedido fica em `route_suggestions`, com `requested_via = 'driver_app'`.
- Entram só as paradas **não concluídas** (a regra da ADR-0077 §1). O orçamento é curto, ≤ 5 s.
- A sugestão é **rascunho**: preenche o editor da 192 e só grava pelo `PUT` dela, com
  `suggestionId` e `source = order_suggestion`.
- Um solver síncrono na API foi descartado: seria uma segunda cópia do solver.

### 2. Origem separada do depósito, e o relógio de agora

- O worker passa a ter `origin` e `depot` separados.
- A origem segue esta ordem de fallback:
  1. a posição enviada;
  2. a última parada concluída (coordenada de `geocoded_addresses`, a mesma fonte da 199);
  3. o depósito.
- O fim continua o `endPolicy` da empresa, e com `depot` ele é o depósito, não a origem.
- Para `driver_app`, `departureEpochSeconds` = **agora**. As janelas passam a ser lidas contra o
  relógio real.

### 3. Uma em voo, e expira

- Há um índice único parcial `(company_id, trip_id) WHERE requested_via = 'driver_app' AND status IN
('queued','running')`. Um segundo pedido recebe `409 STOP_ORDER_SUGGESTION_IN_PROGRESS`.
- Uma rotina do worker marca como `failed` o pedido do motorista que passar de **2 min** em voo. A app
  desiste aos 30 s.
- A rota declara `rateLimit` por usuário (`security.md` §3: rota que gasta cálculo).

### 4. A posição: por toque, com finalidade, e some em minutos

- A leitura é pontual (`getCurrentPosition`, via `readCurrentLocation`) e só acontece depois do toque
  em "Usar minha posição", numa folha que mostra a finalidade. Ao lado fica "Sem minha posição".
- Não depende do consentimento contínuo do Perfil nem o liga.
- A coordenada é arredondada a 4 casas (~11 m) e gravada em `route_suggestions` **só enquanto o solver
  roda**. O worker a zera na mesma transação em que grava o resultado, com sucesso ou com falha.
- A rotina do §3 também zera coordenada de qualquer sugestão que não esteja em voo. Na prática, ela
  vive poucos minutos.
- A coordenada **não** entra:
  - no payload da fila (`security.md` §6);
  - em log;
  - em evento. O evento da 192 guarda só `origin_kind`: `driver_position`, `last_stop` ou `depot`.
- **Redação.** A URL do OSRM é redigida no worker:
  - o gateway loga só o host;
  - o Sentry ganha `beforeBreadcrumb`, que troca o caminho de `/table|/route` por `[REDACTED]`.

  É defesa em profundidade, e vale para as coordenadas de endereço também.

### 5. A rotina entra nos quatro catálogos

`stop-order-suggestion.expire` entra, com `minimumIntervalSeconds: 60`, nos quatro catálogos:

- API: `src/shared/job-catalog.constant.ts`;
- worker: `src/shared/job-catalog.constant.ts`;
- cron: `src/shared/job-catalog.constant.ts`;
- painel: `src/modules/shared/jobCatalog.constant.ts`.

O contrato de paridade (`apps/*/test/job-catalog/catalog.contract.ts`) passa a cobrir a rotina. O
molde é a rotina `trip-cargo-layout-purge` do worker.

## Alternativas rejeitadas

- **Guardar a coordenada até o fim da viagem, para auditoria.** Viola a minimização (LGPD art. 6º
  III). O tipo de origem basta.
- **Mandar a coordenada no payload da fila.** Proibido pelo `security.md` §6.
- **Varredura no cron.** A rotina é do worker, que já roda o expurgo da planta.
- **Usar o consentimento contínuo.** Obriga a ligar rastreamento para um cálculo pontual.
- **Solver síncrono na API.** Seria uma segunda cópia do solver.

## Consequências

- `route_suggestions` passa a ter dois donos (escritório e motorista), separados por `requested_via`.
  A tela do escritório não mostra sugestão do motorista.
- A redação da URL do OSRM muda o que aparece no Sentry para todo o roteamento.
- A lista de exceções do inventário de carimbo da 196 passa a citar as rotas desta spec, não mais as
  da 192.
