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

## T3

Toda troca de `trips.status` grava `trip_status_events`, na mesma transação do `UPDATE trips`
(ADR-0068 §2).

### Arquivos

- `apps/api-transportada/src/trips/infrastructure/trip-status-event.types.ts` (novo):
  `RecordTripStatusChangeParams`.
- `apps/api-transportada/src/trips/infrastructure/trip-status-event.persistence.ts` (novo):
  `recordTripStatusChange(transaction, params)` — único escritor da tabela; no-op quando
  `fromStatus === toStatus`.
- `apps/api-transportada/test/trip-schema/trip-status-writers.contract.ts` (novo, registrado em
  `test/trip-schema.contract.test.ts`): varredura textual de `src/` — todo arquivo com
  `.update(trips)` mudando `status` no `set` tem de chamar `recordTripStatusChange`; `set` com
  spread ou `sql` bruto sobre `trips` é proibido nesses arquivos.
- Os 6 arquivos de infraestrutura da tabela da ADR (9 escritas, 8 métodos):
  `drizzle-current-driver-trip.repository.ts` (`updateStatus`, agora em transação, com
  `updatedAt`), `drizzle-driver-field-report.repository.ts` (`markTripInTransit` → `boolean`,
  `completeTripIfSettled` → lê `FOR NO KEY UPDATE` antes do update e devolve o `from` real),
  `drizzle-trip-route.repository.ts` (`markRoutePlanned` — agora em transação —, `markCancelled`,
  `dispatch`), `drizzle-trip.repository.ts` (`close`), `drizzle-trip-document.repository.ts` e
  `drizzle-trip-document-batch.repository.ts` (`recalculateTripStatus`, trava **antes** da leitura
  do tally, invertendo a ordem das demais escritas).
- Autoria (`actorUserId`, `channel`, `onBehalfOfDriverId`) acrescentada aos ports/inputs que não a
  tinham: `driver-field-report.port.ts` (`markTripInTransit`, `completeTripIfSettled`),
  `cancel-trip.use-case.ts`, `dispatch-trip.use-case.ts` (`DispatchTripWriteInput`/
  `DispatchTripInput`), `plan-trip-route.use-case.ts` (`PlanTripRoutePort`/`PlanTripRouteInput`),
  `trip.port.ts`/`trip.use-case.ts` (`close`), `transition-trip-document.use-case.ts` e
  `transition-trip-documents-batch.use-case.ts` (`channel`/`onBehalfOfDriverId`; já tinham ator),
  `route-suggestion.use-case.ts` (`TripRoutePlanner.planRoute` ganha `actorUserId`).
- `start-field-trip.use-case.ts`: passa a chamar `deriveFieldAuthorship(input)` e repassa
  `channel`/`onBehalfOfDriverId` ao `repository.updateStatus`.
- `report-stop-arrival.use-case.ts` e `report-document-delivery.use-case.ts`: passam a autoria já
  calculada (`authorship`) e `actorUserId` para `markTripInTransit`/`completeTripIfSettled`.
- Canal decidido na composição, nunca no repositório: `trip-lifecycle.use-case.ts` (`document`,
  `batchStatus`, `cancel`, `dispatch`, `planRoute` → `backoffice`), `trip.use-case.ts` (`close` →
  `backoffice`), `main.ts` (rotas web/multi-veículo/route-suggestion → `backoffice`; as quatro ações
  do operador via WhatsApp `main.ts:771-830` → `whatsapp`; `dispatchCurrentTrip` do motorista
  `main.ts:2465` → `driver_app`).
- Testes ajustados por assinatura nova: `test/cancel-releases-cargo/use-case.contract.ts`,
  `test/driver-trip/dispatch.contract.ts`, `test/driver-trip/field-report.double.ts`,
  `test/field-trip-target/use-cases.contract.ts`, `test/fixtures/route-suggestion-application.fixture.ts`,
  `test/routing-application/route-suggestion.contract.ts`,
  `test/trip-documents/{transition,batch-transition,returned-with-active-cte}.contract.ts`,
  `test/trips/{plan-and-dispatch,plan-route-toll-freeze}.contract.ts`.
- Integrações estendidas com asserção de `trip_status_events` (sem arquivo novo em
  `test:integration`): `test/integration/field-trip-target.integration.ts` (aceite 1: motorista,
  `driver_app`, `dispatched→in_transit`, e repetir não duplica), `test/integration/trip-field-office.integration.ts`
  (aceite 2: escritório, `office` + `onBehalfOfDriverId` do motorista de position 1,
  `in_transit→on_delivery_route`), `test/integration/trip-lifecycle.integration.ts` (histórico
  completo `draft→route_planned→separating→loading→dispatched`, todos `backoffice`, na ordem; e um
  `describe` novo com `close` e `cancelTrip`, cada um com o `from` lido dentro da transação e prova
  de que repetir não regrava). As integrações de `delivery-charge-end-to-end`,
  `mixed-cargo-end-to-end`, `me-trip`, `trip-repository` e `whatsapp-operator-flow-actions` só
  precisaram da autoria nova para continuar compilando — chegada (`dispatched→in_transit`) e entrega
  concluindo a viagem já eram exercitadas por `me-trip.integration.ts` antes desta task.

### Decisões / desvios

- **`markTripInTransit`/`updateStatus` seguem sem `FOR NO KEY UPDATE`** (ADR-0068 §2): já são
  compare-and-set por `WHERE status = expected`, e o `from` é o esperado — travar de novo seria
  redundante. Só as demais (que não faziam CAS) ganharam `SELECT … FOR NO KEY UPDATE` imediatamente
  antes do `UPDATE trips`.
- **`completeTripIfSettled` mudou de `inArray(status, ACTIVE)` para `eq(status, tripRow.status)`**:
  a trava fixa o status lido, então o `WHERE` da escrita usa esse valor exato — o `inArray` original
  virou uma checagem em memória (`ACTIVE_TRIP_STATUSES.includes(tripRow.status)`) antes do update.
- **`markRoutePlanned` passou a abrir transação própria** (antes rodava direto em `this.database`) —
  necessário para o `SELECT … FOR NO KEY UPDATE` e o `INSERT` em `trip_status_events` acontecerem
  atomicamente com o `UPDATE trips`, como o ADR pede.
- **`DrizzleTripRepository.close`** passou a fazer `SELECT … FOR NO KEY UPDATE` antes do update
  (antes só devolvia `{ id }`); o retorno de `readTripDetail` deixou de espalhar `...input` (que
  agora carrega `actorUserId`/`channel`/`onBehalfOfDriverId`) e passou a listar `companyId`/`tripId`
  explicitamente — excesso de propriedade seria erro de tipo.
- **`recalculateTripStatus` dos dois repositórios de nota inverteu a ordem interna**: a trava da
  viagem vem **antes** da leitura do tally de `trip_documents` (ADR-0068 §2, emenda do architect na
  T1) — o inverso do padrão "notas → viagem" das demais escritas, porque aqui a decisão de status
  depende do tally que ainda seria lido.
- **`dispatch` mantém o `INSERT` em `trip_dispatch_snapshots` antes da trava da viagem** — é
  exatamente o motivo do `FOR NO KEY UPDATE` em vez de `FOR UPDATE` (ADR-0068 §2): o insert já seguraFOR
  KEY SHARE via FK, e `FOR UPDATE` no início da transação colidiria com ele em dois despachos
  concorrentes.
- **Sem consulta a "transição ilegal"**: `dispatch`, `markRoutePlanned`, `markCancelled` e `close`
  continuam escrevendo sem guarda de origem (achado registrado na ADR, T11 da spec 158) —
  `recordTripStatusChange` grava fielmente o que o repositório escreveu, mesmo que a política um dia
  proibisse aquela transição.
- **Canal do `route-suggestion` (aceite da sugestão) é sempre `backoffice`**: os dois pontos de
  composição de `planTripRoute` continuam do lado do escritório (rota web e aceite de sugestão);
  nenhum caminho de sugestão de rota passa por WhatsApp ou app do motorista hoje.

### TDD

O contrato estático (`trip-status-writers.contract.ts`) foi escrito e registrado **antes** de tocar
em qualquer repositório; rodado contra o código da T2 ele listou exatamente os 6 arquivos esperados
(`drizzle-current-driver-trip.repository.ts`, `drizzle-driver-field-report.repository.ts`,
`drizzle-trip-route.repository.ts`, `drizzle-trip.repository.ts`,
`drizzle-trip-document.repository.ts`, `drizzle-trip-document-batch.repository.ts`) como
"`.update(trips)` muda `status` mas não chama `recordTripStatusChange`" — `bun test
./test/trip-schema.contract.test.ts`: **70 pass, 1 fail** (o `toEqual([])` recebendo os 6 caminhos).
Depois de cada repositório ganhar a chamada, a mesma suíte foi para **71 pass, 0 fail**.

### Comandos e contagens

- `bun run typecheck` (raiz, 6 apps) — **sem erros** (passou por um ciclo intermediário com 70 erros
  em arquivos de teste sem a assinatura nova; todos corrigidos — dublês, fixture de
  `route-suggestion` e as duas expectativas de `trip_status_events`/autoria que quebraram na
  suíte de contrato, ver abaixo).
- `bun run lint` (raiz, 6 apps) — **sem erros/avisos** (`--max-warnings=0`).
- `bunx prettier --write` em todos os arquivos alterados — todos conformes (só os arquivos
  editados por `perl`/sed precisaram do `--write`; sem diff de conteúdo além da formatação).
- De dentro de `apps/api-transportada`, `bun --env-file=../../.env.test test --timeout 120000`:
  primeira rodada **6512 pass, 23 skip, 12 fail** — 9 falhas pré-existentes de
  `toll-booth-catalog-repository` (mesmas da T2, `ERR_POSTGRES_CONNECTION_CLOSED`, arquivo não
  tocado) e 3 novas: `route-suggestion.contract.ts` (`plannedRoutes` sem `actorUserId` na
  expectativa) e `field-trip-target/use-cases.contract.ts` (`world.updates` sem `channel`/
  `onBehalfOfDriverId`). Corrigidas as três expectativas (fixture + os dois `toEqual`), segunda
  rodada: **6515 pass, 23 skip, 9 fail** — só as 9 pré-existentes de `toll-booth-catalog-repository`
  restam, confirmadas fora de escopo (nenhum arquivo delas tocado nesta task).
- Integração (Postgres 18 nativo descartável já no ar em 65434,
  `DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65434/postgres`):
  - Os 10 arquivos tocados/relevantes (`bun ... test ./test/integration/{delivery-charge-end-to-end,me-trip,mixed-cargo-end-to-end,trip-lifecycle,trip-repository,whatsapp-operator-flow-actions,field-trip-target,trip-field-authorship,trip-field-office,freeze-trip-planned-route}.integration.ts --timeout 120000`):
    **44 pass, 0 fail** (41 antes das três asserções novas de `trip_status_events`, 44 depois —
    confirma que rodaram e não pularam).
  - `bun --env-file=../../.env.test run test:integration` completo: **398 pass, 18 fail**. As 18
    são todas pré-existentes e alheias a este PR — nenhum arquivo delas foi tocado nesta task:
    9 de `toll-booth-catalog-repository` (idem T2), 4 de `database-availability`/`Drizzle external
identity repository`/`tenant-context`/`auth-me` (timing de pool e conexão, não schema), 2 de
    `cte-archive-gateway` e 4 de `toll-booth-extract`/`toll-booth-reload` (`OBJECT_STORAGE_UNAVAILABLE`
    — MinIO fora do ar neste ambiente), e 1 de `database-migration.contract.test.ts` (o mesmo
    mismatch `23503`/`23001` do Postgres 18 documentado na T2, `cte-profile-output-constraints.assertion.ts:134`).
    Nenhuma das 18 menciona `trips`, `trip_status_events` ou qualquer arquivo desta task.

### Achados fora de escopo (não corrigidos aqui)

- As mesmas transições ilegais gravadas sem guarda (`dispatch`, `markRoutePlanned`,
  `markCancelled`, `close`) e o `cancelled → completed` do `close` seguem pendentes para a T11.
- O `OBJECT_STORAGE_UNAVAILABLE` das integrações de `toll-booth` e `cte-archive-gateway` sugere que
  o MinIO local não estava no ar durante esta rodada de `test:integration` — vale conferir
  `make up` antes da próxima vez que alguém rodar a suíte completa.

## T4

Fluxo manual com canal (RF4, aceite 4): `channel` gravado em `trip_document_events` (`backoffice`
pela web, `whatsapp` pelo operador do WhatsApp), e fechamento de uma lacuna da T3 — o evento de
status da chegada e o da entrega que conclui a viagem não tinham teste, e o `occurred_at` deles não
usava o `now` do caso de uso.

### Arquivos

- `apps/api-transportada/src/trips/infrastructure/drizzle-trip-document.repository.ts`
  (`insertEvent`) e `drizzle-trip-document-batch.repository.ts` (`insertEvents`): passaram a gravar
  `channel: input.channel` e `onBehalfOfDriverId: input.onBehalfOfDriverId` em
  `trip_document_events` — a T3 já levava `channel`/`onBehalfOfDriverId` até o port
  (`ApplyTripDocumentTransitionInput`/`TripDocumentBatchWriteInput`) e até `recalculateTripStatus`
  (por isso `trip_status_events` já saía certo), mas os dois `insert(tripDocumentEvents)` ignoravam
  os dois campos e caíam no default da coluna (`driver_app`). `onBehalfOfDriverId` sai sempre nulo
  nesses dois fluxos — nem a rota web nem o WhatsApp do operador agem em nome do motorista
  (`trip-lifecycle.use-case.ts` e a composição do operador em `main.ts` nunca passam esse campo).
- **Lacuna da T3 fechada** (aceite explícito desta task, não só teste): `driver-field-report.port.ts`
  (`markTripInTransit`, `completeTripIfSettled`) ganhou o campo `at: Date`; a implementação em
  `drizzle-driver-field-report.repository.ts` passou a repassar `occurredAt: input.at` para
  `recordTripStatusChange` — antes esses dois escritores omitiam `occurredAt` e caíam no
  `defaultNow()` do banco, divergindo do `now` do caso de uso que grava o `trip_stop_event`
  correspondente (ADR-0068 §"Consequências": "o evento de status da chegada e da entrega usa o
  mesmo `now`"). `report-stop-arrival.use-case.ts` e `report-document-delivery.use-case.ts` passam
  a mandar `at: input.now` nas duas chamadas.
- Testes estendidos, sem arquivo novo (`test:integration` do `package.json` inalterado):
  - `test/integration/me-trip.integration.ts`: a chegada na primeira parada (`dispatched →
in_transit`) grava `trip_status_events` com `channel: 'driver_app'`, `onBehalfOfDriverId: null`
    e `occurredAt` igual ao `now` fixo do teste; a devolução final que fecha a viagem
    (`in_transit → completed`, via `completeTripIfSettled`) grava o `from` real com o mesmo
    `occurredAt`; o teste de reenvio idempotente (`idempotencyKey` repetida) passou a checar que só
    1 `trip_status_events` existe.
  - `test/integration/trip-lifecycle.integration.ts`: a separação/carregamento pela rota web
    (`backoffice`) agora também confere `trip_document_events.channel` das três notas; novo
    `describe` (`batch-status grava channel backoffice`) exercitando
    `transitionTripDocumentsBatch` direto, conferindo `backoffice` nos dois `trip_document_events`
    e no `trip_status_events` (`route_planned → separating`).
  - `test/integration/whatsapp-operator-flow-actions.integration.ts`: o fluxo real (separar →
    carregar → despachar) pelo WhatsApp do operador passou a conferir `trip_document_events.channel
= 'whatsapp'` em cada passo e a sequência completa de `trip_status_events` (`separating →
loading → dispatched`, todos `whatsapp`); novo `describe`
    (`batch-status pelo WhatsApp do operador`) chamando `transitionTripDocumentsBatch` direto com
    `whatsapp`, mesma dupla asserção do teste de lote acima. `seedNfeDocument` ganhou um `suffix`
    opcional — sem ele, duas notas da mesma empresa colidiam na chave única de `stored_objects`/
    `nfe_documents`.

### Decisões / desvios

- **A chegada e a entrega do escritório (`office` + `onBehalfOfDriverId`) não ganharam teste
  próprio nesta task.** A task pedia `trip-field-office.integration.ts` como alternativa a
  `me-trip.integration.ts` ("e/ou"); todo `seedTrip` daquele arquivo já nasce `in_transit` (a
  chegada `dispatched → in_transit` e a conclusão `on_delivery_route → completed` do escritório não
  têm cenário seedado ali), e `me-trip.integration.ts` já prova o writer (`markTripInTransit`/
  `completeTripIfSettled`) e o `occurred_at` — o canal/autoria do escritório (`deriveFieldAuthorship`
  com `office`+`onBehalfOfDriverId`) para essas duas transições específicas já está coberto pela
  ADR-0067/spec 156 (`deriveFieldAuthorship` é função pura, testada por tipo de ator, não por rota) e
  fica registrado aqui como cobertura ainda em aberto, não escondido.
- **`onBehalfOfDriverId` em `trip_document_events` sai sempre nulo** nos dois fluxos desta task
  (web e WhatsApp do operador) porque nenhum dos dois pontos de composição em `main.ts`/
  `trip-lifecycle.use-case.ts` preenche esse campo — consistente com a T3 (nenhum dos dois é "em
  nome do motorista").

### TDD

Os testes de integração (`me-trip`, `trip-lifecycle`, `whatsapp-operator-flow-actions`) foram
escritos **antes** do fix em `insertEvent`/`insertEvents` e antes de threading do `at`/`occurredAt`:
rodados contra o código da T3, os três novos/estendidos falhavam — `trip_document_events.channel`
saía `driver_app` (default da coluna) em vez de `backoffice`/`whatsapp`, e `occurredAt` da chegada/
conclusão divergia do `now` fixo do teste (hora real de execução, não `2026-08-26T13:00:00.000Z`).
Depois dos dois fixes, os mesmos arquivos passam.

### Comandos e contagens

- `bun run typecheck` (raiz, 6 apps) — sem erros.
- `bun run lint` (raiz, 6 apps) — sem erros/avisos (`--max-warnings=0`).
- `bunx prettier --check` nos 9 arquivos alterados — todos conformes.
- De dentro de `apps/api-transportada`, `bun --env-file=../../.env.test test --timeout 120000`:
  **6515 pass, 23 skip, 9 fail** — as mesmas 9 falhas pré-existentes de
  `toll-booth-catalog-repository` (`ERR_POSTGRES_CONNECTION_CLOSED`, arquivo não tocado);
  idêntico à contagem final da T3, sem regressão.
- Integração (Postgres nativo descartável em 127.0.0.1:65434,
  `DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65434/postgres`):
  - Os 5 arquivos tocados
    (`bun ... test ./test/integration/{me-trip,trip-lifecycle,whatsapp-operator-flow-actions,trip-field-office,field-trip-target}.integration.ts --timeout 120000`):
    **34 pass, 0 fail** — 32 pass/2 fail antes de corrigir os dois testes novos (um lia a linha
    errada de `trip_status_events`, o outro colidia em `stored_objects` por reusar a mesma chave de
    objeto duas vezes na mesma empresa), 34 pass/0 fail depois.
  - Os 10 arquivos do escopo da T3
    (`bun ... test ./test/integration/{delivery-charge-end-to-end,me-trip,mixed-cargo-end-to-end,trip-lifecycle,trip-repository,whatsapp-operator-flow-actions,field-trip-target,trip-field-authorship,trip-field-office,freeze-trip-planned-route}.integration.ts --timeout 120000`):
    **46 pass, 0 fail** (a T3 fechou com 44 pass; os 2 a mais são os dois `describe` novos de
    `batch-status`).
  - `bun --env-file=../../.env.test run test:integration` completo: **400 pass, 18 fail** — os
    mesmos 18 pré-existentes e alheios a este PR que a T3 documentou (398 pass, 18 fail antes; os 2
    pass a mais são as duas suítes de lote novas). Nenhuma das 18 falhas toca `trips`,
    `trip_status_events`, `trip_document_events` ou qualquer arquivo desta task.

## T5

### Arquivos

- `src/trips/application/trip-timeline.types.ts` (novo): `TRIP_TIMELINE_KINDS` (os oito `kind`s do
  D5), `TRIP_TIMELINE_KIND_PRIORITY` (o desempate do D8), `TripTimelineItem` (D6), `TripTimelineCursor`,
  `ReadTripTimelineParams`/`ReadTripTimelineResult`.
- `src/trips/infrastructure/trip-timeline.query.ts` (novo): seis consultas (D5 — `trip_stop_events`
  cobre três `kind`s num `select` só, por `kind`), `mergeTripTimeline` (pura, exportada),
  `parseTripTimelineCursor`/`encodeTripTimelineCursor` e `listTripTimeline` (orquestra as seis com
  `Promise.all`).
- `test/trip-application/trip-timeline-merge.contract.ts` (novo): unitário de `mergeTripTimeline` e
  do cursor. Import adicionado a `test/trip-application.contract.test.ts`.
- `test/trip-schema/trip-timeline-query-tenant-safety.contract.ts` (novo, irmão do contrato do feed
  de ocorrências): lê a fonte e reprova junção sem `company_id`. Import adicionado a
  `test/trip-schema.contract.test.ts`.
- `test/integration/trip-timeline.integration.ts` (novo), listado em `test:integration` do
  `package.json` (ao lado de `trip-field-office.integration.ts`).

### Decisões

- **Prioridade dos `kind`s (D8), do menor para o maior — menor aparece mais acima na lista
  `occurredAt desc`:** `stop.arrived`(0) < `document.delivered`(1) < `document.returned`(2) <
  `trip.dispatched`(3) < `trip.status_changed`(4) < `stop.occurrence`(5) < `document.occurrence`(6)
  < `document.status_changed`(7). A regra do D8 só amarra duas relações de causa/efeito (chegada
  antes da troca de status que ela provoca; entrega antes da conclusão) — as demais posições seguem
  a ordem em que a própria tabela do D5 lista as fontes, por não haver relação de causa entre elas.
  `trip.dispatched` entrou antes de `trip.status_changed` pelo mesmo raciocínio de causa/efeito (o
  despacho é o evento específico; a troca de status é o efeito genérico), embora o D8 não cite esse
  par por extenso.
- **O parse do cursor (`parseTripTimelineCursor`/`encodeTripTimelineCursor`) fica na infraestrutura
  (`trip-timeline.query.ts`), não na T6.** É base64url de JSON tipado (`{id, kindPriority,
occurredAt}`), simétrico ao par `encode/decodeKeysetCursor` do feed de ocorrências, mas com uma
  chave a mais porque o desempate desta leitura tem três níveis, não dois (D8). `parseTripTimelineCursor`
  nunca lança — cursor malformado devolve `null` — porque é o formato interno que
  `listTripTimeline` consome; a validação Zod da T6 é sobre o parâmetro de querystring em si
  (presença, tipo string), e chama este mesmo parser depois.
- **`document.number`/`document.series` são anuláveis**, no molde de
  `TripOccurrenceFeedItem.invoiceNumber/invoiceSeries`: `trip_documents.nfe_document_id` é anulável
  (o vínculo pode ser só de `freight_calculation_id`, sem NF-e importada ainda — `trip_documents_entity_xor_check`),
  então a junção com `nfe_documents` é sempre `leftJoin`.
- **`stop.occurrence` e `document.occurrence` nunca têm `recordedAt`**: as duas tabelas não têm
  coluna `recorded_at` própria (comentário do schema em `trip_stop_occurrences`/
  `trip_document_occurrences` — `created_at` já é "quando foi contada ao sistema" para os três
  canais). Só `trip_status_events`, `trip_stop_events` e `trip_document_events` passam pelo cálculo
  de `resolveRecordedAt` (D6: `channel = 'office'` e diferença > 60 s).
- **`trip.dispatched` sai sempre com `channel: null` e `onBehalfOfDriverName: null`**:
  `trip_dispatch_snapshots` não tem coluna de canal nem de motorista em nome de quem (só
  `actor_user_id`) — confirmado no schema antes de escrever a consulta, não assumido.
- **`returnReason` só é lido para `kind = 'returned'`** de `trip_stop_events`, buscado em
  `trip_documents.return_reason` pelo mesmo `leftJoin` que já traz o número/série da nota — sem
  consulta extra.
- **Nomes de nota vêm de `trip_documents → nfe_documents`** (`number`/`series`), o mesmo caminho do
  feed de ocorrências — confirmado no schema (`nfe.schema.ts:274-275`) em vez de assumido.

### TDD

O unitário de `mergeTripTimeline` (`test/trip-application/trip-timeline-merge.contract.ts`) e o
contrato estático de tenant (`test/trip-schema/trip-timeline-query-tenant-safety.contract.ts`) foram
escritos junto com a implementação, iterando sobre os dois: a primeira versão do teste de ordem
tinha a expectativa errada (invertia a prioridade de duas fontes), e a primeira versão do teste de
paginação de 250 itens comparava o cursor com o sinal trocado — os dois só ficaram verdes depois de
corrigidos os testes, não a implementação (`mergeTripTimeline` já ordenava corretamente; o defeito
era do fixture do teste). A integração (`test/integration/trip-timeline.integration.ts`) foi escrita
depois de `listTripTimeline` existir, porque o cenário depende do schema completo (seis tabelas,
FKs compostas) — escrevê-la antes exigiria simular o schema à mão sem ganho de sinal.

### Comandos e contagens

- `bun run typecheck` — sem erros.
- `bun run lint` (`--max-warnings=0`) — sem erros/avisos.
- `bunx prettier --check` nos arquivos alterados — todos conformes.
- `bun test ./test/trip-application/trip-timeline-merge.contract.ts ./test/trip-schema/trip-timeline-query-tenant-safety.contract.ts`:
  **15 pass, 0 fail**.
- De dentro de `apps/api-transportada`, `bun --env-file=../../.env.test test --timeout 120000`:
  **6545 pass, 23 skip, 9 fail** — as mesmas 9 falhas pré-existentes de
  `toll-booth-catalog-repository` (`ERR_POSTGRES_CONNECTION_CLOSED`, arquivo não tocado).
- Integração (Postgres nativo descartável em 127.0.0.1:65434,
  `DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65434/postgres`):
  `bun ... test ./test/integration/trip-timeline.integration.ts --timeout 120000`: **7 pass, 0
  fail**. p95 medido (50 notas, 80 `trip_document_events` + 120 `trip_document_occurrences` = 200
  eventos, 20 amostras): **2,84 ms** — bem abaixo do teto de 300 ms do RNF2 (ambiente local; sem
  rede até o banco).
