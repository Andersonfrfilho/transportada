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

## T206 — Fila de revisão (`move`/`swap`, spec 148) recalcula com `cheapest` (RF12)

### D6 — a lacuna que a própria T205 sinalizou

A T205 varreu todo caminho que muda o conjunto de paradas antes do despacho e listou
explicitamente, na seção "Fora do escopo", `trip-document-review.port.ts` →
`releaseUnplaced`/`move`/`swap` como satisfazendo a condição literal de D6 mas pertencendo a um
subsistema distinto (fila de revisão de layout de carga, ADR-0043/spec 148), pedindo decisão nova
antes de implementar. RF12 fecha essa pendência para `move`/`swap`: quando a fila move uma nota da
viagem de origem para a de destino, ou troca a alocação de duas viagens, o T202 volta a ler
distância/pedágio congelados de uma sequência de paradas que já não existe em uma ou nas duas
viagens — exatamente o mesmo defeito que D6 corrigiu para reorder/link/release, agora nos dois
lados de uma movimentação entre viagens.

### Decisão delegada: que viagem(ns) recalculam, e em que ordem

- **`move`**: recalcula a viagem de origem (`review.sourceTripId`) e a viagem de destino
  (`applied.tripId`) — as duas perdem/ganham parada.
- **`swap`**: recalcula a única viagem que carrega as duas mutações da troca (liberar + inserir),
  `applied.tripId` — `swap` só nunca toca duas viagens diferentes, ao contrário de `move`.
- **Critério sempre `cheapest`**: nunca repassar `routeChoice` ao `freeze()` — o congelador cai no
  default (`cheapest`), a mesma técnica de T205, nunca reafirmando uma escolha antiga.
- **Limpa primeiro, recalcula depois**: a mutação de parada (`applyReviewChange`, dentro da
  `database.transaction(...)` já existente) é incondicional — não espera o recálculo. O
  `freezeRoutesGracefully` roda **depois** que a transação principal já deu commit, espelhando o
  precedente de `freezeRouteGracefully` em `trip.use-case.ts` (T205): a escrita da fila de revisão
  nunca fica refém do OSRM.
- **Fronteira da transação**: cogitou-se congelar a rota dentro da própria transação do `move`/
  `swap` (um único commit atômico cobrindo mutação + rota). Descartado porque (a) o
  `PlanTripRouteTollFreezer` já é ele mesmo atômico (T201) — grava rota completa ou `null`, nunca
  parcial — logo não precisa da transação externa para ser seguro; (b) rodar OSRM dentro de uma
  transação com locks de viagem (`orderTripLocks`) held prolongaria o lock por uma chamada de rede
  lenta e sujeita a falha, aumentando risco de deadlock/timeout entre `move`/`swap` concorrentes;
  (c) é exatamente a forma já validada por T205 em `trip.use-case.ts`. Decisão final: recalcular
  fora da transação, depois do commit.

### RED (antes da implementação)

```
cd apps/api-transportada && bun --env-file=../../.env.test test \
  ./test/integration/trip-document-review.integration.ts --timeout 120000 \
  | tee <scratchpad>/t206-red.txt
```

Resultado real, capturado antes de qualquer alteração de código de produção:

```
bun test v1.3.14 (0d9b296a)
 16 pass
 4 fail
Ran 20 tests across 1 file.
```

As 4 falhas eram as asserções positivas de recálculo (`freezeCalls` vazio em vez de conter
`{ companyId, tripId }` para origem/destino de `move` e para a viagem de `swap`, nos dois casos
"sucesso" e "OSRM fora do ar") — o teste de repetição idempotente (`'mover repetido (idempotente)
não recalcula de novo'`) passava trivialmente, porque nenhuma mutação nova ocorre nesse caminho.
Saída completa salva em
`/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada/e08e5c2d-e62d-4a98-9f99-fad68c8e8cc3/scratchpad/t206-red.txt`.

### D5 já vem "de graça" — sem camada de fallback nova

Mesma conclusão de T205: o `try { await freezer.freeze(...) } catch { /* ... */ }` dentro do novo
`freezeRoutesGracefully` (`drizzle-trip-document-review.repository.ts`) é o **mesmo** padrão de
`plan-trip-route.use-case.ts` (linhas ~94-104) e de `freezeRouteGracefully` em `trip.use-case.ts`
(T205) — não uma forma nova. Confirmado por contrato: os testes `'mover ainda troca a nota quando
o congelador de rota falha (D5, OSRM fora do ar)'` e `'trocar ainda troca a nota quando o
congelador de rota falha (D5, OSRM fora do ar)'` passam mesmo com o freezer falso lançando erro —
a mutação da fila (`move`/`swap`) sempre é concluída e devolvida.

### Implementação

- `drizzle-trip-document-review.repository.ts`: construtor ganhou um 3º parâmetro opcional
  `routeFreezer?: PlanTripRouteTollFreezer`; novo método privado `freezeRoutesGracefully(companyId,
tripIds)` (dedup via `Set`, `Promise.all`, `catch` mudo comentado). `move()` e `swap()` passaram a
  coletar `changedTripIds` só no caminho de mutação real (nunca no branch `'unchanged'`/
  `repeatedSwap`) e chamam `freezeRoutesGracefully` **depois** que `database.transaction(...)`
  já retornou.
- `main.ts`: `tripDocumentReviewRepository` reposicionado para depois da definição de
  `tripRouteTollFreezer` (mesmo singleton já usado por `tripLifecycle`/T205), passado como 3º
  argumento. Nenhum uso entre a posição antiga e a nova referenciava a variável antes desse ponto
  (conferido por grep) — reordenação segura.
- `test/integration/trip-document-review.integration.ts`: 5 testes novos + helpers `createFreezer`
  (mesma forma do fixture de T205 em `reorder.contract.ts`) e `byTripId`.

Nenhuma migration, nenhum campo novo em D1–D13, nenhum `[NEEDS CLARIFICATION]`, nenhum backfill de
rota já gravada em viagem existente (D8).

### GREEN (depois da implementação)

```
cd apps/api-transportada && bun --env-file=../../.env.test test \
  ./test/integration/trip-document-review.integration.ts --timeout 120000
```

```
bun test v1.3.14 (0d9b296a)
 20 pass
 0 fail
 46 expect() calls
Ran 20 tests across 1 file. [3.16s]
```

### Gates

```
bun run typecheck   # 6 tsc --noEmit, todos limpos
bun run lint        # 6 eslint --max-warnings=0, todos limpos
bun run format:check
# All matched files use Prettier code style!
```

Comando mandatado (raiz do gate de contrato, `apps/api-transportada`):

```
bun --env-file=../../.env.test test --timeout 120000
 6177 pass
 23 skip
 0 fail
 21675 expect() calls
Ran 6200 tests across 177 files. [10.82s]
```

**Baseline (pós-rebase em staging, antes de T206): 6177 pass, 23 skip, 0 fail, 177 arquivos. Depois
de T206: números idênticos.** Isso é esperado e não esconde os 5 testes novos: o comando mandatado,
invocado sem argumento de caminho, faz a descoberta padrão do Bun por convenção de nome
(`*.test.*`) — que bate, arquivo por arquivo, com os 177 `test/*.contract.test.ts` de topo (`find
test -maxdepth 1 -iname "*.contract.test.ts" | wc -l` → 177) e **nunca** inclui
`test/integration/*.integration.ts` (84 arquivos, nenhum termina em `.test.ts`). Verificado por
sabotagem deliberada: quebrar duas asserções dentro de
`trip-document-review.integration.ts` e rodar de novo o comando mandatado, sem qualquer argumento
de caminho, manteve `6177 pass / 0 fail` inalterado — prova de que este comando não executa esse
arquivo. `package.json` da app confirma a mesma separação por outra via: o script `test` (o que
`make check`/`bun run check` de fato chamam) é uma lista explícita de só `*.contract.test.ts`;
`test:integration` é uma lista explícita separada, que inclui `trip-document-review.integration.ts`.
Nenhum arquivo `.contract.test.ts` usa `describeWithPostgres` (`grep` vazio) — a suíte de contrato
nunca toca banco, então o gate mandatado ficar 100% igual ao baseline é o resultado correto e
esperado para uma mudança que só tocou um arquivo de integração.

Para não reportar um "sem mudança" que esconderia os 5 testes novos, rodei também o gate
complementar que de fato os exercita:

```
cd apps/api-transportada && bun --env-file=../../.env.test run test:integration --timeout 120000
 369 pass
 4 skip
 2 fail
 2485 expect() calls
Ran 375 tests across 72 files. [236.21s]
```

As 2 falhas são as duas de `cte-archive-gateway.integration.ts`
(`ObjectStorageError: Object storage is unavailable`) — dependem do MinIO local, que não está de pé
neste ambiente; pré-existentes, sem relação com T206 (nenhum arquivo de object storage foi tocado).
Nenhuma falha em `trip-document-review.integration.ts`: os 20 testes do arquivo (15 pré-existentes +
5 novos de T206) estão dentro dos 369 que passaram — confirmado tanto pela ausência de qualquer
linha `(fail)` referenciando "mover"/"trocar" no log quanto pela execução isolada do arquivo
(seção GREEN acima, 20/0).

### Nenhum arquivo novo de teste

`test/integration/trip-document-review.integration.ts` já existia e já estava na lista explícita
de `test:integration` no `package.json`. Nenhuma mudança em `package.json` foi necessária.

### Commit

`<preenchido após o commit>`

## T301 — Redação monetária (D10) em route-geometry ×2, detalhe da viagem e NF-e ✅ 2026-09-17

Serviço único `src/shared/monetary-redaction.service.ts` + quatro pontos de aplicação: `POST
/route-geometry`, `GET /trips/:id/route-geometry`, `GET /trips/:id` (detalhe) e `GET
/nfe-documents` + `GET /nfe-documents/:id`. Sem `trip.financials`, o campo monetário **sai** do
objeto (`Omit`, checado por `Object.hasOwn`), nunca vira `null`/zero.

### Vermelho capturado primeiro

Arquivo: `/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada/e08e5c2d-e62d-4a98-9f99-fad68c8e8cc3/scratchpad/t301-red.txt`.

```
cd apps/api-transportada
bun --env-file=../../.env.test test ./test/trip-http.contract.test.ts ./test/trips.contract.test.ts ./test/nfe-http.contract.test.ts --timeout 120000
 5 fail
 152 pass
 447 expect() calls
Ran 157 tests across 3 files.
```

As 5 falhas, todas por `Object.hasOwn(...)` devolvendo `true` onde o teste esperava `false`
(campo de dinheiro presente sem `trip.financials`) — a razão certa, redação ainda não ligada nas
rotas:

1. `test/trip-http/money-redaction.contract.ts:48` — `nfeTotalValue` presente no detalhe da viagem.
2. `test/trips/route-geometry-money-redaction.contract.ts` (`expectTollRedacted`) —
   `chargePerAxle` presente no `toll` do `POST /route-geometry`.
3. Mesma asserção, para `GET /trips/:id/route-geometry` (rota congelada).
4. `test/nfe-http/money-redaction.contract.ts:26` — `freightAmount` presente na listagem.
5. `test/nfe-http/money-redaction.contract.ts:50` — `freightAmount` presente no detalhe.

A primeira captura (antes desta) tinha um sexto "vermelho" falso: `POST /route-geometry`
devolvendo `400` em vez de `200`, porque o corpo de teste mandava `latitude`/`longitude` como
string e `routeGeometrySchema` exige `z.number()` — bug do dado de teste, não da redação. Corrigido
trocando para literais numéricos antes de recapturar o vermelho definitivo acima.

### Veredito sobre os 4 arquivos herdados (rascunho de sessão interrompida, não revisado)

- `src/shared/monetary-redaction.service.ts`: **arquiteturalmente correto**. Todo nome de campo
  (`chargeCar`, `chargePerAxle`, `chargePerAxleAutomatic`, `effectiveChargePerAxle`, `total` em
  `TollBoothStatementLine`/`TollRouteCost`; `fuelTotal`/`totalCost` em `RouteGeometryOption`)
  conferido contra os tipos reais (`toll-route-cost.policy.ts`, `read-route-geometry.use-case.ts`,
  `read-trip-route-geometry.use-case.ts`) e todos batem. Único defeito: falhava
  `bunx prettier --check` — corrigido com `--write`, sem mudança de lógica. Usado como está.
- `test/trip-http/money-redaction.contract.ts`: correto como está, sem mudança de lógica (só
  formatação e a tipagem de `FINANCIALS_PERMISSIONS` — ver abaixo).
- `test/trips/route-geometry-money-redaction.contract.ts`: **um bug real** — `ROUTE_GEOMETRY_BODY`
  mandava `latitude`/`longitude` como string; corrigido para `z.number()`. Fora isso, correto.
- `test/nfe-http/money-redaction.contract.ts`: não herdado — não existia rascunho para NF-e;
  escrito nesta sessão seguindo o mesmo padrão dos outros dois.

Em todos os três arquivos de teste, `new Set([...])` inferia `Set<string>`, incompatível com
`ReadonlySet<CompanyPermission>` sob `strict`. Corrigido tipando a constante como
`CompanyContext['permissions']` — o mesmo padrão já usado em `test/fixtures/trip-http.fixture.ts`
para `READ_ONLY_PERMISSIONS`. A constante `FINANCIALS_PERMISSIONS` de viagem virou export
compartilhado em `test/fixtures/trip-http.fixture.ts` (evita duplicar o mesmo `new Set([...])` em
dois arquivos, code-standart §16).

### Acerto campo a campo com D10

| Superfície                                              | Campo cortado                                                                                     | Sobrevive (D9 / não é dinheiro)                                                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /route-geometry`, `GET /trips/:id/route-geometry` | `toll.chargePerAxle`, `toll.total` (topo)                                                         | `distanceMeters`, `durationSeconds`, `legs`, `returnDistanceMeters` (rota congelada), `points`, `frozen`, `criterion`, `signature`, `cheapestIndex`/`fastestIndex`/`selectedIndex`                   |
| idem                                                    | `toll.booths[].chargeCar/chargePerAxle/chargePerAxleAutomatic/effectiveChargePerAxle/total`       | `booths[].name`, `.operator`, `.latitude`, `.longitude`, `.osmNodeId`, `.legIndex`, `.fellBackToManual` — a praça continua no mapa, sem preço                                                        |
| idem                                                    | `options[].fuelTotal`, `options[].totalCost`, `options[].toll.*` (recursivo, mesmos campos acima) | `options[].distanceMeters`, `.durationSeconds`, `.legs`, `.points`, `.signature`, `.isNoToll`                                                                                                        |
| `GET /trips/:id`                                        | `documents[].nfeTotalValue` — solto em `trip.documents` **e** aninhado em `stops[].documents`     | `nfeNumber`, `nfeSeries`, `nfeIssuedAt`, `fiscalStatus`, `cteAuthorized`, `contact`                                                                                                                  |
| `GET /nfe-documents`, `GET /nfe-documents/:id`          | `freightAmount`, `totalAmount`                                                                    | `freightRuleName` (regra aplicada, não valor), `emitterTaxId`/`City`/`Address`, `recipientTaxId`/`City`/`Address`/`Latitude`/`Longitude`, `accessKey`, `status`, `cteBlockReason`, `nfseBlockReason` |

Nenhum campo vira `null`/zero — toda ausência é `Omit<>` real, checada por `Object.hasOwn(...) ===
false` (não `=== undefined`, que passaria mesmo com a chave presente e valor `undefined`, inválido
sob `exactOptionalPropertyTypes`).

### O que `valuation-preview` faz de fato

`POST /trips/valuation-preview` (`trip.routes.ts:737`) usa `policy: TRIP_FINANCIALS_POLICY`
diretamente no `defineRoute` — é um gate 403 tudo-ou-nada, resolvido pelo router **antes** do
handler rodar; quem não tem `trip.financials` nunca chega ao handler, então não há redação de
campo para fazer ali (a resposta inteira é dinheiro — uma prévia de valorização). É o comentário já
presente logo abaixo, sobre a prévia de carga usar `TRIP_MANAGE_POLICY` em vez de
`TRIP_FINANCIALS_POLICY`, que confirma a distinção: rota que é 100% dinheiro leva `policy` cheia;
rota que mistura dinheiro com o resto (as quatro de T301) leva `policy` de leitura + redação
condicional dentro do handler.

### Prova de que a asserção é sobre o corpo serializado, não o objeto interno

Todo teste novo chama `fixture.handle(jsonRequest(...))` — o handler HTTP real, sem mockar o
serializer — e só então lê `await response.json()` / `responseData(response)`, isto é, o JSON que
sairia pela rede. `Object.hasOwn(parsedBody, 'campo')` roda sobre esse objeto desserializado, não
sobre o `TripDetail`/`RouteGeometryView` que o use case devolveu. Se a redação estivesse só no tipo
TypeScript e não na função que monta o corpo, o teste veria o campo (o JSON não tem tipos) — as 5
falhas do vermelho provam isso: o tipo já existia (`Omit<>`), mas a chamada à função de redação
ainda não estava no handler.

### Como D9 ficou protegido

`redactRouteGeometryMoney` desestrutura só `options`/`toll` do `RouteGeometryView` e devolve o
resto (`...rest`) intocado — `distanceMeters`, `durationSeconds`, `legs`,
`returnDistanceMeters`/`frozen`/`criterion` (campos exclusivos da view congelada) nunca passam
pela função de corte. As duas suítes de teste (`route-geometry-money-redaction.contract.ts`)
afirmam isso positivamente, não por omissão: `expect(options[0]?.distanceMeters).toBe(42_000)`,
`.durationSeconds`, `data.distanceMeters`, `.durationSeconds`, `.returnDistanceMeters`, `.frozen`,
`.cheapestIndex` — todos lidos do corpo **redigido** (`READ_ONLY_PERMISSIONS`), provando que sair
dinheiro não arrasta o resto junto.

### Gates

```
cd apps/api-transportada && bunx prettier --check src/trips/presentation/trip.routes.ts \
  src/nfe-documents/presentation/nfe-documents.routes.ts src/shared/monetary-redaction.service.ts
All matched files use Prettier code style!
```

```
bun run typecheck   # raiz do monorepo — api, worker, cron, 3 frontends
$ tsc --noEmit   (todas as 6 apps, sem saída = 0 erro)
```

```
bun run lint        # raiz do monorepo
$ eslint ... --max-warnings=0   (todas as 6 apps, sem saída = 0 erro/warning)
```

```
bun run format:check   # raiz
Checking formatting...
All matched files use Prettier code style!
```

Contrato (raiz `apps/api-transportada`):

```
bun --env-file=../../.env.test test --timeout 120000
 6187 pass
 23 skip
 0 fail
 21766 expect() calls
Ran 6210 tests across 177 files.
```

Baseline era `6177 pass / 23 skip / 0 fail / 177 arquivos`. Delta: **+10 pass, 0 skip novo, 0
fail**, mesma contagem de arquivos (177) porque os três arquivos novos de teste
(`test/trip-http/money-redaction.contract.ts`,
`test/trips/route-geometry-money-redaction.contract.ts`,
`test/nfe-http/money-redaction.contract.ts`) são folhas importadas pelos barrels já existentes
(`test/trip-http.contract.test.ts`, `test/trips.contract.test.ts`, `test/nfe-http.contract.test.ts`
— cada um já estava na lista explícita do `test` em `package.json`); nenhum barrel novo nasceu,
então a lista não precisou de edição. +10 = 2 (detalhe da viagem, com/sem `trip.financials`) + 4
(`route-geometry` solto e congelado, com/sem) + 4 (NF-e lista e detalhe, com/sem).

Integração (`apps/api-transportada`):

```
bun --env-file=../../.env.test run test:integration
 369 pass
 4 skip
 2 fail
 2485 expect() calls
Ran 375 tests across 72 files.
```

Idêntico ao estado atual reportado (`369 pass / 4 skip / 2 fail / 72 arquivos`) — zero delta,
como esperado: T301 não criou nenhum arquivo `.integration.ts`, e nenhum teste de integração
existente toca as quatro rotas mexidas. As 2 falhas continuam sendo exatamente as duas de
`test/integration/cte-archive-gateway.integration.ts` (`ObjectStorageError: Object storage is
unavailable` — MinIO local fora do ar neste ambiente), sem relação com T301 (nenhum arquivo de
object storage foi tocado). Não mascaradas nem "consertadas".

### Consequência não solicitada, mas obrigatória: refatoração de `serializeTripDetail`

`serializeTripDetail`/`serializeTripDocumentDetail`/`serializeTripStopDetail` (`trip.routes.ts`)
ganharam parâmetro `canReadFinancials` (objeto tipado, code-standart §10). Como TypeScript exige
todo call site atualizado, isso alcançou também `POST /trips` (criar) e `POST
/trips/:id/close` (fechar) — que devolvem `TripDetail` pelo mesmo serializer e por isso também
passaram a cortar `nfeTotalValue` sem `trip.financials`. Não é um quinto ponto de vazamento
descoberto — é o mesmo serializer, reusado; T301 listava 4 rotas, mas o corte estrutural em
`serializeTripDetail` obrigatoriamente cobre todo chamador dele, consistente com o "todo dinheiro é
`trip.financials`" de D10. Nenhum teste de `POST /trips`/`POST /trips/:id/close` quebrou (nenhum
deles fixa `TRIP_DETAIL` completo como corpo esperado sem `trip.financials` — confirmado pelo
contrato 100% verde acima).

### Correções em teste pré-existente (sem tocar produção)

Três testes quebraram por consequência direta da redação entrar em produção — corrigidos
concedendo `trip.financials` no fixture, não afrouxando a asserção:

- `test/trip-http/detail.contract.ts` — "answers the trip with its documents..." e "a failing lazy
  request still answers the read...": ambos comparam a resposta inteira contra `TRIP_DETAIL`
  (que inclui `nfeTotalValue`) — passaram a usar `FINANCIALS_PERMISSIONS` (novo export de
  `test/fixtures/trip-http.fixture.ts`) em vez de `READ_ONLY_PERMISSIONS`/permissão padrão.
- `test/nfe-http/listing-and-detail.contract.ts` — "lists and details documents with decimal
  strings and safe metadata only": comparava contra `serializeDocumentSummary(...)` completo
  (com `freightAmount`/`totalAmount`) — passou a montar um `financialsContext` local (permissões da
  `COMPANY_CONTEXT` de import mais `trip.financials`) e usá-lo tanto na chamada da fixture quanto
  na asserção de `documentListCalls[0].context`.

Nenhuma dessas três é redundante com as suítes novas de T301: elas testam a forma completa do
documento/detalhe (drivers, contato, bloqueio fiscal, cursor); as suítes novas testam
especificamente o corte/presença dos campos de dinheiro.

### Nenhum quinto ponto de vazamento encontrado

Busca por `freightAmount|totalAmount|nfeTotalValue|fuelTotal|totalCost|chargePerAxle|chargeCar` em
`src/**/presentation/*.routes.ts` fora dos dois arquivos tocados não retornou serializer adicional
que exponha esses campos. Os quatro pontos de T301 são os únicos.

### Commit

`<preenchido após o commit>`

## T401 — Validação de respostas com campos novos e monetários opcionais ✅ 2026-09-17

Frontend só: `*.validation.ts` + `*.types.ts` (aqui, os tipos moram junto com o serviço,
`routeGeometry.service.ts`) reconhecidos aos dois lados do T101–T301 já mergeados no backend —
signature/critério/`frozen_at`/`choiceReproduced` na rota congelada (D2/D3) e dinheiro
condicionalmente ausente (D10, T301).

### Vermelho capturado primeiro (typecheck + runtime, os dois genuínos)

Arquivo: `/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada/e08e5c2d-e62d-4a98-9f99-fad68c8e8cc3/scratchpad/t401-red.txt`.

Primeiro `bun run typecheck` na raiz, **antes** de qualquer implementação — 22 erros reais, o teste
novo referenciando campos que ainda não existem no tipo ou ainda não são opcionais:

```
test/trip/route-geometry-money-optional.contract.ts(48,31): error TS2339: Property 'isNoToll' does not exist on type ...
test/trip/route-geometry-money-optional.contract.ts(63,17): error TS2339: Property 'choiceReproduced' does not exist on type ...
test/trip/route-geometry-money-optional.contract.ts(84,17): error TS2339: Property 'criterion' does not exist on type ...
test/trip/route-geometry-money-optional.contract.ts(219,13): error TS2739: ... missing ... chargePerAxle, total
test/trip/route-geometry-money-optional.contract.ts(235,13): error TS2739: ... missing ... chargeCar, chargePerAxle, effectiveChargePerAxle, total
test/trip/route-geometry-money-optional.contract.ts(256,7): error TS2578: Unused '@ts-expect-error' directive.
test/trip/route-geometry-money-optional.contract.ts(261,9): error TS2322: Type 'undefined' is not assignable to type 'string | null'.
(22 erros no total, todos no arquivo novo)
```

Em seguida, `bun test ./test/trip.contract.test.ts` (a barra existente, com uma linha de import
nova para o arquivo novo) — vermelho de runtime nas asserções que já compilam (o tipo ainda aceita
a leitura, o adaptador é que descartava o campo por validação estrita):

```
 900 pass
 6 fail
 17683 expect() calls
Ran 906 tests across 1 file. [516.00ms]
```

As 6 falhas, na ordem: `view.choiceReproduced`/`view.criterion`/`view.frozen` undefined (campo
não lido pelo adaptador), `view.distanceMeters` undefined em vez de `null` (D5), `option`
undefined (o validador rejeitava a opção sem `fuelTotal`/`totalCost` como malformada, D10), `toll`
caindo para `null` pela mesma razão no pedágio.

### O que virou opcional, e por quê (D10) — e o que ficou obrigatório (D9)

| Campo                                                                         | Optional?                                                                | Motivo                                                                                 |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `RouteGeometryOption.fuelTotal`                                               | sim (`?:`)                                                               | dinheiro — some sem `trip.financials` (D10)                                            |
| `RouteGeometryOption.totalCost`                                               | sim (`?:`)                                                               | idem                                                                                   |
| `RouteGeometryToll.chargePerAxle`                                             | sim (`?:`)                                                               | idem                                                                                   |
| `RouteGeometryToll.total`                                                     | sim (`?:`)                                                               | idem                                                                                   |
| `RouteGeometryTollBooth.chargeCar/chargePerAxle/effectiveChargePerAxle/total` | sim (`?:`)                                                               | idem, por praça                                                                        |
| `RouteGeometryOption.distanceMeters`/`durationSeconds`                        | **não**                                                                  | não é dinheiro (D9) — sempre presente, mesmo sem `trip.financials`                     |
| `RouteGeometry.distanceMeters`/`durationSeconds`/`returnDistanceMeters`       | opcional na chave, mas `null` nunca ausente-de-verdade — ver nota abaixo | D5: OSRM fora do ar é `null` explícito (rota indisponível), não a chave sumindo        |
| `RouteGeometryOption.isNoToll`/`signature`                                    | sim (`?:`, novo campo)                                                   | novo em `/route-geometry` avulso; ausente quando a resposta é a de viagem sem eles     |
| `RouteGeometry.selectedIndex`/`choiceReproduced`/`criterion`/`frozen`         | sim (`?:`, novo campo)                                                   | só existem na rota **congelada** da viagem (T203); ausente em `/route-geometry` avulso |

A distinção real: os campos de D9 (distância, duração, volta ao barracão) nunca saem da chave — o
adaptador sempre publica `null` explícito quando o valor não pôde ser calculado (D5), e nunca
`undefined`/chave ausente. Os campos de D10 (dinheiro) são o oposto: a **chave em si** desaparece
do objeto quando a permissão falta, e o adaptador (`isOptionalNullableString`/`isOptionalString`
em `tripResponse.validation.ts`) aceita `undefined` como resposta válida só para esses campos —
nunca `null` fabricado, nunca zero.

`exactOptionalPropertyTypes: true` é o que torna a distinção visível ao compilador, não só ao
runtime: o teste
`test/trip/route-geometry-money-optional.contract.ts` prova isso com um `@ts-expect-error`
genuíno — atribuir `fuelTotal: undefined` explicitamente a um `RouteGeometryOption` **não compila**
(`TS2375`), porque só a ausência da própria chave conta como D10, nunca o valor `undefined`. Achado
empírico durante a implementação: antes do campo virar opcional, o erro (`TS2322`) aparece na linha
da propriedade; depois de opcional, o erro (`TS2375`) muda de classe e aparece na linha de
declaração do literal do objeto — o comentário `@ts-expect-error` teve que subir para lá para
continuar provando a asserção (confirmado por typecheck limpo depois da mudança).

### Toques mínimos fora do escopo original, revelados pelo próprio gate de typecheck

O escopo pedido era só `*.validation.ts`/`*.types.ts` e o serviço que valida a forma
(`routeGeometry.service.ts`). Tornar `chargePerAxle`/`total`/`effectiveChargePerAxle`/`chargeCar`
opcionais quebrou compilação em cinco pontos que já liam esses campos como sempre presentes —
nenhum deles tem lógica nova, só a checagem de ausência que faltava:

- `assemblyRouteOptions.service.ts:54` — `totalCost: option.totalCost` → `option.totalCost ?? null`
  (a lista de opções já tratava pedágio ausente como `null`; dinheiro ausente ganhou o mesmo
  tratamento).
- `TripRouteMap.component.tsx` — `fuelTotal`/`totalCost` extraídos em consts locais com `?? null`
  logo após `route`, e o total do pedágio ganhou o checar de `undefined` ao lado do `null` já
  existente. Zero mudança de comportamento visível: chave ausente e `null` sempre significaram
  "não calculado" nesta tela.
- `RouteTollSummary.component.tsx` — o parágrafo de resumo com valor (`toll.chargePerAxle`/
  `toll.total`) ganhou uma trava a mais (`=== undefined`) antes de chamar `formatAmount`; e a
  checagem por praça (`booth.effectiveChargePerAxle`/`booth.total`) que já testava `=== null`
  ganhou `|| === undefined` ao lado. Achado empírico: `(x ?? null) === null` **não estreita** o
  tipo de `x` no `else` sob `strict` — o TypeScript só estreita comparação direta com a própria
  propriedade, não uma expressão derivada. Reescrito com as quatro comparações diretas.
- `TripAssemblyMap.component.tsx` (linhas ~464–472, fora do escopo original — hot path do projeto)
  — **mesmo defeito, mesmo trecho**, linha por linha idêntico ao de `RouteTollSummary`. O
  typecheck genuinamente não fecha sem o toque: `TS2345: Argument of type 'string | undefined' is
not assignable to parameter of type 'string'` nas duas chamadas a `formatAmount`. Aplicada a
  mesma correção de quatro comparações diretas, sem tocar em mais nada do componente.
- `assemblyToll.service.ts:69` — `formatBoothCharge(booth.chargePerAxle)` recebia
  `string | undefined` para um parâmetro `null | string`; normalizado com `?? null` no call site
  (o marcador do mapa já tratava tarifa desconhecida como `null` → `'—'`; ausência por D10 vira o
  mesmo símbolo).

Nenhum desses cinco toques mexe em `TripAssemblyMap`/detalhe/proposta/criação além da linha exigida
pelo compilador — T402–T405 continuam intocados no resto.

### Barra existente, sem editar `package.json`

O arquivo novo (`test/trip/route-geometry-money-optional.contract.ts`) entra por
`test/trip.contract.test.ts`, que já está na lista explícita de `package.json` — só uma linha de
import nova na barra, confirmado suficiente para o `bun test` pegar as 12 novas asserções.

### Gates

```
$ bun run typecheck   (raiz, 6 apps)
0 erros — os 5 remanescentes do meio da sessão (2× TripAssemblyMap, 1× assemblyToll.service,
2× o par TS2375/TS2578 do @ts-expect-error) todos resolvidos.

$ bun run lint   (raiz, 6 apps)
0 erros — 1 rodada intermediária pegou 2 erros reais de `@typescript-eslint/no-unused-vars`
(`fuelTotal`/`totalCost` destructurados e nunca lidos); corrigido do mesmo jeito que
`test/fleet/vehicle-cost-fields.contract.ts` já fazia (asserção sobre o valor extraído antes de
descartá-lo do objeto), sem eslint-disable.

$ bun run format:check   (raiz)
1 arquivo fora do padrão na primeira rodada — `tripResponse.validation.ts` (só formatação, prettier
--write, sem mudança de lógica). Segunda rodada: limpo.

$ bun run test   (apps/frontend-transportada)
4148 pass / 1 fail → 4149 pass / 0 fail
A 1 falha intermediária: `test/trip/route-map-panel.contract.ts` fazia grep de código-fonte por
`route.fuelTotal` — string literal que sumiu quando o acesso virou `route?.fuelTotal` (D10 exige
optional chaining). Ajustada a asserção para o padrão novo, correto (o comentário já explica a
razão). Delta de 4148→4149 é o total já incluindo as 12 novas asserções deste arquivo desde a
implementação — nenhum teste pré-existente mudou de contagem, só de resultado.

$ bun run build   (apps/frontend-transportada)
✓ built in 8.00s — PWA precache 129 entries (4466.45 KiB), sem estourar o teto por-arquivo do
Workbox (o build falharia se estourasse). `AssemblyVectorMap.component` (11.20 kB) e
`vectorBasemap.service` (997.94 kB) continuam como chunks separados do `index` principal — MapLibre
não voltou ao bundle principal.
```

### Commit

`<preenchido após o commit>`

## T402 — `TripAssemblyMap`: switch mais rápida ↔ mais barata sem novo OSRM (RF13) ✅ 2026-09-17

Extração de `RouteChoiceOptions.component.tsx` a partir do seletor inline que já existia em
`TripAssemblyMap.component.tsx` (spec 096 T3), acrescentando: rótulo "Sem pedágio" (`isNoToll`), o
switch explícito mais rápida ↔ mais barata da RF13 (via `Tabs` do design system) sobre as opções
já em mãos — nenhuma chamada nova ao roteirizador —, abertura sempre na mais barata (D1),
`onRouteChoiceChange` por assinatura+critério (D2, nunca índice) para quem for regravar via
`plan-route`, aviso em tela quando não há duas opções distintas para trocar (em vez de switch
inerte), e `canReadFinancials` em `TripAssemblyMap` e `RouteTollSummary` (D10: dinheiro ausente do
DOM, nunca zero; D9: km/duração sempre presentes).

### Vermelho capturado primeiro

Arquivo: `.../scratchpad/t402-red.txt` — primeiro `bun test test/trip.contract.test.ts` contra o
`resolveRouteChoiceFromIndex` ainda não exportado:

```
SyntaxError: Export named 'resolveRouteChoiceFromIndex' not found in module
'.../src/modules/trip/shared/assemblyRouteOptions.service.ts'.

 0 pass
 1 fail
 1 error
```

### Camada pura (`assemblyRouteOptions.service.ts`, `routeGeometry.service.ts`)

`RouteChoice = Readonly<{ criterion: RouteChoiceCriterion; signature: null | string }>` (novo tipo)
e `resolveRouteChoiceFromIndex({ cheapestIndex, fastestIndex, index, options })`, com prioridade
cheapest > fastest > no_toll > alternative — provado por 6 testes em
`route-choice-switch.contract.ts`, inclusive o caso de empate (rota mais barata que também não tem
pedágio sai como `cheapest`, não `no_toll`) e o de assinatura ausente (`signature: null`, nunca
inventada).

### Sem ida nova ao OSRM (RF13) — a prova é de contagem, não de confiança

`TripAssemblyMap.component.tsx` chama `readPointsRouteGeometry` **uma única vez**; trocar de
critério só troca `selectedOptionIndex` sobre `geometryQuery.data?.options`, já em mãos desde o
fan-out único da RF2. Duas asserções fecham isso:

```ts
const chamadas = source.split('readPointsRouteGeometry').length - 1
expect(chamadas).toBe(1)
// a queryKey não inclui o índice/critério escolhido — senão o TanStack Query refaria a busca
expect(queryKeyBlock).not.toInclude('selectedOptionIndex')
expect(queryKeyBlock).not.toInclude('routeChoiceCriterion')
```

### Abre na mais barata (D1)

Trocado `useState(0)` fixo por `setSelectedOptionIndex(geometryQuery.data?.selectedIndex ?? 0)` no
efeito de reset — `0` é só a reserva antes da resposta chegar, nunca a intenção. Provado pela
ausência do literal antigo:

```ts
expect(source).toInclude('selectedIndex')
expect(source).not.toInclude('setSelectedOptionIndex(0)')
```

### Opção única avisa em tela, nunca switch inerte (RF13 + refinamento do usuário)

`RouteChoiceOptions` calcula `canSwitch` (cheapest e fastest existem e são **diferentes**, sem
`costGap`); sem isso, imprime `assemblyMap.routeOptions.singleOption` — "Não há uma rota mais
rápida e uma mais barata para trocar — só esta opção foi calculada." — no lugar do `<Tabs>`, nunca
ao lado de um switch desabilitado:

```tsx
{canSwitch ? (
  <Tabs ariaLabel={...} items={tabsItems} onChange={handleTabsChange} value={tabsValue} />
) : (
  <p className={styles.hint}>
    {costGap === null ? t('assemblyMap.routeOptions.singleOption') : t(`assemblyMap.routeOptions.gap.${costGap}`)}
  </p>
)}
```

Quando o `costGap` explica a ausência de uma rota mais barata calculada (D-existente da spec 096),
a razão do `costGap` continua tendo prioridade sobre o aviso genérico — o texto mais específico
nunca perde para o mais genérico.

### `onRouteChoiceChange` por assinatura+critério, nunca índice (D2)

```ts
function handleSelectRouteOptionIndex(index: number): void {
  setSelectedOptionIndex(index)
  onRouteChoiceChange?.(
    resolveRouteChoiceFromIndex({ cheapestIndex, fastestIndex, index, options: routeOptions }),
  )
}
```

`TripAssemblyMap` só dispara o callback — não chama `plan-route` nem grava `frozen_at` (RF13),
porque este componente é usado **antes** de a viagem existir (`TripQuickCreateDialog`,
`TripProposalDetail` — sem `tripId`). A regravação em si é escopo de T403/T404/T405, fora desta
task; o campo de comentário no tipo (`onRouteChoiceChange?`) documenta essa fronteira.

### `canReadFinancials` — ausência do DOM, nunca zero (D10), km/duração sempre presentes (D9)

`RouteTollSummary.component.tsx` guarda o resumo com valor e o extrato por praça atrás de
`!canReadFinancials`, mas deixa **fora** da trava a lista de praças, a forma de pagamento e o
catálogo (não são dinheiro):

```ts
{!canReadFinancials || toll.chargePerAxle === undefined || toll.total === undefined ? null : (...)}
...
{!canReadFinancials || booth.effectiveChargePerAxle === null || ... ? t('...statementWithoutCharge') : t('...statementLine', {...})}
```

`RouteChoiceOptions.component.tsx` só imprime o total por opção com `canReadFinancials &&
summary.totalCost !== null` — km e duração (`summary.distanceKilometres`, `summary.minutes`)
seguem fora da condição, sempre impressos. Prova de ausência-vs-zero: a asserção de fonte confirma
o `&&` (curto-circuito que remove o `<span>` inteiro do DOM), não um `formatAmount(0)` condicional.

`RouteTollSummary` é compartilhado por dois chamadores (`TripAssemblyMap`, escopo desta task, e
`TripRouteMap` no detalhe da viagem). Como o novo prop é **obrigatório** (a asserção de fonte
exige o literal exato `canReadFinancials: boolean`), a fiação mínima de compilação alcançou a
segunda cadeia também: `TripRouteMap` → `TripDetail.component.tsx` → `TripDetail.page.tsx`, que já
calculava `financials.canReadFinancials` via `useTripFinancials` — sem inventar valor novo.

Os dois pontos de chamada de `TripAssemblyMap` fora do detalhe (`TripQuickCreateDialog`,
`TripProposalDetail`, nenhuma `tripId` ainda) recebem
`canReadFinancials={permissions.includes(FINANCIALS_PERMISSION)}`, importando a constante de
`@/modules/trip-financials/shared/tripFinancialsQueryKey.constant` — mesmo padrão cross-módulo já
usado por `useTripValuationPreview` nos dois arquivos.

### D3 (`choiceReproduced`) fora de escopo, confirmado

`choiceReproduced` só existe na rota **congelada** da viagem (T203) — não no `/route-geometry`
avulso que `TripAssemblyMap` consulta antes da viagem existir. Pertence a T405; nada implementado
aqui.

### Locale (pt-BR) — sem paridade en, seguindo o precedente já existente

Três chaves novas em `trip.locale.json` sob `assemblyMap.routeOptions`: `noToll`, `singleOption`,
`switchLabel`. Conferido por leitura direta (`python3 -c "import json; ..."`) que
`trip.en.locale.json` **já não tem** a seção `assemblyMap.routeOptions` inteira (lacuna da spec
096, nunca traduzida) e não existe teste de paridade pt-BR/en — decidido não inventar tradução
nova para chaves cuja seção-mãe já está sem par em inglês.

### `test/trip/assembly-route-selector.contract.ts` (spec 096) — atualizado, não substituído

Duas asserções datadas da versão inline do seletor quebraram com a extração: a busca por
`hasChoice` (virou o guard `if (options.length === 0) return null` +
`options.length <= 1 ? null` dentro de `RouteChoiceOptions.component.tsx`) e a busca por
`t('assemblyMap.routeOptions.title')` dentro de `TripAssemblyMap` (o título também migrou). A
asserção de `setSelectedOptionIndex(0)` foi invertida para provar o D1 novo (abre na mais barata,
não no índice fixo). As outras três (posição abaixo do pedágio, razão do `costGap`,
`selectedOptionIndex`/`activeOption` alimentando mapa e pedágio) continuam válidas, só apontando
para o arquivo certo quando a regra migrou de componente.

### Gates

```
$ bun run typecheck   (raiz, 6 apps)
0 erros.

$ bun run lint   (raiz, 6 apps)
0 erros.

$ bun run format:check   (raiz)
3 arquivos fora do padrão na primeira rodada (`RouteChoiceOptions.component.tsx`,
`RouteTollSummary.component.tsx`, `assembly-toll.contract.ts` — só formatação, `prettier --write`,
sem mudança de lógica). Segunda rodada: limpo.

$ bun test test/trip.contract.test.ts   (apps/frontend-transportada)
924 pass / 0 fail / 17736 expect() calls

$ bun run test   (apps/frontend-transportada)
4149 pass / 0 fail (baseline T401) → 4167 pass / 0 fail
Delta de +18 é a suíte nova `route-choice-switch.contract.ts` (17 `it`) mais o ajuste líquido em
`assembly-route-selector.contract.ts` (mesma contagem de `it`, 5, sem alteração) — nenhum teste
pré-existente mudou de contagem, só de asserção.

$ bun run build   (apps/frontend-transportada)
✓ built in 8.15s — PWA precache 129 entries (4468.21 KiB), mesma contagem de entradas do baseline
T401 (129), variação de +1.76 KiB só pelo texto/código novos — nenhum asset novo precacheado.
`AssemblyVectorMap.component` (11.20 kB) e `vectorBasemap.service` (997.94 kB) continuam chunks
separados do `index` principal — MapLibre não voltou ao bundle principal.
```

### Linhas por arquivo (limite de 200 do padrão de código)

`TripAssemblyMap.component.tsx` caiu de 1079 para 1031 linhas com a extração — ainda acima do
limite de 200, mas essa violação é anterior a esta task (arquivo já excedia antes do T402) e
dividi-lo por completo está fora do escopo pedido; a extração feita aqui (`RouteChoiceOptions`,
158 linhas; `RouteTollSummary`, 149 linhas, ambos dentro do limite) é a redução possível sem
alterar comportamento fora do pedido em T402.

### Commit

`<preenchido após o commit>`

## T403

### Escopo

Criação manual (`TripQuickCreateDialog`/`useTripQuickCreate`) precisa (a) mandar a escolha do
operador — critério e assinatura, D2 — ao planejar a rota, inclusive o default (mais barata) quando
ele nunca toca o seletor, e (b) corrigir a ordem `reorder` → `plan`, hoje invertida, que descarta essa
escolha em silêncio. Fora do escopo: proposta (T404), detalhe da viagem (T405), Fase 5.

### A causa raiz confirmada em código

`reorder-trip-stops.use-case.ts` (linhas ~60-90) chama o congelador **sem** `routeChoice`:

```ts
await repository.reorderStops({ companyId, orderedStopIds, tripId })
if (routeFreezer !== undefined) {
  try {
    await routeFreezer.freeze({ companyId, tripId })
  } catch {
    /* a ordem já está gravada; o pedágio congela no próximo replanejamento */
  }
}
```

`freeze-trip-planned-route.use-case.ts` resolve o critério com
`input.choice?.criterion ?? DEFAULT_ROUTE_CHOICE_CRITERION`, e `DEFAULT_ROUTE_CHOICE_CRITERION` é
`'cheapest'`. Logo: **toda reordenação recalcula a rota congelada para a mais barata**, sem exceção —
o congelador não tem como saber, nessa chamada, que critério o operador escolheu.

Consequência observável na criação manual: se o hook planeja a rota com a escolha do operador e só
depois reordena as paradas (ordem antiga do código), a chamada de reordenação sobrescreve a rota
recém-gravada de volta para `cheapest` — o operador pediu "sem pedágio" e a viagem nasce com pedágio,
sem erro nenhum na tela. A correção é inverter a ordem: reordenar primeiro, planejar com a escolha do
operador por último, para que a última escrita seja a que vale.

### Como a escolha viaja hoje (ponta a ponta)

1. `useTripQuickCreate` inicializa `routeChoice` com `DEFAULT_ROUTE_CHOICE = { criterion: 'cheapest',
signature: null }` (D1: a mais barata é o default de tela) e atualiza via `setRouteChoice`, ligado
   a `onRouteChoiceChange` no `TripAssemblyMap` dentro de `TripQuickCreateDialog.component.tsx`.
2. Ao criar a viagem, `useTripQuickCreate.hook.ts` chama `finalizeQuickCreateRoute` (novo,
   `shared/finalizeQuickCreateRoute.service.ts`), que primeiro reordena (`client.reorderTripStops`,
   se houver mais de uma parada) e só depois planeja a rota (`client.planTripRoute({ routeChoice,
tripId })`) — `routeChoice` sempre enviado, nunca omitido, mesmo no default.
3. `tripClient.service.ts`.`planTripRoute` agora aceita `routeChoice` opcional e, quando presente,
   inclui `{ routeChoice }` no corpo JSON do `POST /trips/:id/plan-route`.
4. No servidor, `routeChoiceRequestSchema` (já validado desde T201) aceita o corpo, e
   `plan-trip-route.use-case.ts` encaminha a escolha ao `tollFreezer.freeze(...)` dentro de um
   `try {} catch {}` que absorve falha do OSRM/congelamento sem derrubar a criação da viagem (D5) —
   comportamento confirmado por leitura de código nesta sessão e nas anteriores (T201/T402), sem
   alteração nesta task.
5. Se o OSRM cair: a viagem, o vínculo de notas e a reordenação já estão gravados antes da chamada de
   planejamento; o `catch` silencioso do `plan-trip-route.use-case.ts` garante que a falha de
   congelamento não impede o retorno da viagem criada ao operador — o pedágio/rota recongelam no
   próximo replanejamento, como já documentado nas tasks anteriores.

### Dois reds genuínos (antes da implementação)

Arquivo novo `apps/frontend-transportada/test/trip/route-choice-manual-creation.contract.ts`, saída
completa em `/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada/e08e5c2d-e62d-4a98-9f99-fad68c8e8cc3/scratchpad/t403-red.txt`:

- **Teste 1** (`sends the operators chosen criterion and signature when planning the route`): antes
  da implementação, `planTripRoute` não mandava corpo nenhum — `Object.hasOwn(body, 'routeChoice')`
  falhava (`false` ao invés do `true` esperado), prova de que a escolha não chegava ao servidor.
- **Teste 2** (`sends the default cheapest criterion even when the operator never touches the
selector`): mesma causa — `body.routeChoice` vinha `undefined` em vez de
  `{ criterion: 'cheapest', signature: null }`, prova de que o default também não era enviado.
- **Teste 3** (`planning after reordering keeps the operators criterion; reordering after planning
would discard it`): antes da implementação, `finalizeQuickCreateRoute.service.ts` não existia —
  `Cannot find module '../../src/modules/trip/shared/finalizeQuickCreateRoute.service'` — vermelho
  genuíno por ausência do orquestrador que impõe a ordem `reorder` → `plan`. (O arquivo com a ordem
  correta foi criado antes por engano, movido para fora da árvore, os testes rerrodados para capturar
  este red genuíno, e só então restaurado — para não passar sem intenção.)

### Implementação

- `tripClient.service.ts`: `planTripRoute` passa a aceitar `routeChoice?: RouteChoice` e inclui
  `{ routeChoice }` no corpo quando presente.
- `useTripQuickCreate.hook.ts`: novo estado `routeChoice` (default `{ criterion: 'cheapest', signature:
null }`, resetado em `reset()`), exposto no controller (`routeChoice`/`setRouteChoice`); a
  `mutationFn` de criação passa a chamar `finalizeQuickCreateRoute({ planRoute, reorderStops,
shouldReorder })` no lugar da sequência antiga.
- `finalizeQuickCreateRoute.service.ts` (novo, `shared/`): orquestrador puro e injetável — reordena
  primeiro (se `shouldReorder`), planeja com a escolha do operador por último. Criado em arquivo
  próprio porque `tripQuickCreate.service.ts` já estava em 198 das 200 linhas do padrão de arquivo.
- `TripQuickCreateDialog.component.tsx`: liga `onRouteChoiceChange={quickCreate.setRouteChoice}` no
  `TripAssemblyMap`, entre `onOrderChange` e `onStopRemove`.
- `test/trip.contract.test.ts`: barrel ganha `import './trip/route-choice-manual-creation.contract.js'`.

### Gates

```
$ bun run typecheck   (raiz, 6 apps)
0 erros.

$ bun run lint   (raiz, 6 apps)
0 erros.

$ bun run format:check   (raiz)
Limpo — nenhum arquivo fora do padrão.

$ bun run test   (apps/frontend-transportada)
4167 pass / 0 fail (baseline T402) → 4170 pass / 0 fail
Delta de +3 é exatamente a suíte nova `route-choice-manual-creation.contract.ts` (3 `it`) — nenhum
teste pré-existente mudou de contagem ou de asserção.

$ bun run build   (apps/frontend-transportada)
✓ built in 8.07s — PWA precache 129 entries (4468.59 KiB), mesma contagem de entradas do baseline
T402 (129). Nenhum asset novo precacheado; maior chunk (`vectorBasemap.service`, 997.94 kB) segue
abaixo do teto de 2 MiB por asset, e `vectorBasemap.service`/`index` continuam chunks separados —
MapLibre não voltou ao bundle principal.
```

### Commit

`<preenchido após o commit>`

## T404 — Proposta: escolha por veículo no aceite e na prévia da conta ✅ 2026-09-17

### Escopo

D7: a proposta com **mais de um veículo** grava uma escolha de rota **por veículo**, nunca um valor
único compartilhado por toda a proposta. Cobre (a) o aceite (`acceptMultiVehicleSuggestion`) — a rota
congelada de cada veículo usa a escolha daquele veículo — e (b) a prévia da conta
(`useTripValuationPreview`/`previewValuation`) — a conta muda com a rota escolhida daquele veículo.
D2: a escolha é identificada por `signature` + `criterion`, nunca por índice. D1: a mais barata é o
default por veículo; quem nunca toca o seletor ainda manda `cheapest` explícito, nunca omitido. Fora
do escopo: detalhe da viagem já congelada (T405) e Fase 5.

### API: nenhuma mudança necessária, confirmado com evidência de código

O backend já implementa `routeChoiceByVehicle`/`routeChoice` ponta a ponta desde T204/RF4 — spec 153
não pediu, e não recebeu, alteração de contrato nesta task:

- `apps/api-transportada/src/routing/presentation/route-suggestion-request.schema.ts:143` —
  `routeChoiceByVehicle` já é campo aceito no corpo do aceite multi-veículo.
- `apps/api-transportada/src/routing/application/multi-vehicle-suggestion.use-case.ts:171-172` —
  `routeChoiceByVehicleMap` é montado a partir do array recebido, chaveado por `vehicleId`.
- `multi-vehicle-suggestion.use-case.ts:262-266` — dentro do laço por grupo,
  `routeChoiceByVehicleMap.get(group.vehicleId)` busca a escolha **daquele** veículo antes de chamar
  `trips.planRoute` — é a aplicação por veículo que D7 exige, já em produção.
- `apps/api-transportada/src/trips/presentation/trip-request.schema.ts:112` —
  `previewTripValuationSchema.routeChoice` (`routeChoiceRequestSchema.optional()`) já aceita a
  escolha na prévia de um veículo.
- `apps/api-transportada/src/trips/presentation/trip.routes.ts:738-767` — a rota `POST
/trips/valuation-preview` (`TRIP_VALUATION_PREVIEW_PATH`) já encaminha `body.routeChoice` ao
  `previewValuation.execute` e já está protegida por `policy: TRIP_FINANCIALS_POLICY` (linha 767) —
  D10/D9: sem `trip.financials` o handler nunca roda, 403 antes de qualquer cálculo; km/tempo
  continuam fora dessa rota (a prévia de carga usa `TRIP_MANAGE_POLICY`, comentário já existente na
  linha 771).

Logo: T404 é uma task **só de frontend** — fiar a escolha por veículo já guardada pelo servidor até a
tela que hoje lê/escreve um valor único.

### D5 — o que acontece com os demais veículos quando um falha (confirmado por leitura, não alterado)

Dois mecanismos distintos, ambos pré-existentes:

1. **Falha de OSRM/congelamento dentro de um único veículo não aborta aquele veículo.**
   `apps/api-transportada/src/trips/application/plan-trip-route.use-case.ts:94-102`: o congelamento de
   pedágio roda **depois** de `markRoutePlanned`, dentro de um `try {} catch {}` que absorve qualquer
   falha (`/* o roteiro está planejado; o pedágio congela no próximo replanejamento */`) — o
   `route_planned` daquele veículo não é desfeito, e o pedágio recongela no próximo replanejamento.
2. **Falha "dura" (não-OSRM) em um veículo aborta o restante do aceite naquela chamada.**
   `multi-vehicle-suggestion.use-case.ts:247-297`: um único `try { for (const group of groups) {...} }
catch (cause) { ... }` envolve o laço inteiro. Se um veículo lançar uma exceção que o `catch` de
   `plan-trip-route` não absorveu (ex.: `linkDocument`, `reorderStops`, `applyEstimatedArrivals`), o
   `catch` externo **libera a sugestão de volta para `ready`** (`suggestions.release`) e relança —
   nenhum veículo depois dele na mesma chamada de aceite chega a ser processado. As viagens já criadas
   para veículos **anteriores** na mesma chamada **não são desfeitas** (comentário explícito próximo à
   linha 288: "não desfaz as viagens já criadas: apagá-las seria destruir trabalho que pode estar
   correto"). Ou seja: o operador pode reabrir e reaceitar a sugestão, e vai encontrar as viagens que
   já nasceram antes da falha, mais os veículos restantes ainda por aceitar. Nenhum código deste
   mecanismo foi tocado por T404 — só confirmado, porque T404 depende dele para garantir que a escolha
   de um veículo nunca contamina o resultado de outro mesmo sob falha parcial.

### Vermelho genuíno (antes da implementação)

Arquivo novo `apps/frontend-transportada/test/trip/proposal-route-choice.contract.ts` (18 asserções
novas), saída completa em
`/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada/e08e5c2d-e62d-4a98-9f99-fad68c8e8cc3/scratchpad/t404-red.txt`:

```
$ bun test ./test/trip.contract.test.ts
927 pass
18 fail
17753 expect() calls
Ran 945 tests across 1 file.
```

Os 18 falhos são exatamente as 18 asserções novas (nenhuma das 927 pré-existentes mudou de resultado
— zero regressão introduzida pela chegada do arquivo). A asserção mais importante do lote — a prova
de que **dois veículos com escolhas diferentes continuam diferentes ao serem lidos de volta**:

```ts
test('cada veículo lê a própria escolha — a de um nunca vaza para o outro', async () => {
  const { resolveVehicleRouteChoice } = await loadProposalRouteChoice()
  const routeChoiceByVehicle = new Map<string, RouteChoice>([
    [VEHICLE_ID, { criterion: 'fastest', signature: 'rota-a' }],
    [SECOND_VEHICLE_ID, { criterion: 'no_toll', signature: 'rota-b' }],
  ])

  const first = resolveVehicleRouteChoice({ routeChoiceByVehicle, vehicleId: VEHICLE_ID })
  const second = resolveVehicleRouteChoice({ routeChoiceByVehicle, vehicleId: SECOND_VEHICLE_ID })

  expect(first).toEqual({ criterion: 'fastest', signature: 'rota-a' })
  expect(second).toEqual({ criterion: 'no_toll', signature: 'rota-b' })
  expect(first).not.toEqual(second)
})
```

Antes da implementação isso falhava por ausência do módulo (`proposalRouteChoice.service.ts` não
existia). As demais 17 asserções cobrem: D1 (veículo ausente resolve para `cheapest` explícito, nunca
omitido, tanto na leitura quanto no corpo do aceite), isolamento por veículo no corpo do aceite
(`routeChoiceByVehicle` do POST nunca troca a escolha de um veículo pela de outro) e na prévia (duas
chamadas para dois veículos não compartilham a escolha — cada `previewValuation` leva só a rota do seu
próprio veículo), e o fio de ponta a ponta até a tela por leitura de fonte (import, prop, chave de
`useQuery`, corpo do `POST`).

### Implementação

- `routeGeometry.service.ts`: exporta `DEFAULT_ROUTE_CHOICE` (antes duplicado só dentro de
  `useTripQuickCreate.hook.ts`) — dedup por código-padrão §16, já que agora dois módulos precisam do
  mesmo default.
- `useTripQuickCreate.hook.ts`: importa `DEFAULT_ROUTE_CHOICE` do lugar canônico em vez de declarar a
  própria cópia.
- `proposalRouteChoice.service.ts` (novo, `shared/`): `resolveVehicleRouteChoice` (leitura isolada por
  veículo, `cheapest` se ausente) e `resolveAcceptedRouteChoices` (uma entrada por veículo aceito,
  sempre pareada, nunca trocada) — o núcleo puro e testável de D7.
- `useTripRouteAssembly.hook.ts`: novo estado `routeChoiceByVehicle` (`ReadonlyMap<string,
RouteChoice>`, nunca um valor único), `setVehicleRouteChoice(vehicleId, routeChoice)` exposto no
  controller, limpo (`new Map()`) tanto ao propor de novo quanto ao aceitar com sucesso — a escolha da
  proposta anterior nunca vaza para a próxima. No aceite, `resolveAcceptedRouteChoices` monta
  `routeChoiceByVehicleForAccept` — **sempre presente** no corpo de `acceptMultiVehicleSuggestion`,
  nunca condicionado a `.length === 0` como os campos opcionais vizinhos, porque D1 exige o
  `cheapest` explícito mesmo quando ninguém tocou nada.
- `tripClient.service.ts`: `acceptMultiVehicleSuggestion` aceita `routeChoiceByVehicle?: readonly
Readonly<{ routeChoice: RouteChoice; vehicleId: string }>[]` e inclui no corpo JSON quando presente.
- `TripProposalDetail.component.tsx`: recebe `routeChoice`/`onRouteChoiceChange` por veículo, repassa
  ao `TripAssemblyMap` (que já expunha `onRouteChoiceChange` desde T402) e à consulta de
  `useTripValuationPreview`.
- `useTripValuationPreview.hook.ts`: aceita `routeChoice?: RouteChoice` opcional, inclui no corpo de
  `previewValuation` quando presente e entra na `queryKey` (via `routeChoiceKey`, serializando
  `criterion:signature`) — trocar a rota de um veículo invalida só a consulta daquele veículo.
- `tripFinancialsClient.service.ts`: `previewValuation` aceita `routeChoice?: RouteChoice` (import
  type-only de `trip/shared/routeGeometry.service` — primeira vez que `trip-financials` importa de
  `trip`, seguro por ser só tipo, apagado em tempo de compilação) e inclui no corpo quando presente.
- `TripRouteAssemblyDialog.component.tsx`: cada linha de `<TripProposalDetail>` passa
  `routeChoice={resolveVehicleRouteChoice({ routeChoiceByVehicle: assembly.routeChoiceByVehicle,
vehicleId: view.vehicleId })}` e `onRouteChoiceChange={(routeChoice) =>
assembly.setVehicleRouteChoice(view.vehicleId, routeChoice)}` — a leitura é sempre por
  `view.vehicleId`, nunca um valor lido fora do laço.

### Como a prévia e o aceite são mantidos de acordo

Os dois pontos usam a **mesma fonte** por veículo: o mapa `routeChoiceByVehicle` do
`useTripRouteAssembly`. A prévia lê via `resolveVehicleRouteChoice` dentro de
`TripRouteAssemblyDialog` a cada render da linha daquele veículo (nunca um snapshot separado), e o
aceite lê o mesmo mapa via `resolveAcceptedRouteChoices` no momento do clique — ambos convergem para o
mesmo `Map`, nunca duas cópias que poderiam divergir. Trocar a escolha de um veículo no seletor do
mapa (`onRouteChoiceChange`) atualiza o mapa uma vez; a próxima leitura da prévia **e** o próximo
aceite enxergam o valor novo, do mesmo lugar.

### Três ajustes feitos durante o red → green (no próprio teste, não na produção)

1. **Mock de resposta do aceite incompleto**: o mock de `fetch` de `createAcceptRecordingClient`
   respondia `{ suggestion: { id: SUGGESTION_ID }, trips: [] } }` sem `status`;
   `multiVehicleSuggestionFromApi` exige `status` num dos valores de `MultiVehicleSuggestionStatus` e
   lançava `TRIP_RESPONSE_INVALID` ao validar a resposta — nada a ver com o corpo da requisição que o
   teste de fato verifica. Corrigido acrescentando `status: 'accepted'` ao mock.
2. **Janela de 1500 caracteres da asserção de `TripRouteAssemblyDialog`**: a posição original de
   `routeChoice`/`onRouteChoiceChange` na JSX (depois de `releaseUnplaced`) ficava a 1629 caracteres
   do início de `<TripProposalDetail`, fora da janela de 1500 que o teste lê. Corrigido reposicionando
   as duas props para logo depois de `manualOrder` (492 caracteres do início) — mudança de ordem de
   props, não de comportamento.
3. **Prettier quebrou a anotação `useState<ReadonlyMap<string, RouteChoice>>` em duas linhas** (a
   linha inteira excede os 100 caracteres de `printWidth`), e o regex original
   `/routeChoiceByVehicle.*ReadonlyMap<string, RouteChoice>/u` não casa `.` com quebra de linha.
   Ajustado para `[\s\S]*` no lugar de `.*` — o mesmo teste, tolerante à formatação, sem enfraquecer o
   que ele prova (que o estado é `ReadonlyMap`, não um valor único).

### Gates

```
$ bun run typecheck   (raiz, 6 apps)
0 erros.

$ bun run lint   (raiz, 6 apps)
0 erros. (1 erro corrigido no caminho: `TRIP_ID` importado e não usado em
apps/frontend-transportada/test/trip/proposal-route-choice.contract.ts — removido do import.)

$ bun run format:check   (raiz)
Limpo — nenhum arquivo fora do padrão (depois de aplicar `prettier --write` nos 3 arquivos que a
alteração deixou fora do estilo: useTripRouteAssembly.hook.ts, proposalRouteChoice.service.ts,
proposal-route-choice.contract.ts).

$ bun test ./test/trip.contract.test.ts   (apps/frontend-transportada)
945 pass / 0 fail — 927 pré-existentes (T401-T403) inalterados + 18 novos de D7, todos verdes.

$ bun run test   (apps/frontend-transportada, suíte inteira)
4188 pass / 0 fail — baseline T403 (4170 pass / 0 fail) + 18, exatamente o delta do arquivo novo.
Nenhum teste pré-existente mudou de contagem ou de asserção.

$ bun run build   (apps/frontend-transportada)
✓ built in 9.35s — PWA precache 129 entries (4469.52 KiB), mesma contagem do baseline (129).
`vectorBasemap.service` (997.94 kB) e `index` (952.92 kB) seguem como chunks separados, ambos abaixo
do teto de 2 MiB por asset — MapLibre não voltou ao bundle principal.
```

Gate de API não foi executado: nenhum arquivo de `apps/api-transportada` foi tocado nesta task (ver
seção acima) — os três achados de código citados são leitura, não mudança.

### Commit

`2ec6c5e3`

## T405 — Detalhe: rota gravada, km/volta/tempo, critério, avisos, custos e valor da NF só com permissão ✅ 2026-09-17

### Escopo e a decisão do requisito 1 (regravação no detalhe)

Frontend só (`apps/frontend-transportada`). O detalhe é, de fato, **a única tela que sobra** onde o
operador troca a rota de uma viagem já congelada (RF13/D6): a montagem (`TripAssemblyMap`, T402) e
a criação manual (T403) regravam **antes** de a viagem existir, e a proposta (T404) regrava por
veículo no aceite — nenhuma delas mexe numa rota já `frozen`. Confirmado por leitura de
`read-trip-route-geometry.use-case.ts` (`toFrozenView`) que a rota **congelada** da viagem só
devolve **uma** opção (`options: [option]`, `cheapestIndex`/`fastestIndex` ambos `0`,
`hasChoice: false`) — as alternativas (mais rápida, sem pedágio) não sobrevivem ao congelamento.
Logo, "as opções já em mãos" do switch do detalhe **não podem vir** da leitura congelada
(`GET /trips/:id/route-geometry`, já consumida por `workspace.routeGeometryQuery`); precisam de uma
segunda leitura, **viva**, por pontos — o mesmo `readPointsRouteGeometry` que `TripAssemblyMap`
já usa (T402) — feita **uma única vez** por tela, nunca refeita pela troca. Regravar continua sendo
`plan-route` (RF3), reaproveitando o `planRouteMutation` que o detalhe já tinha para o botão
"planejar rota" de sempre (`TripStateActions.onPlanRoute`), agora aceitando `routeChoice` opcional.

### Requisito 2 — a armadilha do `choiceReproduced` da T401, corrigida

`tripResponse.validation.ts` (`routeGeometryFromApi`) gravava
`choiceReproduced: input.choiceReproduced === true` incondicionalmente — chave **ausente** (o
`/route-geometry` avulso da montagem, sem viagem, nunca manda este campo) virava `false`, o mesmo
valor que "tentei reproduzir a assinatura e não bati" (D3). O detalhe não tinha como distinguir "o
aviso não se aplica aqui" de "a estrada mudou, avise o operador". Corrigido para preservar a
ausência com espalhamento condicional (`...(input.choiceReproduced === undefined ? {} : {
choiceReproduced: input.choiceReproduced === true })`) — `exactOptionalPropertyTypes: true` exige
que a chave **suma** do objeto, nunca receba `undefined` explícito. O tipo em
`routeGeometry.service.ts` já era opcional (`choiceReproduced?: boolean`); só o adaptador colapsava
a distinção.

O teste de `route-geometry-money-optional.contract.ts` (T401) **enshrined o defeito**: a asserção
`expect(view.choiceReproduced).toBe(false)` rodava sobre um `input` que **não tinha a chave**
`choiceReproduced` — provando exatamente o comportamento errado. Corrigida para
`toBeUndefined()`, e acrescentado um teste novo (`choiceReproduced distingue ausência (undefined)
de assinatura não reproduzida (false)`) que prova os dois lados na mesma asserção: ausente vira
`undefined`, presente-e-`false` continua `false`, e os dois nunca são iguais.

### Requisito 3 — a prova das duas metades juntas

`test/trip/route-choice-detail.contract.ts`, teste
`trocar mais rápida ↔ mais barata regrava via plan-route usando as opções já buscadas — nenhuma
chamada nova ao roteirizador`: grava as requisições reais de um `TripClient` fake (mesmo padrão de
`route-choice-manual-creation.contract.ts`, T403), monta a `RouteChoice` a partir de opções que
**nunca passaram por fetch** (dados em memória, iguais aos que uma leitura viva já traria), chama
só `planTripRoute`, e afirma na mesma asserção: (1) o corpo do POST carrega
`{ criterion: 'cheapest', signature: 'rota-mais-barata' }` — a regravação de fato aconteceu — e (2)
`requests` tem **exatamente uma** entrada, para `/plan-route`, nunca para `/route-geometry` — nenhum
novo fetch ao roteirizador. Provar só uma das duas deixaria passar o defeito que o pedido veio
evitar (ex.: um componente que regrava mas também refaz a leitura viva a cada troca).

Complementado por três testes de fonte sobre `TripRouteChoiceSwitch.component.tsx`: a leitura viva
aparece **uma única vez** no arquivo (`chamadas = source.split('readPointsRouteGeometry').length -
1; expect(chamadas).toBe(1)`, mesmo molde de T402), a `queryKey` não inclui `selectedIndex`/
`criterion` (trocar não muda a chave, então o TanStack Query não refaz a busca), e a troca sai por
`onSelect(resolveRouteChoiceFromIndex(...))` — nunca o índice cru.

### Implementação

- `tripResponse.validation.ts`: fix do requisito 2 acima.
- `TripRouteChoiceSwitch.component.tsx` (novo): o switch do detalhe. Busca a geometria viva **uma
  vez** por `routeKey`/`vehicleId` (mesmo padrão de `TripAssemblyMap`), reaproveita
  `RouteChoiceOptions` (T402) sobre essas opções, e emite `onSelect(routeChoice)` — nunca chama
  `plan-route` sozinho (mesma fronteira documentada em `TripAssemblyMap`: "quem tem `tripId` é quem
  regrava"). Só liga a consulta quando `canSwitch` (trip.manage **e** viagem editável, D6) — sem
  isso nem gasta uma requisição.
- `TripRouteCostSummary.component.tsx` (novo, extraído de `TripRouteMap`): km/volta/tempo (D9,
  sempre presentes, lidos de `geometry.distanceMeters/durationSeconds/returnDistanceMeters` — a
  rota **da viagem**, não a opção crua, que é o que RF1/D4 gravaram), combustível/pedágio/total
  (D10, cada linha atrás de `!canReadFinancials ? null : (...)` — a linha inteira some, nunca
  traço/zero), o critério gravado (D2, rótulos reaproveitados de `assemblyMap.routeOptions.*`, mais
  um rótulo novo `alternative`) e o aviso de escolha não reproduzida (D3,
  `geometry.choiceReproduced !== false` — só dispara com `false` de verdade). Extraído pelo mesmo
  motivo de `RouteChoiceOptions`/`RouteTollSummary` em T402: manter `TripRouteMap` abaixo do limite
  de 200 linhas do padrão de código (o arquivo tinha 285 linhas antes desta task, teria passado de
  370 com os campos novos inline; ficou em 257 com a extração — ainda acima do limite, violação
  pré-existente ao T402, fora do escopo zerar por completo, mesma decisão já registrada lá).
- `TripRouteMap.component.tsx`: monta `<TripRouteCostSummary>` e `<TripRouteChoiceSwitch>` logo
  depois de `<RouteTollSummary>`; ganha as props `canSwitchRoute`, `isRouteChoicePending`,
  `onRouteChoiceSelect`, `vehicleId`; perde os cálculos locais que migraram para
  `TripRouteCostSummary`.
- `useTripWorkspace.hook.ts`: `TripController.planTripRoute` passa a aceitar `routeChoice?:
RouteChoice` (a implementação já só repassava `body`; só o tipo travava). `planRouteMutation`
  (já existente, `onSuccess: invalidate`) não mudou — `invalidate()` já invalida `tripKey` por
  prefixo, e `route-geometry` mora sob esse prefixo, então a regravação já refaz o fetch da rota
  congelada sem código extra.
- `TripDetail.component.tsx`: `<TripRouteMap>` ganha `canSwitchRoute={canManage && isEditable}`,
  `isRouteChoicePending={workspace.planRouteMutation.isPending}`,
  `onRouteChoiceSelect={(routeChoice) => workspace.planRouteMutation.mutate({ routeChoice, tripId:
trip.id })}` (reaproveita a mutação que já existia para o botão "planejar rota") e
  `vehicleId={trip.vehicleId}`.
- `trip.locale.json`: `routeMap.cost.duration`, `routeMap.cost.returnDistance`,
  `routeMap.criterion`, `routeMap.choiceNotReproduced` (novos); `assemblyMap.routeOptions.alternative`
  (rótulo que faltava para o quarto critério).
- `route-map-panel.contract.ts` (pré-existente, T013): a asserção `route?.fuelTotal` apontava para
  `TripRouteMap.component.tsx`, que não tem mais esse literal depois da extração — atualizada para
  ler o literal em `TripRouteCostSummary.component.tsx`, mantendo a asserção de que
  `<TripRouteCostSummary` continua montado no mapa.

### O que não fiz

- Não toquei `TripStopList.component.tsx` (valor da NF-e por parada): já lida corretamente com a
  ausência da chave (`document.nfeTotalValue === null || === undefined ? null : ...`), e o
  backend (T301) já corta a chave sem `trip.financials` — o pedido "valor da NF só com permissão"
  já estava satisfeito antes desta task, confirmado por leitura, sem mudança necessária.
- Não toquei a API: RF3 (`plan-route` aceita `routeChoice`), RF7 (`route-geometry` devolve a
  gravada) e a leitura por pontos já existiam desde T201-T204/T104 — confirmado por leitura de
  `read-trip-route-geometry.use-case.ts`, `freeze-trip-planned-route.use-case.ts` e
  `tripClient.service.ts` (o mesmo achado que T404 já tinha registrado para o aceite multi-veículo).
- O texto "rota não calculada" (D5) já existia (`routeMap.trace.straight`, mostrado sempre que
  `geometry === null || geometry.legs.length === 0`) — não criei um segundo aviso redundante.
- Não movi `TripRouteMap.component.tsx` para abaixo de 200 linhas por completo (ficou em 257,
  contra 285 antes desta task) — dividir o resto (o mapa MapLibre em si, a correção de ponto)
  ultrapassa o pedido da T405 e altera comportamento fora do escopo, mesma decisão de T402.

### Gates

```
$ bun run typecheck   (raiz, 6 apps)
0 erros.

$ bun run lint   (raiz, 6 apps)
0 erros.

$ bun run format:check   (raiz)
Limpo — nenhum arquivo fora do padrão.

$ bun test ./test/trip.contract.test.ts   (apps/frontend-transportada)
946 pass / 0 fail (baseline antes da T405) → 960 pass / 0 fail
Delta de +14: as 13 asserções novas de `route-choice-detail.contract.ts` (regravação combinada: 1;
switch: 4; TripRouteCostSummary: 5; TripDetail: 2; total 12 — a 13ª é o teste extra de
`choiceReproduced` ausente-vs-`false` acrescentado a `route-geometry-money-optional.contract.ts`)
mais a 1 asserção nova de `route-map-panel.contract.ts` (o `<TripRouteCostSummary` verificado junto
do `route?.fuelTotal` movido) — nenhum teste pré-existente mudou de contagem.

$ bun run test   (apps/frontend-transportada)
4202 pass / 0 fail

$ bun run build   (apps/frontend-transportada)
✓ built in 8.28s — PWA precache 129 entries (4472.34 KiB), mesma contagem de entradas do baseline
T404 (129), variação de poucos KiB só por texto/código novos. `vectorBasemap.service` (997.94 kB)
continua chunk separado do `index` principal — MapLibre não voltou ao bundle principal.
```

Gate de API não foi executado: nenhum arquivo de `apps/api-transportada` foi tocado nesta task (ver
"o que não fiz" acima) — os achados de código citados são leitura, não mudança.

### Commit

`5ab43a43`

## T501 — Aba Regiões em MapLibre (polígonos por zona, clique, legenda, cidades fora da malha) ✅ 2026-09-17

### Onde fica a aba e o que ela fazia com `VectorMap`

`FreightRegionMap.component.tsx` (`apps/frontend-transportada/src/modules/fleet/components/`),
montado por `FreightRegionPanel.component.tsx` nos dois modos (leitura e edição, dentro do
formulário de zona). Toda a lógica de estado e consulta já morava em `useFreightRegionMap.hook.ts`
— o componente só renderizava. Ele desenhava `entry.model.shapes` (um por município da UF) como
`<path d={shape.path}>` do primitivo SVG `VectorMap` (`src/components/ui/vector-map.tsx`), com
`fill` por `resolveZoneFill(shape.zone)`, clique delegado a `onSelect` só em modo edição, e a
malha vinha **já projetada** em `d` de SVG por `ibgeMesh.service.ts` (`loadStateMesh` →
`projectStateMesh`, que também calculava um `viewBox`). Legenda e lista de cidades fora da malha
(`entry.model.outside`) já eram HTML puro, fora do `<svg>` — não dependiam do motor do mapa.

### A malha crua já existia — não precisou inventar geometria

`ibgeMesh.service.ts` já expunha `loadStateMeshFeatures`/`readStateMeshFeatures`, que devolvem os
polígonos do IBGE **sem projetar** — anéis em longitude/latitude crus (`MeshFeature.rings`) — para
quem enquadra em escala própria (usado hoje por `TripAssemblyMap.component.tsx`, para achar o
centro aproximado do município quando a NF-e não tem geocodificação fina, não para desenhar
polígono nenhum). É exatamente o formato que uma fonte GeoJSON do MapLibre precisa — coordenada
lon/lat direta, sem o `toPath`/`toViewBox` equirretangular que só serve a um `<svg viewBox>`. Não
havia necessidade de parar e reportar: o dado geográfico já existia em forma utilizável, só não
estava ligado a nenhum desenho MapLibre ainda.

### Implementação

- `freightRegionMap.service.ts`: `buildFreightRegionMap` passa a receber `features: readonly
MeshFeature[]` (em vez de `mesh: StateMesh`); `FreightRegionMapShape` troca `path` por `rings`
  (anéis crus) e `FreightRegionMapModel` perde `viewBox` (o MapLibre projeta sozinho, então quem
  enquadra é quem monta o mapa, não o serviço). Duas funções puras novas, cobertas por contrato:
  `toFreightRegionFeatureCollection` (shapes → `FeatureCollection` de `MultiPolygon`, um subpolígono
  por anel — ilha/enclave continuam o mesmo município, como o `d` antigo fazia — com `zone` como
  propriedade **numérica**, sentinela `-1` para sem-zona porque expressão de estilo do MapLibre não
  lê `null`) e `resolveFreightRegionBounds` (extensão real das coordenadas, para `fitBounds`).
- `useFreightRegionMap.hook.ts`: troca `loadStateMesh` por `loadStateMeshFeatures` na mesma
  `useQuery` (mesma `IBGE_MESH_QUERY_KEY`, mesmo `staleTime` de uma semana); resto do hook
  (derivação de UF, `selectShape` por código, `legend`) não mudou — a lógica de zona/claim/outside já
  era por `codarea`, indiferente a SVG ou GeoJSON.
- `FreightRegionVectorMap.component.tsx` (novo): o motor MapLibre da aba, montado do mesmo jeito que
  `AssemblyVectorMap`/`DriverHomeMap` já fazem — `configureVectorBasemap()`, `try/catch` no
  construtor (sem WebGL2 cai para `onBasemapMissing`), `buildBasemapStyle(readToken,
basemapThemeForApp('dark'))` como pano de fundo. Fonte `geojson` própria (`zona-de-frete`,
  `promoteId: 'code'`) com duas layers: `fill` (cor por zona via expressão `match` sobre a
  propriedade `zone`, tokens resolvidos em runtime, igual ao resto do produto) e `line` (contorno,
  com `feature-state` `hover`/`selected` — mesma escala visual do `.selected`/`.interactive:hover` do
  `vector-map.module.css` que ela substitui: fino e semitransparente em repouso, grosso e opaco em
  destaque). Fonte e layers são reaplicadas de forma idempotente a cada `styledata` (mesmo padrão de
  `applyRoute` em `AssemblyVectorMap` — a troca de tema descarta camada em runtime). Clique delegado
  à layer de preenchimento (`map.on('click', ZONE_FILL_LAYER, ...)`), lendo `properties.code` da
  feição sob o cursor e chamando `onSelect` — o mesmo `entry.selectShape` de sempre, que resolve a
  shape e chama `toggleRegionMapCity`. Seleção (cidades já na zona) aplicada como `feature-state`,
  não como propriedade da fonte — trocar a lista de cidades não refaz o GeoJSON. Popup do MapLibre no
  hover reproduz o `<title>` nativo do SVG antigo (nome da cidade, ou cidade + rotas reivindicantes).
- `FreightRegionMap.component.tsx`: troca o `<VectorMap>` estático por `FreightRegionVectorMap`
  carregado por `lazy`/`Suspense`, mesmo padrão de `TripAssemblyMap` — o MapLibre não pode entrar no
  pacote principal. Ganha `hasBasemap`/`onBasemapMissing` (ADR-0044 §6: sem o `.pmtiles` a tela cai
  para a legenda/lista, dizendo isso, em vez de travar) — comportamento que o `VectorMap` antigo não
  precisava ter (SVG não depende de arquivo externo) e que o novo motor precisa, por herdar a mesma
  dependência de basemap do mapa da viagem. Legenda e lista de cidades fora da malha **não mudaram
  uma linha** — já eram HTML puro fora do desenho.
- `fleet.module.css`: `.mapDrawing` (do `<svg>` antigo) sai — nada mais o usa —, entra
  `.regionMapCanvas` (altura fixa de `26rem`: o canvas do MapLibre não tem tamanho intrínseco como o
  `<svg>`, e sem altura declarada o mapa nasce 0×0 e nunca pede telha).
- `fleet.locale.json`/`fleet.en.locale.json`: `regionMap.withoutBasemap`, novo, nos dois idiomas.

### Acessibilidade — a alternativa por teclado já existia, preservada

O `VectorMap` antigo já era `role="img"` **sem** foco nem navegação por teclado nas formas — o
comentário do próprio primitivo explica por quê: "leitor de tela não navega polígono... quem usa
teclado escreve pela busca e pela colagem do campo de cidade ao lado, que fazem a mesma escrita". A
alternativa de teclado/lista para selecionar uma zona sempre foi o campo de cidade do formulário
(`FreightRegionCityField`/`FreightRegionForm`), fora deste componente e não tocado nesta task — o
novo motor mantém o mesmo `role="img"` no contêiner do canvas, sem regressão nem promessa nova de
acessibilidade que o desenho antigo não cumpria.

### O que não fiz

- Não toquei `VectorMap` (`src/components/ui/vector-map.tsx`), `tripRouteMap.service.ts`,
  `tripBasemap.service.ts`, `tileMap.service.ts` nem `resolveRouteTraceSegments`
  (`routeGeometry.service.ts`) — nem seus testes (`test/design-system/vector-map.contract.ts`,
  `test/trip/route-basemap.contract.ts`, `test/trip/route-map-panel.contract.ts` e outros). Todos
  continuam existindo e passando; a aba Regiões só parou de **depender** de `VectorMap`.
- Não mexi em `ibgeMesh.service.ts` além de trocar qual função o hook chama. `loadStateMesh`,
  `projectStateMesh`, `StateMesh`, `MeshShape` e `EMPTY_STATE_MESH` (a família que projeta a malha em
  `d` de SVG) ficaram **sem consumidor de produção** depois desta task — só a própria
  `ibgeMesh.service.ts` e o describe `ibge mesh contract` (que já existia) ainda os referenciam. Não
  removi porque não estavam na lista explícita do pedido (`VectorMap`, `tripRouteMap.service`,
  `tripBasemap.service`, `tileMap.service`, `resolveRouteTraceSegments`) e remover é decisão de T502
  (RF11), não desta task — listados abaixo para a varredura de lá.
- Não toquei `TripAssemblyMap.component.tsx`, `AssemblyVectorMap.component.tsx` nem
  `DriverHomeMap.component.tsx` — só li os três como referência de padrão (montagem do MapLibre,
  `lazy`/`Suspense`, tokens de cor em runtime).

### O que ainda referencia o mapa antigo (achados para a T502)

Confirmado por leitura e por `grep`, sem chamador fora do próprio arquivo em nenhum dos casos:

- `src/components/ui/vector-map.tsx` (`VectorMap`) — sem consumidor de produção depois desta task
  (a aba Regiões era o único). Só o teste `test/design-system/vector-map.contract.ts` o exercita.
- `src/modules/trip/shared/tripRouteMap.service.ts` (`resolveTripRouteMap`) — já estava órfão antes
  desta task; nada o importa fora dele mesmo.
- `src/modules/trip/shared/tripBasemap.service.ts` (`buildTripBasemapPaths`) — já estava órfão antes
  desta task; só `test/trip/route-basemap.contract.ts` o exercita.
- `src/modules/trip/shared/tileMap.service.ts` — importado só como `import {} from
'../shared/tileMap.service'` em `TripAssemblyMap.component.tsx` (linha 48), um import vazio sem
  nenhuma binding usada — efeito nenhum, remoção seria só apagar a linha.
- `resolveRouteTraceSegments` em `src/modules/trip/shared/routeGeometry.service.ts` — sem chamador
  fora do próprio arquivo.
- **Novo nesta task**: `loadStateMesh`, `projectStateMesh`, `StateMesh`, `MeshShape`,
  `EMPTY_STATE_MESH` em `src/modules/shared/ibgeMesh.service.ts` (a projeção SVG da malha) — a aba
  Regiões era a única consumidora de produção; ficaram só com o describe `ibge mesh contract` do
  próprio arquivo de teste.

### Gates

```
$ bun run typecheck   (raiz, 6 apps)
0 erros.

$ bun run lint   (raiz, 6 apps)
0 erros.

$ bun run format:check   (raiz)
Limpo — nenhum arquivo fora do padrão (depois de `prettier --write` nos dois arquivos novos/mudados
que a formatação apontou).

$ bun test ./test/fleet.contract.test.ts   (apps/frontend-transportada)
530 pass / 0 fail — 6605 expect() calls.
`test/fleet/freight-region-map.contract.ts` ganhou 5 testes líquidos (32 → 37 blocos `test(...)`):
+4 do novo describe `freight region geojson contract` (`toFreightRegionFeatureCollection`,
`resolveFreightRegionBounds`), +2 do describe de componente (import dinâmico, fonte GeoJSON/clique
por layer), -1 do teste que só verificava o primitivo `VectorMap` em si (ele continua coberto por
`test/design-system/vector-map.contract.ts`, não removido, só deixou de ser reasserido aqui).

$ bun run test   (apps/frontend-transportada, suíte inteira)
4208 pass / 0 fail — baseline T405 (4202 pass / 0 fail) + 6.

$ bun run build   (apps/frontend-transportada)
✓ built in 8.49s — PWA precache 130 entries (4484.23 KiB), baseline T405 129 entries (4472.34 KiB):
+1 entrada, o chunk novo do motor MapLibre da aba Regiões.
`FreightRegionVectorMap.component-CU6y1ydP.js`: 4.48 kB — chunk próprio, não entrou no `index`.
`vectorBasemap.service-QvV4NZCb.js`: 1 004.90 kB — segue chunk único e compartilhado (trip e fleet),
abaixo do teto de 2 MiB por asset.
`index-DX-Ux_U8.js` (pacote principal): 953.45 kB — MapLibre não voltou a ele.
```

Gate de API não foi executado: nenhum arquivo de `apps/api-transportada` foi tocado nesta task —
T501 é frontend puro (RF11).

### Commit

`ede9d598`

## T502 — Remoção do mapa antigo (RF11) e contrato de fonte (aceite 4)

### Confirmado por `grep`, um por um, antes de apagar

Todos os cinco candidatos que a T501 já tinha levantado (evidence acima, seção "O que ainda
referencia o mapa antigo") foram reconferidos nesta task, agora sem chamador nenhum fora do
próprio arquivo e sem teste que sobrevivesse à remoção sem ajuste:

- `VectorMap` (`src/components/ui/vector-map.tsx`, 90 linhas) e seu CSS
  (`vector-map.module.css`, 47 linhas) — zero consumidor de produção; `AssemblyVectorMap` e
  `FreightRegionVectorMap` são componentes **diferentes** (o motor MapLibre), o `\bVectorMap\b`
  com fronteira de palavra nos dois lados não bate neles.
- `tripRouteMap.service.ts` (113 linhas, `resolveTripRouteMap`) — já estava órfão antes da T501.
- `tripBasemap.service.ts` (52 linhas, `buildTripBasemapPaths`) — já estava órfão antes da T501.
- `tileMap.service.ts` (182 linhas) — o único ponto de contato era `import {} from
'../shared/tileMap.service'` em `TripAssemblyMap.component.tsx:48`, um import vazio (side-effect)
  sem nenhuma binding usada. **O que era**: um motor de mapa de telha (_slippy map_) em Web
  Mercator escrito à mão (`resolveTileMap`, `probeTileUrl`, `resolveTileAvailability`) que reverte
  em parte a ADR-0037 para servir telha própria via `/map-tiles`, conforme a ADR-0044 §6 — foi a
  fase intermediária do mapa da viagem antes do MapLibre assumir; a T501 já registrava que nada
  além do próprio arquivo o exercitava. Remover a linha de import não muda comportamento nenhum —
  era efeito zero, só carregava o módulo para nunca usar as bindings.
- `resolveRouteTraceSegments` (`routeGeometry.service.ts`) — sem chamador; a função irmã
  `resolveRouteLegs` (que ela só envolvia, convertendo `points` em `path` de SVG com `toPath`)
  continua viva e é o que `TripRouteMap`/`AssemblyVectorMap` usam hoje. `toPath` continua (ainda
  usada por `resolveRouteTrace`), só o tipo `RouteTraceSegment` (só usado pela função removida)
  saiu junto.

**Achado novo nesta task**, fora da lista original mas dentro do RF11 ("CSS/locale órfãos"): a
família de projeção SVG em `ibgeMesh.service.ts` que a T501 já tinha marcado como órfã —
`loadStateMesh`, `projectStateMesh`, `StateMesh`, `MeshShape`, `EMPTY_STATE_MESH` — confirmada sem
consumidor de produção (`readFreightRegionMap.hook.ts` usa `loadStateMeshFeatures`, a variante sem
projeção, desde a T501). Removidos junto com os helpers privados que só serviam a eles
(`toPath`/`toExtent`/`toViewBox`/`Extent`, e por tabela `round`, que só `toPath` chamava).

Não havia CSS nem chave de locale exclusiva de nenhum dos arquivos removidos: `VectorMap` não
tinha locale próprio, e `fleet.module.css` já tinha perdido `.mapDrawing` na T501. O único texto
remanescente foi um comentário em `scale-plan.tsx` citando `VectorMap` como exemplo de biblioteca
de ícones — trocado por uma frase sem o nome, porque o aceite 4 pede "nenhuma referência", inclusive
em prosa.

### Dependências npm

Nenhuma: o `package.json` não tem `d3-geo`, `topojson`, `leaflet` nem equivalente — a única lib de
mapa no projeto sempre foi `maplibre-gl`/`@maplibre/maplibre-gl-style-spec`, que é o motor atual.
Não houve `bun install` nem mudança em `bun.lock` por esta task.

### Testes

Removidos por inteiro (testavam só código apagado):

- `test/design-system/vector-map.contract.ts` (3 testes) — CSS do `VectorMap`.
- `test/trip/route-map.contract.ts` (6 testes) — `resolveTripRouteMap`.
- `test/trip/route-basemap.contract.ts` (3 testes) — `buildTripBasemapPaths`.

Editados, tirando só a parte do código morto:

- `test/trip/route-trace-colors.contract.ts`: saiu o teste "a cor do traço entra inline..." (lia o
  código-fonte de `vector-map.tsx`) e a constante `VECTOR_MAP`; os outros 8 testes do describe
  (`resolveRouteLegs`, `stopColorOf`, e os dois que leem `AssemblyVectorMap.component.tsx`) cobrem
  código vivo e ficaram como estavam.
- `test/fleet/freight-region-map.contract.ts`, describe `ibge mesh contract`: das 9 asserções,
  1 (`a projeção estreita a longitude...`) testava só a matemática de `toPath`/`toViewBox`
  (SVG, morta) e saiu sem substituto; as outras 8 foram **adaptadas**, não apagadas — trocando
  `projectStateMesh`/`loadStateMesh`/`EMPTY_STATE_MESH` (mortos) pelos irmãos vivos
  `readStateMeshFeatures`/`loadStateMeshFeatures` que já faziam a mesma leitura e falha, só sem
  projetar. Sem essa troca, o comportamento vivo de `readStateMeshFeatures` (descarta feição
  ilegível, lança `FLEET_IBGE_MESH_MALFORMED`) e de `loadStateMeshFeatures` (propaga falha do
  provedor, não sai à rede por UF desconhecida) ficaria sem contrato nenhum — o describe antigo só
  os exercitava por tabela, através do wrapper de projeção que este task remove.
- `test/trip.contract.test.ts` e `test/design-system.contract.test.ts`: tiraram os `import` dos
  três arquivos de teste apagados (lista explícita do `package.json`/entrypoints, CLAUDE.md).

Novo, cobrindo o aceite 4 (**contrato de fonte**, não lista fechada — varre `src/` inteiro em vez
de nomear arquivo por arquivo, para reintrodução por qualquer caminho quebrar o build):
`test/design-system/legacy-map-removed.contract.ts` — 2 testes: nenhum arquivo `.ts`/`.tsx`/`.css`
de `src/` contém `VectorMap`, `tripRouteMap.service`, `tripBasemap.service`, `tileMap.service` ou
`resolveRouteTraceSegments` (com fronteira de palavra, para não acusar `AssemblyVectorMap`/
`FreightRegionVectorMap`); e os próprios arquivos do desenho antigo não existem mais em `src/`.

**Contagem líquida**: 14 testes de código morto saíram (3+6+3+1+1), 2 novos entraram (aceite 4) →
4208 (baseline T501) → 4196 pass. A queda é inteira de cobertura de código apagado; nenhum teste de
comportamento vivo foi removido — os que cobriam comportamento vivo dentro dos describes mistos
foram adaptados, não descartados.

### Gates

```
$ bun run typecheck   (raiz, 6 apps)
0 erros.

$ bun run lint   (raiz, 6 apps)
0 erros.

$ bun run format:check   (raiz)
All matched files use Prettier code style!

$ bun run test   (apps/frontend-transportada, suíte inteira)
4196 pass / 0 fail — baseline T501 (4208 pass) − 14 (código morto) + 2 (aceite 4) = 4196.

$ bun run build   (apps/frontend-transportada)
✓ built in 10.13s — PWA precache 130 entries (4484.23 KiB), idêntico ao baseline T501 (130
entries, 4484.23 KiB): os arquivos removidos já eram código morto sem consumidor de produção, e o
tree-shaking já os excluía do bundle antes desta task — a remoção não muda o que é servido, só a
árvore de fonte.
`index-DX-Ux_U8.js` (pacote principal): 953.45 kB — mesmo hash e tamanho do baseline T501.
`vectorBasemap.service-QvV4NZCb.js`: 1 004.90 kB — inalterado, segue abaixo do teto de 2 MiB.
```

Gate de API não foi executado: nenhum arquivo de `apps/api-transportada` foi tocado — T502 é
frontend puro (RF11).

### O que não fiz

- Não toquei `resolveRouteLegs`, `resolveRouteTrace`, `RouteTrace`/`RouteTraceKind` nem `toPath`
  em `routeGeometry.service.ts` — vivos, usados por `TripRouteMap`/`AssemblyVectorMap`.
- Não toquei `src/modules/routing/shared/routeMapTiles.service.ts` nem
  `src/modules/routing/hooks/useRouteMap.hook.ts` — nomes parecidos, módulo `routing` diferente
  (não é o mapa da viagem/frota desta spec), fora do escopo do RF11.
- Não mexi em dependências do `package.json` nem rodei `bun install` — não havia nenhuma exclusiva
  do mapa antigo.

### Commit

## T601 — Documentação viva: CLAUDE.md das apps + ai-context ✅

Atualização de documentação (sem código de produção) refletindo a especificação 153 (rota gravada,
redação monetária, um mapa só).

### Arquivos atualizados

**apps/api-transportada/CLAUDE.md** — Seção "Custo de frete, motoristas e pedágio": parágrafo novo
após "Pedágio é calculado..." documentando o congelamento atômico de rota
(`freeze-trip-planned-route` use-case), campos de `planned_route` JSONB, métricas
(`planned_distance/return_distance/duration_meters/seconds`), `choiceReproduced` (D3), OSRM fora do
ar (D5), redação monetária por `trip.financials` (D10), escrita única com CHECK do banco (D4).
Referencia `freezeTripPlannedRoute`, `plan-route` endpoint, `POST /trips/:id/plan-route`, redação
em `route-geometry` (dois endponts), `readTripDetail`, `GET /nfe-documents` (listagem), detalhe da
viagem.

**apps/frontend-transportada/CLAUDE.md** — Seção nova "Um mapa só, MapLibre" (entre "Domínio de
viagem" e "CSP") documentando: MapLibre com chunk lazy, basemap vetorial, remoção do primitivo
`VectorMap`, componentes `AssemblyVectorMap` e `FreightRegionVectorMap`, aceite 4 (contrato
`legacy-map-removed.contract.ts`). Seletor de rota com switch **mais rápida ↔ mais barata** sem
nova ida ao OSRM (usa opções já em mãos), `onRouteChoiceChange`, abre na mais barata, aviso quando
opção única, trocar regrava via `plan-route`. Redação monetária: sem `trip.financials`, linha
monetária some (praças e rótulos sim, valores não).

**docs/ai-context/api-transportada.md** — Seção nova "Planejamento de viagem com rota escolhida e
redação monetária por permissão (spec 153)" documentando domínio de rota (`route-choice.policy.ts`:
quatro critérios, assinatura por `nodeIdsByLeg`, `selectRouteOption`, `choiceReproduced`);
distância e volta (`planned-road-distance.policy.ts`: `summarizeRoadDistance`, rota sem anotação =
`null`, `end_policy: 'last_stop'` = volta `0`); gateway com `exclude=toll` em paralelo,
deduplicação por assinatura, `isNoToll`; congelamento atômico (escrita única, CHECK do banco, D5
rota nula); redação monetária por permissão (`route-financial-redaction.service.ts`); fluxo de
atualização (D6: reordenar/vincular/desvincular recalculam com `cheapest` na mesma transação, T206:
fila de revisão para origem e destino).

**docs/ai-context/frontend-transportada.md** — Seção nova "Seletor de rota no mapa, um mapa só e
redação monetária do frontend (spec 153)" documentando: MapLibre + chunk lazy, basemap vectorial,
remoção de `VectorMap` e serviços órfãos (aceite 4), componentes `AssemblyVectorMap` e
`FreightRegionVectorMap`, lazy-load; seletor (props, abre na mais barata, switch instantâneo sem
OSRM, `choiceReproduced: false` = aviso, opção única = mensagem "Apenas esta rota", redação
monetária sem `canReadFinancials`); validação de campos novos em respostas de rota (opcionais quando
rota nula, campos monetários opcionais sem permissão).

### Nomes do código conferidos com grep

- `freezeTripPlannedRoute` ✓ (use-case exportado de `trips/application/freeze-trip-planned-route.use-case.ts`)
- `plan-route` endpoint ✓ (rota em `trips/presentation/trip.routes.ts` com `TRIP_PLAN_ROUTE_PATH`)
- `route-choice.policy.ts` ✓ (tipos `RouteChoice`, `selectRouteOption`, `ROUTE_CHOICE_CRITERIA`)
- `planned-road-distance.policy.ts` ✓ (função `summarizeRoadDistance`)
- `readRouteGeometry` ✓ (use-case em `trips/application/read-route-geometry.use-case.ts`)
- `route-financial-redaction.service.ts` ✓ (serviço `redactFinancials`)
- `readRouteGeometryTollFreeCandidates` ✓ (serviço em `trips/application/route-geometry-toll-free-candidates.service.ts`)
- `TripAssemblyMap.component.tsx` ✓ (componente em `modules/trip/components/`)
- `AssemblyVectorMap.component.tsx` ✓ (componente em `modules/trip/components/`)
- `FreightRegionVectorMap.component.tsx` ✓ (componente em `modules/fleet/components/`)
- Remoção de `VectorMap` ✓ (grep por `tripRouteMap.service`, `tripBasemap.service`, `tileMap.service`, `resolveRouteTraceSegments` retorna nada)
- Campo `plannedRoute` JSONB ✓ (schema em `database/trip.schema.ts`, tipo `FrozenPlannedRoute`)
- Colunas de métrica ✓ (`plannedDistanceMeters`, `plannedReturnDistanceMeters`, `plannedDurationSeconds`)

### Formato e estilo

Documentação respeita o estilo existente:

- `CLAUDE.md`: parágrafos curtos, bold para decisões-chave, ⚠️ para armadilhas, `code()` para nomes
  de função/arquivo, links "docs/ai-context § ..." para detalhes.
- `docs/ai-context/`: narrativa descritiva, explicação de fluxos, convenções, invariantes. Sem código
  de exemplo — é referência histórica, não tutorial.

### Verificação

```bash
$ bun run format:check   (raiz)
All matched files use Prettier code style!
```

Nenhuma mudança em código de produção. Atualização de markdown only.

### Correção pós-revisão

A primeira passada (modelo menor) inventou nomes e comportamentos que não existem no código. Revisão
linha a linha dos quatro arquivos contra `grep`/leitura direta; lista do que estava errado e do que
foi corrigido:

- **Basemap por `import.meta.glob('./maps/*.pbf')`** — não existe. O basemap é um único `.pmtiles`
  (`BASEMAP_URL`, padrão `/map-tiles/area.pmtiles`) servido por faixa de bytes via protocolo
  `pmtiles://`, registrado em `modules/shared/vectorBasemap.service.ts` (`addProtocol`, `setWorkerUrl`,
  import do CSS do MapLibre — tudo no escopo do módulo, não do componente). Corrigido nos dois
  CLAUDE.md e no ai-context do frontend.
- **Contrato `test/freight/freight-region-map.contract.ts`** — caminho errado; o arquivo real é
  `test/fleet/freight-region-map.contract.ts`. Corrigido nos dois lugares que citavam.
- **`flagSemPedágio`** — campo inventado; o nome real é `isNoToll` (`SelectableRouteOption.isNoToll`,
  `route-choice.policy.ts` e `RouteChoiceOptions.component.tsx`). Corrigido.
- **Assinatura da rota como hash MD5** — é sha256 (`createHash('sha256')`, 32 hex = 16 bytes),
  truncado, não MD5. Corrigido no ai-context da API.
- **`trailingLegs: RoadLeg[] | null`** — tipo errado; `summarizeRoadDistance` recebe
  `trailingLegs: number` (quantos trechos do fim de `legs` são a volta). Corrigido.
- **"Trocar é só visual, regravação só no clique de Aceitar/Usar esta" para todos os mapas** —
  contradizia a RF13. Confirmado no código: na montagem/proposta (`TripAssemblyMap`, T402–T404) é
  verdade — a viagem ainda não existe, `onRouteChoiceChange` só atualiza a tela e quem grava é o
  aceite. No **detalhe** de uma viagem já criada (`TripRouteChoiceSwitch`, T405) é falso: trocar
  chama `onSelect` → `workspace.planRouteMutation.mutate` **direto**, sem clique extra algum. O
  CLAUDE.md do frontend e o ai-context agora distinguem os dois casos.
- **Props inventadas em `TripAssemblyMap`** (`availableRouteOptions`, `canPlanRoute`) — não existem.
  O switch em si é `RouteChoiceOptions.component.tsx`, com props reais `canReadFinancials`,
  `cheapestIndex`, `costGap`, `fastestIndex`, `onSelect`, `options`, `selectedIndex`. Corrigido.
- **Texto "Apenas esta rota está disponível"** — não existe no locale. O texto real
  (`assemblyMap.routeOptions.singleOption`) é "Não há uma rota mais rápida e uma mais barata para
  trocar — só esta opção foi calculada." Corrigido.
- **Aviso "Rota recalculada" para `choiceReproduced: false`** — não existe. O aviso real
  (`routeMap.choiceNotReproduced`, em `TripRouteCostSummary.component.tsx`) diz "A estrada pode ter
  mudado desde que esta rota foi escolhida...". Corrigido, e a armadilha D3 da T405
  (`choiceReproduced !== false`, nunca `!choiceReproduced` — `undefined` não é `false`) foi
  acrescentada ao ai-context, que não a mencionava.
- **Contrato `test/trip/route-geometry-valuation.contract.ts`** — não existe. Os contratos reais são
  `test/trip/route-geometry-money-optional.contract.ts` (D2/D3/D10) e
  `test/trip/route-geometry-options-validation.contract.ts` (spec 096 T1). Corrigido.
- **Campos de resposta em `snake_case`** (`planned_distance_meters` etc.) como se fossem o contrato
  do frontend — o frontend lê camelCase (`distanceMeters`, `returnDistanceMeters`,
  `durationSeconds`, `frozen`, `criterion`, `signature`) em `routeGeometry.service.ts`; o
  `snake_case` é só nome de coluna do banco, do lado da API. Corrigido no ai-context do frontend.
- **`route-financial-redaction.service.ts` com `redactFinancials(view, hasPermission)`** — arquivo e
  função não existem. O real é `shared/monetary-redaction.service.ts`, função
  `redactRouteGeometryMoney({ canReadFinancials, view })`. Corrigido nos dois CLAUDE.md e no
  ai-context da API.
- **`planned_route_frozen_at` "compartilhado" com `planned_toll_frozen_at`** — falso. São colunas
  **separadas**, cada uma sob seu próprio CHECK (`trips_planned_route_check` e
  `trips_planned_toll_check`, ambas em `database/trip.schema.ts`), escritas na mesma `UPDATE` mas
  cada `null`/`now()` decidido pelo seu próprio dado (rota nula vs pedágio nulo). Corrigido nos dois
  CLAUDE.md e no ai-context da API.
- **"`freezeTripPlannedRoute` dentro da mesma transação que altera paradas"** — o erro mais sério:
  é o oposto. `reorder-trip-stops.use-case.ts`, `link-trip-documents-batch.use-case.ts` e
  `trip.use-case.ts` (`freezeRouteGracefully`) chamam o freezer **depois** da escrita principal ter
  commitado, com `try/catch` que nunca desfaz o vínculo/reordenação em caso de falha — o comentário
  no próprio código diz "o vínculo já está gravado; o pedágio congela no próximo replanejamento". A
  fila de revisão (`drizzle-trip-document-review.repository.ts`, `freezeRoutesGracefully`) segue o
  mesmo padrão, para as duas viagens em paralelo. Corrigido nos dois CLAUDE.md e no ai-context da
  API — era a afirmação mais capaz de levar alguém a confiar numa garantia atômica que o código não
  tem.
- **Quebra de code span pelo prettier** (`` `POST\n/trips/:id/plan-route` ``, já presente no CLAUDE.md
  da API) — reescrito para o span não atravessar a quebra de linha.

Nada nesta correção mexeu em código de produção — só nos quatro arquivos de documentação e neste
`evidence.md`. `bun run format:check` roda limpo depois da correção.

## T703 — H2: aceite por viagem usa o congelador tolerante, não `planTripRoute`

### Defeito (regressão do commit `2ea98a51`)

O aceite por viagem da sugestão de rota (`route-suggestion.use-case.ts` `accept`) chamava
`routePlanner.planRoute` — injetado em `main.ts` como `planTripRoute` (o mesmo caso de uso do
endpoint `POST /trips/:id/plan-route`). Dois problemas:

1. `planTripRoute` **lança** `TripStateTransitionNotAllowedError` quando a viagem não tem rota
   possível (`hasRoute` falso — nota viva sem parada com endereço, `checkTripTransition` em
   `trip-state.policy.ts`). O aceite, que antes só reordenava e concluía, passou a falhar inteiro.
2. `planTripRoute` promove a viagem de `draft` para `route_planned` como efeito colateral
   (`markRoutePlanned`), o que a D7 não pediu — D7 só fala em congelar a rota escolhida.

### Correção

Trocado `routePlanner.planRoute` pelo **congelador tolerante** já usado por reordenar/vincular/
desvincular (`freezeRouteGracefully` em `trip.use-case.ts`, injetado como `tripRouteTollFreezer` em
`main.ts`, mesma porta `PlanTripRouteTollFreezer`/`freezeTripPlannedRoute` da T201):

- `route-suggestion.use-case.ts`: renomeada a porta `TripRoutePlanner.planRoute` para
  `TripRouteFreezer.freeze` (mesma assinatura de `PlanTripRouteTollFreezer`). O `accept` chama o
  novo `freezeRouteGracefully` local — mesmo padrão de `trip.use-case.ts`: `try/catch` que nunca
  propaga a falha do congelamento, rodando **depois** da ordem já gravada.
- `main.ts`: a rota `routeSuggestions` passa a injetar `routeFreezer: tripRouteTollFreezer`
  diretamente — o mesmo congelador da T201, nunca um segundo caminho de escrita. O import de
  `planTripRoute` (não mais usado neste arquivo) foi removido.

Por que isso resolve os dois problemas: `freezeTripPlannedRoute` (a implementação real de
`tripRouteTollFreezer.freeze`) nunca lança para viagem sem parada — lê as coordenadas disponíveis
(mesmo que vazias), pede a geometria ao roteirizador e, sem estrada, grava `route: null` (D5); e
`freezeTripPlannedRoute` **não** transiciona status — ele só escreve `planned_route`/`planned_toll`.
E mesmo se o congelador falhasse por outro motivo, o `try/catch` do `accept` absorve, igual ao
`freezeRouteGracefully` do link/release.

### Contrato vermelho, antes da correção

`test/routing-application/route-suggestion.contract.ts`, suíte "accepting a route suggestion":
substituído o teste antigo `leaves the suggestion ready when freezing the route fails` (que
esperava o aceite ficar bloqueado — o comportamento errado que este defeito introduziu) por:

```
test('accepts and decides even when freezing the route fails (viagem sem parada com endereço)', ...)
```

Contra o código do `2ea98a51` (com `routePlanner.planRoute` lançando), este teste falhava: o erro
do congelamento derrubava o `accept` e `dependencies.decided` ficava vazio. Depois da correção, o
`accept` conclui com sucesso, `result.status === 'accepted'` e `dependencies.decided` tem 1 entrada.
O caminho feliz (`freezes the route through the T201 seam...` e `without a routeChoice...`)
continua verde, provando que a rota escolhida ainda é gravada.

### Gates

- `bun run typecheck` (raiz, todas as apps) — limpo.
- `bun run lint` (raiz) — 1 erro inicial (`planTripRoute` importado e não usado em `main.ts` depois
  da troca), corrigido removendo o import; limpo depois.
- `bun run format:check` (raiz) — limpo.
- `bun --env-file=../../.env.test test --timeout 120000` (de dentro de `apps/api-transportada`,
  integração com Postgres real) — **rodou** (banco de teste disponível):
  `6245 pass, 23 skip, 0 fail` em 177 arquivos, 21889 `expect()`. A suíte alvo isolada
  (`test/routing-application.contract.test.ts`, que importa `route-suggestion.contract.ts`):
  `73 pass, 0 fail`.

## T701 — C1: dinheiro opcional da NF-e no frontend (D10) — busca, bipe e faixa ✅ 2026-09-17

### Defeito (achado CRITICAL da revisão final)

T301 fez a API cortar `totalAmount`/`freightAmount` de `/nfe-documents` quando o usuário não tem
`trip.financials` (D10: a **chave** some do corpo, nunca `null`, nunca zero —
`redactNfeDocumentMoney` em `apps/api-transportada/src/shared/monetary-redaction.service.ts`). O
frontend continuava exigindo as duas sempre presentes em três guardas independentes, e quebrava:

- `nfeWorkspaceClient.service.ts`: `isNfeDocumentListItem` exigia `isString(value.totalAmount)` e
  `isNullableString(value.freightAmount)` — os dois reprovam `undefined` (chave ausente) —, então
  `mapDocumentListPage` lançava `NFE_WORKSPACE_RESPONSE_INVALID` e **a listagem inteira** parava de
  carregar para quem não tem a permissão.
- `tripResponse.validation.ts`: `isScannedDocument` exigia `isString(value.totalAmount)`, usado por
  `scannedNfeDocumentFromApi` (o **bipe por chave de acesso**, ADR-0043 §3) e por
  `tripCandidateDocumentPageFromApi` (a **busca por faixa** de numeração da tela de notas da
  viagem). O bipe lançava `TRIP_RESPONSE_INVALID`; a busca por faixa **descartava a linha em
  silêncio** (o `flatMap` de `isScannedDocument` some com a nota sem avisar).
- `TripDocumentSearch.component.tsx` chamava `formatAmount(document.totalAmount)` sem guarda —
  mesmo corrigidos os validadores, a célula formatava `undefined` e explodia em runtime.

Os três papéis afetados: `fiscal`, `viewer` e `separator` — é o separador quem bipa a nota sem ver
o valor (ADR-0043 §3).

### Correção

**Dois formatos de ausência coexistem**, e cada consumidor precisa do seu:

1. `nfeWorkspaceClient.service.ts` devolve o array **cru** da API sem reconstruir objetos
   (`mapDocumentListPage` faz `items: data` direto) — a ausência aqui é literalmente `undefined`
   (chave que não existe no JSON). `NfeDocumentListItem.totalAmount` virou `totalAmount?: string` e
   `freightAmount?: null | string`; o guard usa os novos `isOptionalString`/
   `isOptionalNullableString` (mesmo padrão que `isOptionalNullableString` já cunhado em
   `tripResponse.validation.ts` pelo T401 para `route-geometry`, D10).
2. `tripResponse.validation.ts` **reconstrói** cada campo via `readNullableColumn` (que já
   normaliza ausente/`null`/não-string para `null`) — então `totalAmount` no `ScannedNfeDocument`
   virou `null | string` (igual a `freightAmount`, que já era assim) e as duas ocorrências de
   `totalAmount: row.totalAmount` passaram a `totalAmount: readNullableColumn(row, 'totalAmount')`.
   `isScannedDocument` passou a aceitar `isOptionalString(value.totalAmount)` (helper local já
   existente no arquivo, cunhado pelo T401).
3. `ScannedNfeDocument.totalAmount`/`freightAmount` **também** viraram opcionais (`?:`), não só
   anuláveis — achado ao rodar `tsc`: `TripDocumentSearch.component.tsx` e
   `useTripRouteAssembly.hook.ts` reusam a linha crua de `NfeDocumentListItem` como
   `ScannedNfeDocument`/`TripCandidateDocument` por **compatibilidade estrutural** (nenhum adaptador
   os separa nesses dois pontos — é a mesma busca da listagem de notas, reaproveitada na tela da
   viagem). Propriedade opcional na origem não satisfaz propriedade obrigatória no destino mesmo com
   o mesmo tipo de valor, então sem esse ajuste o `tsc` reprovava as duas telas.
4. `TripDocumentSearch.component.tsx`: a célula do total passou a checar
   `document.totalAmount === null || document.totalAmount === undefined` antes de formatar (a
   mesma linha já tratava `freightAmount` assim, ajustada para cobrir `undefined` também — a origem
   real aqui é `NfeDocumentListItem`, que produz `undefined`, não `null`).
5. `NfeDocumentTable.component.tsx` (coluna "amount" da listagem principal) e
   `useNfeDocumentTable.hook.ts` (`matchesAmount`, o haystack da busca livre) ajustados para aceitar
   `totalAmount: string | undefined` sem quebrar filtro, busca ou ordenação — `Number(undefined)` já
   é `NaN`, que os dois já tratavam como "não bate".
6. `assemblyMapNote.service.ts` normaliza a ausência de volta para `null` ao montar `AssemblyMapNote`
   (`document.totalAmount ?? null`) — esse tipo já era `null | string` e seus consumidores
   (`TripAssemblyMap.component.tsx`, `assemblyNoteFigures.service.ts`) já tratavam `null` como
   "sem valor"; nenhum dos dois precisou mudar.

### Consumidores conferidos e não tocados (fora do escopo de D10 para NF-e)

Busca por `totalAmount`/`freightAmount` em todo `apps/frontend-transportada/src/modules` e
confirmação, um a um, de que os demais usos são **outro** campo homônimo, de outro domínio, não
coberto pela redação de `/nfe-documents`:

- `mdfeManifestCteSource.service.ts` / `MdfeManifestCreationPanel.component.tsx` — `totalAmount` do
  CT-e (`CteBatchItem`), não da NF-e.
- `cteEmission.service.ts` / `CteEmissionDialog.component.tsx` / `cteEmissionQueue.service.ts` —
  `totalAmount` é a soma calculada da prévia de emissão de CT-e (`CteBatchPreview`), campo próprio,
  não vem de `/nfe-documents`.
- `NfeDocumentFilterPanel.component.tsx` — só o rótulo estático do campo de filtro
  (`documents.fields.totalAmount`), não lê valor de documento.
- `TripAssemblyMap.component.tsx`, `assemblyNoteFigures.service.ts` — consomem `AssemblyMapNote`
  (já `null | string`, ver item 6 acima), não `ScannedNfeDocument` diretamente.
- `tripResponse.validation.ts` `isDocument`/`TripDocument.nfeTotalValue` (detalhe da viagem) — já
  opcional (`nfeTotalValue?: null | string`), tratado por T301/T401; não fazia parte deste achado.

### Contrato vermelho, antes da correção

- `apps/frontend-transportada/test/nfe-workspace/document-money-optional.contract.ts` (novo,
  registrado em `test/nfe-workspace.contract.test.ts`): contra o código de antes de T701, o teste
  "payload sem totalAmount e freightAmount passa na validação da listagem" falhava —
  `client.listDocuments` rejeitava com `NFE_WORKSPACE_RESPONSE_INVALID`.
- `apps/frontend-transportada/test/trip/nfe-document-money-optional.contract.ts` (novo, registrado
  em `test/trip.contract.test.ts`): contra o código de antes, "o bipe por chave de acesso não lança"
  falhava com `TRIP_RESPONSE_INVALID`, e "a busca por faixa mantém a linha sem dinheiro" falhava
  porque `page.items` vinha vazio (a linha era descartada em silêncio pelo `flatMap`).
- `apps/frontend-transportada/test/trip/document-search-columns.contract.ts` (existente, ajustado):
  as asserções de string exata sobre `formatAmount(document.totalAmount)` sem guarda,
  `freightAmount: null | string` (sem `?`) e `isNullableString(value.freightAmount)` refletiam o
  código antigo — atualizadas para o código corrigido, mais dois testes novos cobrindo a ausência.

Depois da correção, as quatro suítes ficam verdes (ver Gates).

### Gates

- `bun run typecheck` (raiz, 6 apps) — limpo.
- `bun run lint` (raiz, 6 apps) — limpo.
- `bun run format:check` (raiz) — limpo (1 arquivo novo precisou de `prettier --write` antes).
- `bun run test` em `apps/frontend-transportada` — `4204 pass, 0 fail`, `36241 expect()` em 29
  arquivos (inclui as duas suítes novas e a suíte ajustada).
- `bun run build` em `apps/frontend-transportada` — build de produção concluído sem erro.

### Commit

`<hash desta mesma alteração — ver `git log`>`
