# Evidência — Spec 259

## T1.1 — parecer do architect (opus), 2026-10-09

- Consultas por viagem hoje: `readContext` até 17; `loadTripOccupancy` até 7 (a última varre as caixas medidas da
  empresa inteira); `loadTripCargoWeight` 2. Página de 20 ingênua: ~340 de custo + ~180 de ocupação.
- Decisão: lote verdadeiro. Ocupação ~7 consultas por página; custo ~17 por página (dados da empresa uma vez).
  Reuso por viagem com concorrência rejeitado (varredura da empresa 20 vezes, disputa pelo pool).
- Não entra em lote: rota ao vivo do rascunho (`applyDraftTripLiveRoute`, OSRM). Lista marca lacuna.
- Riscos: paridade (usar viagem com rota congelada no teste), critério de notas da ocupação igual ao do detalhe
  (`trip_documents.nfe_document_id`, sem filtrar liberadas), custo calculado sem `trip.financials` (pular via
  `includeFinancials`), tempo da página de 20 (medir na T2.4).

## T3.1 — tipos e parser tolerante do painel, 2026-10-09

- `TripAmounts` ganha `costTotal`, `marginTotal`, `marginPercentage`, `hasGaps` (opcionais); `Trip.occupancySummary` recebe o `occupancy` do item (renomeado: o detalhe usa o mesmo nome com outra forma). `readTripListOccupancy` tolera ausência e lixo (ocupação malformada vira ausente, a lista segue); `amounts` com tipo errado ou chave desconhecida continua recusando.
- Contrato `test/trip/trip-list-parser.contract.ts` (resposta antiga e nova). `bun test ./test/trip.contract.test.ts`: 2814 pass, 0 fail (antes do commit); `bun run typecheck` limpo; eslint e prettier limpos nos arquivos tocados.

## T1.2 — teste de paridade lista × detalhe (falhando), 2026-10-09

- `apps/api-transportada/test/integration/trip-list-occupancy-financials.integration.ts` (novo, na lista `test:integration`):
  3 viagens com rota congelada (capacidade e peso conhecidos; `tractor_unit` sem carreta; sem veículo), lista montada com o
  `createTripUseCase` real contra Postgres, conferida contra `findById` (ocupação/peso) e `readTripValuation` (custo/margem).
- `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-list-occupancy-financials.integration.ts` →
  1 pass (o cenário prova algo: razão de peso e volume não nulas, `capacityUnknownReason` presente, custo > 0) e 1 fail
  pelo motivo certo: `item.occupancy` é `undefined` (esperado `{ volume, weight, capacityUnknownReason }` do detalhe).
- `bun run typecheck` → limpo. prettier + eslint do arquivo limpos.

## T3.2 — TripOccupancyBars, TripResultCell e colunas, 2026-10-09

- Colunas `occupancy` e `result` em `TRIP_COLUMN_KEYS`; `result` fica em `MONEY_COLUMNS` (some sem `trip.financials`, ordena pela margem numérica) e `occupancy` não ordena (sem botão de ordenação). Viagem cancelada mostra "—" nas duas.
- Percentual = `toOccupancyPercent` (`Math.round(razão × 100)`, a mesma conta do `TripCargoPanel`, que não foi alterado); marca `estimado` (fonte estimada) e `parcial` (fonte parcial ou nota sem medida); resultado marca `previsto` (receita não medida), `sem regra` (receita `missing`) e `parcial` (`hasGaps`). Prejuízo sai com a palavra "Prejuízo", não só cor.
- Contrato `test/trip/trip-list-cells.contract.tsx` (sem veículo, estimado, parcial, sem capacidade, acima do teto, prejuízo, sem permissão, colunas, ordenação); `amount-columns.contract.ts` atualizado. `bun test ./test/trip.contract.test.ts`: 2828 pass, 0 fail; typecheck e eslint limpos.
