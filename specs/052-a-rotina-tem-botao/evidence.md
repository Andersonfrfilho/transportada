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
recusa a função em predicado de índice. Então o banco garante _uma execução aberta por rotina_, e
quem decide se a aberta ainda está viva é `lease_expires_at`, lido pela consulta — a varredura de
abandono é que fecha a linha vencida e devolve a vaga.

**Gate.** `bun run --cwd apps/api-transportada test` → 2893 pass · 15 skip · 0 fail.
`typecheck`, `lint` e `format:check` limpos nos arquivos desta task.

## T2 — o catálogo das quatro rotinas

**Vermelho antes do verde.** O contrato da API foi escrito e rodado antes do arquivo existir:

```
$ bun test ./test/job-catalog.contract.test.ts
error: SyntaxError: Export named 'JOB_TICK_INTERVAL_SECONDS' not found in module
       '.../src/shared/job-catalog.constant.ts'
```

Depois da implementação: **13 pass · 0 fail · 134 expect()**.

**As três cópias mordem — conferido por divergência deliberada, não por diff de texto.** Como o
worker, o cron e o frontend receberam a cópia depois de a API já existir, os contratos deles nunca
teriam sido vistos vermelhos por acidente. Troquei `anp_week_not_published` por
`anp_semana_nao_publicada` nas três cópias, uma de cada vez:

```
worker    → 4 pass · 2 fail   (toEqual mostrando a palavra trocada)
cron      → 4 pass · 2 fail
frontend  → 4 pass · 2 fail
```

As três voltaram do `.bak` e ficaram verdes. O frontend foi conferido rodando pelo entrypoint que o
`package.json` de fato executa — `bun test ./test/shared.contract.test.ts -t "job catalog"` → 6 pass,
152 filtrados —, porque teste registrado no arquivo errado não roda e passa despercebido.

**Duas coisas que a spec não dizia e o código precisou dizer.**

`JOB_MAXIMUM_INTERVAL_SECONDS` (noventa dias) não estava no §5. Sem teto, o campo de período vira um
segundo jeito de desligar rotina — e a decisão 12 exige que rotina parada se anuncie com desde quando
e por quem. Um "intervalo de um ano" não se anuncia: o cartão continuaria dizendo "próxima janela",
e a data estaria em 2027. O teto é o que obriga quem quer parar a rotina a usar o controle que deixa
rastro.

`unexpected_error` entrou no vocabulário de invólucro, ao lado de `succeeded`, `cancelled` e
`abandoned`. Sem ele, erro fora do mapa deixaria a linha **sem `finished_at`** — que é exatamente a
morte silenciosa que esta spec existe para acabar. O pouso do imprevisto é o que garante que toda
execução termina escrita.

**A coluna `outcome` continua sem CHECK, de propósito.** Uma coluna serve as quatro rotinas, e um
CHECK sobre a união aceitaria `anp_unreachable` numa execução de notificação — migration a cada
palavra nova sem impedir o único erro que importa. Quem guarda o vocabulário por rotina é
`isJobOutcome({ job, outcome })`, que sabe de qual rotina o código é.

**O piso de cada rotina, e por quê.** `fuel.price.pull` em um dia: ANP publica por semana e ANEEL por
vigência, os dois serviços públicos e sem contrato — bater neles de cinco em cinco minutos é abuso
sem ganho. As outras três na batida (300s): a distribuição fora de janela é no-op recusada por
`cooldown_active` antes de qualquer chamada externa, a NFS-e é provedor contratado, e
`notification.schedules.run` só publica na nossa própria fila.

**O piso do banco derivou do catálogo.** `JOB_SCHEDULE_MINIMUM_INTERVAL_SECONDS` deixou de repetir
`300` e passa a ser `JOB_TICK_INTERVAL_SECONDS`. O SQL da migration mantém o literal — migration
congelada não segue constante. O contrato assevera a igualdade dos dois, e ainda lê o
`20260823175600_job_schedule_registry/migration.sql` para conferir que **cada intervalo já semeado**
cabe entre o piso da sua rotina e o teto.

**Gate.** Suítes completas das quatro apps:

```
api       2906 pass · 15 skip · 0 fail
worker     495 pass ·  0 fail
cron       221 pass ·  0 fail
frontend  1755 pass ·  0 fail
```

`typecheck`, `lint` e `format:check` limpos nos arquivos desta task.
