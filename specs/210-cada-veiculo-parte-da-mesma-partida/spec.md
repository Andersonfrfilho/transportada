# Feature 210 — Cada veículo parte da mesma partida

> Registrada em 2026-09-25, a partir de um defeito P0 apontado por revisão de código no otimizador
> multi-veículo do worker.
>
> **Numeração.** Conferida em 2026-09-25 com `git fetch && git log --all --format=%h -- 'specs/2*'`
> e `ls specs`: 200 a 209 estavam tomados (203 a 209, os mais recentes, por sessões concorrentes na
> mesma árvore). Esta é a **210**.

## Problema e resultado

`runRouteOptimization` (`apps/worker-transportada/src/routing/application/route-optimization.effect.ts`)
monta a proposta de viagem para **todos os veículos de uma sugestão multi-veículo** (spec 106) numa
única passada, em `toOrderedStops`.

Medido no código em 2026-09-25:

1. O relógio da proposta, `clockSeconds`, era declarado **uma vez, fora** do
   `for (const assignment of input.solution.assignments)` (linha 329, antes do fix).
2. Dentro do laço, só `previousIndex` era zerado por veículo (linha 339): "cada veículo recomeça no
   depósito" valia para a **distância/duração do primeiro trecho**, mas não para o **relógio**.
3. Resultado: a primeira parada do 2º veículo (e de todo veículo depois do 1º) herdava, no ETA
   publicado, o trecho de estrada **e** o tempo de serviço de todas as paradas dos veículos
   anteriores — em vez de partir de `departureEpochSeconds`, como a primeira parada do 1º veículo.
4. `Math.max` da espera pela janela (linha 357, hoje 364) só empurra o relógio para cima — nunca
   corrige a herança.
5. O fitness do solver (`route-fitness.policy.ts:66`, `evaluateRoute`) **zera por rota**: cada
   chamada começa com `durationSeconds = 0` e `previous = input.problem.depotIndex`, por veículo. O
   custo que decide a rota nunca teve esse viés — só o ETA gravado e exibido.
6. O ETA inflado chega a `trip_stops.estimated_arrival_at` pelo aceite multi-veículo
   (`trip-composer.adapter.ts`) e ao portal do contratante (`contractor-delivery.query.ts:38`).

**Resultado.** `clockSeconds` é inicializado dentro do laço por veículo, junto com `previousIndex` —
cada veículo parte de `departureEpochSeconds`, igual ao que o fitness já assumia.

## Fora do escopo

- **Pausas obrigatórias de jornada (`sinceBreakSeconds` / `insertBreakIfDue`,
  `route-fitness.policy.ts:67,85-88,239-252`).** O fitness soma a pausa a `durationSeconds` quando
  `duty.breakEverySeconds` e `duty.mandatoryBreakSeconds` não são nulos; `toOrderedStops` não soma
  pausa nenhuma ao montar o ETA publicado. É uma segunda divergência entre custo e ETA, do mesmo
  formato desta — mas com condição de contorno diferente (só aparece quando a jornada está
  configurada) e merece a própria spec. Registrada como achado em `evidence.md`, não corrigida aqui.
- **Backfill de viagens já aceitas.** Sugestões multi-veículo já aceitas antes deste fix mantêm o
  ETA inflado gravado em `trip_stops.estimated_arrival_at` — recalcular exigiria re-otimizar viagens
  em andamento, decisão que este fix não toma.
- Qualquer mudança em `route-fitness.policy.ts` ou no solver (`route-solver.ts`): o fitness já
  estava correto: o defeito é só na tradução da solução em ETA publicado.

## Histórias priorizadas

### P1 — O ETA do 2º veículo em diante parte da mesma hora de saída

**Given** uma sugestão de viagem multi-veículo com 2+ veículos e paradas atribuídas a mais de um
**When** o worker monta a proposta (`runRouteOptimization`)
**Then** a primeira parada de cada veículo tem `estimatedArrivalAt` igual a
`departureEpochSeconds + trecho(depósito → primeira parada do veículo)` — nunca somando o trecho ou
o serviço de paradas de outro veículo.

## Requisitos funcionais

- RF-01: `clockSeconds` é reiniciado em `departureEpochSeconds` a cada veículo (`assignment`) do
  laço em `toOrderedStops`, no mesmo escopo em que `previousIndex` já é reiniciado.
- RF-02: o comportamento de um único veículo, e a soma de espera por janela (`Math.max` na linha
  ~364), continuam exatamente como estavam — o fix não toca nesse trecho.

## Requisitos não funcionais

- RNF-01: determinismo (ADR-0044 §8) preservado — a mesma semente continua dando a mesma proposta.

## Casos extremos e falhas

- Sugestão de um veículo só: comportamento inalterado (é o caso que os testes existentes já cobrem).
- Veículo sem paradas atribuídas (`stopIndexes: []`): o laço interno não roda, `clockSeconds` local
  morre sem uso — sem efeito.
- Veículo com janela de entrega (`windowStartSeconds`): a espera continua sendo computada a partir
  da partida do **próprio** veículo, não mais contaminada pelo relógio do anterior.

## Critérios de aceite

- Contrato novo em `test/routing/route-optimization-effect.contract.ts` prova, com um `solve` de
  teste que fixa as atribuições, que a primeira parada do 2º veículo usa só o trecho
  depósito→parada, sem herdar tempo do 1º veículo. Falha antes do fix (480s ao invés de 120s no
  cenário do teste), passa depois.
- Suíte de contrato do worker (`bun --env-file=../../.env.test test --timeout 120000`) e de
  integração (`bun --env-file=../../.env.test run test:integration`) verdes.
- `bun run typecheck` e `bun run lint` do worker sem erros.

## Dúvidas

Nenhuma bloqueante — achado das pausas registrado em "Fora do escopo" e `evidence.md`, sem
`[NEEDS CLARIFICATION]` aberto.
