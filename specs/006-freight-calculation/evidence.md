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
