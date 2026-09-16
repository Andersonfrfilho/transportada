# Tasks — 143 A diária paga o motorista

> 🤖 Modelo: `sonnet` (T1, T3 e T12 são 🧠 — validar com `opus` antes)

Uma task por vez. Teste de contrato **antes** da implementação. Task só fecha com `bun run typecheck`,
testes da app e evidência em `evidence.md`, em commit isolado.

## Fase 1 — O dado entra na casa

> 🤖 Modelo: `sonnet` (T1 🧠)

### T1 🧠 — Migration da diária

Colunas `fleet_drivers.daily_allowance_amount` e `trips.daily_allowance_days`, e a tabela
`company_driver_allowance_settings`, com os CHECKs do plan e `rollback.sql`.

- **Aceite:** `make migration-test` verde; contrato de schema cobre os CHECKs (aceite 8); a tabela nova
  entra no contrato de tenant-safety com `company_id`.

### T2 — Política da diária

`daily-allowance.policy.ts` + `.constant.ts`: `resolveDailyAllowance` e `suggestAllowanceDays`.

- **Aceite:** contrato unitário com 50h → 3, 0s → 1, 24h → 1, 24h01 → 2, e com as três origens
  (`driver` / `company` / `default`).

## Fase 2 — A conta usa a diária

> 🤖 Modelo: `sonnet` (T3 🧠)

### T3 🧠 — `buildTripDriverCost` por diária

Troca o custo por rota pela diária (D1, D2, D5). Antes de codar, listar em `evidence.md` cada suíte de
zona/empate afetada e o que a asserção passa a dizer.

- **Aceite:** `test/trip-valuation/daily-allowance.contract.ts`, aceites 1, 3, 4 e 5.

### T4 — Leitura da tripulação e dos dias

`trip-valuation.query.ts`: diária do motorista + configuração da empresa num JOIN só; `readAllowanceDays`.
`read-trip-valuation.use-case.ts` passa dias e origem.

- **Aceite:** aceites 1–4 via `readTripValuation` e via prévia; nenhuma query por motorista em loop.

### T5 — Dias na criação e na prévia

`createTripSchema`/`previewTripValuationSchema` + `trip.use-case.ts create`.

- **Aceite:** aceite 2; `dailyAllowanceDays: 0` → 400.

### T6 — Congelamento grava a origem

`freeze-trip-financial-result.use-case.ts`: `note` da parcela `driver` com a frase.

- **Aceite:** congelar → `trip_financial_parcels.note` = "R$ 200,00 × 3 dias · valor geral"; aceite 10.

## Fase 3 — Os lançamentos aparecem

> 🤖 Modelo: `sonnet`

### T7 — Pedágio separado do avulso

`readTollTotal` só `toll`; `readManualCostTotal` → parcela `manual`.

- **Aceite:** aceite 6, parte das parcelas.

### T8 — `GET /trips/:id/costs` com autor

`listByTrip` com JOIN em `identity_user_profiles`, rota e wiring.

- **Aceite:** aceites 6 e 7.

## Fase 4 — Configuração

> 🤖 Modelo: `sonnet`

### T9 — Diária no cadastro do motorista (API + FE)

`driverFieldsSchema`, resposta da frota, `DriverForm`.

- **Aceite:** contrato HTTP da frota grava e lê `dailyAllowanceAmount` e o apaga com `null`; contrato
  FE do formulário.

### T10 — Valor geral da empresa (API + FE)

`GET/PUT/DELETE /company-settings/driver-allowance` + aba `DriverAllowancePanel`.

- **Aceite:** sem linha → GET devolve `200.0000` com `origin: 'default'`; PUT → `company`; DELETE volta
  ao padrão; papel sem permissão → 403.

## Fase 5 — A tela

> 🤖 Modelo: `sonnet` (T12 🧠)

### T11 — Frase de origem no ledger

`composeCostParcelDetail` + `ValuationLedger`.

- **Aceite:** `daily-allowance-detail.contract.ts`; `driver-route-tie-detail` atualizado.

### T12 🧠 — Painel com todos os gastos, lançamentos e input

`TripFinancialPanel` com ledger na viagem aberta, `TripCostEntries` e `useTripCostEntries`.

- **Aceite:** aceite 9 em `cost-entries.contract.ts`; `valuation-ledger-shared` continua verde (sem
  segunda implementação); verificação no browser.
- 🧠 porque reorganiza o painel com as duas situações (aberta/fechada) e as duas permissões.

### T13 — Campo "Diárias" na criação da viagem

`TripQuickCreateDialog` + hook + client.

- **Aceite:** sugestão preenchida pela duração; alterar recalcula a prévia; valor enviado no POST.

## Fase 6 — Fechamento

> 🤖 Modelo: `sonnet`

### T14 — ADR-0066, contexto da IA e gate

ADR-0066; nota em `apps/api-transportada/CLAUDE.md` e `apps/frontend-transportada/CLAUDE.md` sobre a
diária substituir a tabela no custo do motorista; `make check`.

- **Aceite:** `make check` verde; revisão final com `code-reviewer` `opus`.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/143-a-diaria-paga-o-motorista/ (leia spec.md, plan.md e
tasks.md antes de começar). Crie o worktree com `make worktree NAME=spec-143`. Uma task por vez, na ordem
do tasks.md.
Modelos: Fases 1–6 → executor model=sonnet · T1, T3 e T12 🧠 → opus (validar com architect antes de
implementar) · revisão final → code-reviewer model=opus.
Cada task fecha com teste de contrato escrito antes + bun run typecheck + testes da app (teste novo
adicionado à lista do package.json) + commit isolado, evidência em evidence.md. T1 exige make migration-test.
Pare e pergunte antes de: deploy em production, qualquer migration destrutiva, apagar suíte de teste
existente, ou se as premissas da seção "Premissas a confirmar" da spec forem contrariadas pelo código.
Gates verdes → push para staging.
```
