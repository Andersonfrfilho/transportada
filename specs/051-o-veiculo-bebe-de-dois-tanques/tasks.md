# Tasks — 051

> 🤖 Modelo: `sonnet` (T4 e T7 são 🧠 — decisão de domínio e integração externa)

## Fase 1 — o catálogo aprende energia

> 🤖 `sonnet`

- **T1** — `eletrico`/`kwh` nas três cópias de `FUEL_TYPES` (api, frontend, cron) e nos três
  contratos de paridade. Aceite: `bun run test` verde nas três apps com o produto novo na mesma
  ordem e com a unidade `kwh`.
- **T2** — Unidade `kwh` na tela: rótulo do produto, sufixo do preço e rótulo do consumo
  (`km/kWh`, não `km/l`). Aceite: `test/fleet/fuel-unit.contract.ts`.

## Fase 2 — o segundo tanque

> 🤖 `sonnet` (T4 é 🧠)

- **T3** — Migration aditiva `fleet_vehicles.secondary_fuel_type` + `secondary_average_consumption`,
  com CHECK: secundário diferente do primário, e consumo secundário só com produto secundário.
  Rollback ao lado, guardado por hash. Aceite: `make migration-test` e
  `test/database-migration/fleet-constraints.assertion.ts`.
- **T4** 🧠 — `vehicle-cost.policy.ts` escolhe o menor R$/km entre os dois tanques e nomeia o
  vencedor no detalhamento. Aceite: `test/fleet-domain/vehicle-cost.contract.ts`.
- **T5** — Fronteira: `fleet-request.schema.ts`, `fleet.port.ts`, `fleet.mapper.ts`, rotas e
  `company-fuel-price.gateway.ts` resolvendo dois preços por veículo (uma consulta por empresa,
  nunca por linha). Aceite: `test/fleet-http/vehicles.contract.ts`.
- **T6** — Formulário: select de modos (preset → par de produtos), segundo campo de consumo, tabela
  e exportação. Aceite: `test/fleet/vehicle-cost-fields.contract.ts`.

## Fase 3 — a tarifa da ANEEL

> 🤖 `opus` 🧠

- **T7** 🧠 — Tabela `energy_tariff_references` (pública, sem `company_id`, exceção declarada no
  contrato de tenant) e `company_energy_settings` (distribuidora + fator). Migrations + rollback.
- **T8** — Cron `energy.price.pull`: CKAN datastore, filtro por vigência e subgrupo, gravação
  idempotente pela chave natural. Aceite: `test/energy-price-pull/*.contract.ts`.
- **T9** — Preço efetivo do `eletrico` = `ajuste ?? (TUSD+TE) × fator`, origem `aneel`, aviso de
  "sem impostos" na tela. Aceite: `test/companies/fuel-price-policy.contract.ts`.
- **T10** — Deploy do `cron-energy` e destino externo declarado onde a app o busca.
