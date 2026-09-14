# Plano — 125

| camada   | arquivo                                              | o quê                                                               |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------------- |
| domínio  | `cte-issuance/domain/cte-icms.policy.ts` (novo)      | `computeIcms` e `projectIcmsAmount` — a regra de base do CT-e       |
| domínio  | `cte-issuance/domain/cte-payload.builder.ts`         | `composeIcms` passa a mapear `computeIcms`                          |
| domínio  | `trips/domain/trip-icms-projection.policy.ts` (novo) | `resolveDocumentIcms`: documento → perfil → projeção ou lacuna      |
| domínio  | `trips/domain/trip-tax.policy.ts`                    | a parcela soma medido + projetado, pior origem, `basis` de ICMS     |
| domínio  | `trips/domain/trip-valuation.policy.ts`              | `NO_EMISSION_PROFILE`, `ICMS_CST_UNSUPPORTED`, `basis` `of: 'icms'` |
| app      | `trips/application/read-trip-valuation.use-case.ts`  | casa nota com a linha de receita e resolve o ICMS dela              |
| infra    | `trips/infrastructure/trip-valuation.query.ts`       | `readIcmsProfiles` (uma consulta); `recipientTaxId` nas notas       |
| frontend | ledger + 4 `*.locale.json`                           | `basis` de ICMS; rótulos das duas lacunas                           |

Nenhuma migration, nenhuma rota.

## Contratos

- `api-transportada/test/trip-valuation/icms-projection.contract.ts` (novo).
- `cte-payload-builder.contract.ts` continua passando sem mudança — é a prova de que a extração não
  mudou o CT-e.

## 🤖 Modelo

`sonnet`; a regra fiscal (D1) é 🧠 e está escrita.
