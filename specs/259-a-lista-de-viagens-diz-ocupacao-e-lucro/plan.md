# Plano — Spec 259

## Leitura do que existe (medido em 2026-10-09)

- Lista: `GET /trips` → `trip.routes.ts` → `trip.use-case.ts#list` → `drizzle-trip.repository.ts#list` (keyset)
  - `loadTripDriverNames`/`loadTripFinishTimes` + `readTripRevenueTotals` (lote por `readDocumentsByTrip`).
- Custo e margem: `buildValuationFromContext` (única conta) sobre `TripValuationContext`, que
  `trip-valuation.query.ts#readContext` monta **por viagem** com ~12 consultas. Hoje a lista chama
  `buildTripValuation({ costParcels: [] })` — sem custo.
- Ocupação: `loadTripOccupancy` (por viagem, 3–4 consultas) e `loadTripCargoWeight` (2). Só o detalhe usa.
- Frontend: `TripTable.component.tsx`, colunas em `shared/tripTable.service.ts`, tipos em `trip.types.ts`,
  adaptação em `tripClient.service.ts` / `tripResponse.validation.ts`. `TripCargoPanel` já calcula o % e a marca.
- Spec 198 (tamanho da viagem na app do motorista) e 176/177 não se sobrepõem: nenhuma toca a lista.

## Decisões

1. **Custo e margem**: novo `readValuationContexts({ companyId, tripIds })` em `trip-valuation.query.ts` que
   devolve `Map<tripId, TripValuationContext>` com cada leitura do `readContext` virando **uma consulta por
   página** (`inArray(tripId)`), e `readTripListFinancials` chama `buildValuationFromContext` por viagem com a
   busca de regra memoizada (padrão de `readTripRevenueTotals`). Leituras por empresa (preço do combustível por
   tipo, diária, taxas federais, perfis de ICMS, taxa de ajudante) saem **uma vez por página**.
2. **Ocupação**: T1.1 mede e decide entre (a) leitor em lote por `tripIds` reaproveitando
   `resolveTripOccupancy`/`resolveTripCargoWeight`, e (b) reuso do carregador por viagem com concorrência 4 e
   isolamento por `.catch()`. Preferência: (a). (b) só se (a) exigir reescrever as 700 linhas de cubagem.
3. **Contrato**: `occupancy: { weight: { ratio, estimated } | null, volume: { ratio, estimated, partial } | null,
unknownReason }` por item; `amounts.costTotal/marginTotal/marginPercentage` com `money` na política.
4. **Falha isolada** (code-standart §15): ocupação e valoração entram na lista como refinamento — `allSettled`
   por viagem; a lista de hoje nunca fica pior por causa delas.
5. **Frontend**: duas colunas ("Ocupação" com duas barras finas peso/volume; "Resultado" com gasto, lucro e
   margem). Componente `TripOccupancyBars` e `TripResultCell`, reaproveitando as marcas de `TripCargoPanel`.

## Riscos

- Custo em lote pesa mais que a lista de hoje: medir tempo da página de 20 antes e depois (T2.4).
- Paridade lista × detalhe é o risco de produto (dois números para a mesma pergunta): teste de paridade obrigatório.
- Parser do painel publicado com lista fechada de chaves: publicar **painel tolerante antes da API** (ADR-0081 §9).
