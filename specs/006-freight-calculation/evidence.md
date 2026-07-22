# Evidência — Feature 006 Regras e cálculo de frete

## T001 — ADR e decomposição executável

Data: 2026-07-22

Modelo executor: Codex Sol high recomendado para especificação/revisão de dinheiro,
snapshots, idempotência e migration.

Arquivos criados:

- `specs/006-freight-calculation/spec.md`
- `specs/006-freight-calculation/plan.md`
- `specs/006-freight-calculation/tasks.md`
- `docs/adr/0008-freight-decimal-snapshots.md`

Decisões registradas:

- regra inicial `PERCENTAGE_OF_INVOICE_TOTAL`;
- dinheiro e percentual como decimal seguro, sem `number` binário;
- versionamento de regras e snapshot imutável por cálculo persistido;
- seleção vigente pela data de emissão da NF-e;
- bloqueio de vigência sobreposta para regras ativas equivalentes;
- feature limitada a configuração e simulação, sem lote ou emissão CT-e.

Gate executado:

```text
bunx prettier --write docs/adr/0008-freight-decimal-snapshots.md specs/006-freight-calculation/spec.md specs/006-freight-calculation/plan.md specs/006-freight-calculation/tasks.md
bunx prettier --check docs/adr specs/006-freight-calculation && git diff --check
```

Resultado:

```text
All matched files use Prettier code style!
git diff --check sem apontamentos.
```

Não houve implementação, banco, RabbitMQ, SEFAZ, Railway, XML fiscal, PFX ou
segredo nesta tarefa.

## T002 — Contracts do schema de frete e constraints

Data: 2026-07-22

Modelo executor recomendado: Codex Sol high, por envolver schema, dinheiro,
constraints, tenant e vigência.

Arquivos criados/alterados:

- `apps/api-transportada/test/freight-schema.contract.test.ts`
- `apps/api-transportada/test/freight-schema/aggregator.contract.ts`
- `apps/api-transportada/test/freight-schema/rules.contract.ts`
- `apps/api-transportada/test/freight-schema/calculations.contract.ts`
- `apps/api-transportada/test/freight-schema/tenant-safety.contract.ts`
- `apps/api-transportada/test/freight-schema/tables.ts`
- `apps/api-transportada/package.json`
- `specs/006-freight-calculation/tasks.md`

Contratos definidos:

- exportação agregada de `freightRules`, `freightRuleVersions` e
  `freightCalculations`;
- módulo dedicado `src/database/freight.schema.ts`;
- regra tenant-scoped com tipo percentual, status, prioridade, versão corrente e
  ator por membership;
- versão imutável com `numeric(9,6)` para percentual, `numeric(19,4)` para
  valores, vigência, snapshot e filtros;
- cálculo com snapshot, idempotência tenant-scoped, FKs compostas para NF-e,
  regra e versão;
- checks de status, versão, percentual, valores, mínimo/máximo e vigência;
- segurança tenant, timestamps UTC e ausência de XML/segredos/payload fiscal.

Gate RED executado:

```text
(cd apps/api-transportada && bun test test/freight-schema.contract.test.ts)
```

Resultado esperado:

```text
T003 schema implementation is missing database export: freightRules
```

A falha é intencional e limitada à implementação ausente da T003. Nenhum banco,
migration, RabbitMQ, SEFAZ, Railway, XML fiscal, PFX ou segredo foi usado nesta
tarefa.

## T003 — Schema, migration aditiva e rollback

Data: 2026-07-22

Modelo executor recomendado: Codex Sol high, por envolver migration, dinheiro,
constraints, tenant e rollback.

Arquivos criados/alterados:

- `apps/api-transportada/src/database/freight.schema.ts`
- `apps/api-transportada/src/database/database.schema.ts`
- `apps/api-transportada/drizzle/20260722172720_confused_excalibur/migration.sql`
- `apps/api-transportada/drizzle/20260722172720_confused_excalibur/rollback.sql`
- `apps/api-transportada/drizzle/20260722172720_confused_excalibur/snapshot.json`
- `apps/api-transportada/test/database-migration/support.ts`
- `apps/api-transportada/test/database-migration/database-migration.integration.ts`
- `apps/api-transportada/test/database-migration/static-migration.contract.ts`
- `specs/006-freight-calculation/tasks.md`

Implementado:

- `freight_rules` com tenant, tipo percentual, status, prioridade, versão
  corrente e ator via membership;
- `freight_rule_versions` com vigência, `numeric(9,6)` para percentual,
  `numeric(19,4)` para mínimo/máximo, filtros e snapshot;
- `freight_calculations` com NF-e tenant-scoped, regra, versão, idempotência,
  valores decimais, ajustes, snapshot e detalhes;
- FKs compostas por empresa para NF-e, regra, versão e membership;
- checks de status, versão, percentual, valores, mínimo/máximo e vigência;
- rollback manual reverso, sem `CASCADE`, removendo o journal da migration com
  hash guardado.

Gates executados:

```text
(cd apps/api-transportada && bun test test/freight-schema.contract.test.ts)
bun run --cwd apps/api-transportada db:check
make migration-test
bun run --cwd apps/api-transportada check
```

Resultados:

```text
freight-schema.contract: 7 pass, 0 fail, 77 expect() calls.
db:check: Everything's fine.
migration-test: 9 pass, 0 fail, 129 expect() calls.
api check: 365 pass, 1 skip, 0 fail, 2251 expect() calls; build OK.
```

O skip no `api check` é o teste de integração de migration quando executado sem
`DRIZZLE_TEST_DATABASE_URL`; o mesmo cenário foi coberto pelo `make
migration-test` com PostgreSQL local.

Nenhum RabbitMQ, SEFAZ, Railway, XML fiscal, PFX ou segredo participou desta
tarefa. O Postgres local usado pelo migration-test foi encerrado após a coleta
da evidência.
