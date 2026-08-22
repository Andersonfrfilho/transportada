# Tasks — 051

> 🤖 Modelo: `sonnet` (T4 e T7 são 🧠 — decisão de domínio e integração externa)

## Fase 1 — o catálogo aprende energia

> 🤖 `sonnet`

- **T1** — `eletrico`/`kilowatt-hour` nas três cópias de `FUEL_TYPES` (api, frontend, cron) e nos
  três contratos de paridade, mais a migration que ensina o produto aos três CHECKs
  (`fleet_vehicles_fuel_type_check`, `fuel_price_references_product_check`,
  `company_fuel_prices_product_check`). A unidade é escrita por extenso como as outras duas —
  `kwh` ao lado de `litre` e `cubic-metre` seria a única abreviada. Aceite: `bun run test` verde nas
  três apps com o produto novo na mesma ordem, e `make migration-test`.
- **T2** — Unidade `kilowatt-hour` na tela: rótulo do produto, sufixo do preço e rótulo do consumo
  (`km/kWh`, não `km/l`). Aceite: `test/fleet/fuel-unit.contract.ts`.

## Fase 2 — o segundo tanque

> 🤖 `sonnet` (T4 é 🧠)

- **T3** — Migration aditiva `fleet_vehicles.secondary_fuel_type` + `secondary_average_consumption`,
  com CHECK: secundário diferente do primário, e consumo secundário só com produto secundário.
  Rollback ao lado, guardado por hash. Aceite: `make migration-test` e
  `test/database-migration/fleet-constraints.assertion.ts`.
- **T4** 🧠 — `vehicle-cost.policy.ts` soma as duas parcelas e divide por dois, nomeando as duas no
  detalhamento. Tanque secundário ausente mantém a conta de hoje, sem dividir. Aceite:
  `test/fleet-domain/vehicle-cost.contract.ts`.
- **T5** — Fronteira: `fleet-request.schema.ts`, `fleet.port.ts`, `fleet.mapper.ts`, rotas e
  `company-fuel-price.gateway.ts` resolvendo dois preços por veículo (uma consulta por empresa,
  nunca por linha). Aceite: `test/fleet-http/vehicles.contract.ts`.
- **T6** — Formulário: segundo par (produto + consumo), rótulo derivado do par (Flex · Híbrido ·
  Elétrico) na ficha, na tabela e na exportação. Aceite: `test/fleet/vehicle-cost-fields.contract.ts`
  e `test/fleet/fuel-arrangement.contract.ts`.

## Fase 3 — a tarifa da ANEEL

> 🤖 `opus` 🧠

- **T7** 🧠 — Tabela `energy_tariff_references` (pública, sem `company_id`, exceção declarada no
  contrato de tenant) e `company_energy_settings` (distribuidora + fator). Migrations + rollback.
- **T8** — A tarifa entra na **segunda metade do job `fuel.price.pull` que já existe**, não num cron
  novo: um deploy, uma janela, um advisory lock. Datastore CKAN da ANEEL, recorte B3 · Convencional ·
  Tarifa de Aplicação · `DscDetalhe` fora do SCEE, só o que está vigente no dia, gravação idempotente
  pela chave natural. Aceite: `test/fuel-price-pull/aneel-*.contract.ts`.
- **T9** — Preço efetivo do `eletrico` = `ajuste ?? (TUSD+TE) ÷ 1000 × fator`, origem `aneel`, aviso
  de "sem impostos" na tela. Aceite: `test/companies/fuel-price-policy.contract.ts`.
- **T10** — `ANEEL_BASE_URL`/`ANEEL_TIMEOUT_MS` no `.env.example` e nos dois ambientes do deploy do
  cron de combustível, e o destino externo declarado onde a app o busca.
- **T11** — A escolha da distribuidora, que hoje não tem caminho de escrita:
  `GET`/`PUT`/`DELETE /company-settings/energy` (`settings.manage`, escopo `company`) e o painel na
  aba **Combustível** da frota, ao lado do preço que ele decide. A distribuidora é **escolhida de uma
  lista**, nunca digitada — a lista sai das distribuidoras que a coleta já publicou, e o que já está
  gravado continua escolhível mesmo com a vigência fechada, como no catálogo de veículo e no
  município. Código fora da lista é `422`, não linha órfã que nunca vira preço. Aceite:
  `test/companies/company-energy.contract.ts`, `test/integration/company-energy-repository.integration.ts`
  e `test/fleet/energy-settings-panel.contract.ts`.
