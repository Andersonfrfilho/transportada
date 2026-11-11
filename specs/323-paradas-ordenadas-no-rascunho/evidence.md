# Evidência — 323

## Fase A — Ordenador puro e contrato (T1–T3)

Contratos escritos antes do código e vistos vermelhos (módulo inexistente), depois verdes.

### T1 — Contrato

- `apps/api-transportada/test/trip-domain/draft-stop-order.contract.ts`: caso Matão/Monte Alto/Jaboticabal intercalado,
  desempate pela menor `sequence`, refinamento que corrige o vizinho mais próximo, parada sem coordenada no fim (RF3),
  zero/uma parada, célula sem estrada como pior escolha, matriz que não cobre as paradas é recusada, modo `insert_new`
  (encaixe mais barato, ordem do despachante preservada mesmo pior que a ótima, antiga sem coordenada fica no lugar,
  várias novas uma a uma) e a escolha do modo pela origem (D2). Propriedades em 300 matrizes assimétricas com semente
  fixa (até 12 paradas, 3% de células sem estrada): permutação, determinismo (a ordem do array não muda o resultado),
  nunca pior que a ordem de entrada e ordem relativa das antigas no encaixe.
- `apps/api-transportada/test/trip-domain/draft-stop-order-no-straight-line.contract.ts` (CA3): nenhum arquivo do
  ordenador (`draft-stop-order*`, `road-matrix.port.ts`, `order-draft-trip-stops*`, `osrm-road-matrix.gateway.ts`) cita
  `haversine`, `coordinate-distance` ou "straight line". O glob já cobre o serviço da Fase B.

### T2 — Ordenador

`apps/api-transportada/src/trips/domain/draft-stop-order.policy.ts` (`orderStopsByRoad`, `measureOpenPathCost`,
`resolveDraftStopOrderMode`), constantes em `draft-stop-order.constant.ts` (`STOP_ORDER_SOURCES`, códigos estáveis,
`DRAFT_STOP_ORDER_MAX_STOPS = 100`, timeout 5 s) e erro de programação em `draft-stop-order.error.ts`.

- Vizinho mais próximo a partir do barracão (índice 0), refinado por busca local de melhor melhora com 2-opt (custo do
  trecho invertido pelas somas de prefixo no sentido contrário, porque a matriz do OSRM é assimétrica) e **realocação de
  uma parada**. A realocação não estava escrita na spec: o 2-opt sozinho não sai do caso "barracão em 0, paradas em 1, 3
  e −2" (fica em 8, o ótimo é 7), que está no contrato.
- O resultado só substitui a ordem de entrada se for estritamente mais barato; empate mantém a ordem que já estava.
- Modo `insert_new` (origem `manual`): a nova entra logo depois da parada anterior escolhida (ou no começo); a antiga sem
  coordenada não se move; a nova sem coordenada vai para o fim.
- Tempo medido no pior tamanho aceito (100 paradas, matriz assimétrica aleatória): ~150 ms numa execução local.

### T3 — Porta e gateway

`apps/api-transportada/src/trips/application/road-matrix.port.ts` (`RoadMatrixPort.readMatrix`, durações e distâncias
N×N) e `apps/api-transportada/src/trips/infrastructure/osrm-road-matrix.gateway.ts` (`GET /table/v1/driving/...?annotations=duration,distance`,
schema com tamanho N×N conferido, célula negativa recusada, timeout 5 s, qualquer falha = `null`, sem log).
Contrato em `apps/api-transportada/test/trip-infrastructure/osrm-road-matrix.contract.ts`: URL, sinal de abort, menos de
dois pontos sem chamada, seis respostas malformadas + HTTP 502 + rede caída = `null`, tempo esgotado = `null`.

### Comandos

```bash
cd apps/api-transportada
bun test ./test/trip-domain.contract.test.ts ./test/trip-infrastructure.contract.test.ts ./test/whatsapp-commands.contract.test.ts
#  1569 pass, 0 fail
bunx eslint <arquivos novos>   # sem achados
bunx tsc --noEmit              # sem erros (NODE_OPTIONS=--max-old-space-size=8192)
```

Ainda nada liga o ordenador: o serviço `orderDraftTripStops`, a migration e a rota são da Fase B.

## Fase B (sonnet)

### T4 — Migration

`apps/api-transportada/drizzle/20261111193708_trip_stop_order_source/`: `trips.stop_order_source` (`unordered` por padrão,
CHECK em `unordered|suggested|manual`) e `trips.stop_order_error_code` (nulo, CHECK nos três códigos). Aditiva; a viagem
existente nasce `unordered` e não é reordenada. Rollback remove as colunas e a linha do diário (`ROW_COUNT = 1`). Os
vocabulários moraram em `src/shared/trip-stop-order.constant.ts`: o pre-deploy importa `database/trip.schema.ts` e a imagem
de runtime só copia `database/` e `shared/` (o contrato `a imagem de runtime copia todo o grafo de imports` reprovou a
primeira versão, que importava de `trips/domain`).

### T5 — Serviço e ligação

`createOrderDraftTripStops` (`trips/application/order-draft-trip-stops.use-case.ts`): lê o estado, o barracão (`readDepot`) e
as coordenadas de `geocoded_addresses` (só `rooftop|street|postal_code` entram; `city` fica de fora), pede a matriz única,
chama `orderStopsByRoad` e escreve por `reorderTripStops` (a porta de não-retorno). Falhas gravam o código e deixam a ordem
de chegada: `ROUTING_MATRIX_UNAVAILABLE`, `ROUTING_DEPOT_NOT_GEOCODED`, `ROUTING_TOO_MANY_STOPS`. ⚠️ **Decisão da
implementação:** numa falha, a origem `manual` **continua `manual`** (só o código é gravado); `unordered` só substitui
`unordered` e `suggested`. Ligado em `linkDocumentsBatch` e `linkDocument` (depois do vínculo e antes do congelamento da
rota, sem nunca derrubá-lo; `order-draft-trip-stops-gracefully.ts` loga só `tripId`, fase e nome do erro). O aceite da
sugestão multiveículo vincula com `orderStops: false` e grava `suggested` ao reordenar, para não pedir uma matriz por nota.
Sem `ROUTING_MATRIX_URL` o ordenador não é montado e tudo segue como antes.

### T6 — Rota e origem

`POST /trips/:id/stops/auto-order` (`trip.manage`, 409 em viagem despachada): refaz inclusive a ordem manual e recongela a
rota. `reorderTripStops` ganhou `source` (padrão `manual`, a rota do despachante); o repositório grava
`stop_order_source` e limpa `stop_order_error_code` **na mesma transação** da escrita. A 058 (`createTripStopOrderWriter`)
e o aceite multiveículo passam `suggested`. O detalhe da viagem devolve `stopOrderSource` e `stopOrderErrorCode`. A rota
entrou na lista do separador (`separator-role`, mesma `trip.manage` do reordenar manual).

### T7 — Verificação

```bash
cd apps/api-transportada
bun --env-file=../../.env.test run test                       # contratos: 15111 testes, 0 fail depois dos ajustes abaixo
DATABASE_URL=postgresql://…/transportada bun test ./test/integration/draft-stop-order.integration.ts
#  4 pass, 0 fail (Postgres 16 real, matriz falsa pela longitude)
bunx tsc --noEmit             # sem erros
bunx eslint <arquivos alterados e novos>   # sem achados
```

Contrato novo `test/trip-stops/order-draft-trip-stops.contract.ts` (11 casos: ordem da estrada, já ordenada, OSRM fora,
manual sobrevive à falha, encaixe da nota nova, nada a fazer, botão refaz a manual, parada sem coordenada, limite de
paradas, barracão sem geocodificação, despachada) e integração `test/integration/draft-stop-order.integration.ts` (CA1,
CA2, CA3 e CA4 contra o banco; entrou na lista `test:integration`). Ajustes que a suíte cobrou: `reorder.contract.ts`
(agora há `source` na chamada), `separator-role` e os payloads de `TRIP_DETAIL`.

## Fase C — painel (T8, T9)

```bash
cd apps/frontend-transportada
bunx tsc --noEmit && bunx eslint <alterados>     # sem achados
bun run test                                     # trip.contract.test.ts: 3166 pass, 0 fail
```

- `quickCreateTrip` só chama a ordem em linha reta (`reorderByMap`) quando a pessoa mexeu na ordem das cidades
  (`cityOrderTouched`, via `isCityOrderTouched`); sem ajuste, a API ordena por estrada ao vincular as notas.
- Detalhe da viagem: `TripStopOrderNotice` (origem da ordem ou motivo da falha + botão "Ordenar paradas",
  `POST /trips/:id/stops/auto-order`, só com `trip.manage` e viagem editável). Contrato novo
  `test/trip/stop-order-source.contract.ts`.
- Prints (`prints/t9-{suggested,error}-{desktop,mobile}-{light,dark}.png`, 1440 e 375), gerados por
  `test/spec-323-stop-order-prints.smoke.spec.ts` (fora da CI; `PLAYWRIGHT_TEST_MATCH`). O botão tem a altura dos
  botões vizinhos ("Corrigir ponto no mapa", "Desvincular") e o aviso usa o tom de alerta já existente.
