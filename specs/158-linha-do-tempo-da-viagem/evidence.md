# Spec 158 — Evidências

## Origem

Achado da T9 da spec 156 (`specs/156-o-escritorio-da-baixa-pelo-motorista/evidence.md`, "Achado
fora do escopo"): o aceite 2 da 156 pede a linha do tempo com autoria do início de rota, e nenhuma
leitura da API expõe `trip_stop_events`/`trip_document_events`; o início de rota do motorista nem é
gravado. Decisões do usuário em 2026-09-18: linha do tempo completa (spec nova), tabela
`trip_status_events` (D1) e canal `backoffice` (D2).

## T1

ADR-0068 (`docs/adr/0068-historico-de-status-da-viagem-e-canal-backoffice.md`), escrita com o
inventário de um Explore sobre `origin/staging` e validada pelo `architect` (Opus): **aprovada com
emendas**, todas aplicadas na ADR e na spec antes do commit.

### Inventário

- 14 `update(trips)` em `apps/api-transportada/src/trips/infrastructure/`; **9 pontos em 8 métodos**
  mudam `status`, 5 não. Worker, cron, scripts e triggers não escrevem em `trips`. Todas as escritas
  têm ator humano (tabela na ADR, "Inventário").
- `trip_document_events`: só `drizzle-trip-document.repository.ts:190` e
  `drizzle-trip-document-batch.repository.ts:150` gravam, chamados pela web (`trip.manage`) e pelo
  WhatsApp do operador; o papel de motorista só tem `trip.read`/`trip.report`
  (`authorization.policy.ts:214`) e nunca chega a esses repositórios. Nenhum escritor preenche
  `channel`: toda linha está `driver_app` pelo default.

### Consulta a produção: dispensada

A linha vinda do WhatsApp do operador não se distingue da web (mesmo ator humano, `note` nula, sem
`audit_logs`; só heurística em `meta_whatsapp.messages`, que falha no lote). A saída (b) do D3 é exata
sem número nenhum: em `trip_document_events`, `driver_app` = canal não registrado. Nada foi consultado.

### Emendas do architect (aplicadas)

1. `FOR NO KEY UPDATE` logo antes do `UPDATE trips`, não `FOR UPDATE` no início da transação: evita
   deadlock com o `FOR KEY SHARE` do `insert` em `trip_dispatch_snapshots` e mantém a ordem notas →
   viagem. Nos `recalculateTripStatus`, a trava vem antes da leitura do tally.
2. Os ports recebem `actorUserId`, `channel` e `onBehalfOfDriverId` (hoje sem ator: `close`,
   `cancelTrip`, `PlanTripRouteInput`/`TripRoutePlanner`, `markTripInTransit`,
   `completeTripIfSettled`).
3. Sem FK de membership do ator: com `ON DELETE RESTRICT`, `removeMembership` falharia para quem já
   mexeu numa viagem, depois de já ter desvinculado o WhatsApp e desabilitado o Keycloak.
4. `from_status NOT NULL` (sem evento de criação); `recorded_at NOT NULL DEFAULT now()`.
5. Rollback recusa com qualquer linha em `trip_status_events` ou qualquer `backoffice`.
6. Contagens corrigidas; `whatsapp` passa a cobrir o operador e a frase traz o nome do ator.
7. Transição ilegal registrável e `close` `cancelled → completed` → T11; `updated_at` do start-route
   registrado.
8. Spec: D1, D3, D6 (critério de `recordedAt`: `office` e > 60 s), D7, D8 (ordem), casos extremos,
   T5, T7, T11 e prompt de execução emendados.

### Spec 156

`specs/156-o-escritorio-da-baixa-pelo-motorista/evidence.md` ganhou a nota de que o aceite 2 fecha
por esta spec.

## T2

Schema Drizzle e migration de `trip_status_events` e do canal `backoffice` (ADR-0068 §1/§3).

### Arquivos

- `apps/api-transportada/src/database/trip.schema.ts`: `TRIP_FIELD_CHANNELS.backoffice = 'backoffice'`;
  tabela nova `tripStatusEvents` (`trip_status_events`), inserida logo após `trips`.
- `apps/api-transportada/src/database/database.schema.ts`: `tripStatusEvents` no import de
  `trip.schema.js` e no objeto de schema do cliente Drizzle.
- `apps/api-transportada/drizzle/20260918122304_trip_status_events/{migration.sql,rollback.sql,snapshot.json}`.
- Testes: `test/database-migration/support.ts` (`trip_status_events` em `TRIP_TABLES`),
  `test/database-migration/static-migration.contract.ts` (diretório na lista ordenada),
  `test/database-migration/trip-constraints.assertion.ts` (`assertTripStatusEventConstraints`, nova
  função chamada de `assertTripConstraints`), `test/database-migration/trip-status-event-rollback.assertion.ts`
  (novo, molde de `driver-allowance-rollback.assertion.ts`) e a chamada dele em
  `test/database-migration/database-migration.integration.ts`.

### Decisões / desvios da ADR

- **FK do ator**: `actor_user_id` não tem FK para `user_company_memberships` (ADR-0068 §1, precedente
  `nfe_package_box_measurements` — comentário no schema cita os dois). Isolamento por empresa vem só
  da FK composta `(company_id, trip_id) → trips`.
- **FK direta para `companies`**: a ADR só cita as FKs `(company_id, trip_id)` e
  `(company_id, on_behalf_of_driver_id)`; segui o molde de `trip_drivers`/`trip_stop_events` e mantive
  também a FK simples `company_id → companies.id` (`ON DELETE RESTRICT`), presente em toda tabela
  irmã do módulo — nenhuma tabela de evento do domínio trips fica sem ela.
- **`unique(company_id, id)`**: nenhuma tabela referencia `trip_status_events` por FK composta hoje,
  mas mantive o `unique` por consistência com `trip_stop_events`/`trip_stop_occurrences` (mesmo
  desenho, sem consumidor ainda, do jeito que essas duas já vivem no repositório).
- **Seis `*_channel_check`**: reescritos como `DROP CONSTRAINT` + `ADD CONSTRAINT ... NOT VALID` +
  `VALIDATE CONSTRAINT` (ADR §3), diferente do `drizzle-kit generate` bruto (que propôs
  `DROP+ADD` numa American única, sem `NOT VALID` — editado à mão no `migration.sql` depois de
  gerado). `trip_delivery_proofs_receiver_check` não foi tocado.
- **Sem backfill**: nenhuma linha nasce com `backoffice` na migration; D3 (b) da ADR-0068 §4
  permanece — `trip_document_events.channel = 'driver_app'` continua significando "canal não
  registrado", tratado na T5.

### TDD

Os três arquivos de teste (`trip-constraints.assertion.ts`, `trip-status-event-rollback.assertion.ts`,
as listas em `support.ts`/`static-migration.contract.ts`) foram escritos antes de rodar qualquer
gate contra Postgres — a primeira rodada de `assertTripStatusEventConstraints` falhou por typo (canal
`fax` sem o `office_driver_check` cobrindo o caminho `backoffice`, corrigido ao adicionar o caso
`channel = 'backoffice'` sem `on_behalf_of_driver_id`, que a princípio eu tinha esquecido de exercitar
e só descobri a lacuna ao reler o §3 da ADR antes de considerar a task fechada). O rollback foi escrito
olhando `driver-allowance-rollback.assertion.ts` e `trip_field_authorship/rollback.sql` como molde
explícito, então passou de primeira contra Postgres real.

### Comandos e resultados

- `bun run typecheck` (raiz, 6 apps) — **sem erros**.
- `bun run lint` (raiz, 6 apps) — **sem erros/avisos** (`--max-warnings=0`).
- `bunx prettier --check` nos arquivos alterados — **conforme** (um arquivo precisou de
  `--write`: `trip.schema.ts`, corrigido antes do commit).
- De dentro de `apps/api-transportada`, `bun --env-file=../../.env.test test --timeout 120000`:
  **6512 pass, 23 skip, 9 fail**. As 9 falhas são pré-existentes e fora de escopo — todas em
  `toll-booth-catalog-repository.integration.ts` (`ERR_POSTGRES_CONNECTION_CLOSED`), um arquivo que
  este PR não toca; reproduzido idêntico com e sem as mudanças desta task (`git stash`
  temporário, protocolo do worktree, aplicado e descartado logo em seguida).
- Migration contra Postgres real: o Docker estava parado e a porta 65434 combinada não tinha
  servidor rodando — subi um Postgres 18.4 nativo descartável no scratchpad da sessão
  (`initdb` + `postgres -p 65434 -c listen_addresses=127.0.0.1`, `LC_ALL=C` por causa de
  "postmaster became multithreaded during startup" sem locale explícito) e derrubei ao final.
  `DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65434/postgres bun --env-file=../../.env.test run db:test`
  aplica as 79 migrations (inclusive a nova) e falha em **1 de 97 testes** — mas a falha é alheia a
  esta task: `cte-profile-output-constraints.assertion.ts` espera SQLSTATE `23503` para uma violação
  de FK `ON DELETE RESTRICT`, e o Postgres 18 relata `23001` (`restrict_violation`) para esse caso
  específico (confirmado com um `CREATE TABLE`/`DELETE` mínimo direto no `psql`) — mudança de
  comportamento do próprio Postgres 18 em relação a versões anteriores, não algo que esta migration
  introduziu. Reproduzido igual com o worktree limpo (stash temporário de novo). Para não deixar a
  task sem prova real de banco, escrevi um script ad hoc
  (`test/database-migration/verify-t2-scratch.integration.ts`, apagado depois de rodar — não faz
  parte do commit) que roda só `runDatabaseMigrations` + `assertIdentityConstraints` +
  `assertFleetConstraints` + `assertTripConstraints` (que já chama
  `assertTripStatusEventConstraints`) + `assertTripStatusEventRollbackRefusesRecordedHistory` contra
  o mesmo Postgres 18 descartável: **as 5 etapas passaram** (fixtures, os 3 `check`s + as 2 FKs
  compostas + o índice de `trip_status_events`, a recusa do rollback com linha em
  `trip_status_events` e com `backoffice` em `trip_field_reports`, e o rollback aplicando limpo com
  as duas tabelas vazias). `bun run db:check` (drizzle-kit) — "Everything's fine".
- Achado fora de escopo (não corrigido aqui): o mismatch de SQLSTATE `23503`/`23001` em
  `cte-profile-output-constraints.assertion.ts` bloqueia `db:test`/`test:integration` completos contra
  Postgres 18 — vale uma task própria para atualizar o `errno` esperado nesse (e possivelmente outros)
  `expectQueryToFail` de violação `RESTRICT`.

### Verificação do orquestrador (T2)

`test/database-migration.contract.test.ts` contra Postgres 18.4 nativo descartável
(`DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65434/postgres`) para **no primeiro
erro**: `cte-profile-output-constraints.assertion.ts:134` espera `23503` numa FK `ON DELETE RESTRICT`,
e o Postgres 18 devolve `23001`. Como o teste é um único `it` sequencial, **nada depois dessa linha
roda** — inclusive as assertions novas desta task. Pular não é passar: com o `'23001'` trocado só na
linha 136 daquele arquivo, **localmente e desfeito em seguida** (não commitado), a suíte inteira deu
**61 pass, 0 fail**, incluindo `assertTripStatusEventConstraints` (`trip-constraints.assertion.ts:374`)
e `assertTripStatusEventRollbackRefusesRecordedHistory` (`database-migration.integration.ts:111`),
aplicar → reverter → reaplicar. A assertion alheia fica para a task separada que o executor abriu; a
imagem do `compose.yaml` é fixada por digest e a versão dela não foi confirmada aqui.
