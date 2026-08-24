# Tasks — 052

> 🤖 Modelo: `sonnet` (T3, T5 e T7 são 🧠 — relógio, topologia e movimentação de trilho)

## Fase 1 — o relógio nasce no banco

> 🤖 `sonnet`

- **T1** — Migration de `job_schedules` (uma linha por rotina, **sem `company_id`**: `job`,
  `interval_seconds`, `next_run_at`, `enabled`) e `job_executions` (`job`, `origin`
  `schedule`·`manual`, `company_id` nulo, `requested_by`, `correlation_id`, `started_at`,
  `finished_at`, `outcome`, `counters` JSONB, `lease_expires_at`, `cancel_requested_at`) e
  `job_schedules.paused_at`/`paused_by`. Índice parcial de execução **com lease válido** por job —
  é ele que a rota consulta para o `409`, e é o lease que impede o bloqueio eterno. Sem ENUM nativo. Seed das quatro linhas com os intervalos
  de hoje. Rollback ao lado. ⚠️ As duas tabelas entram como exceção declarada no contrato de
  tenant, como `fuel_price_references`. Aceite: `make migration-test` e
  `test/database-migration/static-migration.contract.ts`.
- **T2** — `job-catalog.constant.ts`: as quatro rotinas, o **piso de intervalo** de cada uma e o
  **vocabulário de falha** de cada uma (§6 da spec). Cópia por valor na API, no worker, no cron e no
  frontend — quatro apps que não importam código uma da outra —, guardada por contrato de paridade
  nas quatro. Aceite: `test/job-catalog/catalog.contract.ts` em cada app.

## Fase 2 — o cron vira batida

> 🤖 `opus` 🧠

- **T3** 🧠 — O cron deixa de ter `CRON_JOB` e passa a **tick**: pega o advisory lock, seleciona
  `next_run_at <= now and enabled`, publica cada uma, grava `origin: 'schedule'` e avança
  `next_run_at`. Um `railway.json` só (`*/5 * * * *`); os quatro serviços viram um.
  `SCHEDULED_DISTRIBUTION_CRON`, `scheduled-distribution-window.policy.ts` e o contrato do espelho
  saem. Aceite: `cron/test/tick/selects-due.contract.ts`, `cron/test/tick/advances-window.contract.ts`.
- **T4** — Trilho `job-run.v1` no worker: topologia main/retry/dead, envelope Zod versionado, e a
  gravação de `started_at`/`finished_at`/`outcome`/`counters` em volta do ciclo. A idempotência é a
  **própria linha da execução** — `claim` por `UPDATE` condicional sobre `finished_at is null` e
  lease vencido —, e **não** `processed_messages`: aquela tabela exige `company_id not null`, e
  execução de `origin: 'schedule'` não tem empresa. Aceite:
  `worker/test/job-run/envelope.contract.ts` e `make worker-integration`.
- **T4b** — Lease e cancelamento cooperativo, os dois no invólucro do ciclo, não em cada rotina:
  renovação do `lease_expires_at` enquanto corre, releitura de `cancel_requested_at` no limite de
  unidade, e a varredura que marca `abandoned` a execução de lease vencido — a batida do T3 é quem
  a roda. Aceite: `worker/test/job-run/lease.contract.ts` (worker morto no meio libera a rotina) e
  `worker/test/job-run/cooperative-cancel.contract.ts` (para no limite, o gravado permanece).

## Fase 3 — as rotinas mudam de casa

> 🤖 `opus` 🧠

- **T5** 🧠 — `fuel-price-pull/` **movido** do cron para o worker — clientes da ANP e da ANEEL,
  gateways e ciclo, sem mudar uma linha da regra —, com o vocabulário de falha da §6 substituindo o
  que hoje só existe em log. `ANP_*`/`ANEEL_*` migram para o deploy do worker, nos **dois**
  ambientes. Aceite: `worker/test/job-run/fuel-price-cycle.contract.ts` reproduz o resultado que o
  contrato do cron produzia.
- **T6** — `notification.schedules.run` movido pelo mesmo trilho. Aceite:
  `worker/test/job-run/notification-schedules.contract.ts`.
- **T7** 🧠 — `nfse.status.pull` movido, e as cinco cópias por valor do cron acompanham o movimento:
  `nota-rp-parity.contract.ts` passa a guardar worker × worker, e o AAD
  `transportada:nfse-credential:v1:${companyId}:${credentialId}` tem de continuar idêntico ao que
  selou. Aceite: o contrato de paridade e `make worker-integration`.
- **T8** — `nfe.distribution.pull` passa a nascer da batida e a registrar em `job_executions` nos
  dois caminhos — a janela e o botão que já existe —, para as quatro rotinas contarem a mesma
  história. Aceite: `test/nfe-workspace/job-run-latest.contract.ts`.

## Fase 4 — a rota

> 🤖 `sonnet` (T9 é 🧠)

- **T9** 🧠 — `POST /operations/job-runs` (`settings.manage`, escopo `company`): valida o job contra
  o catálogo, recusa `409` com execução em andamento, grava `origin: 'manual'` com `requested_by`
  do contexto autenticado, publica **pelo outbox** — nunca publicação solta fora de transação — e
  avança `next_run_at` na mesma transação. Aceite: `test/operations/job-runs.contract.ts`.
- **T10** — `GET /operations/routines` (última execução, resultado, contadores, próxima janela e
  estado de pausa das quatro) e `PUT /operations/routines/{job}/interval` com o piso do catálogo,
  `422` nomeando o piso. Aceite: `test/operations/routines.contract.ts` e
  `test/operations/tenant-safety.contract.ts`.
- **T10b** — As três rotas de controle: `POST /operations/job-runs/{id}/cancel` (grava
  `cancel_requested_at`), `POST /operations/job-runs/{id}/abandon` (destrava, marca `abandoned`) e
  `PUT /operations/routines/{job}/paused` (pausa e retoma, gravando quem e quando). Todas
  `settings.manage`. Aceite: `test/operations/job-run-control.contract.ts`.

## Fase 5 — o painel

> 🤖 `sonnet`

- **T11** — `RoutinePanel` no design system dos módulos: botão de execução, estado em andamento com
  esqueleto, cartão de última sincronização com contadores e próxima janela, campo de intervalo com
  o piso, e a tradução do vocabulário de falha. Um componente, quatro montagens. Aceite:
  `test/design-system/routine-panel.contract.ts` e um contrato que falha se algum código do
  catálogo ficar sem tradução.
- **T11b** — Os controles de travamento no mesmo painel: "Interromper" só enquanto há execução
  viva, com o texto dizendo que para na etapa seguinte; "Destravar" atrás de confirmação que nomeia
  o que ele faz e o que não faz; e o aviso permanente de rotina pausada, com desde quando e por
  quem. Aceite: `test/design-system/routine-panel-control.contract.ts`.
- **T12** — As quatro montagens nos seus lugares (§10): aba Combustível da frota, aba Configurações
  de NFS-e, aba Remota de Notas e a tela de agendamentos. O cartão continua visível sem
  `settings.manage`; o botão e o campo de intervalo, não. Aceite:
  `test/fleet/routine-panel.contract.ts`, `test/nfse-invoice/routine-panel.contract.ts`,
  `test/nfe-workspace/routine-panel.contract.ts`, `test/notification/routine-panel.contract.ts`.

## Fase 6 — o registro

> 🤖 `haiku`

- **T13** — `CLAUDE.md`: a seção do cron passa a descrever a batida, o desvio deliberado de
  `nfse.status.pull` e `fuel.price.pull` deixa de existir, e o worker ganha o trilho. `.env.example`
  perde `SCHEDULED_DISTRIBUTION_CRON` e ganha as variáveis que mudaram de app. Corrigir também a
  descrição da semana da ANP — o texto diz "a semana que contém o dia de hoje" e o código resolve a
  última semana **completa**, que é o que torna a rotina indiferente ao dia. ADR do movimento:
  executor único, relógio no banco, provedor de hospedagem fora da API.
