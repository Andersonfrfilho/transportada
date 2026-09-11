# Evidência — spec 129

## Comandos

```
bun run --cwd apps/api-transportada typecheck        # limpo
bun run --cwd apps/frontend-transportada typecheck    # limpo
bun test ./test/trip-valuation.contract.test.ts       # 132 pass (api)
bun test ./test/trip-financial.contract.test.ts       # 166 pass junto com trip-valuation (api)
bun test ./test/trip-financials.contract.test.ts \
         ./test/suggestion-valuation.contract.test.ts \
         ./test/trip.contract.test.ts \
         ./test/routing.contract.test.ts              # frontend, todos verdes
make check                                            # EXIT_CODE=0
```

## O que mudou

- `TripCostParcelBasis['driver'].tie` (API): novo, opcional, cru — `{cityCount, zones: [{amount,
city, code}]}`. `trip-driver-cost.policy.ts` não compõe mais frase nem moeda para o empate:
  `buildTieBasis` extrai o dado, `tieDriverNameDetail` extrai só o nome do condutor para `detail`.
- Frontend: `tripCostParcelDetail.service.ts` (`composeCostParcelDetail`), usado por
  `ValuationLedger.component.tsx` e `SuggestionVehicleValuation.component.tsx`. Chaves novas em
  `tripFinancials.locale.json`/`.en.locale.json`: `ledger.tieCityCount_one/_other`,
  `ledger.tieNoPrice`.
- Testes: `driver-route-tie.contract.ts` e `driver-route-vote.contract.ts` (API) reescritos para o
  dado cru; `driver-and-tax.contract.ts` (API) ajustado às novas chaves de `basis`
  (`tie: null`/`basis: null` explícitos); novo `driver-route-tie-detail.contract.ts` (frontend)
  provando pt/en e o fallback ao texto cru de uma API anterior.

## Nenhum número mudou

Os 5021 testes da API (incluindo os 166 de `trip-financial`+`trip-valuation`, que somam o custo do
motorista) e os testes de frontend continuam verdes com os mesmos valores — a mudança é só na forma
de `detail`/`basis`, nunca no `amount`, `totalCost`, `marginPercentage` etc.

## O que não foi medido

- Não há ambiente com Postgres real rodando nesta sessão para o teste de integração
  `route-optimization-trip-weight.integration.test.ts`-like contra dados reais do empate — a prova
  é toda unitária/contrato, como o resto de `trip-valuation`.
- Não foi possível confirmar visualmente na tela (Playwright/browser) o aviso renderizado; a prova
  é pelo contrato de composição (`composeCostParcelDetail`) e pelos testes de fonte que checam que
  os dois componentes usam o serviço compartilhado.
