# Spec 144 — Evidência

Base: `work/cargo-missing-box` = `origin/staging` + `da30f9a0` + `1ca4b17a`, worktree
`../transportada-wt/cargo-missing-box`. Pré-existente em `staging`: "o Atego de 1417 caixas cabe no
orçamento de 50 ms" falha em ~235–240 ms, medido no checkout intocado.

## 1. Contrato do resíduo (T1 → T2)

**Vermelho** (`65415486`, só o contrato):

```
error: Export named 'resolveDocumentCargoEstimate' not found in module
  '.../src/nfe-documents/domain/cargo-volume.policy.ts'
 0 pass · 1 fail (o arquivo não carrega)
```

**Parecer do `architect` (opus) sobre a D2**, incorporado antes de implementar:

- Retorno **nunca `null`**: `volumeM3`/`source` viram `null` juntos ("nota sem cubagem", o mesmo
  sinal que o par `resolveMeasuredCargoVolume`/`resolveCargoVolume` dava), mas `unmeasuredBoxCount`
  e `estimateSource` existem sempre — a D4 precisa deles justamente quando não há volume.
- `total` reusa `resolveCargoVolume` (bit a bit igual a hoje para nota sem ficha nenhuma);
  `volumeM3` no caminho do resíduo é o **total exato**, nunca Σ das caixas arredondadas.
- Caixa presumida **única por nota** (`divideHalfUp(resíduo, restantes)`); deriva máxima
  `restantes × 0,5 µm³`, ordens de grandeza abaixo do mm do `resolveFallbackBox` e da célula de 5 cm.
- Guarda: caixa que arredonda para `0n` cai na mediana (senão o empacotador desenha caixa degenerada).
- Divisor arredonda para cima a quantidade fracionária sem ficha (`Math.ceil` local);
  `countMeasuredBoxes` fica intocado, porque mudá-lo alteraria o medido das notas com ficha (D6).
- Sem total: a mediana dá tamanho às caixas mas **não** cubagem à nota — a nota continua "sem
  volume", como hoje. Não inventar m³ de nota a partir da mediana.
- Medido acima do total sem mediana: a nota vale o **medido** (hoje saía o total, menor que o
  medido). Caso inalcançável na prática — linha medida implica mediana da empresa — mas é a única
  mudança deliberada de número, e vai na direção "ocupação menor que a real é o que faz alguém
  continuar carregando".
- Deviação consciente do parecer: nota **sem linha nenhuma** com `qVol` continua valendo o total
  por espécie (`estimated`), como hoje; o architect sugeria `null`, o que mudaria o volume de uma
  nota que a spec não cobre.
- Risco a verificar em T4: nota com linha medida + `total` + **sem** mediana sai `partial` em vez
  de `estimated`, e `estimated` vence `partial` na severidade da viagem.

**Verde** (T2, 15 casos — os 9 originais mais os 6 do parecer):

```
bun test ./test/cargo-volume/document-box-estimate.contract.ts
 15 pass · 0 fail · 17 expect() calls

bun run typecheck → sem erros
bun test ./test/cargo-volume.contract.test.ts
 321 pass · 1 fail  (pré-existente: "o Atego de 1417 caixas cabe no orçamento de 50 ms", ~135–185 ms)
bunx prettier --check → All matched files use Prettier code style!
```

## 2. Conservação e m³ fechando com a fatia (T3 → T5)

### T3 — vermelho

Novo teste em `test/cargo-volume/cargo-layout-conservation.contract.ts`: `'nota sem ficha e com
qVol desenha as caixas presumidas pelo resíduo, fechando com a fatia'` (G002). Caixa da parada sem
ficha carrega `estimatedVolumeM3: 0.05` (10 caixas, resíduo de 0.500000 m³ no total).

```
bun run typecheck
test/cargo-volume/cargo-layout-conservation.contract.ts(117,43): error TS2353: Object literal may
only specify known properties, and 'estimatedVolumeM3' does not exist in type 'CargoPlanBox'.

bun test ./test/cargo-volume.contract.test.ts
(fail) a planta conserva as caixas da viagem > nota sem ficha e com qVol desenha as caixas
presumidas pelo resíduo, fechando com a fatia
  expect(Math.abs(drawnVolumeM3 - 0.5)).toBeLessThanOrEqual(10 * 1e-4)
  Expected: <= 0.001
  Received: 0.14000000000000007
 321 pass · 2 fail
```

Vermelho por dois motivos, como esperado: `CargoPlanBox` ainda não tem `estimatedVolumeM3` (typecheck
falha) e, em runtime, `toPlacementBoxes` ignora o campo (não existe ainda) e usa a caixa da mediana da
empresa para todo box sem medida — por isso o m³ desenhado (0.14, 10 × 0.036 do módulo padrão da
empresa) não fecha com o resíduo da nota (0.5). A segunda falha (`o Atego de 1417 caixas cabe no
orçamento de 50 ms`) é pré-existente, já registrada na seção 1.

### T4 — grade intermediária

`CargoPlanBox` ganhou `estimatedVolumeM3`/`productCode`; `loadMeasuredItems` agora seleciona
`nfeProducts.code` e carimba `productCode` só na caixa sem ficha; `loadTripOccupancy` trocou o par
`resolveMeasuredCargoVolume` + `resolveCargoVolume` por uma chamada a `resolveDocumentCargoEstimate`
por nota, e carimba `estimatedVolumeM3` nas caixas sem ficha (`stampEstimatedVolume`) sempre que
`estimateSource === 'note'` — o mesmo `boxesByDocument` alimenta a prévia e o detalhe da viagem, sem
código repetido entre os dois caminhos.

```
bun run typecheck → sem erros
bun test ./test/cargo-volume.contract.test.ts
 321 pass · 2 fail
   - T3 (G002) ainda vermelho na asserção de m³ (esperado — toPlacementBoxes só muda em T5)
   - "o Atego de 1417 caixas cabe no orçamento de 50 ms" — pré-existente
```

⚠️ **Risco sinalizado pelo arquiteto, conferido**: nota com uma linha medida + `qVol` + **sem**
mediana da empresa podia trocar de `estimated` para `partial`. Confirmado por leitura do código:
acontece quando o resíduo é positivo (`resolveDocumentCargoEstimate` retorna `source: 'partial'`
porque `hasMeasured` é verdadeiro, contra o par antigo que descartava a medida parcial sem mediana e
caía no total por espécie, `estimated`). Busquei por `'estimated'`/`'partial'`/`medianBoxVolumeM3` em
todo `test/integration/*.integration.ts` que toca `loadTripOccupancy` (via `drizzle-trip.repository`
ou `trip-cargo-preview.query`) e em `trip-occupancy.contract.ts`/`cargo-preview.contract.ts` (que só
exercitam `resolveTripOccupancy`/`previewTripCargo` com dados forjados, nunca `loadTripOccupancy`
de verdade) — **nenhum teste do repositório afirma o resultado antigo `estimated` nesse cenário
exato**. Nenhum teste alterado; a troca `partial` é a decisão da spec 144 (D2), não um efeito colateral
disfarçado.

### T5 — verde

`toPlacementBoxes` (`cargo-layout.policy.ts`) passou a resolver a forma por caixa, na precedência
D1: medida usa a própria dimensão; sem ficha com `estimatedVolumeM3` chama `resolveFallbackBox` com
o m³ da própria caixa (o resíduo da nota); sem ficha e sem `estimatedVolumeM3` cai na caixa da
mediana da empresa, como antes; sem nenhum dos dois, sem fallback (`notMeasured`). Três casos novos
em G003 (`cargo-layout.contract.ts`): medida ignora o resíduo e a mediana; sem ficha com resíduo usa
o resíduo (não a mediana); sem ficha e sem resíduo usa a mediana.

```
bun run typecheck → sem erros
bun test ./test/cargo-volume.contract.test.ts
 325 pass · 1 fail  (pré-existente: "o Atego de 1417 caixas cabe no orçamento de 50 ms", ~55–200 ms)
```

T3 (G002) fechou verde nesta rodada — o m³ desenhado na parada sem ficha passou a fechar com o
resíduo da nota, não mais com a mediana da empresa.

## 3. G006 — caixas colocadas antes/depois nas viagens reais (T6)

Rodei um script descartável (fora do repo) que monta `CargoLayoutStop`/`CargoPlanBox` a partir das
duas cargas reais de `test/fixtures/real-mixed-cargo.fixture.ts` (`ACCELO_24_STOPS`,
`ATEGO_85_STOPS` — as mesmas que `test/cargo-placement/real-mixed-cargo.contract.ts` usa, spec 115)
e chama `resolveCargoLayout` (`src/trips/domain/cargo-layout.policy.ts`), o mesmo caminho que
`loadTripOccupancy` usa em produção. Caixa com `medida = 1` entra com as três dimensões (medida);
caixa com `medida = 0` entra **sem** dimensão nenhuma (`heightMm`/`lengthMm`/`widthMm: null`) e
**sem** `estimatedVolumeM3` — a fixture não carrega nota nem resíduo, só a dimensão que a busca por
etiqueta mediu ou presumiu por fita —, então toda caixa sem ficha cai na mediana da empresa
(`fallbackBoxVolumeM3` = 0,371 × 0,261 × 0,21 m³, a mesma caixa presumida que a spec 115 documenta),
nunca no ramo novo de D1. Comparei **antes** (`8a611288`, fim da Fase 1, antes de T4/T5 — ainda sem
`estimatedVolumeM3`/`productCode` em `CargoPlanBox`) contra **depois** (HEAD `09f97166`), num
worktree `git worktree add` detached em `8a611288`, `node_modules` por symlink (sem instalar nada),
removido ao final (`git worktree remove --force` + `git worktree prune`).

| fixture             | total caixas | colocadas | unplaced | sem 3 dimensões | m³ desenhado | antes = depois |
| ------------------- | ------------ | --------- | -------- | --------------- | ------------ | -------------- |
| Accelo (24 paradas) | 500          | 500       | 0        | 489             | 10.1766      | sim            |
| Atego (85 paradas)  | 1417         | 1417      | 0        | 1384            | 28.7631      | sim            |

Os cinco números (total, colocadas, unplaced, sem-3-dimensões, m³ desenhado) saíram **idênticos**
byte a byte nas duas rodadas, para as duas cargas — como a D6 promete. A razão é a que T5 deixou
escrita em `toPlacementBoxes`: o ramo do resíduo da nota só dispara quando `box.estimatedVolumeM3`
não é `null`, e nenhuma caixa desta fixture carrega esse campo (ela não tem nota nem resíduo,
só dimensão medida ou ausente) — então as duas versões do código executam exatamente o mesmo
`companyFallback` para toda caixa sem ficha, e a única diferença possível entre os commits (a
precedência nova de D1) nunca chega a ser lida.

⚠️ Os números de "colocadas"/`unplaced` aqui **não replicam** as asserções de
`real-mixed-cargo.contract.ts` (que espera até 232 caixas de fora no Atego): esse contrato chama
`resolveCargoPlacement` direto, com as dimensões já resolvidas na própria fixture. Aqui a entrada
passa por `resolveCargoLayout`, que decide o arranjo (`resolveStopArrangement`) a partir do
`payloadRatio` e monta a mediana da empresa a partir de um `measuredShapes` diferente (só as caixas
com `medida = 1`) — outra decisão de arranjo, outro empacotamento. Não é o alvo de G006: o alvo é a
igualdade **entre os dois commits sob a mesma entrada**, que se confirmou.

Rodei também os contratos de placement direto (evidência independente, mesma fixture, sem passar
por `resolveCargoLayout`), nos dois commits:

```
# HEAD 09f97166 — bun test ./test/cargo-volume.contract.test.ts
 326 pass · 0 fail · 19609 expect() calls

# 8a611288 — bun test ./test/cargo-placement/real-mixed-cargo.contract.ts
 6 pass · 1 fail · 56 expect() calls
 (fail) "o Atego de 1417 caixas cabe no orçamento de 50 ms" — 235.70ms, pré-existente e intermitente
 (as 6 asserções de propriedade e contagem de caixas — inclusive as que fixam ≥1185 colocadas e
 ≤14 paradas fora — passaram sem mudança)
```

Nenhuma asserção de posição, contagem ou propriedade mudou de resultado entre os dois commits — o
único fail é o de desempenho já registrado na seção 1, intermitente nos dois lados.

## 4. Lista do que falta medir (T7, T8)

### Contrato vermelho (T7, antes do código)

`bun test ./test/cargo-volume/cargo-layout.contract.ts ./test/cargo-volume/cargo-preview.contract.ts`
— 3 falhas esperadas (`pendingMeasurements` ainda não existe):

```
(fail) pendingMeasurements — a lista do que falta medir (spec 144 D4) > a mesma nota e produto em paradas diferentes viram linhas separadas, ordenadas por caixas
  Expected: [{...6 caixas Barrinha...}, {...3 caixas Campinas mediana...}, {...2 caixas Campinas nota...}]
  Received: undefined

(fail) pendingMeasurements — a lista do que falta medir (spec 144 D4) > viagem toda medida devolve lista vazia
  Expected: []
  Received: undefined

(fail) a prévia carimba a nota nas caixas pendentes de medição (spec 144 D4) > pendingMeasurements sai com o documentNumber da nota
  Expected: [{ boxCount: 5, documentNumber: '12345', estimateSource: 'note', label: 'Caneta', productCode: 'P1', sequence: 1, stopLabel: 'A' }]
  Received: undefined

25 pass / 3 fail, 41 expect() calls, 28 testes.
```

### T7 — verde

- `bunx tsc --noEmit` — sem erro.
- `bun test ./test/cargo-volume.contract.test.ts` — 329 pass / 0 fail, 19612 expect() calls.
- `bun test ./test/trip-application.contract.test.ts` — 60 pass / 0 fail.
- `bun test ./test/cargo-volume.contract.test.ts ./test/trip-application.contract.test.ts
./test/trip-infrastructure.contract.test.ts ./test/trip-http.contract.test.ts
./test/trips.contract.test.ts` — 498 pass / 0 fail, 20010 expect() calls (nem o flake de 50 ms do
  Atego apareceu nesta rodada).

`estimateSource` carimbado em `CargoPlanBox` por `stampEstimatedVolume` (agora para `note`,
`median` e `none`, não só `note`); `pendingMeasurements` montado em `resolveCargoLayout` por
`collectPendingMeasurements`, agrupando por (`sequence`, `documentNumber`, `productCode`).
`documentNumber` já era carimbado nos dois caminhos (repositório e prévia) via `stampCargoNote` —
nada a mudar ali.

### Contrato vermelho (T8, antes do código)

`bun test ./test/trip.contract.test.ts` — 6 falhas esperadas em
`test/trip/pending-measurements.contract.ts` (tipo, validação, painel, componente e locales ainda
não existem) mais 1 falha em `test/trip/table-and-form.contract.ts`
(`navigateToPackageBoxQueue` ainda não existe):

```
704 pass
6 fail
17166 expect() calls
Ran 710 tests across 1 file.
```

### T8 — verde

- `bunx tsc --noEmit` (frontend) — sem erro.
- `bunx eslint` nos arquivos tocados — sem erro.
- `bun test ./test/trip.contract.test.ts` — 710 pass / 0 fail, 17176 expect() calls, sem
  regressão nos 704 testes que já existiam.
- `bunx prettier --write` nos arquivos tocados — todos já formatados (unchanged).

Implementado: `TripPendingMeasurement` e o campo opcional `pendingMeasurements` em
`TripCargoLayout` (`trip.types.ts`); guarda `isPendingMeasurement` + `CARGO_ESTIMATE_SOURCES`
plugada em `isCargoLayout`, tolerante à ausência do campo — API antiga não quebra
(`tripResponse.validation.ts`); `navigateToPackageBoxQueue` cai em `${NFE_WORKSPACE_ROUTE}?tab=boxes`
(`tripNavigation.service.ts`); novo componente `TripPendingMeasurements.component.tsx` — tabela
reaproveitando `.dataTable`/`.tableScroll` (mesma convenção de `TripOccurrenceTable`) e um botão
"ir para a fila" que chama `createBrowserWorkspaceNavigator()` inline (mesmo padrão de
`TripDetail`, sem furar o teto de 5 props de `TripCargoPanel`); renderizado em
`TripCargoPanel.component.tsx` junto da dica de `documentsWithoutVolume`; chaves
`pendingMeasurement.*` em `trip.locale.json`/`trip.en.locale.json`, em ordem alfabética entre
`occurrenceFeed` e `pagination`.

## 5. Gate (T10)

### `make check`

`rtk proxy make check` — `format:check` e `lint` verdes; `typecheck` verde nas seis apps;
`test` fecha com **5068 pass, 23 skip, 1 fail** em 5092 testes (163 arquivos, 29,55 s). A única
falha é a pré-existente: `test/cargo-placement/real-mixed-cargo.contract.ts:224`, "o Atego de 1417
caixas cabe no orçamento de 50 ms", recebido 74,58 ms. `build` não chega a rodar dentro do `make
check` porque o `test` sai com código 1 antes — rodado à parte (abaixo) para fechar a evidência.

Repeti só o contrato do Atego mais duas vezes, isolado (`bun test
./test/cargo-volume.contract.test.ts` em `apps/api-transportada`), para separar ruído de máquina de
regressão real: 328 pass / 1 fail nas três rodadas, sempre a mesma linha, com 56,30 ms e 63,29 ms —
dentro da faixa 55–240 ms já registrada como pré-existente em `staging` no cabeçalho deste arquivo.
Não é da spec 144: nenhuma das mudanças de T1–T9 toca o cronômetro ou o volume do Atego, e o mesmo
teste já falhava no checkout intocado. Registrado, não mascarado.

### `bun run build` (isolado, raiz)

Verde nas seis apps (`api-transportada`, `worker-transportada`, `cron-transportada`,
`frontend-transportada`, `frontend-client`, `frontend-landing`) — só o aviso de sempre do Vite sobre
chunk grande em `frontend-transportada` (`vectorBasemap.service`, 997.95 kB), anterior a esta spec.

### `apps/api-transportada`

- `bun run typecheck` → verde, sem saída de erro.
- `bun test ./test/cargo-volume.contract.test.ts` → **328 pass, 1 fail** (o Atego, pré-existente,
  ver acima), 19612 `expect()`.

### `apps/frontend-transportada`

- `bun run typecheck` → verde, sem saída de erro.
- `bun test ./test/trip.contract.test.ts` → **710 pass, 0 fail**, 17176 `expect()`.

### Commits da spec (`git log --oneline f5663a88^..HEAD`)

```
c70dc068 docs(cargo): spec 144 — precedência D1 e caixa presumida pela nota (T9)
5cfb5dc8 feat(frontend): painel de carga lista o que falta medir (spec 144 T8)
3677d760 feat(trips): a viagem lista o que falta medir (spec 144 T7)
e800ecca docs(spec): 144 T6 — G006, caixas colocadas antes e depois da D1
09f97166 feat(trips): toPlacementBoxes respeita a precedência D1 (spec 144 T5)
2fa8cabc feat(trips): loadTripOccupancy passa a resolver o resíduo por nota (spec 144 T4)
8a0c28e3 test(trips): estende conservação de caixas com nota sem ficha e qVol (spec 144 T3)
8a611288 feat(nfe-documents): a caixa sem ficha sai do resíduo da nota (spec 144 T2)
65415486 test(nfe-documents): contrato da caixa presumida pelo resíduo da nota (spec 144 T1)
f5663a88 docs(spec): 144 — caixa presumida pelo resíduo da nota e lista do que falta medir
```

### G007 — veredito

Verde para os critérios da spec 144: nenhuma falha nova, format/lint/typecheck limpos nas seis apps,
build limpo. A única linha vermelha (`test/cargo-placement/real-mixed-cargo.contract.ts`, Atego 50 ms)
é a mesma falha intermitente já documentada como pré-existente em `staging` no topo deste arquivo, e
não conta contra esta spec.
