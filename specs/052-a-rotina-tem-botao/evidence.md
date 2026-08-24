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

## T4 — o trilho `job-run.v1` no worker

**O trilho nasceu com as três filas de sempre.** `src/messaging/job-run-rabbitmq-topology.ts` produz
`${QUEUE_PREFIX}.job-run.v1.{main,retry,dead}.{exchange,queue}`, com `delayMs` de 60s e três
tentativas — cópia por valor da topologia que o cron publica, e `test/job-run/topology.contract.ts`
é quem guarda que os dois lados nomeiam a mesma fila. O envelope é
`src/messaging/job-run-envelope.schema.ts`, `strictObject` versionado como todos os outros:
`executionId`, `job` do catálogo e `origin`. Aceite em `test/job-run/envelope.contract.ts`.

⚠️ **Desvio do `tasks.md`: a idempotência não é por `processed_messages`.** A task pedia essa tabela,
e ela não serve: `processed_messages.company_id` é `uuid not null`, enquanto execução de
`origin: 'schedule'` **não tem empresa** — quem a torna obrigatória é o
`job_executions_requester_check`, e só para `origin: 'manual'`. Uma coluna de empresa inventada para
caber na tabela seria tenant fabricado dentro do trilho que menos precisa dele.

Quem guarda a repetição é a **própria linha da execução**, por `UPDATE` condicional:
`DrizzleJobExecutionRepository.claim` só escreve o lease onde `finished_at is null` **e** o lease
está vencido ou ausente, e devolve `{job, origin}` por `returning`. Sem linha devolvida, a mensagem é
redundante — ou a execução já terminou (reentrega), ou outro worker segura um lease vivo — e o
consumidor dá `ack` com log em vez de trabalhar duas vezes. É o mesmo padrão da liquidação de NFS-e:
quem decide a transição é o banco, projetando o estado de origem no `where`. O `finish` fecha pelo
mesmo recorte, então terminar duas vezes não sobrescreve o primeiro desfecho. Aceite nos sete testes
de `test/job-run-execution.integration.test.ts`.

**Quem escolhe a rotina é a linha do banco, não o envelope.** `runJobCycle` roda com o `job` que o
`claim` devolveu, não com o que veio na mensagem: o envelope é pedido, a linha é fato, e um envelope
adulterado rodaria a rotina errada sobre uma execução que diz outra coisa.

**O invólucro não deixa linha sem `finished_at`.** Rotina ausente do registro, rotina que lança, e
`outcome` fora do vocabulário da rotina (`isJobOutcome`) — os três pousam em `unexpected_error` com
`finished_at` escrito. No terceiro caso os `counters` da rotina são **preservados**: o desfecho é
nosso erro de vocabulário, e o que ela contou continua verdadeiro. O log de falha leva só
`error.name`; a mensagem de exceção pode carregar corpo de terceiro.

**`correlationId` não vai para o log.** `extractMessageKey` do consumidor extrai só `eventId` e
`executionId` do corpo indecifrável — o `correlationId` é texto que atravessa a fronteira, e log de
mensagem morta não é lugar de conteúdo não validado. Decode que falha é dead-letter com
`job_run_envelope_decode_failed` e os códigos/caminhos do Zod, teto de 480 caracteres.

**O consumidor entrou na runtime como todos os outros.** `startJobRunConsumer` é injetável por
`WorkerRuntimeDependencies`, tem provider próprio no `createCloseableGroup` e posição fixa na ordem
de dreno — os dois contratos de runtime que assertam a ordem exata foram atualizados, e é por eles
que um consumidor esquecido no shutdown falha o gate. Ele subiu com `routines: {}`: as quatro rotinas
chegam uma por vez, e até cada uma chegar a mensagem dela pousa em `job_run_routine_missing`. ⚠️ Foi
esse vazio que parou a busca automática de notas em produção — o T8, abaixo, é o registro da
primeira rotina real e o fim daquela parada.

⚠️ **Renovação de lease é do T4b, de propósito.** `JOB_RUN_LEASE_SECONDS` é 30, o mesmo do outbox
relay, e nada o renova enquanto o ciclo corre. Com `routines: {}` nenhum ciclo leva tempo mensurável,
então o teto curto não morde no intervalo; assim que a primeira rotina real chegar (T5), a renovação
e a varredura de `abandoned` do T4b passam a ser pré-requisito, não melhoria.

**Gate.** Suíte do worker e a integração, que é o que o T4 tocou:

```
worker                    517 pass ·  0 fail  (61 arquivos)
make worker-integration    46 pass ·  0 fail  (11 arquivos)
job-run-execution           7 pass ·  0 fail  (banco migrado descartável)
```

`typecheck` e `lint` limpos nas quatro apps.

## T4b — o lease que se renova, a parada que é pedida e a linha que ninguém corre

**O invólucro renova, a rotina não sabe disso.** Quem bate é `startLeaseHeartbeat`
(`job-run/application/lease-heartbeat.ts`), montado por `runJobCycle` antes de `routine.run` e
desligado no `finally` — a rotina recebe um `isStopRequested()` no contexto e mais nada. Pôr a
renovação em cada rotina significaria escrever a mesma batida quatro vezes e esquecê-la na quinta.

`JOB_RUN_LEASE_RENEWAL_SECONDS` é 10, **exatamente um terço** de `JOB_RUN_LEASE_SECONDS` — a razão
é asserção de contrato, não coincidência: com um terço cabem duas batidas perdidas antes de o lease
vencer, e é isso que separa uma pausa de GC de um processo morto.

⚠️ **Renovar sem saber qual lease é o nosso seria roubá-lo de volta.** `renew` leva
`expectedLeaseExpiresAt` no `where`, o valor que **este** processo escreveu por último. Sem ele, um
worker que travou, viu o lease vencer e teve a linha reivindicada por outro voltaria a empurrar o
prazo — e os dois correriam a mesma rotina achando que a têm. Com ele, a renovação do processo
atrasado devolve `undefined`, o batimento marca `job_run_lease_lost`, e o `finish` condicional do T4
recusa a escrita: a linha fica como o novo dono a deixar.

**Renovação e releitura da parada são a mesma ida ao banco.** É a mesma linha; um `select` separado
por batimento dobraria o tráfego, e ler `cancel_requested_at` por unidade custaria uma consulta por
empresa. O `UPDATE ... RETURNING` devolve as duas coisas, e `isStopRequested()` lê o que o último
batimento trouxe — defasagem de no máximo 10s, cobrada num limite de unidade.

**Parar é no limite da unidade, nunca no meio.** `cooperative-cancel.contract.ts` corre quatro
estados e dispara o pedido entre o segundo e o terceiro: para com `['SP','MG']` gravados,
`outcome: 'cancelled'`, `counters: {statesWritten: 2}` — o que a unidade anterior escreveu
**permanece**. A unidade em voo termina; parar no meio dela deixaria metade. E parada não apaga
falha: rotina que já ia devolver `anp_unreachable` devolve `anp_unreachable`, e vocabulário
desconhecido continua vencendo tudo com `unexpected_error`.

**Lease perdido e parada pedida dizem a mesma coisa para a rotina.** Os dois acendem
`isStopRequested()`: largar o que ainda não começou. O que os separa é o desfecho — parada pedida
vira `cancelled`, lease perdido devolve o desfecho da rotina intacto, porque a linha já não é nossa
e quem decide o que ficou gravado é o dono novo.

**A varredura mora na batida, e corre antes de `listDue`.** `abandonExpired` é o primeiro membro de
`JobSchedulePort` e a primeira chamada dentro do lock. A ordem é o contrato: varrer depois de ler o
que venceu publicaria zero e travaria a rotina por mais uma janela, porque
`job_executions_open_unique` recusa a execução nova enquanto a linha morta estiver de pé. O teste
prova a ordem pelo efeito — lease vencido é abandonado **e** a rotina publica na mesma batida.

⚠️ **A varredura recolhe duas mortes, e a segunda é acréscimo deliberado ao texto da task.** A task
pede a execução de lease vencido. A outra é a linha aberta **sem lease nenhum**: o relógio insere
sem lease (quem reivindica é o worker), então uma mensagem que morreu no caminho — dead-letter
depois das três tentativas do trilho — deixa uma linha que ninguém jamais vai reivindicar, e nenhum
lease jamais vai vencer nela. Sem esse segundo braço a rotina ficaria travada para sempre e o botão
manual recusaria com 409 sem nada correndo: exatamente a morte calada que esta spec existe para
fechar, e a varredura é o único lugar que a enxerga. O prazo é
`JOB_EXECUTION_PICKUP_GRACE_SECONDS`, 900s — quinze minutos, onde cabem três batidas de cinco
minutos mais as três tentativas do trilho, com folga.

**A varredura não tem `company_id` e não deveria ter.** Ela recolhe execução de qualquer origem, e
`origin: 'schedule'` não tem empresa por `job_executions_requester_check`. O que a torna segura é o
advisory lock: sem ele não se varre nada — duas instâncias abandonando a mesma linha é corrida —, e
o contrato fixa o resultado inteiro de batida sem lock em zeros.

**A SQL do `or(and(…))` foi medida contra Postgres**, em banco descartável migrado, com as quatro
linhas que importam abertas ao mesmo tempo:

```
abandonedCount: 2
fuel.price.pull            lease vencido há 1s          → abandoned, finished_at gravado, lease nulo
nfe.distribution.pull      sem lease, 900s de aberta    → abandoned, finished_at gravado, lease nulo
nfse.status.pull           lease vivo por mais 20s      → intacta
notification.schedules.run sem lease, 60s de aberta     → intacta
```

Os três CHECKs da tabela aceitaram a escrita: `finish_check` (desfecho e `finished_at` juntos),
`lease_check` (linha encerrada não segura lease) e o vocabulário `abandoned`.

**Um teste antigo dizia "ainda correndo" sem lease nenhum.**
`advances-window.contract.ts` abria a execução 20 minutos antes do `now` e a chamava de rotina em
curso — com a varredura no lugar, ela passou a ser recolhida. O teste não estava errado por acaso:
correr de verdade é segurar lease vivo, e agora ele segura. É a diferença entre o worker morto e o
worker ocupado, que antes desta task não existia em lugar nenhum.

**O batimento é injetado, não cronometrado.** `runJobCycle` aceita `scheduleInterval`, e só os
testes o passam — o duplo captura o callback e `beat()` o aguarda, então uma rotina de teste dispara
o batimento **entre** duas unidades e prova o limite. Com temporizador falso a asserção seria sobre
o relógio; assim é sobre a ordem.

**Gate.** Worker, cron e a integração:

```
worker                    531 pass ·  0 fail  (61 arquivos)
cron                      238 pass ·  0 fail  (10 arquivos)
make worker-integration    50 pass ·  0 fail  (11 arquivos)
job-run-execution          11 pass ·  0 fail  (banco migrado descartável)
```

As quatro novas do `job-run-execution` são a renovação contra Postgres — 46 → 50 na integração é a
prova de que rodaram, e não caíram em `describe.skip` por falta de `DATABASE_URL`.
`typecheck` e `lint` limpos nas quatro apps.

## T8 — a distribuição nasce da batida

**Esta task fechou uma parada em produção, não uma lacuna de roadmap.** Com a release da 052 no ar
(staging `375e4c6`, produção `c99db03`), o cron virou batida de cinco minutos e a execução passou
para o worker — que subiu com `routines: {}`. Cada janela de `nfe.distribution.pull` reivindicava a
linha, não achava rotina, registrava `job_run_routine_missing` e a encerrava como `unexpected_error`.
A busca automática de NSU parou aí.

⚠️ **O que parou foi o gatilho, e só ele.** `nfe-distribution-consumer.service.ts` seguia consumindo
`nfe-distribution.v1`, o relay seguia entregando e o botão de `POST /nfe-imports/distribution`
seguia funcionando — o que faltava era quem publicasse sem alguém clicar. Como o cursor da SEFAZ é
por NSU, a nota não se perde enquanto ninguém puxa: ela espera. A parada custou **atraso**, não
documento.

**O registro é uma linha só, e é o `routines: {}` que sai.** `src/main.ts` passou a compor
`{[DISTRIBUTION_PULL_JOB]: createNfeDistributionPullRoutine({gateway, identifiers, logger, now,
source})}` com os três adaptadores da fatia (`drizzle-distribution-candidate.source.ts`,
`drizzle-distribution-enqueue.gateway.ts`, `crypto-identifiers.ts`). A rotina não fala com a SEFAZ:
ela seleciona empresa elegível e enfileira `source: 'distribution'` · `triggeredBy: 'automation'` na
`processing_outbox`, reusando o relay e o consumidor que já existiam.

**A trava contra o `cStat 656` mora no cursor, não no agendador.** É
`nfe_distribution_cursors.next_allowed_at`, por `(company_id, environment)` — a NT 2014.002 §3.11.4
bloqueia o **CNPJ** por uma hora em consumo indevido, e quem sabe quando a janela reabre é a última
resposta da SEFAZ, não o relógio do painel. Consequência aritmética: com batida de cinco minutos,
onze de cada doze janelas são recusadas por `cooldown_active` **antes de qualquer chamada**, e sobra
no máximo uma ida real por hora por CNPJ. Bater de cinco em cinco minutos é seguro justamente
porque a decisão não é do agendador.

**A cadência não é configuração:** `DISTRIBUTION_CADENCE_MINUTES` é
`JOB_MINIMUM_INTERVAL_SECONDS[DISTRIBUTION_PULL_JOB] / 60`, cinco. Ela é o balde da chave de
idempotência (`<job>:<ambiente>:<empresa>:<instante do balde>`), então duas batidas do mesmo balde
não abrem duas importações, e ambiente diferente tem chave diferente — cursor próprio, e uma chave
só pularia NSU de um lado.

⚠️ **O ambiente fiscal aqui é por empresa.** Ele vem de `company_fiscal_profiles.environment`: o
worker não tem `FISCAL_ENVIRONMENT` e o envelope de `job-run.v1` não carrega ambiente. Por isso a
junção do cursor é escopada pelo ambiente do perfil — ler o do outro ambiente devolveria a espera
errada, que é caminho direto para o `cStat 656`. Empresa sem perfil fica de fora com
`nfe_distribution_pull_company_without_fiscal_profile`, e **não** ganha uma oitava razão de
inelegibilidade: o vocabulário das sete é contrato do painel, e inventar termo aqui faria o cartão
contar história que a API não conta.

**O certificado é o de CT-e, e essa é a única correção de comportamento em relação ao cron.** A
pré-filtragem do cron juntava `digital_certificates` **sem filtrar propósito**, enquanto quem assina
a distribuição abre o envelope de `purpose = 'cte'`. Com os dois propósitos ativos por empresa, isso
aprovava empresa pelo certificado de MDF-e e falhava na assinatura — ou a recusava por um vencimento
que a distribuição nunca usaria. O valor virou `NFE_DISTRIBUTION_CERTIFICATE_PURPOSE` em
`src/shared/nfe-distribution.constant.ts`, um lugar para os dois lados olharem a mesma linha. O
defeito latente não foi portado.

**A consulta de candidatos ganhou teste contra Postgres de verdade**
(`test/nfe-distribution-candidate-source.integration.test.ts`), e não por zelo: ela é uma junção de
cinco `left join` sobre tabelas que o worker só **copia**, e coluna renomeada na API passa pelo
typecheck deste lado para falhar calada no ciclo — a mesma classe de defeito que produziu esta
parada. Quatro empresas semeadas provam cinco coisas: a elegível reúne os cinco fatos numa linha; a
espera lida é a do ambiente do perfil e não a do outro (há duas linhas de cursor, e a de
`homologation` está fechada por dez anos); ausência no join chega como ausência e não como linha a
menos; certificado de MDF-e não faz as vezes do de CT-e; e empresa sem perfil fica fora **com** o log
que diz por quê.

**O tipo do vocabulário não é `string`.** `enqueue-distribution.port.ts` declara os campos como
`typeof CONSTANT`, espelhando o cron: coluna narrada por `$type` não aceita `string`, e afrouxar o
port para o insert compilar é abrir a porta para gravar palavra que a tabela não conhece.

**Parada pedida no meio das empresas devolve `succeeded`.** Quem traduz parada em `cancelled` é o
invólucro do T4b, e só de cima disto — a rotina reporta o que gravou, e o que a empresa anterior
enfileirou permanece.

**Nenhuma migration é devida**, conferido coluna por coluna: cada edição de schema no worker é cópia
do que a API já versiona — `digital_certificates.valid_from`/`expires_at` e o estreitamento de
`status`, `companies.status`, os seis `default` de `processing_outbox`,
`company_distribution_settings` inteira e `nfe_distribution_cursors.next_allowed_at`. Isso importa
porque o gate local não roda `test:integration` (pede Docker): schema Drizzle sem a migration dele
passa aqui e só quebra no CI.

⚠️ **A fatia do cron continua sem chamador**, como as outras três — o `nfe-distribution-pull/` de lá
não é apagado nesta task, e a paridade das duas cópias segue guardada pelos contratos dos dois
lados. Remover a fatia é o rabo da mudança, quando a última rotina pousar no worker.

⚠️ **O aceite listado no `tasks.md` para o T8 é `test/nfe-workspace/job-run-latest.contract.ts` —
frontend**, fora do escopo de worker + cron que combinei nesta parada. Ele **não** foi escrito. O que
existe deste lado são as duas suítes de contrato (`job-run/nfe-distribution-eligibility.contract.ts`
e `job-run/nfe-distribution-pull.contract.ts`) mais a integração acima; o cartão da última execução
na tela segue pendente.

**Gate.** Worker e a integração, que é o que o T8 tocou:

```
worker                    554 pass ·  0 fail  (61 arquivos)
make worker-integration    55 pass ·  0 fail  (12 arquivos)
```

50 → 55 na integração é a prova de que as cinco novas rodaram, e não caíram em `describe.skip` por
falta de `DATABASE_URL`. `typecheck` e `lint` limpos.

## T7 — `nfse.status.pull` no worker

**A rotina existia sem chamador, e agora tem um.** `nfse-status-pull/application/nfse-status-pull.routine.ts`
segue o molde da distribuição: `CycleTally`, contadores sempre com `eligible`/`failed`/`settled`/`skipped`
e as razões não-zeradas ao lado. Duas divergências deliberadas, escritas no cabeçalho do arquivo — esta
rotina **processa** em vez de enfileirar, e o catálogo dela não nomeia razão de inelegibilidade, então
ciclo vazio é `succeeded`, não um código que `isJobOutcome` recusaria.

**As cinco cópias por valor do cron não vieram.** Dentro de uma app não há fronteira que as
justifique: `nfse-issuance/` já publica o cliente da Nota RP, o serviço de credencial (superset — ele
devolve também o `callbackToken`), a política de payload e as tabelas. A infraestrutura nova é a
mínima que faltava — o repositório Drizzle, a query de ordenação, o arquivamento no bucket e
`nfse-fiscal-status.gateway.ts`, que traduz o `NotaRpStatusOutcome` plano do cliente na união
discriminada do domínio. Consequência: **o `nota-rp-parity.contract.ts` worker × worker do `tasks.md`
não foi escrito, porque não há duas implementações para casar.** O AAD segue idêntico ao que selou:
`transportada:nfse-credential:v1:${companyId}:${credentialId}`, herdado do serviço da emissão.

**O aviso de rejeição ficou de fora.** O `nfse-rejection-notifier.gateway.ts` depende de
`notification-schedules/`, que é o T6 e ainda não se mudou; a porta `notifier` do
`ReconcileInvoiceUseCase` é opcional exatamente para isto, e a reconciliação fiscal roda calada. As
duas linhas de catálogo de notificação que a sessão anterior tinha acrescentado no worker foram
revertidas — chave de template sem consumidor é código morto.

⚠️ **O worker ganhou `FISCAL_ENVIRONMENT`** (`homologation` | `production`, padrão `production`),
porque a seleção de nota devida casa a linha de `nfse_provider_credentials` por ambiente e o envelope
de `job-run.v1` não o carrega. **Instalação de homologação tem de declarar a variável no painel** —
esquecê-la não quebra nada visível: a consulta simplesmente não acha nota. `.env.example` e o
`tick.cronjob.yaml` já a declaram como `homologation`.

**Sem `NFSE_PROVIDER_BASE_URL` a rotina não morre**: cada nota é adiada como
`provider_not_configured`, e o segredo nem chega a ser aberto.

**Gate.**

```
worker                    571 pass ·  0 fail
make worker-integration    55 pass ·  0 fail  (12 arquivos)
```

`typecheck`, `lint` e `format` limpos na raiz.

### T7 (h) — a fatia do cron foi apagada, e o bloco de configuração dela foi com ela

Ao contrário da distribuição, aqui a fatia **não** ficou parada esperando a última rotina pousar. O
motivo é o bloco de configuração: manter `nfse-status-pull/` no cron obrigava o schema de ambiente a
continuar exigindo chaveiro (`ENCRYPTION_ACTIVE_KEY_ID`, `ENCRYPTION_KEYRING_JSON`), bucket
(`STORAGE_*`) e endereço de prefeitura (`NFSE_PROVIDER_BASE_URL`, `NFSE_PROVIDER_TIMEOUT_MS`) no boot
de uma app onde **nada mais os lê**. Segredo cobrado no boot para rotina que não roda é convite a
resto de configuração no painel.

O que saiu do `cron-transportada`:

- as cinco cópias por valor (`infrastructure/nota-rp-v2.client.ts`, `.../nfse-fiscal-gateway.ts`,
  `domain/nfse-document-payload.policy.ts`, `application/nfse-credential-secret.service.ts`,
  `src/database/nfse-reconciliation.schema.ts`) mais `config/cryptographic-configuration.schema.ts`,
  o parser de chaveiro, e `test/nfse-status-pull/` inteiro — inclusive o
  `nota-rp-parity.contract.ts` que o `tasks.md` prometia converter em worker × worker. Com uma
  implementação só não há paridade a guardar: **o contrato que sobrevive é
  `worker/test/nota-rp-v2-client.contract.test.ts`**, e a varredura de `no-bearer` perdeu a segunda
  cópia junto.
- `nfseStatusPull` do `CronEnvironment`, `resolveNfseStatusPullEnvironment` do schema e o guarda de
  `NFSE_PROVIDER_BASE_URL_HOMOLOGATION`/`_PRODUCTION` — este último mudou para o worker, única app
  que ainda fala com a Nota RP.
- `@adatechnology/object-storage-provider` e `@adatechnology/secret-envelope` do `package.json`
  (nenhum importador restante, verificado por varredura); `bun install` na raiz podou exatamente duas
  linhas do `bun.lock`, sem outro movimento.
- o `NFSE_SETTINGS` do `test/notification-schedules/environment.contract.ts` e o teste que o usava —
  com as chaves fora do schema, ele já não afirmava nada.

O que **fica** no cron de propósito: `src/shared/job-catalog.constant.ts` continua nomeando
`nfse.status.pull` (é o vocabulário do relógio, não da rotina) e `FISCAL_ENVIRONMENT` continua
exigido, porque a fatia já órfã da distribuição ainda o lê.

`docs/spec/railway.md` e o `CLAUDE.md` foram atualizados: **nenhuma variável nova foi provisionada** —
o worker já abria envelope selado e arquivava documento fiscal para _emitir_ nota —, e as que saíram do
schema da cron podem ser removidas do painel dela, nunca do worker.

**Gate.**

```
cron                      153 pass ·  0 fail  (410 expects · 9 arquivos)
worker                    615 pass ·  0 fail  (1470 expects · 62 arquivos)
make worker-integration    55 pass ·  0 fail  (196 expects · 12 arquivos)
```

`typecheck` e `lint` limpos nas duas apps; `format:check` limpo na raiz.

## T8 — o botão da puxada de emergência vira linha de `job_executions`

A janela agendada já registrava; o botão que sempre existiu, não. Quem olhasse a aba **Remota** via
"última puxada" e nada sobre o ciclo — e a linha manual, que é a que o operador provoca, não existia
em lugar nenhum.

**Como o caminho manual fecha a linha.** `request-nfe-import.use-case.ts` grava a execução **já
fechada** (`startedAt = finishedAt`, `outcome: 'succeeded'`, `origin: 'manual'`, `requestedBy` do
contexto autenticado) dentro da mesma transação que salva o outbox, e só quando
`source === 'distribution'` — upload não é rotina. Fechada, e não aberta, porque o trabalho da API
termina no commit: o que corre depois é o consumidor de `nfe-distribution.v1`, que tem trilho
próprio. Isso também é o que dispensa o `409`: o índice parcial `job_executions_open_unique` só
constrange linha **aberta**. O clique reagenda a janela — `next_run_at = now() + interval` —, como a
spec pede.

**Como a tela lê.** `GET /nfe-imports/distribution` passou a devolver `lastRun` ao lado de `cursor` e
`scheduled`, servido por `createGetLastJobRunUseCase`. A leitura é escopada por
`company_id is null OR company_id = <chamador>`: o ciclo agendado não tem empresa, e ler a linha
manual de **outra** empresa contaria à instalação vizinha que alguém ali apertou o botão.

No frontend o desfecho é conferido contra o vocabulário **desta** rotina (`isJobOutcome`), não contra
a união das quatro — a coluna é uma só, e um `anp_unreachable` numa execução de distribuição é
resposta errada, não desfecho desconhecido. `NfeDistributionControl` ganhou a linha da última
execução, com origem e desfecho traduzidos nos dois catálogos.

**Gate.**

```
api        2888 pass · 0 fail  (118 arquivos)
frontend   1799 pass · 0 fail  (18 arquivos)
```

`typecheck`, `lint` e `format:check` limpos nas quatro apps.

## T6 — `notification.schedules.run` no worker, e a falha ganha nome

`worker/test/job-run/notification-schedules.contract.ts` — 10 pass · 0 fail · 30 expect().

**Por que a rotina não é um `for` sobre `createNotificationSchedules`.** Duas divergências do que o
cron fazia, e as duas estão no contrato:

- **Schedule que cai não derruba a fila de schedules.** O ciclo roda os dois (`dispatch-due` e
  `purge-expired`) e só depois decide o desfecho; parar no primeiro deixaria a purga de fora toda
  vez que a entrega tropeçasse. Entre um e outro o ciclo respeita `isStopRequested()` — o que não
  começou fica para a janela seguinte, e a linha fecha `succeeded`.
- **A classificação é por causa tipada, nunca por semelhança de mensagem.** O contrato afirma o
  contrário do atalho: `new Error('queue unreachable')` continua `unknown` → `unexpected_error`.
  Quem nomeia o broker é `createGuardedNotificationQueue`, decorador que envolve **só** o `enqueue`
  da fila que o módulo já usa e converte a falha em `NotificationQueueUnreachableError`; `consume` e
  `close` passam intactos. `template_missing` vem do código estável
  `NOTIFICATION_TEMPLATE_NOT_FOUND` que `sendNotification` levanta na varredura — dentro do
  `dispatchDueNotifications` o template ausente **não lança**, vira `errorCode` da entrega, e por
  isso não há o que classificar ali.

**Aqui a falha domina, ao contrário de `nfse.status.pull`.** Na fiscal o trabalho feito vence: nota
liquidada é resultado, e o que ficou pendente volta na próxima. Aqui um ciclo que avisou metade das
faturas precisa mostrar isso — a outra metade não tem segunda janela antes do vencimento. A ordem é
`['template_missing', 'queue_unreachable']`: o que o operador conserta sozinho vence o que o tempo
conserta.

**O que o worker ganhou.** `notification-schedules/` com a rotina, a varredura de fatura a vencer
(que, ao contrário da do cron, **não engole** falha — devolve `failures[]`), a query de
`billing_invoices` e a política de causas; `BILLING_INVOICE_DUE` no catálogo de templates com os
lugares `dueDate` e `invoiceNumber` — **sem valor e sem cliente**, o gatilho carrega referência.
`main.ts` registra a terceira entrada do `JobRoutineRegistry`.

**O que saiu do cron.** `src/notification-schedules/**`, as três suítes, a entrada do
`package.json`, o bloco `notificationSchedules` de `cron.types.ts`/`environment.schema.ts` com
`NOTIFICATION_SUPPRESSION_HMAC_KEY` — e as duas dependências de notificação, que nenhum arquivo da
app importa mais.

**Gate.**

```
worker   625 pass · 0 fail  (62 arquivos)
cron     101 pass · 0 fail  (7 arquivos)  ·  typecheck limpo
```

⚠️ Na hora do commit o `worker typecheck` estava **vermelho**, e não por causa do T6: a fatia
`fuel-price-pull` do T5 já estava movida no índice do git e ainda não religada. Fechou com o T5,
abaixo — hoje o typecheck do worker está limpo.

## T5 — `fuel.price.pull` no worker, e a agência mora onde a coleta acontece

**Aceite antes da implementação.** `worker/test/job-run/fuel-price-cycle.contract.ts` — 21 pass, 0
fail. Ele reproduz o que o contrato do cron produzia e acrescenta o vocabulário da §6: as duas
metades correm na mesma execução, cada uma falha por conta própria, e a **linha fecha como falha**
se qualquer uma cair — meia série gravada é tela com preço sem dizer que está incompleta. Entre as
metades há `isStopRequested()`: parada pedida encerra `succeeded` sem começar a segunda.

**A regra não mudou uma linha.** Os vinte e três arquivos de `fuel-price-pull` (domínio, portas,
use cases, clientes HTTP, leitor de XLSX, os dois gateways Drizzle) e os sete arquivos de teste
foram `git mv` do cron para o worker. O que nasceu novo são dois: a rotina
(`application/fuel-price-pull.routine.ts`) e a tradução da falha
(`domain/fuel-price-pull-failure.policy.ts`), com `FUEL_PRICE_PULL_FAILURE_OUTCOMES` =
`anp_malformed_workbook · aneel_empty_slice · anp_week_not_published · anp_unreachable ·
aneel_unreachable`. Dezenove códigos de erro mapeados; transporte é reconhecido pelo **nome** do
erro (`AbortError`, `TimeoutError`, `TypeError`), e erro desconhecido devolve `undefined` → o
consumidor fecha `unexpected_error`. Antes disso a causa só existia em log.

**Sem advisory lock.** O cron precisava dele; aqui quem serializa é a linha de `job_executions`,
com o unique de execução aberta e o lease que se renova (T4b). A porta de lock não atravessou.

**A configuração.** `ANP_BASE_URL`, `ANP_TIMEOUT_MS`, `ANEEL_BASE_URL` e `ANEEL_TIMEOUT_MS` saíram
do schema da `cron` e entraram no do `worker`, com os mesmos valores de sempre (padrão 15 000 ms,
teto 60 000 ms) — a mudança não altera comportamento. A **presença** é o que liga a rotina: nenhuma
das duas bases declarada deixa `fuelPricePull` `undefined` e a entrada do registro não é criada (a
janela pousa em `job_run_routine_missing`); **uma só** declarada derruba o boot com
`WorkerConfigurationError`. Quatro testes novos em `worker/test/environment.contract.test.ts`
cobrem os quatro casos, incluindo string em branco contando como não declarada.

**O contrato de deploy veio junto.** `cron/test/deploy/fuel-price-environment.contract.ts` virou
`worker/test/fuel-price-pull/environment.contract.ts`, apontando para `parseWorkerEnvironment`,
`WORKER_SOURCE_ROOT` e exigindo que `docs/spec/railway.md` cite o serviço `worker`. Ele guarda que
o `.env.example` provisiona as quatro, que nenhum endereço de agência está escrito no código-fonte,
e que o railway.md documenta a migração.

**Gate.**

```
worker   683 pass · 0 fail  (63 arquivos)  ·  typecheck limpo
cron      94 pass · 0 fail  ( 7 arquivos)  ·  typecheck limpo
raiz      lint limpo  ·  format:check limpo
```

**Railway.** As quatro foram provisionadas no serviço `worker` dos **dois** ambientes
(`--skip-deploys`; valem no próximo deploy). No painel da `cron` elas não existiam — quem as tinha
era o serviço `cron-fuel`, que já não existe. Reconferido pela CLI em 24/08/2026: `worker` com as
quatro nos dois ambientes, `cron` sem nenhuma.

Na mesma passada saiu o `CRON_JOB`, resto nos dois painéis da `cron` desde o T3: nenhum código o
lê, mas variável morta ali diz que a rotina ainda é escolhida pelo provedor de hospedagem em vez de
pelo relógio do banco.

⚠️ Dois desvios entre ambientes, achados na mesma conferência e **fora do escopo desta spec**: o
`worker` de staging não tem `NFSE_PROVIDER_BASE_URL` (a Nota RP publica um servidor só, o de
produção — em staging `nfse.status.pull` adia toda nota como `provider_not_configured`, que é o
comportamento desenhado), e o `worker` de production não tem `SENTRY_DSN` nem `LOG_SINK_URL`: a
observabilidade está desligada justamente no trilho que emite documento fiscal.
