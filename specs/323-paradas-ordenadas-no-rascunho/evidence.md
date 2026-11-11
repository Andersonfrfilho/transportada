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
