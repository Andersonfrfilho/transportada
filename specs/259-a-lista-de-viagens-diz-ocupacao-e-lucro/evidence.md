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
