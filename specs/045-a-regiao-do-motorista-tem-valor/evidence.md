# 045 — Evidência

## T001 — Contrato da zona acumulativa

`test/freight-regions-domain/coverage.contract.ts` escrito antes da regra. Vermelho registrado:

```
error: Cannot find module '../../src/freight-regions/domain/region-coverage.policy.js'
```

## T002 — `region-coverage.policy.ts`

```
$ bun test ./test/freight-regions-domain.contract.test.ts
7 pass · 0 fail · 26 expect() calls
```

Entrypoint `test/freight-regions-domain.contract.test.ts` registrado no `test` do
`apps/api-transportada/package.json` — sem isso a suíte não roda.

## T003 — Schema e migration

Aceite do contrato escrito antes do `rollback.sql`; vermelho pelo motivo certo:

```
ENOENT: .../drizzle/20260820000830_freight_regions_and_vehicle_freight_class/rollback.sql
(fail) versions the freight regions and the vehicle freight class as an additive migration with a guarded rollback
```

Depois de escrever o caminho de volta:

```
$ make migration-test
73 pass · 0 fail · 783 expect() calls (6 arquivos, Postgres descartável)

$ bun run --cwd apps/api-transportada test
2626 pass · 15 skip · 0 fail · 10812 expect() calls (108 arquivos)

$ bun run typecheck   # verde
$ bun run lint        # verde
```

O que a migration faz, e por quê:

- Cria `freight_regions`, `freight_region_cities`, `freight_region_driver_rates` e
  `fleet_driver_regions`, todas com FK de `company_id` para `companies`.
- `freight_regions_company_id_code_unique` é a chave natural da importação: reimportar a tabela do
  cliente atualiza, nunca duplica rota.
- A cidade é única em `(company_id, region_id, city, state)` e **não** em `(company_id, city)` —
  BARRINHA/SP aparece em `1.000` (Barretos) e em `5.000` (Jaboticabal) na tabela real, com preços
  diferentes; a unicidade por cidade recusaria a importação na segunda linha.
- `fleet_vehicles.freight_class` nasce preenchida pelo rodado onde as duas tabelas coincidem
  (`01→truck`, `02→toco`, `04→van`, `05→utility`) e fica vazia em `03` e `06` — é onde o VUC e o 3/4
  se escondem hoje, e escolher por eles poria valor de pagamento errado no cadastro sem ninguém
  saber. Nada de `07`/`08` no `tipoRodado`: o código é da SEFAZ e vai para dentro do MDF-e.
- `rollback.sql` derruba filho antes de pai, sem `CASCADE`, e exige exatamente uma linha no diário
  de migrations.
