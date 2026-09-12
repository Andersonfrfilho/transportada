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

_(preencher após T5)_

## 3. G006 — caixas colocadas antes/depois nas viagens reais (T6)

| viagem | antes | depois |
| ------ | ----- | ------ |

## 4. Lista do que falta medir (T7, T8)

## 5. Gate (T10)
