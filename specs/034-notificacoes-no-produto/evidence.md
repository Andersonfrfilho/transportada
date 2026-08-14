# 034 — Evidências

Uma seção por task, com o comando rodado e o resultado. Task sem evidência aqui não está fechada.

## T001 — módulo instalado e migrations no passo manual

Versões instaladas divergem do que a task pediu, por indisponibilidade no registry:

- `@adatechnology/module-http` — `0.1.0-rc.1`; a `rc.2` pedida não existe publicada.
- `@adatechnology/notification-module` — `0.1.0-rc.3`, não `rc.2`. A `rc.2` não sobe nesta API: o
  migrator do drizzle 1.x recusa o layout antigo de `meta/_journal.json` e o pacote ainda o trazia
  (`We detected that you have old drizzle-kit migration folders`). A correção foi feita no pacote
  (`adatechnology-packages`, commits `99a5327` + `c902afe`) e publicada pelo pipeline.

O rollback mora em `apps/api-transportada/drizzle-notification/rollback.sql`, e não em `drizzle/`,
porque `test/database-migration/static-migration.contract.ts` fixa a lista exata de diretórios de
migration da aplicação — um diretório a mais reprova. A tabela de controle do módulo é
`drizzle.notification_migrations`: o migrator troca o nome da tabela, não o schema.

```
$ DRIZZLE_TEST_DATABASE_URL=$DATABASE_URL bun run --cwd apps/api-transportada db:test
 44 pass
 0 fail
 552 expect() calls
Ran 44 tests across 3 files.
```

```
$ bun run --cwd apps/api-transportada db:migrate
$ select table_name from information_schema.tables where table_schema='notification'
deliveries,devices,notifications,preferences,suppressions,templates
```

`bun run lint` e `bun run typecheck` (raiz, quatro apps) sem achados.
