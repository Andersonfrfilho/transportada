# Plan — 143 A diária paga o motorista

`API` = `apps/api-transportada`, `FE` = `apps/frontend-transportada`.

## Esquema (1 migration aditiva + rollback)

`API/drizzle/<timestamp>_driver_daily_allowance/`

- `fleet_drivers.daily_allowance_amount numeric(19,4) NULL CHECK (daily_allowance_amount IS NULL OR daily_allowance_amount > 0)`.
  É independente do CHECK de `payment_model` (`fleet.schema.ts:544`).
- `trips.daily_allowance_days integer NULL CHECK (daily_allowance_days IS NULL OR daily_allowance_days >= 1)`.
- `company_driver_allowance_settings`: `company_id uuid PK FK`, `daily_allowance_amount numeric(19,4) NOT NULL CHECK > 0`,
  `updated_by_user_id`, `updated_at`. Modelo: `company_energy_settings` (`company-energy-settings.schema.ts:18`)
  — e não `company_tax_settings`, que usa `id` surrogate + UNIQUE, uma linha por empresa garantida por
  constraint acessória em vez de pela chave.

## API

| Camada             | Arquivo                                                                                                          | Mudança                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| domain             | `trips/domain/daily-allowance.policy.ts` (novo)                                                                  | `resolveDailyAllowance({ driverAmount, companyAmount })` → `{ amount, rateOrigin }`; `suggestAllowanceDays(durationSeconds)` → `max(1, ceil(s/86400))`; `DEFAULT_DAILY_ALLOWANCE_AMOUNT` em `trips/domain/daily-allowance.constant.ts`                                                                                           |
| domain             | `trips/domain/trip-driver-cost.policy.ts`                                                                        | `buildTripDriverCost({ crew, days, daysOrigin })`: soma `dailyAmount × days` de toda a tripulação; `source` = `measured` se `informed`, `estimated` se `estimated`; tripulação vazia continua `missing`/`NO_DRIVER_RATE`. Remove o ramo por `routeAmount`, os votos de zona e o empate                                           |
| domain             | `TripCrewMember`                                                                                                 | Troca `routeAmount/routeGap/regionCity/regionCode/tiedZones/...` por `dailyAmount`, `rateOrigin`                                                                                                                                                                                                                                 |
| infra              | `trips/infrastructure/trip-valuation.query.ts`                                                                   | `readCrew`/`readPreviewCrew` fazem SELECT de `fleetDrivers.dailyAllowanceAmount` e da configuração da empresa (um único LEFT JOIN, sem N+1); `resolveCrew`/`priceTiedCrewMember` saem do caminho do custo. Novo `readAllowanceDays(tripId)`. `readTollTotal` filtra `kind='toll'`; novo `readManualCostTotal` com `kind='other'` |
| application        | `read-trip-valuation.use-case.ts`                                                                                | passa `days`/`daysOrigin` para a política; parcela `manual` vinda de `readManualCostTotal`                                                                                                                                                                                                                                       |
| application        | `freeze-trip-financial-result.use-case.ts:94`                                                                    | `note` da parcela `driver` = frase de origem (D5)                                                                                                                                                                                                                                                                                |
| application        | `trip.use-case.ts` `create`                                                                                      | recebe `dailyAllowanceDays?`; sem ele, grava a sugestão                                                                                                                                                                                                                                                                          |
| presentation       | `trip-request.schema.ts`                                                                                         | `createTripSchema` e `previewTripValuationSchema` + `dailyAllowanceDays: z.number().int().min(1).max(60).optional()`                                                                                                                                                                                                             |
| infra/presentation | `drizzle-trip-cost.repository.ts` + `trip.routes.ts`                                                             | `listByTrip({ companyId, tripId })` com JOIN em `identity_user_profiles`; `GET /trips/:id/costs` (`trip.financials`)                                                                                                                                                                                                             |
| companies          | `driver-allowance-settings.{use-case,port,schema,routes}.ts` + `drizzle-driver-allowance-settings.repository.ts` | GET/PUT/DELETE, espelhando `federal-tax-settings.*`                                                                                                                                                                                                                                                                              |
| fleet              | `fleet-request.schema.ts:191` + `fleet.routes.ts:282`                                                            | `dailyAllowanceAmount` (string decimal, opcional, nullable) na entrada e na saída                                                                                                                                                                                                                                                |
| wiring             | `main.ts`                                                                                                        | registra rotas e repositórios novos                                                                                                                                                                                                                                                                                              |
| docs               | `docs/adr/0066-a-diaria-substitui-a-tabela-no-custo-do-motorista.md`                                             | D1, D2, D3                                                                                                                                                                                                                                                                                                                       |

## Frontend

| Arquivo                                                                                                                                 | Mudança                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `trip-financials/shared/tripCostParcelDetail.service.ts`                                                                                | frase "R$ X × N dias · valor do motorista/geral/padrão" por motorista                        |
| `trip-financials/components/ValuationLedger.component.tsx`                                                                              | `driverBasis` usa a frase nova e remove as variantes de zona                                 |
| `trip-financials/components/TripCostEntries.component.tsx` (novo)                                                                       | lista com autor + formulário (amount, description, kind)                                     |
| `trip-financials/hooks/useTripCostEntries.hook.ts` (novo)                                                                               | `listCosts` + `recordCost`, invalidando valuation e a lista                                  |
| `trip-financials/shared/tripFinancialsClient.service.ts`                                                                                | `listCosts` + validação zod da resposta                                                      |
| `trip-financials/components/TripFinancialPanel.component.tsx`                                                                           | viagem aberta renderiza `ValuationLedger`; encaixa `TripCostEntries` antes de `.recalculate` |
| `trip/components/TripQuickCreateDialog.component.tsx` + `useTripQuickCreate.hook.ts` + `tripClient.service.ts`                          | campo "Diárias" com a sugestão, enviado na prévia e na criação                               |
| `fleet/components/DriverForm.component.tsx` + `useDriverForm.hook.ts` + `fleet.types.ts` + `fleetForm.service.ts` + `fleet.constant.ts` | campo "Diária (R$/dia)"                                                                      |
| `company-settings/components/DriverAllowancePanel.component.tsx` (novo) + hooks + `companySettingsTabs.service.ts`                      | aba nova                                                                                     |
| `*.locale.json`                                                                                                                         | textos pt-BR                                                                                 |

## Testes (lista explícita no `package.json` de cada app)

- API `test/trip-valuation/daily-allowance.contract.ts` (novo): aceites 1–5.
- API `test/trip-financial/cost-entries.contract.ts` (novo): aceites 6–7.
- API `test/trip-financial/schema.contract.ts` + `test/fleet-schema/*`: CHECKs (aceite 8) e tenant-safety da tabela nova.
- API `test/company-settings-http/driver-allowance.contract.ts` (novo).
- API: `driver-rate-gap`, `driver-route-tie`, `driver-route-vote`, `driver-zone-table-price`, `crew-zone-wiring`
  **mudam de assunto** (a zona não afeta mais o custo do motorista). Reescrever a asserção; não apagar
  sem registrar em `evidence.md`.
- FE `test/trip-financials/cost-entries.contract.ts` e `daily-allowance-detail.contract.ts` (novos);
  atualizar `driver-route-tie-detail`, `valuation-ledger`, `panel`.
- Migration: `make migration-test`.

## Riscos

- Os contratos de zona/empate somem do custo do motorista. É a mudança pretendida (D1), mas mexe em
  cerca de 6 suítes. A T3 lista cada uma antes de alterar.
- Viagens congeladas guardam `note` com gap antigo; não se toca nelas (aceite 10).
