# Evidência — 153

Registro por task: comando, resultado e commit.

## T001 — OSRM aceita `exclude=toll` ✅

OSRM `v6.0.0`, algoritmo **MLD**, perfil `/opt/car.lua` padrão da imagem
`ghcr.io/project-osrm/osrm-backend:v6.0.0`, sobre o extract real `ribeirao.osrm`
(`deploy/osrm/data`, processado com `osrm-extract -p /opt/car.lua` + `osrm-partition` +
`osrm-customize`) — o mesmo pipeline do `deploy/osrm/Dockerfile`.

```bash
docker run -d --name osrm-spike-153 -p 53105:5000 \
  -v "$PWD/deploy/osrm/data:/data:ro" \
  ghcr.io/project-osrm/osrm-backend:v6.0.0 \
  osrm-routed --algorithm mld --max-table-size 2000 -i 0.0.0.0 -p 5000 /data/ribeirao.osrm
```

Rota Ribeirão Preto → Franca (`-47.8103,-21.1767;-47.3925,-20.5386`), com
`overview=false&alternatives=false&annotations=nodes`:

| Chamada        | `code` | Distância | Duração | Nós anotados |
| -------------- | ------ | --------- | ------- | ------------ |
| sem `exclude`  | `Ok`   | 89.301 m  | 4.186 s | 1.139        |
| `exclude=toll` | `Ok`   | 95.969 m  | 6.486 s | 1.486        |

Controle, para provar que o servidor **valida** a classe em vez de ignorar o parâmetro:

```bash
curl -s '.../route/v1/driving/...?exclude=banana'
{"message":"Exclude flag combination is not supported.","code":"InvalidValue"}
```

**Conclusão:** `exclude=toll` é aceito e muda a rota de verdade — 6,7 km a mais, 38 min a mais e
traçado diferente (contagem de nós distinta). A classe inválida é recusada, então o `Ok` do `toll`
é suporte real, não parâmetro engolido. **D1 confirmado**: a chamada com `exclude=toll` pode
alimentar a opção "sem pedágio" do seletor.

⚠️ O suporte vem do `excludable` do `car.lua` e é **assado no dataset** pelo `osrm-partition` —
dataset processado com perfil sem `excludable` recusaria a chamada. O caso extremo já previsto na
spec (falha isolada, `warn` uma vez por processo) continua valendo para instalação com perfil próprio.

## T101 — Migration aditiva do RF1 + schema Drizzle + rollback ✅

Colunas novas em `trips` (RF1): `planned_route` (jsonb), `planned_distance_meters`,
`planned_return_distance_meters`, `planned_duration_seconds` (`bigint`, `mode: 'number'`, precedente
`route-suggestion.schema.ts`), `planned_route_frozen_at`. `planned_toll`/`planned_toll_frozen_at`
(spec 090 T11) não mudam — a migration não os menciona.

Dois CHECKs, na forma de `trips_planned_toll_check` (D4 — a rota nasce inteira numa escrita, mesmo
`frozen_at`): `trips_planned_route_check` (as quatro colunas nascem e morrem com
`planned_route_frozen_at`) e `trips_planned_route_metrics_check` (as três colunas numéricas nunca são
negativas — `planned_return_distance_meters = 0` continua legal para `end_policy = 'last_stop'`).

Pasta `apps/api-transportada/drizzle/20260916174951_trip_planned_route/` (`migration.sql`,
`rollback.sql`, `snapshot.json`, gerada com `bun run db:generate --name trip_planned_route`).

### Contrato vermelho, antes de implementar

```bash
cd apps/api-transportada && bun test test/database-migration.contract.test.ts
```

```
54 pass
4 skip
2 fail
680 expect() calls
Ran 60 tests across 1 file. [2.19s]
```

Falhando: a asserção nova em `static-migration.contract.ts` (pasta `*_trip_planned_route` inexistente
na lista exaustiva de `directories`) e o teste novo em `trip-constraints.assertion.ts` (colunas e
CHECKs ainda não existem no schema).

### Verde, depois de implementar

```bash
cd apps/api-transportada && bun test test/database-migration.contract.test.ts
```

```
56 pass
4 skip
0 fail
728 expect() calls
Ran 60 tests across 1 file. [2.19s]
```

### Gates

```bash
bun run typecheck   # raiz do worktree — api, worker, cron, 3 frontends
```

6 `tsc --noEmit` limpos, sem erro.

```bash
bun run lint        # raiz do worktree
```

6 `eslint --max-warnings=0` / `eslint .` limpos, sem erro nem warning.

```bash
cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
```

```
6086 pass
23 skip
0 fail
21465 expect() calls
Ran 6109 tests across 177 files. [10.92s]
```

```bash
make config && make migration-test
```

```
 96 pass
 0 fail
 1288 expect() calls
Ran 96 tests across 8 files. [29.72s]
```

Migration e rollback aplicados de verdade num Postgres descartável — inclui as asserções reais de
CHECK em `trip-constraints.assertion.ts` (meia-escrita rejeitada, `planned_return_distance_meters = 0`
aceito, métricas negativas rejeitadas).

## T102 — Assinatura de rota, `selectRouteOption` e `summarizeRoadDistance` ✅

Três seams puros, sem I/O e sem import de `application/` nem de `infrastructure/`:

- `apps/api-transportada/src/trips/domain/route-choice.policy.ts` (152 linhas) —
  `ROUTE_CHOICE_CRITERIA`, `RouteChoiceCriterion`, `RouteChoice`, `SelectableRouteOption`,
  `SelectedRouteOption`, `buildRouteSignature`, `selectRouteOption`.
- `apps/api-transportada/src/trips/domain/planned-road-distance.policy.ts` (65 linhas) — `RoadLeg`,
  `RoadDistanceSummary`, `summarizeRoadDistance`.

Contratos em `test/trip-domain/route-choice.contract.ts` e
`test/trip-domain/planned-road-distance.contract.ts`, importados por
`test/trip-domain.contract.test.ts` — entrypoint **já** na lista explícita de arquivos de teste do
`package.json` (linha 26), então as suítes novas rodam sem mexer nela.

### Decisões do seam

**A assinatura sai de `nodeIdsByLeg`, não de `nodeIds`.** A lista achatada do gateway é deduplicada
**atravessando o limite do trecho** (`toNodeIdsByLeg`, `osrm-route-geometry.gateway.ts`), então duas
rotas que só diferem em onde a parada cai achatam para a mesma sequência: `[[1,2,3],[4,5]]` e
`[[1,2],[3,4,5]]` produzem o mesmo `[1,2,3,4,5]`. Assinatura igual para rotas diferentes é a colisão
que a D2 não pode ter, e o contrato a fixa.

**`reproduced` responde "a rota devolvida é a que o pedido pediu".** `false` nas duas formas de
falhar — assinatura veio e não foi encontrada, ou o critério não achou candidata e a escolha caiu na
principal (`cheapest` com todo `totalCost` nulo, `no_toll` sem rota sem pedágio). Pedido **sem**
assinatura que o critério atende é `true`: nada deixou de ser reproduzido, e um aviso ali acusaria
falha inexistente em toda viagem criada sem seletor (corpo ausente, recálculo da D6).

**`rankRouteOptions` não é reimplementado.** `SelectableRouteOption` **estende** `RankedRouteOption`
(`toll-booths/domain/route-option.policy.ts`), então `totalCost`/`fuelTotal` só podem vir de lá — a
soma de combustível + pedágio continua com um dono só. Esta política compara os valores já pontuados
(`parseScaledDecimal`/`MONEY_SCALE`, como a vizinha: em texto `'9,00'` viria depois de `'10,00'`) e
mantém a mesma regra de empate, a primeira vence.

⚠️ Divergência deliberada, para a T104: `rankRouteOptions.cheapestIndex` é `null` quando **qualquer**
opção tem `totalCost` nulo (é rótulo — não se chama de "mais barata" o que não dá para comparar),
enquanto `selectRouteOption` com `cheapest` elege a de menor `totalCost` **não nulo**. Com
`[A sem pedágio conhecido, B R$ 110]` não há rótulo "mais barata" e a selecionada é B. Eleger A seria
gravar a rota cujo custo ninguém sabe tendo outra medida ao lado. O rótulo segue vindo de
`cheapestIndex`/`costGap`; `selectedIndex` vem daqui.

### Contrato vermelho, antes de implementar

```bash
cd apps/api-transportada && bun test ./test/trip-domain/route-choice.contract.ts
```

```
error: Cannot find module '../../src/trips/domain/route-choice.policy.js' from '.../test/trip-domain/route-choice.contract.ts'

 0 pass
 1 fail
 1 error
```

```bash
cd apps/api-transportada && bun test ./test/trip-domain/planned-road-distance.contract.ts
```

```
error: Cannot find module '../../src/trips/domain/planned-road-distance.policy.js' from '.../test/trip-domain/planned-road-distance.contract.ts'

 0 pass
 1 fail
 1 error
```

### Verde, depois de implementar

```bash
cd apps/api-transportada && bun test test/trip-domain.contract.test.ts
```

```
209 pass
0 fail
900 expect() calls
Ran 209 tests across 1 file. [71.00ms]
```

21 contratos novos (188 → 209): assinatura estável entre chamadas e no formato `[0-9a-f]{32}`,
estradas diferentes com assinaturas diferentes, colisão de achatamento recusada, rota sem anotação e
rota sem nó nenhum sem assinatura; os quatro critérios; assinatura não encontrada caindo no critério
com `reproduced: false`; `alternative` → `cheapest`; `totalCost` nulo fora da disputa; sem candidata
alguma na principal com `reproduced: false`; uma oferta só; lista vazia devolvendo `null`; comparação
de custo como decimal. Distância: total e volta separados, `last_stop` com volta `0`, estrada ausente
com tudo `null` (nunca zero), `trailingLegs` maior que os trechos com volta `null`.

### Gates

```bash
bun run typecheck   # raiz do worktree
```

6 `tsc --noEmit` limpos, sem erro.

```bash
bun run lint        # raiz do worktree
```

6 `eslint --max-warnings=0` / `eslint .` limpos, sem erro nem warning.

```bash
bun run format:check   # raiz do worktree
```

`All matched files use Prettier code style!` (reprovou uma vez em
`test/trip-domain/route-choice.contract.ts`, corrigido com `prettier --write`).

```bash
cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
```

```
6107 pass
23 skip
0 fail
21508 expect() calls
Ran 6130 tests across 177 files. [11.29s]
```

### O que a T201/T202 recebe daqui

`summarizeRoadDistance({ legs, trailingLegs })` devolve
`{ distanceMeters, durationSeconds, returnDistanceMeters }` — os três nomes das colunas da RF1. Os
dois chamadores têm as duas entradas prontas na resposta de `readRouteGeometry`: `legs` da opção
**selecionada** e `trailingLegs` de `depot.trailingLegs` (`null` no `depot` é "esta chamada não pediu
barracão" → `trailingLegs: 0`, e a volta é `0`). A política de fim não é lida aqui de propósito:
`route-depot.policy.ts` continua sendo o único lugar que interpreta `end_policy`, e `last_stop` já
chega como `trailingLegs: 0`.

- **T201** (`freeze-trip-planned-route`) grava os três em `planned_distance_meters`,
  `planned_return_distance_meters` e `planned_duration_seconds`; os `null` da estrada ausente são a
  D5 ("nunca zero") já na forma da coluna, e o CHECK `trips_planned_route_check` da T101 exige que os
  quatro campos nasçam junto com `planned_route_frozen_at`.
- **T202** (`resolvePreviewRoad`, `read-trip-valuation.use-case.ts`) troca o
  `road.legs.reduce(...)` de hoje por esta chamada e passa a ter a volta e a duração que antes não
  calculava — `distanceMeters` mantém exatamente o número atual, o que é o que faz a paridade do
  aceite 2 valer entre prévia e viagem gravada.

## T103 — Gateway com `exclude=toll` em paralelo, dedupe por assinatura, `isNoToll` ✅

Split do `plan.md`: o **gateway** só ganha a flag; **paralelismo, dedupe e `isNoToll` moram no
chamador**. `read-route-geometry.use-case.ts` (456 linhas, `rawRoads`/`options[]`/`selectedIndex`)
não foi tocado — é escopo da T104.

- `apps/api-transportada/src/trips/application/route-geometry.port.ts` — `readRouteGeometry` ganha
  um segundo parâmetro opcional, `options?: Readonly<{ excludeToll?: boolean }>`. Aditivo: todo call
  site existente (`osrm-route-geometry.gateway.ts`, `read-route-geometry.use-case.ts:295`, fakes de
  teste) chamava com um argumento só e continua válido.
- `apps/api-transportada/src/trips/infrastructure/osrm-route-geometry.gateway.ts` — a URL ganha
  `&exclude=toll` quando `options?.excludeToll === true`; os parâmetros existentes
  (`overview`/`geometries`/`annotations`/`alternatives`) continuam intactos, só concatenados.
- `apps/api-transportada/src/trips/application/route-geometry-toll-free-candidates.service.ts`
  (73 linhas) — `RouteGeometryTollFreeCandidate` (`road`, `isNoToll`, `signature`) e
  `readRouteGeometryTollFreeCandidates({ geometry, points })`: o chamador que faz as duas chamadas,
  deduplica e marca. Reusa `buildRouteSignature` da T102 — nenhuma segunda lógica de assinatura.

Contratos em `test/trip-infrastructure/route-geometry-exclude-toll.contract.ts` (importado por
`test/trip-infrastructure.contract.test.ts`, já na lista do `package.json`) e
`test/trip-application/route-geometry-toll-free-candidates.contract.ts` (importado por
`test/trip-application.contract.test.ts`, mesma situação) — nenhuma das duas listas precisou de
edição.

### Decisões

**`Promise.allSettled`, não `Promise.all`.** O gateway real já converte toda falha em `null` dentro
do próprio `try/catch` (nunca rejeita), então na prática as duas formas isolariam a falha da mesma
forma. `allSettled` foi escolhido porque o contrato do chamador não deve **depender** desse detalhe
de implementação do gateway — uma porta falsa (ou um gateway futuro) que rejeite a promise em vez de
resolver `null` não pode derrubar a rota principal só porque o chamador usou a forma errada de
`Promise`. Isola por construção, não por acordo tácito com quem implementa `RouteGeometryPort`.

**Assinatura nula nunca deduplica.** `buildRouteSignature` devolve `null` para rota sem
`nodeIdsByLeg` (sem anotação do OSRM). Tratar dois `null` como iguais daria a mesma identidade a toda
rota sem anotação — a colisão que a própria T102 recusa. Por isso o merge só procura candidata
existente quando a assinatura da rota sem pedágio **não é nula**; sendo nula, ela sempre vira
candidata nova, com `isNoToll: true` e `signature: null`.

**Rota sem pedágio que bate com a principal marca `isNoToll: true` na mesma entrada, sem duplicar.**
É o caso sutil do aceite: uma estrada que responde às duas chamadas (mesma assinatura) precisa
continuar como **uma** candidata — perder a marca ao dedupear seria esconder da T104 que aquela rota
é, de fato, a rota sem pedágio.

**A chamada `exclude=toll` falhando (rejeita ou devolve `null`) preserva a principal sozinha.** É o
caso descrito no `plan.md` ("falha da chamada com `exclude` não derruba a outra").

**A chamada principal falhando esvazia a lista, mesmo com a sem pedágio OK.** Decisão nova desta
task, não coberta literalmente pelo `plan.md`: toda candidata (inclusive a sem pedágio) é ancorada na
rota principal — spec 096 D2, "a alternativa é oferta, nunca troca automática". Uma rota sem pedágio
sozinha não tem principal ao lado para ser oferta _de_, então não há nada publicável. A T104, que vai
decidir o que a API responde quando não há candidata nenhuma (provavelmente a queda para reta que o
gateway já produz hoje), consome essa lista vazia como sinal de "sem geometria alguma", igual a hoje.

**Log de aviso "exclude não suportado" (caso extremo do `spec.md`) não foi implementado.** Fora dos 5
itens do aceite desta task e exigiria uma dependência de logger ainda não decidida para este módulo;
fica registrado como gap para quem tratar aquele caso extremo, e não foi simulado com números
inventados.

### Contrato vermelho, antes de implementar

```bash
git stash push -- src/trips/application/route-geometry.port.ts \
  src/trips/infrastructure/osrm-route-geometry.gateway.ts
cd apps/api-transportada && bun test ./test/trip-infrastructure/route-geometry-exclude-toll.contract.ts
```

```
3 pass
1 fail
7 expect() calls
Ran 4 tests across 1 file. [9.00ms]
```

(a que falha é `asks OSRM for the toll-free route when the caller requests it` — `exclude=toll`
ausente da URL sem a mudança no gateway; `git stash pop` restaurou a implementação depois.)

```bash
cd apps/api-transportada && bun test ./test/trip-application/route-geometry-toll-free-candidates.contract.ts
```

```
error: Cannot find module '../../src/trips/application/route-geometry-toll-free-candidates.service.js' from '.../test/trip-application/route-geometry-toll-free-candidates.contract.ts'

 0 pass
 1 fail
 1 error
Ran 1 test across 1 file. [11.00ms]
```

### Verde, depois de implementar

```bash
cd apps/api-transportada && bun test ./test/trip-application/route-geometry-toll-free-candidates.contract.ts ./test/trip-infrastructure/route-geometry-exclude-toll.contract.ts
```

```
14 pass
0 fail
33 expect() calls
Ran 14 tests across 2 files. [22.00ms]
```

10 contratos novos no chamador (duas rotas diferentes → duas candidatas com `isNoToll` correto e as
duas chamadas de fato paralelas; mesma estrada nas duas chamadas → uma candidata só com
`isNoToll: true`; falha isolada da chamada sem pedágio, por exceção e por `null`, preservando a
principal; principal falhando por exceção e por `null` esvaziando a lista; rota sem pedágio sem
anotação nunca tratada como duplicata; alternativas da principal continuam na lista sem marca; rota
sem pedágio que bate com uma alternativa marca a alternativa certa, não a principal; a chamada sem
pedágio pedida pela flag do gateway) e 4 no gateway (sem `exclude=toll` por padrão, sem ele com
`excludeToll: false` explícito, com ele em `excludeToll: true`, parâmetros existentes intactos).

### Gates

```bash
bun run typecheck   # raiz do worktree
```

6 `tsc --noEmit` limpos, sem erro.

```bash
bun run lint        # raiz do worktree
```

6 `eslint --max-warnings=0` / `eslint .` limpos, sem erro nem warning.

```bash
bun run format:check   # raiz do worktree
```

Reprovou uma vez nos dois arquivos novos (`route-geometry-toll-free-candidates.service.ts` e o
contrato correspondente), corrigido com `prettier --write`; depois, `All matched files use Prettier
code style!`.

```bash
cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
```

```
6121 pass
23 skip
0 fail
21541 expect() calls
Ran 6144 tests across 177 files. [11.26s]
```

14 testes a mais que a base da T102 (6130 → 6144), sem nenhuma quebra nas 6107 já existentes.

### O que a T104 recebe daqui

`readRouteGeometryTollFreeCandidates({ geometry, points })` devolve
`readonly RouteGeometryTollFreeCandidate[]` (`road`, `isNoToll`, `signature`) já deduplicada — a
T104 monta `options[]`/`selectedIndex` a partir desta lista, e decide o que fazer quando ela vem
vazia (principal falhou) dentro do fluxo existente de `read-route-geometry.use-case.ts`, sem repetir
a lógica de paralelismo ou de assinatura.
