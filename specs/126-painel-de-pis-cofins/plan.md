# Plano — 126

| camada   | arquivo                                                               | o quê                                                    |
| -------- | --------------------------------------------------------------------- | -------------------------------------------------------- |
| domínio  | `companies/domain/federal-tax-settings.policy.ts`                     | teto de 20%, Simples zerado, erros com `details[]`       |
| app      | `companies/application/federal-tax-settings.{port,use-case}.ts`       | get / set / clear, com auditoria                         |
| infra    | `companies/infrastructure/drizzle-federal-tax-settings.repository.ts` | upsert por `company_id`, `audit_logs`                    |
| http     | `companies/presentation/federal-tax-settings.{routes,schema}.ts`      | três rotas, Zod `.strict()`                              |
| domínio  | `trips/domain/trip-tax.policy.ts`                                     | federal `estimated` quando a receita é prevista          |
| frontend | `company-settings`: cliente, validação, sugestão, hook, painel        | aba **Tributos**, registro em `SETTINGS_PANEL_PLACEMENT` |
| frontend | `shared/fractionPercentage.service.ts` (da 125)                       | percentual ↔ fração, textual                            |

Nenhuma migration: a tabela existe desde `20260827124518_trip_financial_result`.

## Contratos

- `api-transportada/test/companies/federal-tax-settings.contract.ts`: fronteira, teto, Simples,
  rotas e política, `companyId` do contexto, auditoria, isolamento por texto de fonte, federal
  estimado.
- `frontend-transportada/test/company-settings/federal-tax-panel.contract.ts`: sugestão por CRT e
  regime, fração ↔ percentual (a conversão errada multiplicaria por cem), guard da resposta, uso do
  `Select` do DS, esqueleto, rótulos.
- `test/company-settings/tabs.contract.ts` cobra o registro sozinho.

## 🤖 Modelo

`sonnet`.
