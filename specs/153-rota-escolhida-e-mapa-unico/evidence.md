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

**Log de aviso "exclude não suportado" — implementado como follow-up sobre o commit original.** A
revisão apontou, corretamente, que este `warn` é a segunda metade da mesma frase do `spec.md` linha
144 cuja primeira metade (chamada isolada falhando, "as demais seguem") já estava implementada: sem
o aviso, uma instalação OSRM sem `excludable` no perfil para de oferecer rota sem pedágio para sempre
e nada acusa o defeito. Não é um gap fora do aceite — é o aceite incompleto.

**O sinal é a assimetria, não a falha em si.** A chamada `exclude=toll` falhando (ou devolvendo
`null`) **enquanto a principal deu certo** é o que indica perfil sem `excludable` — se o OSRM
estivesse fora do ar, a principal também teria falhado, e a função já devolve lista vazia antes de
chegar no aviso (`if (principal === null) return []`). Por isso o aviso só é alcançável quando a
principal está de pé; as duas falhando junto (serviço fora do ar, degradação para reta, spec 153 D5)
nunca aciona o `warn`.

**Convenção de log seguida: a existente em `occurrence-notifier.gateway.ts`.** Tipo `Logger` local,
não exportado (`warn(message, metadata?)`), injetado por parâmetro opcional na função — sem importar
`ApiLogger` nem instanciar logger novo, sem `console.log`. Sem `logger` informado, um `NO_OP_LOGGER`
de módulo absorve a chamada, então nenhum dos 10 testes originais do T103 precisou mudar.

**Sem PII, sem URL, sem coordenada na linha de log.** A chamada de aviso não carrega `metadata`
nenhum — só o nome do evento, `trip_route_geometry_exclude_toll_unsupported` — porque a mensagem de
erro capturada do `Promise.allSettled` poderia, em tese, embutir fragmento de URL (que carrega
coordenada de parada), e a spec veda isso explicitamente. Testado serializando as chamadas do logger
falso e checando que nem a coordenada `-47.8103` nem a substring `http` aparecem.

**"Uma vez por processo" (spec.md linha 144) via `WeakSet` por instância de logger, sem `reset`
exportado para teste.** Um `boolean` solto no módulo travaria depois do primeiro teste que dispara o
aviso, e ficaria dependente da ordem de execução dos contratos. Em vez disso, `warnedLoggers` é um
`WeakSet<Logger>`: em produção há exatamente um logger para o processo inteiro (criado uma vez em
`main.ts`), então o efeito prático é idêntico a "uma vez por processo"; em teste, cada contrato cria
seu próprio logger falso via `recordingLogger()`, então cada um é uma chave nova no `WeakSet` — o
aviso de um contrato não vaza para o outro, não depende de rodar antes ou depois de qualquer outro, e
nada precisou ser exportado só para permitir resetar estado entre testes.

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

### Contrato vermelho do aviso, antes de implementar

Oito testes novos em `route-geometry-toll-free-candidates.contract.ts`, incluindo o `recordingLogger()`
falso (só grava o que recebeu, sem tocar em infraestrutura real), antes de o `warn` existir no
serviço:

```
14 pass
4 fail
35 expect() calls
Ran 18 tests across 1 file. [90.00ms]
```

As 4 falhas são todas `expect(logger.calls).toHaveLength(1)` recebendo `0` — as duas chamadas de
"avisa quando..." (rejeita e `null`), a de "avisa só uma vez... falhas repetidas" e a de "logger novo
tem o próprio contador" — exatamente os quatro casos que dependem do `warn` existir. Os quatro que já
passavam de cara ("não avisa quando as duas dão certo", "não avisa quando as duas falham", "mensagem
sem coordenada nem URL" porque `logger.calls` vazio também não contém as substrings vetadas, e
"funciona sem logger nenhum") confirmam que a ausência do aviso já não quebrava nada — só faltava o
aviso em si.

Depois de implementar `warnExcludeTollUnsupportedOnce` no serviço:

```
22 pass
0 fail
43 expect() calls
Ran 22 tests across 2 files. [91.00ms]
```

### Gates do follow-up

`bun run typecheck` (raiz): limpo nas 6 apps depois de trocar `metadata?: Record<string, unknown>`
por `metadata: Record<string, unknown> | undefined` no tipo de retorno de `recordingLogger()` —
`exactOptionalPropertyTypes` não aceita atribuir `undefined` explícito a uma propriedade opcional.
`bun run lint`: limpo. `bun run format:check`: acusou o arquivo de teste na primeira passada;
`bunx prettier --write` nos dois arquivos tocados resolveu (o serviço já veio formatado). Suíte
completa (`cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000`):

```
6129 pass
23 skip
0 fail
21551 expect() calls
Ran 6152 tests across 177 files.
```

8 testes a mais que a base do T103 original (6144 → 6152), sem nenhuma quebra nas 6144 já
existentes.

### O que a T104 recebe daqui

`readRouteGeometryTollFreeCandidates({ geometry, points })` devolve
`readonly RouteGeometryTollFreeCandidate[]` (`road`, `isNoToll`, `signature`) já deduplicada — a
T104 monta `options[]`/`selectedIndex` a partir desta lista, e decide o que fazer quando ela vem
vazia (principal falhou) dentro do fluxo existente de `read-route-geometry.use-case.ts`, sem repetir
a lógica de paralelismo ou de assinatura.

## T104 — `signature`/`isNoToll` em `options[]`, `selectedIndex`, campos de topo pela selecionada ✅

`read-route-geometry.use-case.ts` (agora ~490 linhas — ver "Decisões" sobre não dividir o arquivo)
troca a chamada crua `input.geometry.readRouteGeometry(plan.stops)` por
`readRouteGeometryTollFreeCandidates` (T103): cada `RouteGeometryOption` ganha `signature` e
`isNoToll` direto da candidata correspondente, sem recalcular nem rehashear nada — um dono só,
como o `plan.md` exige. `selectRouteOption` (T102) decide qual índice vira `selectedIndex`, com
`{ criterion: 'cheapest', signature: null }` como escolha padrão quando `input.choice` está
ausente. Os campos de topo (`legs`, `points`, `toll`) passam a ser os de `options[selectedIndex]`,
não mais sempre `options[0]` — o defeito que esta spec existe para corrigir.

- `RouteGeometryOption` ganha `isNoToll: boolean` e `signature: null | string`.
- `RouteGeometryView` ganha `selectedIndex: null | number` e `choiceReproduced: boolean` (nome
  espelhando o futuro `planned_route.choiceReproduced` da Fase 2, D3). Os comentários de `legs` e
  `toll` foram reescritos: de "sempre a rota principal" para "sempre a rota selecionada".
- `ReadRouteGeometryInput` ganha `choice?: RouteChoice` — **desenhado, não ligado ao HTTP**: nenhuma
  rota/controller passa este campo ainda. É isso que a Fase 2 (T201/T204) vai preencher a partir do
  corpo do pedido.
- `UNAVAILABLE_VIEW` ganha `selectedIndex: null, choiceReproduced: true` — sem candidata nenhuma não
  há escolha a reproduzir ou não reproduzir, e marcar como "reproduzida" evita a tela acusar uma
  falha de seleção que não existiu (só a ausência de rota, já coberta por `source: 'unavailable'`).

### Decisões

**Arquivo não foi dividido, apesar de passar de 200 linhas.** `read-route-geometry.use-case.ts`
tinha 455 linhas antes desta task (já acima do limite por causa da soma de pedágio/depósito
acumulada desde specs anteriores) e fecha em ~490. A função `readRouteGeometry` continua a única
dona da montagem da view: dividir agora — por exemplo, separar "monta `options[]`" de "escolhe e
publica os campos de topo" — criaria uma dependência de dados (a segunda parte precisa do
`ranking` e dos `candidates` da primeira) entre dois arquivos sem ganhar coesão nenhuma, só
indireção. Julgamento explícito: manter, sinalizado aqui em vez de refatorar às pressas dentro do
escopo desta task.

**`cheapestIndex`/`costGap` (rótulo) não foi unificado com `selectedIndex` (seleção).** São donos
diferentes por desenho (`route-option.policy.ts` vs `route-choice.policy.ts`, ver o comentário de
topo de `route-choice.policy.ts`), e a spec pede a divergência **pinada** num contrato, não
escondida: pedágio desconhecido numa opção zera `cheapestIndex` (nenhuma concorre ao rótulo por
ausência de dado, nunca por empate — spec 096 D1), mas não impede `selectRouteOption` de achar,
entre as que **sabem** o próprio custo, a mais barata. Contrato
`'cheapestIndex e selectedIndex podem discordar...'` em `route-geometry-options.contract.ts` fixa o
caso exato: opção A com pedágio desconhecido (nós nulos, nunca deduplica — ver T103), opção B com
pedágio exato de R$110 (`praca(99, '110.0000', ...)`, multiplicador 1/1) — `cheapestIndex: null`,
`costGap: 'TOLL_UNKNOWN'`, mas `selectedIndex: 1` e `choiceReproduced: true`.

**`selectableOptions` é montado no use case, não em `route-choice.policy.ts`.** Nenhuma função nova
entrou no domínio: `SelectableRouteOption` já é `RankedRouteOption & { isNoToll, signature }`, e o
use case só faz `ranking.options.map((option, index) => ({ ...option, isNoToll: candidates[index]
?.isNoToll, signature: candidates[index]?.signature }))` — junção de dois arrays que já nascem na
mesma ordem (`resolved`/`ranking.options` vêm de mapear `candidates`), sem lógica nova a testar
isoladamente.

**Efeito colateral aceito: `read-trip-valuation.use-case.ts` passa a disparar duas chamadas ao
roteirizador, não mais uma.** `previewTripValuation` chama o `readRouteGeometry` compartilhado
(única chamada ao **use case**, D4 da spec 090 continua valendo nesse nível), mas esse use case
agora sempre busca a variante `exclude=toll` também, mesmo quando quem chamou só quer `legs`/`toll`
de topo e nunca olha `options`. Não há como evitar isso sem um parâmetro para "não busque
alternativas", que não está no escopo desta task nem foi pedido pelo `plan.md` — o contrato
`'pega carona na mesma chamada que já buscava a distância, nunca numa segunda dedicada a
pedágio'` foi atualizado de `toHaveLength(1)` para `toHaveLength(2)`, com o comentário deixando
claro que a segunda chamada é a `exclude=toll` da spec 153, não uma reintrodução do defeito que a
D4 original evitava (pedágio saindo de uma rota diferente da desenhada).

**Nenhum lugar a jusante ainda assume "topo == `options[0]`".** `read-trip-valuation.use-case.ts`
(`resolvePreviewRoad`) e `freeze-trip-route-toll` (que consome `read-route-geometry` pelo mesmo
caminho) já leem `road.legs`/`road.toll` do retorno do use case compartilhado — ganham o
comportamento novo (congelar a mais barata, não mais sempre a primeira) sem precisar de nenhuma
mudança de código, porque nunca acessavam `options[0]` diretamente.

### Contrato vermelho, antes de implementar

```bash
git stash push -- apps/api-transportada/src/trips/application/read-route-geometry.use-case.ts
cd apps/api-transportada && bun --env-file=../../.env.test test ./test/trip-application.contract.test.ts --timeout 120000
```

```
84 pass
12 fail
202 expect() calls
Ran 96 tests across 1 file. [221.00ms]
```

As 12 falhas, todas esperadas (`selectedIndex`/`choiceReproduced` ainda não existem no retorno,
`options[]` ainda não carrega `signature`/`isNoToll`, e a lista ainda não reflete o merge de
sem-pedágio): 2 em `route-geometry.contract.ts` (`selectedIndex`/`choiceReproduced` ausentes) e 10
em `route-geometry-options.contract.ts` (`selectedIndex` `undefined`, `options` com 1 elemento em
vez de 2, `isNoToll`/`signature` ausentes, e uma que lança a guarda própria do teste porque
`options[1]` ainda não existe). `git stash pop` restaurou a implementação depois.

### Verde, depois de implementar

```bash
cd apps/api-transportada && bun --env-file=../../.env.test test ./test/trip-application.contract.test.ts --timeout 120000
```

```
96 pass
0 fail
225 expect() calls
Ran 96 tests across 1 file. [126.00ms]
```

```bash
cd apps/api-transportada && bun --env-file=../../.env.test test ./test/trip-domain.contract.test.ts --timeout 120000
```

```
209 pass
0 fail
900 expect() calls
Ran 209 tests across 1 file. [55.00ms]
```

Nenhuma quebra em `trip-domain` (regressão-only — `simplifyRouteGeometry`, sem relação com seleção
de rota).

### Gates

```bash
bun run typecheck   # raiz do worktree
```

6 `tsc --noEmit` limpos, sem erro (achou um erro de teste na primeira passada —
`view.options[1]?.points` podendo ser `undefined` num `toEqual`, corrigido com a mesma guarda por
`if (alternativeOption === undefined) throw ...` já usada nos outros contratos novos, nunca `!`).

```bash
bun run lint        # raiz do worktree
```

6 `eslint --max-warnings=0` / `eslint .` limpos, sem erro nem warning.

```bash
bun run format:check   # raiz do worktree
```

Reprovou uma vez no contrato editado (`route-geometry-options.contract.ts`), corrigido com
`bunx prettier --write`; depois, `All matched files use Prettier code style!`.

```bash
cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
```

Antes de descobrir o efeito colateral do `read-trip-valuation`:

```
6134 pass
23 skip
1 fail
21589 expect() calls
Ran 6158 tests across 177 files. [10.73s]
```

(a falha: `test/trip-valuation/toll-parcel.contract.ts` — `geometryCalls` esperava 1, recebeu 2; ver
"Decisões" acima). Depois de atualizar o contrato para refletir a segunda chamada:

```
6135 pass
23 skip
0 fail
21589 expect() calls
Ran 6158 tests across 177 files. [11.84s]
```

6 testes a mais que a base do T103 (6129 → 6135), sem nenhuma quebra líquida nas 6129 já
existentes — a única mudança de comportamento observável fora dos testes novos foi a contagem de
chamadas ao roteirizador no cenário de `toll-parcel.contract.ts`, corrigida no próprio teste.

### O que a Fase 2 recebe daqui

- **Forma de resposta nova**: `RouteGeometryOption` ganhou `isNoToll: boolean` e
  `signature: null | string`; `RouteGeometryView` ganhou `selectedIndex: null | number` e
  `choiceReproduced: boolean`. `legs`/`points`/`toll` de topo agora refletem
  `options[selectedIndex]`, não mais `options[0]`.
- **Forma de entrada para passar uma escolha**: `ReadRouteGeometryInput.choice?: RouteChoice`
  (`{ criterion: 'cheapest' | 'fastest' | 'no_toll' | 'alternative', signature: null | string }`,
  de `route-choice.policy.ts`, T102). Ausente é `{ criterion: 'cheapest', signature: null }`. Este
  campo **não está ligado a nenhuma rota HTTP** — é a T201/T204 quem lê o corpo do pedido
  (provavelmente `{ criterion, signature }` vindos do seletor da tela) e monta este objeto antes de
  chamar `readRouteGeometry`.
- **O que já funciona sem mudança nenhuma**: `read-trip-valuation.use-case.ts` e qualquer outro
  consumidor de `readRouteGeometry` que só lê `legs`/`points`/`toll`/`source` de topo já recebem a
  rota mais barata por padrão — a Fase 2 só precisa passar `choice` quando o operador realmente
  escolheu algo diferente do padrão.
- **A divergência pinada**: `cheapestIndex` (rótulo, pode ser `null`) e `selectedIndex` (seleção,
  quase sempre não-`null` quando há candidata) continuam sendo números diferentes de propósito — a
  tela da Fase 2 não pode assumir que "sem `cheapestIndex`" significa "sem rota selecionada".

## T201

Congelamento da rota inteira (`freeze-trip-planned-route`, renomeado de `freeze-trip-route-toll`),
`plan-route` aceitando `routeChoice` (RF3), D3 (assinatura não reproduzida cai para o critério) e D5
(OSRM fora vira rota+pedágio `null`, nunca zero) — provados por contrato e por integração contra
Postgres de verdade.

### Evidência RED

⚠️ Não tenho em mãos o texto literal da saída RED capturada antes da implementação — a sessão que a
gerou foi interrompida por rate limit e o terminal daquela execução não sobreviveu à retomada. Não
vou reconstruí-la de memória. O que fica registrado é a evidência GREEN abaixo, incluindo os testes
novos (`freeze-trip-planned-route.contract.ts`, 7 casos; `freeze-trip-planned-route.integration.ts`,
4 casos) que só existem porque a implementação os satisfaz — não uma reconstrução do estado anterior.

### Comandos e saída real

```bash
$ bun run typecheck   # raiz — 6 apps
# api-transportada, worker-transportada, cron-transportada, frontend-transportada,
# frontend-client, frontend-landing: tsc --noEmit limpo em todas

$ bun run lint        # raiz — 6 apps
# eslint --max-warnings=0 limpo em todas

$ bun run format:check   # raiz
Checking formatting...
All matched files use Prettier code style!

$ cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
6146 pass
23 skip
0 fail
21620 expect() calls
Ran 6169 tests across 177 files. [10.53s]
```

Base do T103/fases anteriores: 6139 pass / 23 skip / 0 fail / 177 arquivos. Delta: **+7 pass**, skip
e arquivos inalterados — exatamente os 7 casos novos de `freeze-trip-planned-route.contract.ts`. Sem
quebra líquida. `.integration.ts` não entra nesta contagem por convenção do Bun (arquivo sem `.test`/
`.spec` no nome não é descoberto por filtro vazio) — confirmado também neste ciclo.

```bash
$ bun --env-file=../../.env.test test ./test/integration/freeze-trip-planned-route.integration.ts --timeout 120000
4 pass
0 fail
12 expect() calls
Ran 4 tests across 1 file. [4.40s]
```

**Os 4 testes do arquivo novo caíram na contagem de pass, não na de skip** — confirmado tanto isolado
(acima, 0 skip) quanto dentro do `test:integration` agregado (abaixo), o que prova que `.env.test`
alcançou o arquivo e ele realmente exercitou o Postgres descartável (`transportada_t201_*`).

```bash
$ bun --env-file=../../.env.test run test:integration --timeout 120000
363 pass
4 skip
2 fail
2474 expect() calls
Ran 369 tests across 72 files. [229.44s]
```

As 2 falhas são pré-existentes e não relacionadas ao T201: `cte-archive-gateway.integration.ts`
falhou por `transportada-test-minio-1` estar parado no início da sessão (`ObjectStorageError:
Object storage is unavailable`) — nada a ver com trips/Postgres. Confirmado com
`docker ps -a --filter name=transportada-test`, e reiniciado o container para não deixar falso
negativo registrado; a causa raiz (container de MinIO do ambiente de teste desligado) é anterior a
este trabalho.

```bash
$ make config
18 pass
0 fail
99 expect() calls

$ make migration-test
96 pass
0 fail
1288 expect() calls
Ran 96 tests across 8 files. [28.25s]
```

`make migration-test` é o gate que mais importa para o T201: é a primeira vez que código de
aplicação escreve _através_ dos CHECKs de T101 (`trips_planned_route_check`,
`trips_planned_route_metrics_check`). Passou limpo, incluindo `trip-constraints.assertion.ts`.

### A prova de escrita única (D4)

O `DrizzleTripPlannedRouteRepository.writePlannedRoute` faz **um único** `update` (uma chamada
Drizzle, uma instrução SQL) que grava rota, métricas e pedágio juntos, com `now()` avaliado uma vez
para os dois carimbos. Duas provas, não uma:

1. **Contrato de aplicação** (`freeze-trip-planned-route.integration.ts`, terceiro caso): grava
   `FULL_ROUTE`/`FULL_TOLL` e confere
   `row.plannedRouteFrozenAt.getTime() === row.plannedTollFrozenAt.getTime()` — se fossem duas
   escritas separadas (ainda que sequenciais e bem-sucedidas), os carimbos discordariam em
   microssegundos; iguais só acontece se vierem do mesmo `now()` de uma única instrução.
2. **Regressão de banco** (`freeze-trip-planned-route.integration.ts`, quarto caso, adicionado a
   pedido explícito do coordenador): abre uma conexão `SQL` crua para o mesmo banco descartável e
   tenta `update trips set planned_route = '{}'::jsonb where id = ...` — uma escrita parcial que
   _não_ passa pelo repositório. O banco rejeita com SQLSTATE `23514` e a constraint
   `trips_planned_route_check`, confirmando que o CHECK de T101 protege a invariante mesmo contra
   quem tentar escrever fora do caminho do repositório — não é o repositório que garante o D4
   sozinho, é o banco.

### Decisões e porquês

- **Pedágio fora do JSONB de rota**: `planned_toll` continua sendo a coluna própria da spec 090 —
  `planned_route` (JSONB novo) carrega só `{ criterion, signature, choiceReproduced, points, legs,
depot }`. Misturar os dois num único JSONB obrigaria reler/reescrever pedágio toda vez que a rota
  mudasse de forma, e quebraria consumidores existentes de `planned_toll` sem necessidade.
- **`signature` persistida é a da rota realmente congelada, não a pedida (D3)**: quando a assinatura
  do pedido não bate com nenhuma opção candidata, `readRouteGeometry` cai para o critério e
  `choiceReproduced: false`; o `signature` gravado é `selected.signature` — a identidade da opção que
  _de fato_ foi escolhida, nunca a string que o cliente mandou e que não existia mais. Ver
  `freeze-trip-planned-route.use-case.ts:150`.
- **Qualquer métrica desconhecida zera a rota inteira, não zera cada campo (D5)**: `toFrozenRoute`
  devolve `null` se `distanceMeters`, `durationSeconds` ou `returnDistanceMeters` vier `null` —
  nunca grava duas métricas e cala a terceira, porque o CHECK `trips_planned_route_metrics_check`
  (T101) e o CHECK de "tudo ou nada" (`trips_planned_route_check`) exigem exatamente essa
  atomicidade; gravar parcial teria sido rejeitado pelo banco de qualquer forma.
- **`routeChoice` com `.strict()` e sem fallback silencioso**: critério fora de
  `ROUTE_CHOICE_CRITERIA` é 400, nunca um `cheapest` implícito — um cliente que erra o nome do
  critério precisa saber que errou, não descobrir semanas depois que a rota congelada não é a que
  pediu.
- **`companyId` nunca vem do corpo**: `PlanTripRouteRequestInput` carrega `routeChoice` opcional, mas
  `companyId` continua vindo só do contexto autenticado (`trip.routes.ts`), como em toda rota da
  API.
- Violação pré-existente de >200 linhas em `trip-request.schema.ts` (235 linhas) não foi introduzida
  por esta task — o arquivo já estava perto do limite antes do `routeChoice`; não escopo desta task
  dividir o arquivo.

### O que a T202/T203 recebe daqui

- **Onde ler o congelado**: `trips.plannedRoute` (JSONB: `criterion`, `signature`,
  `choiceReproduced`, `points`, `legs`, `depot`), `trips.plannedDistanceMeters`,
  `trips.plannedReturnDistanceMeters`, `trips.plannedDurationSeconds`, `trips.plannedRouteFrozenAt`
  — todos `null` juntos (D5) ou todos preenchidos juntos, nunca mistura. `trips.plannedToll`/
  `plannedTollFrozenAt` continuam como sempre (spec 090), e `plannedRouteFrozenAt` ==
  `plannedTollFrozenAt` sempre que ambos existem.
  - **T202** (valuation): pode ler distância e pedágio direto dessas colunas sem recalcular nada —
    a paridade prévia × viagem depende de nenhuma release resolver a rota duas vezes.
  - **T203** (`GET /trips/:id/route-geometry`): a resposta "frozen" é uma projeção de
    `plannedRoute` + as três métricas — sem tocar OSRM.
- **`freeze-trip-planned-route.use-case.ts`** exporta `FreezeTripPlannedRoutePort`,
  `FreezeTripPlannedRouteVehicleContext`, `FrozenPlannedRoute` e `WritePlannedRouteInput` — os tipos
  que qualquer leitor de rota congelada (T202/T203) deve espelhar, não reinventar.
- **`freeze-trip-route-toll.use-case.ts` e `drizzle-trip-route-toll.repository.ts` não existem
  mais** — todo importador foi migrado para os nomes novos (`freeze-trip-planned-route.*`); nenhum
  código deve mais referenciar os nomes antigos.

## T202

Valuation da viagem lê `trips.planned_distance_meters`/`trips.planned_toll` gravados por T201, em
vez de somar `trip_stops.distance_from_previous_meters`; a prévia (`previewTripValuation` + rota
`TRIP_VALUATION_PREVIEW_PATH`) passa a aceitar `routeChoice`; e o aceite 2 da spec (prévia × viagem
gravada × detalhe mostram a mesma rota/distância/valor) ganha um contrato de verdade.

### Evidência RED

Diferente do T201 (cuja sessão perdeu a saída RED para uma queda de terminal), aqui a saída RED foi
capturada de propósito, com `tee` para arquivo, **antes** de fechar a task — via `git stash` isolando
só os quatro arquivos-fonte já implementados (a implementação já existia de uma sessão anterior; os
testes novos, não). Dois ciclos, cada um `stash push -- <arquivos-fonte>` → roda o teste novo contra
o código antigo → `tee` do RED → `stash pop` → confirma GREEN de novo:

**1) `preview-route-choice.contract.ts` contra o código antigo** (sem `routeChoice` na prévia) —
`/private/tmp/.../scratchpad/t202-red.txt`:

```
error: expect(received).toMatchObject(expected)

  {
-   "amount": "288.0000",
+   "amount": "255.8400",
...
(fail) a prévia aceita a rota escolhida (spec 153 RF4) > com `no_toll`, troca de rota — a distância
e o pedágio passam a ser os da estrada sem praça [1.31ms]

 138 pass
 1 fail
 691 expect() calls
Ran 139 tests across 1 file. [171.00ms]
```

Sem repassar `routeChoice` à prévia, `no_toll` é ignorado e a rota principal (106,6 km, com praça)
continua sendo precificada — `255.8400` (o combustível da rota com pedágio) em vez de `288.0000` (o
combustível da rota sem pedágio, 120 km). Prova que o parâmetro realmente muda o resultado quando
aceito, e que o teste falha de verdade sem a implementação.

**2) O caso T010 pré-existente, como regressão colateral do `trip_stops` esvaziado** —
`/private/tmp/.../scratchpad/t202-red-d5.txt`:

```
error: expect(received).not.toBe(expected)

Expected: not "932.4500"
...
(fail) a viagem fecha a conta (spec 061 T010) > receita do CT-e, agregado pela tabela, imposto
descendo — e o congelado não muda depois [1118.67ms]

 1 pass
 1 fail
 16 expect() calls
Ran 2 tests across 1 file. [2.49s]
```

⚠️ Nuance a registrar com honestidade: o fixture de `seedTrip` passou a não gravar mais
`distanceFromPreviousMeters` em `trip_stops` (T202 move a fonte para `trips.planned_distance_meters`).
Sob o código **antigo** (`readPlannedDistance` somando `trip_stops`), isso zera a soma — mas SQL
`SUM()` sobre zero linhas devolve `null`, não `0`, então o teste T010 pré-existente falhava não por
expor um defeito de `noPlannedDistance`, e sim porque `recalculated.costTotal` ficava igual a
`frozen.costTotal` (ambos `932.4500`) por falta de distância nova — um sintoma correto de "fixture e
código de leitura desalinhados", não uma prova de bug de zero-vs-lacuna. O teste **novo** de D5 (a
seguir) é quem prova `noPlannedDistance` de verdade, e esse passou mesmo antes da troca de fonte,
porque a ausência total de planejamento já produzia `null` nos dois códigos — ele é um **pino
prospectivo** contra a fonte de dado certa (`trips.planned_distance_meters`), não um teste que expôs
regressão pré-existente.

### Comandos e saída real

```bash
$ bun run typecheck   # raiz — 6 apps
# limpo em todas

$ bun run lint        # raiz — 6 apps
# eslint --max-warnings=0 limpo em todas

$ bun run format:check   # raiz
# 1ª rodada: reprovou `preview-route-choice.contract.ts` (quebra de linha do import) — corrigido com
# `bunx prettier --write`, sem tocar em lógica. 2ª rodada: "All matched files use Prettier code
# style!"

$ bun --env-file=../../.env.test test --timeout 120000   # apps/api-transportada
bun test v1.3.14 (0d9b296a)

 6150 pass
 23 skip
 0 fail
 21627 expect() calls
Ran 6173 tests across 177 files. [14.62s]
```

**Delta contra a baseline** (6146 pass / 23 skip / 0 fail / 177 arquivos): **+4 pass**, skip e fail
inalterados, contagem de arquivos inalterada (os dois arquivos novos/editados já eram alcançados por
imports existentes — `preview-route-choice.contract.ts` via `test/trip-valuation.contract.test.ts`,
já listado no `package.json`; `trip-financial-end-to-end.integration.ts` já existia).

O delta foi reconciliado por isolamento real, não por contagem de `it()`/`test()` no código-fonte
(que se mostrou enganosa — os arquivos do diretório misturam `it` e `test` do `bun:test`, e contar só
um dos dois subestima o total): usei `git stash push -- <os dois arquivos de teste modificados>` mais
mover `preview-route-choice.contract.ts` para fora do diretório temporariamente, rodei a suíte
completa nesse estado ("antes" real, sem as duas mudanças de teste desta task), depois `git stash pop`
e devolvi o arquivo, e rodei de novo ("depois"):

```bash
# antes (T202 test additions revertidas via stash, arquivo novo movido para fora)
 6146 pass
 23 skip
 0 fail
Ran 6169 tests across 177 files.

# depois (git stash pop + arquivo devolvido — estado final)
 6150 pass
 23 skip
 0 fail
Ran 6173 tests across 177 files.
```

**+4 pass e +4 no total de testes rodados (6169 → 6173), skip e fail inalterados** — um delta líquido
limpo e reproduzível, obtido comparando o mesmo ambiente com e sem exatamente as duas mudanças de
teste desta task, sem depender de contar blocos `it`/`test` no código-fonte (que por si só não
bateria, dada a mistura de convenções entre arquivos). Nenhum teste foi marcado `.skip`/`.only`.

### O que ficou provado

- **`readPlannedDistance` foi removido de fato**: `trip-valuation.query.ts:201` seleciona
  `trips.plannedDistanceMeters` direto no mesmo `select` que já buscava o veículo; `:227` usa
  `trip.plannedDistanceMeters` como `distanceMeters` do `TripValuationContext`. Não há mais `SUM`
  sobre `trip_stops` em nenhum leitor de valuation.
- **`trip_stops.distance_from_previous_meters` está morta, mas viva no schema**: grep em `src/`
  mostra a coluna e sua constraint declaradas em `trip.schema.ts:308`/`:367`, e nenhum outro leitor —
  os únicos hits de `distanceFromPreviousMeters` fora desse arquivo pertencem a
  `route_suggestion_stops` (feature de sugestão multi-veículo, tabela e domínio diferentes, fora de
  escopo). Migration destrutiva para apagar a coluna não foi feita — está fora de escopo por
  instrução explícita, e a task não decidiu isso sozinha.
- **`summarizeRoadDistance({legs, trailingLegs})` substitui o `reduce` inline em
  `resolvePreviewRoad`** (`read-trip-valuation.use-case.ts`) e a alegação de "byte-idêntico" foi
  confirmada, não assumida, por dois caminhos: (1) o contrato do aceite 2 chama a mesma
  `readRouteGeometry` usada pelo congelamento (T201) e a mesma `previewTripValuation` sobre a
  **mesma** estrada fake, e as parcelas de combustível/outros-por-km batem byte a byte
  (`toMatchObject` em `amount`/`gap`); (2) estruturalmente, `road.legs`/`road.toll` em
  `RouteGeometryView` sempre refletem a opção **já selecionada** (`selectedOption.legs`/
  `selectedOption.toll`, spec 153 D1) tanto no código velho quanto no novo, e a fórmula de
  `summarizeRoadDistance` não depende de `trailingLegs` para o total de `distanceMeters` — não há
  como o `reduce` inline e a função pura divergirem para a mesma entrada.
- **`routeChoice` na prévia passa pela mesma fronteira Zod que `plan-route` (T201)**:
  `previewTripValuationSchema` usa o `routeChoiceRequestSchema` compartilhado
  (`z.enum(ROUTE_CHOICE_CRITERIA)`, `.strict()`) — um critério fora do enum é `400`, nunca um
  `cheapest` implícito. A rejeição em si é testada em `trip-request.schema.test.ts` (mesmo padrão já
  coberto por T201); `preview-route-choice.contract.ts` prova o lado de aplicação: quando o
  `routeChoice` é aceito, ele muda a rota escolhida de verdade (rota principal com pedágio → rota sem
  pedágio, combustível `255.8400` → `288.0000`).
- **Aceite 2 (paridade prévia × viagem)**: `preview-route-choice.contract.ts`, describe "aceite 2",
  constrói a mesma estrada fake (`ROAD_WITH_TOLL`) e a mesma tarifa de praça (nó 10, `10.50`) para
  os dois lados — chama `readRouteGeometry` uma vez para simular o que o congelamento gravaria
  (`distanceMeters`/`toll` via `summarizeRoadDistance`), monta um `TripValuationContext` congelado à
  mão com esse resultado, roda `readTripValuation` nele, e roda `previewTripValuation` contra a
  mesma estrada — depois compara as três parcelas (`fuel`, `other_per_kilometer`, `toll`) em
  `amount` e `gap`. **O que o contrato mantém constante de propósito**: a estrada e a tarifa
  observada da praça (`observedOn: '2026-07-01'` nos dois lados) — porque uma tarifa observada em
  data posterior é a única divergência legítima entre o momento do planejamento e uma prévia
  seguinte, e o contrato existe para isolar exatamente o que a T202 garante (rota e distância iguais
  → valor igual) sem confundir com a variação legítima de preço.
- **D5 permanece honesto em nível de integração**: o novo caso em
  `trip-financial-end-to-end.integration.ts` (`seedTripWithoutPlannedRoute`, sem nenhuma coluna de
  rota planejada) confirma via `readTripValuation` real contra Postgres descartável que `fuel` e
  `other_per_kilometer` chegam com `gap: 'NO_PLANNED_DISTANCE'`/`source: 'missing'`/`amount:
'0.0000'` — nunca um `0.0000` sem `gap`. Como registrado acima, este é um pino prospectivo contra
  a fonte de dado nova, não uma prova de regressão pré-existente (o comportamento de "null vira gap,
  nunca zero" já valia sob o código antigo, porque `SUM()` sobre zero linhas retorna `null`).

### O que a T203/T204 recebem daqui

- `TripValuationContext.distanceMeters`/`.toll` já vêm prontos de `trips.planned_distance_meters`/
  `trips.planned_toll` — T203 (`GET /trips/:id/route-geometry`) não precisa (e não deve) reabrir
  `trip_stops` para nada relacionado a distância.
- `previewTripValuation`'s `routeChoice` é opcional e propagado por spread condicional no limite
  HTTP (`exactOptionalPropertyTypes`) — T204 (multi-veículo) que precisar de um `routeChoice` por
  veículo deve replicar esse mesmo padrão de spread por veículo, não introduzir um novo formato de
  payload.
- `summarizeRoadDistance` é o único ponto de soma de `legs` para distância — qualquer novo
  consumidor (inclusive T204) deve chamar essa função, nunca reimplementar o `reduce`.

## T203

`GET /trips/:id/route-geometry` (rota **com** viagem — `TRIP_ROUTE_GEOMETRY_PATH`) passa a servir a
rota **congelada** por T201 quando ela existe, em vez de recalcular sempre ao vivo via OSRM. A outra
rota de geometria, `POST /route-geometry` (`ROUTE_GEOMETRY_PATH`, tela de montagem sem viagem ainda
criada), não foi tocada — ela é, por definição, sempre ao vivo.

### Evidência RED

Nenhuma das duas rotas de geometria tinha cobertura de contrato HTTP antes desta task —
`RouteDependencies` (fixture) nem sequer declarava `readTripRouteGeometry`/`readRouteGeometry`. Para
não nascer um teste cego à lógica de negócio (a fixture não sabe o que é uma rota congelada), a
fixture ganhou um mecanismo de sobrescrita de `execute` inteiro
(`readTripRouteGeometryExecute`), e o teste liga a fixture ao caso de uso real
`readTripRouteGeometry` — que ainda não existia. RED genuíno, capturado com `tee` **antes** de
qualquer arquivo de produção:

```bash
cd apps/api-transportada && bun --env-file=../../.env.test test ./test/trips/routes.contract.ts --timeout 120000
```

`/private/tmp/.../scratchpad/t203-red.txt`:

```
bun test v1.3.14 (0d9b296a)

test/trips/routes.contract.ts:

# Unhandled error between tests
-------------------------------
error: Cannot find module '../../src/trips/application/read-trip-route-geometry.use-case.js' from '/Users/anderson.filho/Documents/personal/transportada-wt/spec-153/apps/api-transportada/test/trips/routes.contract.ts'
-------------------------------

 0 pass
 1 fail
 1 error
Ran 1 test across 1 file. [7.00ms]
```

(Bug de sintaxe do Bun encontrado no caminho: `bun test test/trips/routes.contract.ts` sem `./`
na frente é interpretado como filtro de nome, não caminho, e devolve "did not match any test
files" — o comando certo, usado daqui para frente, leva o `./`.)

### Implementação

- **`src/trips/domain/parse-planned-route.policy.ts`** (novo): leitura defensiva de
  `trips.planned_route` (jsonb sem `.$type<>()`, o Drizzle devolve `unknown`) — forma inesperada
  vira ausência (`null`), nunca meio preenchida. Mesmo idioma de `parseTollRouteCost` (spec 090).
  Domínio declara os próprios tipos estruturais (`ParsedRouteLeg`, `ParsedRoutePoint`) em vez de
  importar tipos da camada de aplicação — confirmado por grep que nenhum `.policy.ts` do
  repositório importa de `application/` (`find src -path "*/application/*.policy.ts"` não achou
  nada, e o padrão inverso, domínio declarando o próprio formato estrutural, já existe em
  `planned-road-distance.policy.ts`'s `RoadLeg`). Por isso `depot` — que é tipado pela camada de
  aplicação (`RouteGeometryView['depot']`) — fica fora desse parser; é resolvido no repositório.
- **`src/trips/application/read-trip-route-geometry.use-case.ts`** (novo): `readTripRouteGeometry`
  chama `route.readFrozenRoute`; se vier `null` (rascunho, D5 — OSRM fora do ar na hora de congelar,
  ou D8 — viagem anterior à spec), cai para `readLiveRoute()` (a mesma leitura ao vivo de sempre) e
  devolve `frozen: false`, `criterion: null`, `signature` da opção selecionada quando houver. Se
  vier uma rota congelada, monta uma única `RouteGeometryOption` com os dados gravados e devolve
  `frozen: true`, `criterion`/`signature`/`choiceReproduced` gravados, `hasChoice: false` (não há
  outras opções para uma rota já congelada), `distanceMeters`/`durationSeconds`/
  `returnDistanceMeters` vindos das colunas armazenadas (nunca recontados).
  - `enrichFrozenToll` **nunca** chama `resolveTollRouteCost` (a função de repreço do caminho ao
    vivo) sobre o pedágio congelado — confirmado lendo o corpo de `resolveRouteToll` que essa função
    busca registros de praça **frescos** e reprecifica, o que violaria D4 (a rota congela inteira,
    de uma vez, e nunca é reprecificada na leitura). Em vez disso, reusa só
    `describeTollBoothCharges` (puro sobre o que já foi congelado) e recalcula apenas
    `catalog`/`tariffObservedOn` — metadados de hoje sobre um pedágio de ontem, não o preço em si,
    e o próprio arquivo do caminho ao vivo já documenta esses dois campos como "leitura fresca,
    nunca congelada".
  - Reusa o tipo `ReadRouteGeometryTollBoothsPort` já exportado por `read-route-geometry.use-case.ts`
    em vez de declarar um duplicado — as instâncias de `createCompanyScopedTollBoothGateway(...)`
    em `main.ts` já implementam essa forma, e o mesmo tipo serve os dois caminhos (ao vivo e
    congelado).
- **`src/trips/infrastructure/drizzle-trip-planned-route.repository.ts`**: ganhou
  `readFrozenRoute`, e a classe passou a implementar também `ReadTripRouteGeometryRoutePort` (além
  de `FreezeTripPlannedRoutePort`, que já tinha). Lê as seis colunas (`plannedRoute`,
  `plannedDistanceMeters`, `plannedDurationSeconds`, `plannedReturnDistanceMeters`,
  `plannedRouteFrozenAt`, `plannedToll`/`plannedTollFrozenAt`), confere `plannedRouteFrozenAt`/as
  métricas individualmente como ausência (não confia cegamente na constraint do banco), chama
  `parsePlannedRoute` (domínio, acima) e `parseTollRouteCost` (existente, spec 090) para o pedágio.
  `depot` é extraído do próprio jsonb de `plannedRoute` com uma checagem estrutural leve
  (`readPlannedRouteDepot`) — não precisa da validação funda do domínio porque quem grava esse jsonb
  é só a própria escrita de T201 (`writePlannedRoute`), nunca payload externo.
- **`src/main.ts`**: o bloco `readTripRouteGeometry: { execute: ... }` (dependência HTTP) passou a
  delegar para o novo `readTripRouteGeometryUseCase`, com o corpo antigo inteiro (busca da viagem,
  eixo do veículo, `readRouteGeometry` contra OSRM) virando o closure `readLiveRoute` — mesmo
  comportamento de antes, só que chamado condicionalmente agora. Ganhou `route:
tripPlannedRouteRepository` (já existia no módulo, criado para T201) e um `tollBooths` próprio
  (`createCompanyScopedTollBoothGateway`). O `readRouteGeometry: { execute: ... }` irmão (rota
  `POST /route-geometry`, sem viagem) **não foi tocado**.
- **`src/trips/presentation/trip.routes.ts`**: só o tipo de retorno de
  `Dependencies.readTripRouteGeometry.execute` mudou (`RouteGeometryView` → `TripRouteGeometryView`,
  união com `frozen`/`criterion`/`signature`/etc.). O corpo do handler não mudou nem uma linha — já
  era um repasse puro (`{ data: geometry }`, `status: 200`).

### Contrato HTTP — formas exatas

**Rota congelada** (`frozen: true`), campos principais do corpo (`data`):

```json
{
  "frozen": true,
  "criterion": "fastest",
  "signature": "frozen-signature-abc",
  "choiceReproduced": false,
  "distanceMeters": 128450,
  "durationSeconds": 9360,
  "returnDistanceMeters": 15000,
  "hasChoice": false,
  "selectedIndex": 0,
  "source": "road",
  "options": [{ "...": "uma só opção, montada a partir do que foi congelado" }]
}
```

**Sem congelamento — cai para ao vivo** (`frozen: false`): mesma forma de sempre de
`RouteGeometryView`, mais `criterion: null` e `signature` da opção selecionada (ou `null` se
`selectedIndex` também for `null`).

**Ao vivo e sem estrada disponível** (`source: 'unavailable'`, D5): `distanceMeters`,
`durationSeconds` e `returnDistanceMeters` vêm `null` — nunca `0` fingindo uma rota medida.
`summarizeRoadDistance({legs: [], ...})` já devolve os três `null` juntos quando `legs.length === 0`,
e o use case novo só repassa esse resultado.

### Decisão: viagem ainda não congelada cai para leitura ao vivo (não para "ausência")

Task pedia para decidir e justificar. Decisão: **cai para o mesmo cálculo ao vivo de sempre**, não
para uma resposta de "sem rota". Razões:

1. **É o comportamento que já existe hoje** para toda viagem em `draft`/sem congelamento — mudar
   para "ausência" seria uma regressão visível na tela de detalhe (T405, fora de escopo), que hoje
   depende de ver alguma rota.
2. **D5 já cobre o caso "OSRM fora do ar"**: se o OSRM também estiver fora do ar na hora da leitura
   ao vivo, a resposta já degrada honestamente pra `source: 'unavailable'`/métricas `null` — não
   precisa de um terceiro estado.
3. **D8 (nunca fazer backfill)** não pede um comportamento diferente na leitura — só proíbe migrar
   viagens antigas para ganhar uma rota congelada que nunca existiu. Elas continuam lendo ao vivo,
   exatamente como liam antes desta task.
4. Não fingir "congelado" quando não está: por isso `frozen: false` some sempre que a leitura não
   veio de `readFrozenRoute`, mesmo que o resultado pareça, superficialmente, uma rota só.

### Fora de escopo — T301 (D10, redação monetária)

`TRIP_READ_POLICY` não mudou (confirmado por um teste novo de `403` com `NO_PERMISSIONS` — T203 não
alarga a permissão). Onde T301 vai precisar tocar:

- **`toFrozenView`** (`read-trip-route-geometry.use-case.ts`): monta `option.totalCost: null` e
  `option.toll` sem redação — T301 precisa envolver esse retorno (ou o de `readTripRouteGeometry`
  como um todo) na mesma redação já aplicada no caminho ao vivo, condicionada a `trip.financials`.
- **`enrichFrozenToll`**: devolve `RouteGeometryToll` completo (com `total`, `chargePerAxle`, etc.)
  — os mesmos campos monetários que o pedágio ao vivo já expõe sem redação hoje. T301 trata os dois
  caminhos (ao vivo e congelado) com o mesmo serviço de redação, aplicado uma vez na fronteira HTTP
  ou dentro de ambos os use cases — não duplicar a lógica de "o que é dinheiro" entre eles.
- Nenhuma mudança de forma foi feita para acomodar T301 além de manter os campos monetários
  isolados dentro de `toll`/`option` (nunca espalhados soltos no nível raiz da resposta), o que já
  ajuda T301 a redigir por sub-objeto sem precisar listar campo por campo no nível raiz.

### Gates

```bash
# teste alvo (RED → GREEN)
cd apps/api-transportada && bun --env-file=../../.env.test test ./test/trips/routes.contract.ts --timeout 120000
 26 pass
 0 fail
 71 expect() calls
Ran 26 tests across 1 file. [279.00ms]

# typecheck (raiz, todas as apps)
bun run typecheck
# 6 tsc --noEmit, todos limpos (api, worker, cron, frontend-transportada, frontend-client, frontend-landing)

# lint (raiz, todas as apps)
bun run lint
# 6 eslint --max-warnings=0, todos limpos

# format:check (raiz) — 1ª rodada acusou 3 arquivos fora do padrão Prettier
# (main.ts, read-trip-route-geometry.use-case.ts, parse-planned-route.policy.ts);
# corrigido com `prettier --write` nos mesmos arquivos, sem mudança de lógica, e revalidado:
bun run format:check
# All matched files use Prettier code style!

# suíte completa da API
cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
 6154 pass
 23 skip
 0 fail
Ran 6177 tests across 177 files. [12.78s]
```

**Baseline (fim de T202): 6150 pass, 23 skip, 0 fail, 177 arquivos. Depois de T203: 6154 pass
(+4, exatamente os 4 testes novos), 23 skip (inalterado — nenhum teste novo caiu em skip), 0 fail,
177 arquivos (inalterado — `routes.contract.ts` já estava na lista explícita do `package.json`,
nenhum arquivo novo de teste precisou ser adicionado).**

### O que a T204/T205 recebem daqui

- `GET /trips/:id/route-geometry` agora reflete a rota **realmente vigente** da viagem (congelada
  quando existe) — T204/T205, ao recalcular rota em qualquer ponto do fluxo (multi-veículo,
  reorder, link, release), não precisam (e não devem) ler essa rota de volta para decidir se
  recalculam: a fonte de verdade para "existe rota congelada?" continua sendo
  `trips.planned_route_frozen_at`, exposta agora também via `ReadTripRouteGeometryRoutePort` caso
  outro use case precise da mesma leitura sem duplicar o parsing.
- `ReadTripRouteGeometryRoutePort`/`StoredTripRoute` (novo, em `read-trip-route-geometry.use-case.ts`)
  é o formato canônico de "rota congelada já validada" — se T204/T205 precisarem ler a rota gravada
  para outro propósito (ex.: decidir se recalculam antes do despacho), devem reusar esse port em vez
  de reimplementar a leitura+parse das seis colunas.
- `parsePlannedRoute` (domínio) é o único lugar que sabe validar o jsonb de `trips.planned_route` —
  qualquer novo leitor desse jsonb (T204/T205 inclusive) deve importar essa função, nunca duplicar a
  validação campo a campo.

## T204

Aceite multi-veículo passa a aceitar `routeChoice` **por veículo** (`routeChoiceByVehicle`), e o
aceite por viagem única (`POST /trips/:id/route-suggestions/:suggestionId/accept`) passa a **gravar
a rota**, além da ordem — que já era o único efeito de aceitar antes desta task. Confirmado no
início da task que `POST /trips/:id/plan-route` é rota separada, já entregue por T104/T201/T202, e
fora do escopo de T204: o escopo real é só os dois endpoints de _aceite de sugestão_.

### Evidência RED

Como a implementação de produção já existia no worktree ao retomar a sessão (checkpoint de sessão
anterior interrompido por um crash — trabalho perdido antes, evidência RED incluída), o RED foi
obtido revertendo **só os arquivos de produção** de volta ao estado anterior a esta task, mantendo
os arquivos de teste com as asserções novas, rodando a suíte, e restaurando a implementação depois
(`git stash push` dos arquivos `src/*` listados, teste, `git stash pop` — nenhum arquivo de teste
entrou no stash). É RED genuíno contra o comportamento anterior a T204, capturado com `tee`
**antes** de qualquer gate rodar sobre o código restaurado:

```bash
cd apps/api-transportada && bun --env-file=../../.env.test test test/routing-application.contract.test.ts --timeout 120000
```

`/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada/e08e5c2d-e62d-4a98-9f99-fad68c8e8cc3/scratchpad/t204-red.txt`:

```
 68 pass
 5 fail
 131 expect() calls
Ran 73 tests across 1 file. [50.00ms]
```

As 5 falhas, todas nos testes novos desta task:

- `accepting a route suggestion (ADR-0044 §5) > freezes the route through the T201 seam, after the
order and before deciding` — `dependencies.plannedRoutes` vazio (o aceite não chamava
  `routePlanner.planRoute` antes desta task).
- `accepting a route suggestion (ADR-0044 §5) > without a routeChoice, freezes without one —
cheapest stays the seam default` — idem.
- `accepting a route suggestion (ADR-0044 §5) > leaves the suggestion ready when freezing the route
fails` — `dependencies.decided` tinha 1 registro (o aceite decidia mesmo sem nunca ter tentado
  congelar rota nenhuma, porque a chamada não existia).
- `a sugestão multi-veículo (spec 058 P2) > escolha de rota por veículo (spec 153 T204) > leva a
escolha de rota ao planejamento, só para o veículo que a escolheu` — `routeChoice` chegava
  `undefined` em ambos os veículos (o campo era ignorado).
- `a sugestão multi-veículo (spec 058 P2) > escolha de rota por veículo (spec 153 T204) > veículo de
rota fora da proposta é recusado antes de qualquer viagem nascer` — o aceite criava as duas
  viagens normalmente em vez de recusar (nenhuma checagem de `routeChoiceByVehicle` existia).

### Implementação

- **`src/trips/presentation/trip-request.schema.ts`**: `routeChoiceRequestSchema` passou a ser
  exportado — é o único schema Zod de `routeChoice` do repositório, reusado pelos dois endpoints de
  aceite em vez de duplicar a validação de `criterion`/`signature`.
- **`src/routing/domain/routing.error.ts`**: `MultiVehicleSuggestionVehicleNotInProposalError`
  ganhou um segundo parâmetro, `field: string = 'vehicleIds'` (default preserva os lançamentos
  existentes) — `routeChoiceByVehicle` erra com um veículo fora da proposta pela mesma razão que
  `vehicleIds`/`stopOrderByVehicle` erram, mas um detalhe genérico faria o cliente procurar no corpo
  errado.
- **`src/routing/presentation/route-suggestion-request.schema.ts`**: novo
  `acceptRouteSuggestionSchema` (corpo opcional, `{ routeChoice? }`) para o aceite por viagem; e
  `routeChoiceByVehicle` adicionado a `acceptMultiVehicleSuggestionSchema`.
- **`src/routing/application/route-suggestion.port.ts`** /
  **`route-suggestion.use-case.ts`**: `DecideRouteSuggestionInput`/`accept()` ganharam
  `routeChoice?`; nova dependência `routePlanner: TripRoutePlanner` (`planRoute(input): Promise<void>`
  com `{ companyId, routeChoice?, tripId }`); a chamada roda **depois** da reordenação e **antes**
  de `repository.decide(...)` — mesma ordem e mesmo motivo de reordenar antes de decidir (T201): se
  a sugestão não virar `accepted`, o conferente tenta de novo, e replanejar de novo é idempotente.
- **`src/routing/application/multi-vehicle-suggestion.port.ts`** /
  **`multi-vehicle-suggestion.use-case.ts`**: `AcceptMultiVehicleSuggestionInput` ganhou
  `routeChoiceByVehicle?: readonly { routeChoice, vehicleId }[]`; `TripComposer.planRoute` ganhou
  `routeChoice?`; dentro do `for (const group of groups)`, um `Map` (`routeChoiceByVehicleMap`)
  resolve a escolha do veículo do grupo antes de chamar `trips.planRoute`. Checagem de veículo fora
  da proposta para `routeChoiceByVehicle` é **separada** da checagem existente de
  `vehicleIds`/`stopOrderByVehicle` — mesmo raciocínio do `field` acima.
- **`src/routing/infrastructure/trip-composer.adapter.ts`**: `TripComposerDependencies.planRoute`
  ganhou `routeChoice?`, repassado ao `dependencies.planRoute` sem alteração de lógica (passthrough).
- **`src/routing/presentation/route-suggestion.routes.ts`** /
  **`multi-vehicle-suggestion.routes.ts`**: `parse()`/`handle()` dos dois endpoints de aceite
  passam a ler e repassar `routeChoice`/`routeChoiceByVehicle` do corpo.
- **`src/main.ts`**: `routeSuggestions: createRouteSuggestionUseCase({...})` ganhou `routePlanner`,
  implementado chamando o **próprio** `planTripRoute` (a função exportada de
  `plan-trip-route.use-case.ts`, a mesma que T201 introduziu) com `tripRouteRepository` (já
  `DrizzleTripRouteRepository`, que **já implementa** `PlanTripRoutePort` — confirmado lendo a
  classe, sem adaptação nenhuma) e `tripRouteTollFreezer` (já existente, mesmo formato de
  `PlanTripRouteTollFreezer`). É a mesma porta de escrita de T201, chamada de um segundo lugar —
  nunca um segundo caminho de escrita. A wiring do `TripComposer` multi-veículo não precisou de
  nenhuma mudança: `planRoute: (input) => tripLifecycle.planRoute.execute(input)` já era um
  passthrough puro, e passou a aceitar `routeChoice` assim que o tipo de `TripComposerDependencies`
  ganhou o campo.
- **Por que o aceite por viagem única chama `planTripRoute` (a função) e não
  `dependencies.trips.planRoute` (via porta)**: `route-suggestion.use-case.ts` usa `CompanyScope`
  (`{companyId, userId}`), e `PlanTripRouteInput` só exige `companyId: string` — a interseção já
  cabe sem adaptação. O caminho multi-veículo usa `MultiVehicleScope`/`CompanyContext`, que é
  **estruturalmente diferente** e mantido separado de propósito (comentário already existente em
  `multi-vehicle-suggestion.port.ts`: estreitar o tipo ali obrigaria alargá-lo de volta com um `as`,
  que é mentir sobre a diferença). Por isso o aceite por viagem tem uma dependência própria
  (`routePlanner`), montada em `main.ts` chamando a função crua, em vez de reusar a porta do
  `TripComposer` do outro fluxo.
- **`test/fixtures/route-suggestion-application.fixture.ts`**: novo campo `plannedRoutes` (array de
  `{companyId, routeChoice?, tripId}`) e `planRouteError?: Error` em `FixtureParams`, seguindo o
  mesmo idioma de `reorderError`. `routePlanner` inserido no objeto retornado na posição alfabética
  correta (`repository` < `routePlanner` < `stopOrder`).
- **Testes novos** (nenhum arquivo novo — todos em arquivos já listados no `package.json`):
  `test/routing-application/route-suggestion.contract.ts` (+3), `multi-vehicle-suggestion.contract.ts`
  (+3), `test/routing-http/route-suggestions.contract.ts` (+2),
  `test/routing-http/multi-vehicle-suggestion.contract.ts` (+2).

### Persistência

**Nenhuma persistência nova.** `routeChoice`/`routeChoiceByVehicle` são pass-through puro: o aceite
só os repassa ao seam de congelamento de T201 (`planTripRoute`/`tollFreezer.freeze`), que já grava
em `trips.planned_route`/`trips.planned_route_frozen_at` desde T201. Nenhuma coluna, nenhuma
migration — confirmado que `test/routing-schema/route-suggestions.contract.ts` não precisou de
nenhuma alteração.

### Falha parcial de OSRM (D5)

Não foi necessário nenhum tratamento novo. No aceite multi-veículo, cada `trips.planRoute(...)`
dentro do `for (const group of groups)` já era uma chamada independente por veículo antes desta
task — uma falha no congelamento de um veículo não impede os demais grupos de continuar (o loop não
teria como saber, porque cada iteração já criava/vinculava/ordenava/planejava sua própria viagem
isoladamente). E dentro do próprio `planTripRoute` (T201), a falha do `tollFreezer.freeze(...)` (que
é onde uma falha de OSRM apareceria) já é um catch de fallback gracioso documentado — não deriva do
planejamento da rota em si, que já rodou antes com sucesso (`markRoutePlanned`). D3
(`choiceReproduced: false` quando a assinatura não é reproduzida) segue implementado a jusante, em
`read-route-geometry.use-case.ts`/`read-trip-route-geometry.use-case.ts` (T104/T203) — nada aqui
precisou mudar para isso continuar valendo.

### Gates

```bash
# typecheck (raiz, 6 apps)
bun run typecheck
# 0 erros

# lint (raiz, todas as apps)
bun run lint
# 6 eslint --max-warnings=0, todos limpos

# format:check (raiz) — 1ª rodada acusou 1 arquivo (quebra de linha do bloco de teste novo);
# corrigido com `prettier --write` no mesmo arquivo, sem mudança de lógica, e revalidado:
bun run format:check
# All matched files use Prettier code style!

# suíte completa da API
cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
 6164 pass
 23 skip
 0 fail
Ran 6187 tests across 177 files. [13.86s]
```

**Baseline (fim de T203): 6154 pass, 23 skip, 0 fail, 177 arquivos. Depois de T204: 6164 pass
(+10, exatamente os 10 testes novos: 3+3 nas suítes de aplicação, 2+2 nas suítes HTTP), 23 skip
(inalterado), 0 fail, 177 arquivos (inalterado — nenhum arquivo novo de teste, todos já estavam na
lista explícita do `package.json`).**

### O payload exato que T404 (proposta multi-veículo) e T205 recebem/enviam

- **Aceite por viagem única** (`POST /trips/:id/route-suggestions/:suggestionId/accept`): corpo
  opcional `{ routeChoice?: { criterion, signature } }`. Sem corpo, `cheapest` (default do
  congelador T201).
- **Aceite multi-veículo** (`POST /route-suggestions/:suggestionId/accept`): corpo ganha o campo
  opcional `routeChoiceByVehicle?: [{ vehicleId, routeChoice: { criterion, signature } }]`. Veículo
  ausente dessa lista planeja com `cheapest`; veículo presente nela mas fora da proposta aceita é
  `400 ROUTE_SUGGESTION_VEHICLE_NOT_IN_PROPOSAL` com `details: [{ field: 'routeChoiceByVehicle',
message: <vehicleId> }]`.
- T205 (reorder/link/release recalculando com `cheapest`) não depende de nada novo desta task: ele
  já tinha o seam de T201 disponível, e T204 não alterou a assinatura de `planTripRoute` nem do
  `PlanTripRoutePort`.

### Commit

`<preenchido após o commit>`

## T205 — Reorder, link (unitário e lote) e release recalculam com `cheapest` antes do despacho

### D6 — mudou a parada antes do despacho, recalcula e pega a mais barata

A ordem, o vínculo e o desvínculo de nota mudam o conjunto/sequência de paradas de uma viagem ainda
não despachada. A rota congelada (T201) descreve uma sequência que deixou de existir, e o T202 lê
distância/pedágio gravados direto — uma rota velha precifica errado em silêncio. D6 exige recalcular
com `cheapest` depois de cada uma dessas mudanças; D5 exige que o OSRM fora do ar não derrube a
operação principal.

### Varredura exaustiva de todo caminho que muda o conjunto de paradas antes do despacho

**Dentro do escopo (4 pontos de chamada — bate exatamente com RF8/plan.md/título da task):**

1. `reorderTripStops` (`src/trips/application/reorder-trip-stops.use-case.ts`)
2. `TripUseCase.linkDocument` (`src/trips/application/trip.use-case.ts`)
3. `LinkTripDocumentsBatchUseCase.execute` (`src/trips/application/link-trip-documents-batch.use-case.ts`)
4. `TripUseCase.releaseDocument` (`src/trips/application/trip.use-case.ts`)

**Fora do escopo — sinalizado para o orquestrador, não implementado:**

- `trip-document-review.port.ts` → `releaseUnplaced` / `move` / `swap`
  (rotas `POST {API_TRIPS_PATH}/:id/cargo-layouts/:layoutId/release-unplaced`,
  `POST {TRIP_DOCUMENT_REVIEWS_PATH}/:id/move`, `.../swap`). Esses três também mudam
  membership de nota/parada entre viagens antes do despacho, satisfazendo a condição literal
  de D6. Mas pertencem a um subsistema distinto (fila de revisão de layout de carga da
  ADR-0043/spec 148 — ver `trip-document-review-relink.support.ts`, status `'relinked'`), não
  nomeado em RF8 nem no título da T205. Implementar recálculo ali exigiria decisões novas fora
  de D1–D11 (qual viagem recalcula quando a nota muda de viagem — a de origem, a de destino, ou
  as duas; ordem entre a troca e o congelamento). Isso aciona a regra de "parar e perguntar diante
  de decisão nova" — fica registrado aqui como pendência, não decidido nem implementado nesta task.

**Descartados — não são caminho separado, ou não são pré-despacho:**

- `reconcileStopOnLink` / `reconcileStopOnUnlink` (`reconcile-trip-stops.use-case.ts`): helpers
  internos já invocados PELOS fluxos de vínculo/desvínculo, não uma porta de entrada própria.
- `transitionTripDocument` / `transitionTripDocumentsBatch`, ações `deliver`/`return`
  (`transition-trip-document(s-batch).use-case.ts`): o comentário no `trip-state.policy.ts` fixa que
  "entregar e devolver acontecem na rua" — só valem com a viagem já `dispatched`, fora do escopo de
  D6 por definição (D6 é sobre viagem **ainda não despachada**).
- `report-stop-arrival` / `report-stop-occurrence`: exigem `DISPATCHED_STATUS = 'dispatched'` como
  precondição — mesmo motivo acima.
- Varredura de `INSERT`/`UPDATE`/`DELETE` em `tripStops` nos repositórios (`grep` em
  `src/trips/infrastructure/*.repository.ts`): nenhum ponto de escrita de parada fora dos 4 já
  listados e do `reconcile-trip-stops` (que eles já chamam).

### D5 já vem "de graça" — sem camada de fallback duplicada

O congelamento (`freezeTripPlannedRoute`, seam de T201) é **uma única escrita atômica**: grava
rota+métricas+pedágio juntos, ou grava rota `null` quando o OSRM/geometria falha — nunca parcial.
Não existe um "passo de limpeza" separado a implementar: cada chamada ao `PlanTripRouteTollFreezer`
já é "limpa primeiro, tenta recalcular depois" por construção, herdado de T201. A T205 reaproveita
esse mesmo tipo (`PlanTripRouteTollFreezer`, de `plan-trip-route.use-case.ts`) nos 3 novos pontos de
chamada, e o `try { await routeFreezer.freeze(...) } catch { /* comentário */ }` ao redor de cada
chamada **espelha exatamente** — não duplica — o padrão já existente em `planTripRoute` (linhas
94-104 daquele arquivo). Confirmado por contrato: os testes
`'still reorders the stops when the route freezer fails (D5, OSRM fora do ar)'`,
`'still returns the batch result when the route freezer fails (D5, OSRM fora do ar)'`, e os
equivalentes de link/release em `trip-use-case.contract.ts` passam mesmo quando o freezer falso
lança erro — a operação principal (reordenar/vincular/liberar) sempre é concluída e retornada.

### Portas de despacho reaproveitadas, não duplicadas

Os 4 pontos em escopo já checavam a porta de não-retorno antes desta task:
`reorderTripStops` chama `checkTripAcceptsLinkage` diretamente; `linkDocument` e `releaseDocument`
chamam via `assertTripOpen` (que por sua vez chama `checkTripAcceptsLinkage`);
`LinkTripDocumentsBatchUseCase` delega ao repositório, que já aplicava a mesma regra na versão
lote. Nenhuma guarda nova foi adicionada — o recálculo só roda depois que a escrita principal já
passou por essa porta.

### RED (antes da implementação)

```
mkdir -p <scratchpad> && cd apps/api-transportada && bun test \
  ./test/trip-stops/reorder.contract.ts \
  ./test/trip-application/link-documents-batch.contract.ts \
  ./test/trip-application/trip-use-case.contract.ts \
  2>&1 | tee <scratchpad>/t205-red.txt
```

Resultado real, capturado antes de qualquer alteração de código de produção:

```
bun test v1.3.14 (0d9b296a)
 32 pass
 4 fail
 74 expect() calls
Ran 36 tests across 3 files.
```

As 4 falhas eram exatamente as 4 asserções positivas (`recalculates the route with cheapest
after/when...`) de reorder, link em lote, vínculo unitário e liberação — todas com
`expect(routeFreezer.freezeCalls).toEqual([{ companyId, tripId }])` recebendo `[]`, porque nenhum
código de produção chamava o freezer ainda. Saída completa salva em
`/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada/e08e5c2d-e62d-4a98-9f99-fad68c8e8cc3/scratchpad/t205-red.txt`.

### Implementação

- `reorder-trip-stops.use-case.ts`: `routeFreezer?: PlanTripRouteTollFreezer` opcional em
  `ReorderTripStopsInput`; depois de `repository.reorderStops(...)`, `try/catch` gracioso chamando
  `routeFreezer.freeze({ companyId, tripId })` (sem `routeChoice` — o congelador cai no default
  `cheapest`, D6).
- `link-trip-documents-batch.use-case.ts`: `routeFreezer?: PlanTripRouteTollFreezer` opcional nas
  dependências; recalcula só quando `result.linked.length > 0` (lote todo pulado não muda parada
  nenhuma — recalcular seria trabalho à toa, coberto pelo teste
  `'does not recalculate the route when every document in the batch was skipped'`).
- `trip.use-case.ts`: `routeFreezer?: PlanTripRouteTollFreezer` opcional nas dependências; extraído
  `freezeRouteGracefully` (helper local, mesmo arquivo — evita duplicar o `try/catch` entre
  `linkDocument` e `releaseDocument`) chamado depois da escrita confirmada em ambos.
- `trip-lifecycle.use-case.ts`: `reorderStops.execute` passou a repassar
  `dependencies.tollFreezer` (campo já existente em `TripLifecycleDependencies`, usado por
  `planRoute`) como `routeFreezer` — nenhum campo novo na dependência.
- `main.ts`: `trips = createTripUseCase({ ..., routeFreezer: tripRouteTollFreezer })` e
  `linkTripDocumentsBatch: createLinkTripDocumentsBatchUseCase({ repository: tripRepository,
routeFreezer: tripRouteTollFreezer })` — reaproveita o mesmo singleton já injetado em
  `tripLifecycle`/`planRoute`.

Nenhuma migration, nenhum campo novo em D1–D11, nenhum `[NEEDS CLARIFICATION]`.

### GREEN (depois da implementação)

```
cd apps/api-transportada && bun test \
  ./test/trip-stops/reorder.contract.ts \
  ./test/trip-application/link-documents-batch.contract.ts \
  ./test/trip-application/trip-use-case.contract.ts
```

```
bun test v1.3.14 (0d9b296a)
 36 pass
 0 fail
 74 expect() calls
Ran 36 tests across 3 files. [21.00ms]
```

Regressão nas suítes vizinhas (`trip-stops.contract.test.ts`, `trip-application.contract.test.ts`,
`trip-http.contract.test.ts`, `trip-infrastructure.contract.test.ts`, `trip-documents.contract.test.ts`,
`trip-domain.contract.test.ts`): 482 pass, 0 fail, 1532 `expect()`.

### Gates (raiz do worktree)

```
bun run typecheck   # 6 tsc --noEmit, todos limpos
bun run lint        # 6 eslint --max-warnings=0, todos limpos
bun run format:check
# All matched files use Prettier code style!

cd apps/api-transportada && bun --env-file=../../.env.test test --timeout 120000
 6174 pass
 23 skip
 0 fail
Ran 6197 tests across 177 files. [12.75s]
```

**Baseline (fim de T204): 6164 pass, 23 skip, 0 fail, 177 arquivos. Depois de T205: 6174 pass
(+10, exatamente os 10 testes novos do bloco D6: 3 em reorder, 3 em link em lote, 4 em
vínculo/liberação unitários), 23 skip (inalterado — nenhum teste novo caiu em skip), 0 fail, 177
arquivos (inalterado — os 3 arquivos de teste editados já estavam na lista explícita do
`package.json`, via os entrypoints `trip-stops.contract.test.ts` e
`trip-application.contract.test.ts`; nenhum arquivo novo precisou ser adicionado).**

### Nenhum arquivo novo de teste

`test/trip-stops/reorder.contract.ts` e `test/trip-application/link-documents-batch.contract.ts` e
`test/trip-application/trip-use-case.contract.ts` já existiam e já eram importados pelos
entrypoints registrados no `package.json`. Nenhuma mudança em `package.json` foi necessária —
confirmado pela contagem de arquivos estável em 177 antes e depois.

### Commit

`<preenchido após o commit>`
