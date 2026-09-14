# Plano — 123

## Onde a mudança cai

| camada   | arquivo                                                 | o quê                                                        |
| -------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| domínio  | `trips/domain/trip-valuation.policy.ts`                 | duas lacunas novas em `VALUATION_GAPS`                       |
| domínio  | `trips/domain/trip-driver-zone.policy.ts`               | o ramo "não cobre" passa a devolver a zona recusada          |
| domínio  | `trips/domain/trip-driver-cost.policy.ts`               | `driverName` no `TripCrewMember`; `buildRateDetail`          |
| infra    | `trips/infrastructure/trip-valuation.query.ts`          | nome do motorista, zona no ramo de lacuna, escolha da lacuna |
| frontend | 4 `*.locale.json` (`trip` e `trip-financials`, pt e en) | rótulos                                                      |

Nada de migration: nenhuma coluna nova. Nada de rota: o corpo já publica `detail` e `gap`.

## Contratos

- `api-transportada/test/trip-valuation/driver-rate-gap.contract.ts` (novo, no entrypoint
  `trip-valuation.contract.test.ts` que o `package.json` já lista).
- `frontend-transportada/test/trip-financials/valuation-gap-labels.contract.ts` cobra sozinho os
  rótulos: ele lê `VALUATION_GAPS` do fonte da API e falha sem label nos dois idiomas das duas telas.

## Prova de que nenhum número muda

Teste diferencial: a versão anterior de `buildTripDriverCost` (por `git show HEAD:`) e a atual,
alimentadas com as 20 tripulações reais extraídas do banco desta instalação, comparando `amount` e
`source`.

## 🤖 Modelo

`sonnet` — a decisão de vocabulário é 🧠 e já está escrita na spec.
