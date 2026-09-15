# Evidence

## T101

Migration aditiva `20260915162953_address_correction_requests` (gerada por `bun run db:generate
--name address_correction_requests` a partir de `src/database/address-correction.schema.ts`, exportado
em `database.schema.ts`), com `rollback.sql` manual. Amplia
`contractor_mail_threads_subject_type_check` para incluir `address_correction`
(`contractor-mail.schema.ts`). Pasta nova de `drizzle/` inclui `snapshot.json` (regra do
`apps/api-transportada/CLAUDE.md` — "migration à mão é permitida, sem snapshot não"). Nome da
migration adicionado à lista explícita em
`test/database-migration/static-migration.contract.ts`.

Comandos:

```
bun run typecheck
```

Resultado: `tsc --noEmit` passou nas 6 apps (api, worker, cron, frontend-transportada,
frontend-client, frontend-landing), sem erro.

```
DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65433/postgres \
  bun --env-file=../../.env.test test test/database-migration.contract.test.ts --timeout 120000
```

(dentro de `apps/api-transportada`; Postgres do Docker em 65432 indisponível — I/O error — usado o
Postgres nativo descartável em 65433, conforme instrução da task)
Resultado: **58 pass, 1 fail**, 1078 `expect()`. A falha é em
`Drizzle migration integration > applies, constrains, rolls back, and reapplies the fiscal migration`
(`test/database-migration/cte-profile-output-constraints.assertion.ts:134`), esperando SQLSTATE
`23503` e recebendo `23001` — divergência de versão do Postgres nativo local para violação de
`RESTRICT`, não relacionada a esta task (nenhum arquivo de `cte-profiles`/`cte-profile-output` foi
tocado nesta task; `git diff --stat` mostra só `contractor-mail.schema.ts`,
`database.schema.ts` e `static-migration.contract.ts`, além dos arquivos novos). O rollback da
migration nova (`address_correction_requests`) e a nova entrada na lista de diretórios passaram sem
erro.

```
bun run --cwd apps/api-transportada test
```

Resultado: **5820 pass, 23 skip, 0 fail**, 20539 `expect()`, 172 arquivos (sem
`DRIZZLE_TEST_DATABASE_URL`, os testes de integração Postgres pulam — comportamento documentado no
`CLAUDE.md` da raiz).

### Arquivos alterados

- `apps/api-transportada/src/database/address-correction.schema.ts` (novo)
- `apps/api-transportada/src/database/contractor-mail.schema.ts` (CHECK ampliado)
- `apps/api-transportada/src/database/database.schema.ts` (import/export/registro da tabela nova)
- `apps/api-transportada/drizzle/20260915162953_address_correction_requests/migration.sql` (novo,
  gerado)
- `apps/api-transportada/drizzle/20260915162953_address_correction_requests/rollback.sql` (novo)
- `apps/api-transportada/drizzle/20260915162953_address_correction_requests/snapshot.json` (novo,
  gerado)
- `apps/api-transportada/test/database-migration/static-migration.contract.ts` (lista explícita)

## T102

Contrato de tenant contra Postgres: `apps/api-transportada/test/integration/address-correction-repository.integration.ts`
(banco descartável com todas as migrations, apagado no fim), declarado em `test:integration` do
`package.json` da API. Prova: a contratante sai de `contractors.tax_id` dentro da `companyId`
informada (o CNPJ só cadastrado em outra empresa não é encontrado); o rascunho de uma empresa não
aparece em `findByAddressKeys`/`listDraftsByContractor` da outra, e o `upsertDraft` da outra cria
linha própria sem tocar no dele; salvar de novo atualiza o mesmo registro; pedido `sent` não é
reaberto (o rascunho novo é outra linha); a FK composta recusa `contractor_id` de outra empresa.

Postgres nativo descartável em `127.0.0.1:65433`, de dentro de `apps/api-transportada`:

```
DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65433/postgres \
  bun --env-file=../../.env.test test ./test/integration/address-correction-repository.integration.ts --timeout 120000
```

**Vermelho** (antes da porta e do repositório existirem):

```
error: Cannot find module '../../src/address-correction/infrastructure/drizzle-address-correction.repository.js'
 0 pass
 1 fail
 1 error
```

**Verde** (depois de `address-correction.port.ts` e `drizzle-address-correction.repository.ts`):
**5 pass, 0 fail**, 17 `expect()` — não pulou (5 testes executados contra o banco).

O `upsertDraft` usa `on conflict (company_id, address_key) where status = 'draft'`, o índice
parcial da T101: um pedido `sent` fica fora do alvo e o insert cria linha nova.

Gates:

- `bun run typecheck` (raiz): verde.
- `bun run --cwd apps/api-transportada test`: **5820 pass, 23 skip, 0 fail**, 20539 `expect()`,
  172 arquivos.
- Prettier nos arquivos tocados: verde.

### Arquivos alterados

- `apps/api-transportada/src/address-correction/application/address-correction.port.ts` (novo)
- `apps/api-transportada/src/address-correction/infrastructure/drizzle-address-correction.repository.ts` (novo)
- `apps/api-transportada/test/integration/address-correction-repository.integration.ts` (novo)
- `apps/api-transportada/package.json` (entrada em `test:integration`)
