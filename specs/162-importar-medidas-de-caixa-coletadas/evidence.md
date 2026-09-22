# Evidência — spec 162

## T003 — FK de `measured_by_user_id` e decisão do ator

Confirmado por leitura de `apps/api-transportada/src/database/nfe.schema.ts` (comentário da tabela
`nfePackageBoxMeasurements`): **sem FK** para nenhuma tabela de usuário (ADR-0039). Decisão
registrada em `plan.md` § "T003 — decisão sobre o ator": `CATALOG_IMPORT_ACTOR_ID` é constante UUID
fixa, sem linha de banco criada pela migration.

## T004 — Migration aditiva das CHECKs + rollback

Comando: `bun run db:generate --name package_box_catalog_source` (dentro de
`apps/api-transportada`), após alargar as duas CHECKs em `src/database/nfe.schema.ts` para incluir
`'catalog'`. Resultado: `drizzle/20260922020751_package_box_catalog_source/migration.sql` com
exatamente as duas ALTER TABLE esperadas (`nfe_package_box_measurements_source_check`,
`nfe_package_boxes_measurement_source_check`). `rollback.sql` escrito à mão seguindo o padrão de
`20260917153054_package_box_replicated_source`.

Verificação manual contra o Postgres 18 nativo descartável (127.0.0.1:56998, banco
`transportada_mig162_<epoch>`, Docker local indisponível):

```
DATABASE_URL=postgres://test@127.0.0.1:56998/transportada_mig162_<epoch> \
  bun --env-file=../../.env.test run db:migrate
```

→ aplicou sem erro; `pg_get_constraintdef` confirmou as duas CHECKs com `'catalog'` no `ANY(ARRAY[...])`.

```
psql ... -f drizzle/20260922020751_package_box_catalog_source/rollback.sql
```

→ `BEGIN / DO / ALTER TABLE / ALTER TABLE / DO / COMMIT`; `pg_get_constraintdef` confirmou a CHECK
voltando à lista de 4 valores (sem `'catalog'`). Banco descartável removido em seguida
(`drop database`).

`bun run typecheck` (raiz): verde nos 6 apps.

## T001/T002 — fixture, schema e mapper do JSONL

(preenchido abaixo conforme as tasks avançam)
