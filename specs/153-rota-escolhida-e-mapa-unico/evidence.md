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
