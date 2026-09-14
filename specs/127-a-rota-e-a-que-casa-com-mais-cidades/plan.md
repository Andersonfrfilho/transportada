# Plano — 127

| camada   | arquivo                                        | o quê                                                                        |
| -------- | ---------------------------------------------- | ---------------------------------------------------------------------------- |
| domínio  | `trips/domain/trip-driver-zone.policy.ts`      | catálogo em lista por cidade; voto por rota; faixa mais alta; empate nomeado |
| domínio  | `trips/domain/trip-valuation.policy.ts`        | `DRIVER_ROUTE_AMBIGUOUS`; nova semântica de `DRIVER_ZONE_PRICED_FROM_TABLE`  |
| domínio  | `trips/domain/trip-driver-cost.policy.ts`      | `tiedZones` no detalhe; `routeSource` sai; lembrete não muda a origem        |
| infra    | `trips/infrastructure/trip-valuation.query.ts` | `resolveCrew`: preço da zona escolhida; lembrete por `isCoveredByDriver`     |
| frontend | 4 `*.locale.json`                              | rótulo de `DRIVER_ROUTE_AMBIGUOUS` nas duas telas, pt-BR e en                |

Nenhuma migration, nenhuma rota nova, nenhuma chave nova no corpo.

## Contratos

- `api-transportada/test/trip-valuation/driver-route-vote.contract.ts` (novo, registrado em
  `test/trip-valuation.contract.test.ts`).
- Reescritos, com a razão no teste: `driver-zone.contract.ts` (086), `driver-rate-gap.contract.ts`
  (123), `driver-zone-table-price.contract.ts` (124), e o fixture de
  `frontend-transportada/test/trip-financials/valuation-ledger-advisory.contract.ts`.
- `valuation-gap-labels.contract.ts` (frontend) cobra o rótulo da lacuna nova.

## 🤖 Modelo

`sonnet` — a regra é do usuário e está escrita na spec.
