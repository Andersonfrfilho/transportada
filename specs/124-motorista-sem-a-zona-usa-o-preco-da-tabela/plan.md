# Plano — 124

| camada   | arquivo                                                      | o quê                                                                  |
| -------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| domínio  | `trips/domain/trip-valuation.policy.ts`                      | `DRIVER_ZONE_PRICED_FROM_TABLE`, `ADVISORY_GAPS`, `hasGaps` sem avisos |
| domínio  | `trips/domain/trip-driver-zone.policy.ts`                    | o ramo "não cobre" leva também o `regionId`                            |
| domínio  | `trips/domain/trip-driver-cost.policy.ts`                    | `routeSource` no `TripCrewMember`; parcela `estimated` com aviso       |
| infra    | `trips/infrastructure/trip-valuation.query.ts`               | `resolveCrew` lê o preço também da zona recusada                       |
| frontend | `trip-financials/shared/valuationLedger.service.ts` + ledger | linha com aviso mostra valor **e** aviso; marca de estimado            |
| frontend | 4 `*.locale.json`                                            | rótulo da lacuna-aviso e da marca                                      |

Nenhuma migration, nenhuma rota nova, nenhuma chave nova no corpo.

## Contratos

- `api-transportada/test/trip-valuation/driver-zone-table-price.contract.ts` (novo).
- `frontend-transportada/test/trip-financials/valuation-ledger-advisory.contract.ts` (novo) — lê
  `ADVISORY_GAPS` do fonte da API, como o de rótulos lê `VALUATION_GAPS`.
- `valuation-gap-labels.contract.ts` cobra o rótulo sozinho.

## 🤖 Modelo

`sonnet` — a decisão (aviso × lacuna, D2) é 🧠 e está escrita na spec.
