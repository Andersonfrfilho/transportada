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

## T3 — a batida, e o relógio que a tela lê

**O cron perdeu `CRON_JOB` e virou um processo só.** `src/tick/tick.job.ts` é o novo ponto de
entrada do ciclo: abre a conexão com o broker, pega o advisory lock, lê `job_schedules`, publica em
`job-run.v1` cada rotina com `next_run_at <= now()` e avança a janela dela. `src/job-registry.ts` foi
apagado, e com ele a variável que escolhia qual das quatro rodava. Aceite em
`test/tick/selects-due.contract.ts` e `test/tick/advances-window.contract.ts`.

**A variável tinha três empregos, e cada um ganhou substituto próprio.** Como chave do advisory lock,
virou a constante de domínio de cada rotina (`FUEL_PRICE_PULL_JOB`, `DISTRIBUTION_PULL_JOB`,
`NFSE_STATUS_PULL_JOB`, `NOTIFICATION_SCHEDULES_JOB`). Como `traceStack` do log, virou
`CRON_STACK_NAME = 'tick'` — o nome da rotina viaja na linha, não no cabeçalho, porque uma batida
publica as quatro. Como seletor de bloco de ambiente, virou a **presença** da variável que abre o
bloco: `NFSE_PROVIDER_BASE_URL` vazia deixa a rotina de NFS-e não configurada em vez de derrubar o
boot.

**`RABBITMQ_URL` e `QUEUE_PREFIX` passaram a ser obrigatórios.** A batida sempre publica, então um
cron que não alcança a fila não tem o que fazer — falhar no boot é melhor que abrir execução que
ninguém consome. Consequência: o broker deixou de servir como sinal de presença do trilho de aviso,
que agora é decidido só pela chave de supressão (`test/notification-schedules/environment.contract.ts`).

**Quatro serviços viraram um.** A matriz do `deploy.yml` é `[worker, cron]`, `deploy/cron-nfse/`,
`deploy/cron-notifications/` e `deploy/cron-fuel/` foram apagados, e o `cronSchedule` de
`deploy/cron/railway.json` passou de `*/15` para `*/5 * * * *` — é o piso de granularidade, não mais
a cadência. `test/deploy/cron-services.contract.ts` falha se algum dos três serviços aposentados
voltar ao disco, e `api/test/deploy/service-naming.contract.ts` desceu de oito serviços publicados
para cinco. O manifesto de referência do k8s virou `deploy/cron/tick.cronjob.yaml`.

⚠️ **O guarda de deploy de `cron-nfse` só em production (ADR-0035) morreu com o serviço.** Enquanto o
trilho de NFS-e ainda mora no cron (até T7), quem o desliga em staging é o `NFSE_PROVIDER_BASE_URL`
vazio, que faz a rotina nascer não configurada. Quando o trilho for para o worker — que publica nos
dois ambientes — a postura precisa ser dita de novo.

**O espelho em texto do `cronSchedule` saiu.** `SCHEDULED_DISTRIBUTION_CRON`,
`scheduled-distribution-window.policy.ts` e `test/companies/scheduled-distribution-window.contract.ts`
foram apagados. A tela mostrava o "próximo ciclo automático" resolvendo uma expressão de cron copiada
à mão do `railway.json`: espelho não observado é espelho que mente, e mudar o tique no painel sem
mudar a variável mostrava ao operador uma data que nunca chegava. Hoje o instante vem de
`job_schedules.next_run_at`, escrito pela própria batida ao publicar — a mesma linha que decide o
ciclo é a que a tela lê.

**A próxima execução passou a ser anulável, ponta a ponta.** `nextScheduledRunAt` é
`string | null` no corpo servido, porque **rotina pausada não tem próxima**: o relógio guarda o
`next_run_at` de quando ela parou, e repeti-lo prometeria um ciclo que não vem. A consulta nova em
`DrizzleScheduledDistributionStatusRepository` não leva `company_id` — o relógio é da instalação, e a
exceção de tenant está declarada no schema da tabela desde a T1. No frontend o guarda de chaves
exatas aceita `null` e os dois painéis dizem `scheduled.paused` no lugar da data; sem isso a tela
inteira cairia em erro com a API respondendo 200, que é a falha que este produto já viu.

**Gate.** Suítes completas das quatro apps:

```
api       2883 pass · 15 skip · 0 fail
worker     495 pass ·  0 fail
cron       230 pass ·  0 fail
frontend  1768 pass ·  0 fail
```

`typecheck`, `lint` e `format:check` limpos.
