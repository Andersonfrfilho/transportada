# Evidência — spec 177

## Conclusão

**Nenhuma mudança de código foi necessária.** Investigação na base (branch derivada de
`origin/staging`, sem alterações locais fora de `specs/177-*`) mostra que os requisitos RF1–RF9
já estão implementados, por especificações anteriores (061, 090, 101, 110, 124, 143, 153, 165), e
cobertos por teste. Detalhe abaixo, arquivo por arquivo, e os gates rodados para confirmar.

## Onde a conta já lê o custo da rota

- `apps/api-transportada/src/trips/infrastructure/trip-valuation.query.ts` (`readContext`, linha
  ~196): lê `trips.plannedDistanceMeters` e `trips.plannedToll` — o roteiro **congelado no
  planejamento** (spec 153 RF5), o mesmo que `readTripRouteGeometry` devolve para o mapa da mesma
  tela. Não há segunda chamada ao roteirizador.
- `apps/api-transportada/src/trips/application/read-trip-valuation.use-case.ts`
  (`resolveFuelParcel`, `resolveOtherPerKilometer`, `resolveTollParcel`, linhas 580–740): com
  `distanceMeters` presente, combustível e "outros por km" saem como `estimated` via `fuelCost` /
  `costOverDistance` (`trip-valuation.policy.ts`); pedágio usa o lançamento manual quando existe
  (`measured`) e, na ausência dele, o `context.toll` congelado (`estimated`), nunca soma os dois
  (RF1, RF3, RF7).
- `apps/frontend-transportada/src/modules/trip-financials/components/ValuationLedger.component.tsx`
  (linha 93): renderiza `t('gap.' + line.gap)` — o texto que a tela mostra já é o vocabulário de
  `VALUATION_GAPS`, não um texto fixo por parcela.

## RF2 — vocabulário `measured`/`estimated`

`trip-valuation.policy.ts:26` declara `VALUATION_SOURCES = ['measured', 'estimated', 'missing',
'period']`, e é isso que toda parcela e toda linha de receita carrega em `source`. Nenhum
vocabulário paralelo foi criado.

## RF4 — "roteiro ainda não calculado" só sem roteiro

`resolveFuelParcel`/`resolveOtherPerKilometer` só usam `VALUATION_GAPS.noPlannedDistance` quando
`distanceMeters === null` (linha 645/714). Com distância presente e falta consumo, preço ou
lançamento, os gaps são outros: `NO_FUEL_CONSUMPTION`, `NO_FUEL_PRICE`, `NO_FUEL_BASELINE`,
`NOT_RECORDED` — nunca a mesma frase da ausência de roteiro. Confirmado por
`test/integration/trip-financial-end-to-end.integration.ts` (bloco "sem roteiro planejado,
combustível e outros-por-quilômetro são lacuna, nunca zero").

## RF5 — pedágio sem catálogo não vira "ninguém lançou"

`resolveTollParcel` (linha 580): lançamento manual sempre vence; sem ele, cai no `context.toll`
congelado. Quando o roteiro foi calculado e há praças sem tarifa conhecida no trajeto, a parcela
sai `TOLL_PARTIAL` (`boothsWithoutCharge > 0`, linha 613) — nunca `NOT_RECORDED`. Só cai em
`NOT_RECORDED` quando não há lançamento **e** não há projeção nenhuma (rota nunca calculada, ou
projeção de sugestão multi-veículo ausente — que tem gap próprio, `TOLL_NOT_AVAILABLE_IN_SUGGESTION`).

## RF6 — total previsto marcado

`buildTripValuation` (`trip-valuation.policy.ts:311`) calcula `hasGaps` a partir de qualquer
parcela ou linha de receita com `gap !== null` (exceto os avisos de `ADVISORY_GAPS`).
`ValuationLedger.component.tsx:69` imprime `ledger.incomplete` só a partir de `hasGaps`, sem
condição adicional — comentário no próprio arquivo alerta contra acrescentar uma.

## RF8 — campo ausente não vira zero

`TripValuationContext` declara todos os campos de custo como opcionais/`null | string`
(`toll?`, `tollTotal?`, `manualCostTotal?`, `deliveryChargesTotal?`), e `resolveRecordedParcel`
(linha 628) só produz `amount: ZERO` **com a lacuna marcada** (`source: 'missing'`) quando o valor
é `null` — nunca zero sem marca.

## Gates rodados

```
cd apps/api-transportada
bun --env-file=../../.env.test test test/trip-valuation.contract.test.ts test/trip-financial-result.contract.test.ts --timeout 120000
# 156 pass, 0 fail, 714 expect() calls

cd apps/frontend-transportada
bun test ./test/trip-financials.contract.test.ts ./test/suggestion-valuation.contract.test.ts test/trip.contract.test.ts
# 1626 pass, 0 fail, 19245 expect() calls
```

Nenhum arquivo de produção foi alterado; nenhum commit foi criado nesta sessão.

## Pendente

- **CA07** (revisão de design com print, 375px e desktop) não foi executada: não há mudança visual
  para revisar, porque a tela já produz os textos e marcas que a spec pede. Se o usuário observou
  o defeito descrito no problema numa instância real do produto, vale conferir se aquele ambiente
  está rodando uma versão anterior às specs 153/165 — o código desta branch (derivada de
  `origin/staging`) já não reproduz o sintoma.
