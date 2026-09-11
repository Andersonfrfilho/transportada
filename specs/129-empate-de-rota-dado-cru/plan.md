# Plano — spec 129

1. **API (`sonnet`)** — `TripCostParcelBasis['of'='driver']` ganha `tie?`. `trip-driver-cost.policy.ts`
   deixa de compor a frase do empate: `buildTieBasis` extrai o dado cru para `basis.tie`,
   `tieDriverNameDetail` extrai só o nome do condutor para `detail`. `buildRateDetail` (spec 123)
   perde o ramo de empate, intocado no resto.
2. **Frontend (`sonnet`)** — `tripCostParcelDetail.service.ts` novo, com `composeCostParcelDetail`:
   lê `basis.tie`, traduz e formata; sem `tie`, devolve `detail` cru (compatibilidade). Usado por
   `ValuationLedger.component.tsx` e `SuggestionVehicleValuation.component.tsx` (a proposta tinha a
   mesma composição duplicada). Chaves novas em `tripFinancials.locale.json`/`.en.locale.json`:
   `ledger.tieCityCount_one/_other`, `ledger.tieNoPrice`.
3. **Testes (`sonnet`)** — contrato antes do código: `driver-route-tie.contract.ts` (API) reescrito
   para `basis.tie` cru; `driver-route-vote.contract.ts` (spec 127) atualizado no mesmo sentido;
   novo `driver-route-tie-detail.contract.ts` (frontend) prova pt/en e o fallback ao texto cru.

## Gates

- `bun test` das suítes de `trip-valuation` (API) e `trip-financials`/`suggestion-valuation`/`trip`/
  `routing` (frontend).
- `bun run typecheck` nas duas apps.
- `make check` na raiz do worktree.
