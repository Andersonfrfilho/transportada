# Evidência — 052

## T1 — o relógio nasce no banco

**Contrato antes da implementação.** Os dois blocos foram escritos e vistos falhando antes de existir
schema ou migration:

- `test/database-migration/static-migration.contract.ts` — `expect(directory).toBeString()` recebeu
  `undefined` (a migration não existia).
- `test/operations-schema/tenant-safety.contract.ts` — `SyntaxError: Export named 'jobSchedules' not
  found in module database.schema.ts`.

**Migration.** `drizzle/20260823175600_job_schedule_registry/`, hash
`cc2dfafbca08fd422510b33a19e3ca4a7a32eeb3efa121f43e7de09afde99ea8`, com `rollback.sql` ao lado.
Nenhum `CREATE TYPE`: os quatro nomes de rotina e as duas origens são CHECK sobre `varchar`.

**As duas tabelas entraram no round-trip, e as duas antigas junto.** `readBusinessTables` só enxerga
tabela que está declarada em `test/database-migration/support.ts` — uma tabela nova é **invisível**
para o teste de aplicar-e-derrubar, e era assim que `fuel_price_references` e
`energy_tariff_references` estavam desde que nasceram. `OPERATIONS_TABLES` passou a nomear as quatro,
e o round-trip continua verde: as quatro sobem na migration e somem no rollback.

```
$ make migration-test
82 pass · 0 fail · 1030 expect() calls
```

**Os guardas mordem — conferido em Postgres, não no texto do SQL.** Base descartável, migration
aplicada, cada tentativa contra a linha real:

```
seed: as quatro rotinas, com o intervalo dos quatro railway.json de hoje e next_run_at já vencido
  fuel.price.pull 604800 · nfe.distribution.pull 900 · nfse.status.pull 300 · notification.schedules.run 3600

recusou intervalo abaixo da batida               job_schedules_interval_check
recusou pausa sem autor                          job_schedules_pause_check
recusou manual sem quem pediu                    job_executions_requester_check
recusou encerrada sem desfecho                   job_executions_finish_check
recusou segunda execução aberta da mesma rotina  job_executions_open_unique
recusou encerrada segurando lease                job_executions_lease_check
após abandono, a rotina volta a correr: ok
```

A última linha é a que importa para a decisão 11: fechar a execução com `outcome: 'abandoned'` e
soltar o lease libera o índice, e a rotina volta a aceitar ciclo. O bloqueio eterno do `409` não
existe porque a linha sabe expirar.

**O predicado do índice é `finished_at is null`, não o lease.** `now()` não é imutável e o Postgres
recusa a função em predicado de índice. Então o banco garante *uma execução aberta por rotina*, e
quem decide se a aberta ainda está viva é `lease_expires_at`, lido pela consulta — a varredura de
abandono é que fecha a linha vencida e devolve a vaga.

**Gate.** `bun run --cwd apps/api-transportada test` → 2893 pass · 15 skip · 0 fail.
`typecheck`, `lint` e `format:check` limpos nos arquivos desta task.
