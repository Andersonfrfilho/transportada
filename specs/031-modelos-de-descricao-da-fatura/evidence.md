# 031 — Evidência

## T001 — catálogo `billing_description_templates`

**Contrato antes da implementação.** `test/billing-schema/description-template.contract.ts` foi
escrito e rodado vermelho (`requireSchemaTable('billingDescriptionTemplates')` não achava a tabela)
antes de existir `src/database/billing-description-template.schema.ts`. A tabela entrou em
`BILLING_SCHEMA_EXPORT_NAMES` (`test/billing-schema/tables.ts`), o que a inscreve automaticamente no
agregador e no contrato de isolamento por empresa.

**Suporte novo.** `uniqueIndexWhereSqlByName()` em `test/fiscal-schema/support.ts` — o suporte de
schema não sabia ler o `WHERE` de índice parcial, e o "um padrão por empresa" é exatamente isso.

**Desvio consciente da spec.** A spec pedia FK `on delete cascade`. O invariante de
`test/billing-schema/tenant-safety.contract.ts` exige, para toda tabela de billing, FK chamada
`${tabela}_company_id_companies_id_fk` com `restrict`/`cascade`. O invariante do repositório venceu;
a spec e a task foram corrigidas.

**Migration.** `drizzle/20260811164234_billing_description_templates/` — `CREATE TABLE` aditivo,
índice único parcial `(company_id) WHERE is_default`, CHECK de `name` (1..120 após `btrim`) e de
`body` (1..500, o mesmo teto de `billing_invoices.observations`, para onde o texto resolvido vai), e
backfill que copia cada `company_fiscal_profiles.billing_observations` não vazio para um modelo
`Padrão`. A coluna de origem não é esvaziada — a migration só copia.

**Rollback.** `rollback.sql` ao lado, `BEGIN;`/`COMMIT;`, sem `CASCADE`, com o `DELETE` do journal
guardado por `GET DIAGNOSTICS` + `RAISE EXCEPTION` se não remover exatamente uma linha. O diretório
foi registrado na lista explícita de `test/database-migration/static-migration.contract.ts` e ganhou
o seu próprio teste de forma (aditividade, índice parcial, backfill, rollback guardado).

### Comandos

```
make migration-test
  35 pass · 0 fail · 441 expect() · 2 arquivos

bun run --cwd apps/api-transportada test
  2032 pass · 3 skip · 0 fail · 8369 expect() · 82 arquivos

bun run --cwd apps/api-transportada db:check
  Everything's fine

bun run lint       → limpo (4 apps)
bun run typecheck  → limpo (4 apps)
```
