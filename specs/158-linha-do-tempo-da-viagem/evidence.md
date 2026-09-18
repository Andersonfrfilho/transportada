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

### Correção do orquestrador (T5): ordem do empate e cursor

Na revisão da entrega do executor, dois defeitos ligados:

- **Cursor inconsistente com a ordem.** O SQL de cada fonte corta por
  `(occurred_at, prioridade, id) < cursor` — a tupla supõe as três colunas **decrescentes** —, mas
  `compareTimelineRows` ordenava a prioridade **crescente**. Com `occurredAt` empatado entre fontes
  diferentes, a página seguinte pulava ou repetia itens. O teste dos 250 eventos não pegou porque só
  empatava itens do mesmo kind.
- **D8 invertido.** Com a prioridade crescente, a chegada aparecia acima da troca de status que ela
  provocou, numa lista do mais recente para o mais antigo.

TDD: `trip-timeline.integration.ts` ganhou "empate de occurredAt entre fontes diferentes pagina na
mesma ordem da página única" (40 instantes × 2 fontes, páginas de 30, comparado com a página única de 200) — **falhou** contra o código da T5 (7 pass, 1 fail). Correção: `TRIP_TIMELINE_KIND_PRIORITY`
renumerado (maior = mais acima; `trip.status_changed` 7 … `stop.arrived` 0) e `compareTimelineRows`
com a prioridade decrescente; os três unitários de ordem passaram a esperar o efeito acima da causa.

- `bun test ./test/trip-application/trip-timeline-merge.contract.ts ./test/trip-schema/trip-timeline-query-tenant-safety.contract.ts`
  — 15 pass, 0 fail.
- `DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65434/postgres bun --env-file=../../.env.test test ./test/integration/trip-timeline.integration.ts --timeout 120000`
  — 8 pass, 0 fail.
- `bun run typecheck` e `bun run lint` na raiz — sem erros.

## T6

### Arquivos

- `src/trips/domain/trip.error.ts` — `TripTimelineCursorInvalidError` (400
  `TRIP_TIMELINE_CURSOR_INVALID`), ao lado de `TripNotFoundError`.
- `src/trips/infrastructure/trip-timeline.query.ts` — `findTripCompanyScope` (novo): existência da
  viagem **nesta empresa**, molde de `DrizzleTripCostRepository.listByTrip`
  (`select({ id: trips.id })`). As seis fontes de `listTripTimeline` não servem para o 404: uma
  viagem existente e sem nenhum evento devolveria itens vazios, igual a uma viagem inexistente.
- `src/trips/application/read-trip-timeline.use-case.ts` (novo): `createReadTripTimelineUseCase`
  — resolve a viagem da empresa (`existence.findTripCompanyScope`, 404 `TRIP_NOT_FOUND` se `null`,
  **antes** de chamar o leitor), repassa `companyId`/`cursor`/`limit`/`tripId` a
  `reader.listTripTimeline`. Sem try/catch — o erro propaga para o Exception Filter do router.
- `src/trips/presentation/trip-timeline.schema.ts` (novo): `parseTripTimelineQuery(url)` — chave
  desconhecida é recusa (`readListQuery`), `cursor` string opcional decodificada por
  `parseTripTimelineCursor` (T5, infraestrutura — reaproveitado porque é quem sabe o formato que
  ele mesmo produziu, decisão já registrada na T5), `limit` inteiro 1..200 padrão 100 (diferente do
  teto de 100 de `readPaging`, por isso não reaproveitado).
- `src/trips/presentation/trip.routes.ts` — `GET /trips/:id/timeline` (`TRIP_TIMELINE_PATH`), no
  molde de `.../documents/:documentId/occurrences`: `TRIP_FIELD_READ_POLICY`
  (`fleet.read`/`trip.report-on-behalf`), resposta `200 { data: { items, nextCursor } }` (o envelope
  exato do plan.md — diferente do `{ data, pagination }` do feed de ocorrências, que é outro
  contrato). `cache-control: no-store` vem de graça de `jsonResponse`, comum a toda rota do arquivo.
- `src/main.ts` — ligação: `readTripTimeline: createReadTripTimelineUseCase({ existence:
{findTripCompanyScope}, reader: {listTripTimeline} })`, ambos batidos em `database` (o mesmo padrão
  de `listTripOccurrenceFeed(database, query)` já em uso no arquivo — confirmado por `bun run
typecheck` limpo, não assumido).
- `test/trip-application/read-trip-timeline.contract.ts` (novo): unitário do caso de uso com
  dublês — 404 sem chamar o leitor, `companyId`/`cursor`/`limit` repassados ao leitor. Import
  adicionado a `test/trip-application.contract.test.ts`.
- `test/trip-http/timeline.contract.ts` (novo): contrato da rota via `route.execute` direto (molde
  de `test/trip-field-office/finance-read.contract.ts`, sem o router inteiro) — 200 com o envelope,
  `companyId` do contexto (nunca da query, que nem aceita essa chave), cursor/limit repassados,
  limit padrão 100, 400 `TRIP_TIMELINE_CURSOR_INVALID`, 400 para limit 0 e 201, 404
  `TRIP_NOT_FOUND` quando o caso de uso recusa, política `anyPermission`. Import adicionado a
  `test/trip-http.contract.test.ts`.
- `test/trip-field-office/finance-read.contract.ts` — `GET /trips/:id/timeline` entrou em
  `FIELD_READS` (o `finance` alcança pela mesma `trip.report-on-behalf`), na lista exaustiva do
  `finance` e no mapa `results` da checagem 200. Títulos "as seis"/"seis" viraram "as sete"/"sete"
  onde citavam `FIELD_READS` por extenso.
- `test/separator-role.contract.test.ts` — `GET /trips/:id/timeline` entrou na lista exaustiva
  (alfabética, entre `.../stops` e `.../cargo-layouts/:layoutId`) — o separador tem `fleet.read`,
  então alcança.
- `test/integration/trip-timeline.integration.ts` — `describe('GET /trips/:id/timeline contra o
Postgres (spec 158 T6)')`: 200 com item real (`trip.status_changed`) via `route.execute`, 404 para
  viagem de outra empresa. Molde de `route.execute` de `trip-field-office.integration.ts`
  (`fakeContext`, dependências mínimas via `Proxy`).

### Decisões

- **404 não é responsabilidade das seis fontes.** `listTripTimeline` filtra por
  `companyId`+`tripId` em cada fonte, mas uma viagem existente e silenciosa (nenhum evento ainda)
  devolve `{ items: [], nextCursor: null }` — indistinguível de uma viagem inexistente. Por isso a
  T6 introduz `findTripCompanyScope`, uma consulta própria (`select 1` na tabela `trips`), chamada
  **antes** de `listTripTimeline` no caso de uso — nunca depois, e nunca em paralelo.
- **`parseTripTimelineCursor` é chamado direto da camada de apresentação**, quebrando a regra geral
  de módulo em 4 camadas — decisão já registrada na T5 (evidence.md, "O parse do cursor... fica na
  infraestrutura, não na T6"): é função pura, sem I/O, e é o único lugar que sabe decodificar o
  formato que ela mesma codifica (`encodeTripTimelineCursor`). Reimplementar o parse na apresentação
  duplicaria a lógica e poderia divergir do formato real.
- **O envelope da rota é `{ data: { items, nextCursor } }`, não `{ data, pagination }`.** O plan.md
  ("Contratos/API/eventos") fixa essa forma por extenso para esta rota — diferente do
  `TRIP_OCCURRENCE_FEED_PATH`, que usa `{ data: page.items, pagination: {...} }`. Os dois contratos
  coexistem no mesmo arquivo por serem rotas diferentes com specs diferentes.
- **Sem OpenAPI/Scalar**: a API não gera documentação OpenAPI a partir das rotas (nenhuma
  infraestrutura de geração existe no repositório — confirmado por busca, não assumido). A rota
  entra na documentação viva do jeito que as demais entram: comentário no arquivo de rotas e nesta
  evidência. Nenhuma infraestrutura nova foi criada para isso (fora do escopo da T6).
- **Log da rota**: a app não tem um padrão de log por rota de leitura (as outras leituras de
  `/trips/:id/*` — custos, valuation, stops, allowed-actions — não logam nada na rota; quem loga é o
  `router.service.ts` genericamente, via `http_request_failed`/`http_request_completed`, sem
  detalhe de negócio). Inventar um log específico para esta rota quebraria esse padrão sem pedido
  explícito de nenhuma outra leitura do módulo — decisão registrada aqui em vez de criado.

### TDD

Contrato do caso de uso (`read-trip-timeline.contract.ts`) e da rota (`timeline.contract.ts`)
escritos antes da implementação, com dublês — vermelho por dependência ausente
(`createReadTripTimelineUseCase`/rota inexistente), depois verde após `read-trip-timeline.use-case.ts`,
`trip-timeline.schema.ts` e a rota em `trip.routes.ts`. As listas exaustivas (`finance-read`,
`separator-role`) e a integração vieram depois, como aceite 6 e prova contra Postgres real.

### Comandos e contagens

- `bun run typecheck` — sem erros.
- `bun run lint` (`--max-warnings=0`) — sem erros/avisos.
- `bunx prettier --check` nos arquivos alterados — todos conformes (após `--write` nos 5 que o
  primeiro `--check` apontou).
- `bun test ./test/trip-application.contract.test.ts ./test/trip-http.contract.test.ts
./test/separator-role.contract.test.ts` — **214 pass, 0 fail**.
- De dentro de `apps/api-transportada`, `bun --env-file=../../.env.test test --timeout 120000`:
  **6553 pass, 23 skip, 9 fail** — as mesmas 9 falhas pré-existentes de
  `toll-booth-catalog-repository` (`ERR_POSTGRES_CONNECTION_CLOSED`, arquivo não tocado); antes da
  T6 eram 6545 pass — os 8 testes novos (2 do caso de uso + 6 da rota) fecham a diferença.
- Integração (Postgres nativo descartável em 127.0.0.1:65434):
  `DRIZZLE_TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:65434/postgres bun
--env-file=../../.env.test test ./test/integration/trip-timeline.integration.ts --timeout 120000`
  — **10 pass, 0 fail** (os 8 da T5 mais os 2 novos da rota, 200 e 404).

### Formato do envelope (para a T7 do frontend)

```
GET /trips/:id/timeline?cursor=<opaco base64url>&limit=<1..200, padrão 100>
200 { "data": { "items": TripTimelineItem[], "nextCursor": string | null } }
400 { "error": { "code": "TRIP_TIMELINE_CURSOR_INVALID" | outro (limit fora de 1..200), ... } }
404 { "error": { "code": "TRIP_NOT_FOUND", ... } }
403 sem `fleet.read` nem `trip.report-on-behalf`
```

`TripTimelineItem` é exatamente o tipo de `trip-timeline.types.ts` (T5) — nenhum campo é adicionado,
removido ou renomeado nesta T6; `occurredAt`/`recordedAt` já chegam como string ISO (serializados em
`listTripTimeline`). `nextCursor` é a mesma string opaca que `cursor` aceita de volta.

## T7

### Arquivos

- `apps/frontend-transportada/src/modules/trip/shared/trip.types.ts`: `TRIP_FIELD_CHANNELS` ganha
  `backoffice` (D2, ADR-0068 §3); `TRIP_TIMELINE_KINDS`/`TripTimelineKind` (cópia por valor dos oito
  `kind`s de `trip-timeline.types.ts`, T5), `TripTimelineStopReference`,
  `TripTimelineDocumentReference`, `TripTimelineOccurrenceReference`, `TripTimelineItem` (D6) e
  `TripTimelinePage`.
- `apps/frontend-transportada/src/modules/trip/shared/trip.constant.ts`: `TRIP_TIMELINE_ITEM_KEYS`
  (os 13 campos, todos sempre presentes — nenhum é opcional no D6) e as três listas de chave dos
  objetos aninhados (`stop`/`document`/`occurrence`), `TRIP_TIMELINE_DEFAULT_LIMIT` (100, o padrão
  do D4). `TRIP_TIMELINE_CURSOR_INVALID` entra em `TRIP_FEEDBACK_KEY_BY_ERROR` → `timelineCursorInvalid`
  (o único lugar do módulo que mapeia código de erro para chave de feedback).
- `apps/frontend-transportada/src/modules/trip/shared/tripResponse.validation.ts`:
  `tripTimelineFromApi` (molde de `occurrencesFromApi`) e `isTimelineItem` (molde de `isOccurrence`,
  `:1051`) com `hasExactKeys` — todos os 13 campos são obrigatórios (D6 não tem opcional), então uma
  chave a mais (`actorUserId`, `receiverName`, `latitude`, …) já reprova sozinha; `channel`/`kind`
  fora do vocabulário fechado (`isOneOf`) e os três guardas aninhados
  (`isTimelineStopReference`/`isTimelineDocumentReference`/`isTimelineOccurrenceReference`).
- `apps/frontend-transportada/src/modules/trip/shared/tripClient.service.ts`: `readTripTimeline`
  (molde de `readTripOccurrences`, `:731`), `buildSearch({cursor, limit}, {})` já existente (mesmo
  usado por `listNfeDocuments`) e `path` = `${TRIPS_PATH}/:tripId/timeline`.
- `apps/frontend-transportada/src/modules/trip/hooks/useTripTimeline.hook.ts` (novo):
  `useInfiniteQuery` pelo cursor, `enabled: canReadTrip(permissions)` — a mesma política de leitura
  de `useTripWorkspace.hook.ts` (`canReadTrips`, `fleet.read` **ou** `trip.report-on-behalf`, D4),
  chave `[TRIP_QUERY_KEY, tripId, 'timeline']`.
- `apps/frontend-transportada/src/modules/trip/shared/fieldAuthorship.service.ts` (renomeado de
  `fieldOccurrenceAuthorship.service.ts`, `git mv`): `resolveFieldAuthorshipText` ganha `backoffice`
  e o canal `null` (não registrado, D3) — mesma frase "por `<ator>`" para os dois, e `whatsapp` passa
  a levar o nome do ator quando ele existe. `office`/`driver_app` mantidos sem mudança de texto.
- `apps/frontend-transportada/src/modules/trip/locales/{trip,trip.en}.locale.json`: namespace
  `occurrence.authorship.*` movido para `authorship.*` (raiz), com as chaves novas
  `backoffice`/`notRegistered`/`removedActor`/`whatsappWithActor`; `feedback.timelineCursorInvalid`.
- `apps/frontend-transportada/src/modules/trip/components/TripOccurrences.component.tsx`: import
  migrado para `fieldAuthorship.service`.
- `test/trip/field-occurrence-authorship.contract.ts`: migrado para `fieldAuthorship.service` e o
  namespace `authorship.*` — não apagado, os testes existentes continuam e ganham `backoffice`,
  canal `null`, ator removido nos dois casos, `whatsapp` com nome, e a checagem de que nenhum canal
  produz "pelo sistema" (ADR-0068). `test/trip/field-occurrence-validation.contract.ts`: comentário
  do teste de vocabulário atualizado para citar `backoffice`.
- `test/trip/timeline.contract.ts` (novo, importado por `test/trip.contract.test.ts`): validador
  (página completa; `channel`/`recordedAt`/`document` nulos; chave desconhecida; `channel`/`kind`
  fora do vocabulário; envelope sem `items`/`nextCursor`), cliente HTTP (query string com
  `cursor`/`limit`, e sem `cursor` a chave não vai), e paridade de `TRIP_TIMELINE_KINDS` e
  `TRIP_FIELD_CHANNELS` com os arquivos-fonte da API (molde de
  `test/driver-trip/catalog-parity.contract.ts`).

### Decisões

- **`channel: undefined` continua "sem frase" — `channel: null` agora tem frase própria.** São dois
  sinais diferentes: `undefined` é ausência do campo (registro anterior à ADR-0067, ou uma API mais
  antiga que ainda não manda o campo — `TripOccurrence.channel` continua opcional); `null` é o D3
  confirmando, na leitura, que o canal **não foi registrado**. Misturar os dois faria a linha do
  tempo (que sempre manda `channel`, nunca ausente — D6) cair siempre no ramo "sem frase", quando o
  D3 pede "por `<usuária>`" explícito. `FieldAuthorship.channel` passa de `TripFieldChannel?` para
  `null | TripFieldChannel | undefined`.
- **`backoffice` e o canal `null` compartilham o texto "por `<ator>`"**, mas por chaves i18n
  diferentes (`authorship.backoffice`/`authorship.notRegistered`): são conceitualmente diferentes
  (um canal real vs. ausência confirmada) mesmo que a frase de hoje seja igual — divergir no futuro
  não exige tocar na outra.
- **"ator sem nome" não é um caso só.** Para `office`/`driver_app` o rótulo genérico já existente
  (sem nome do ator, mantém o resto da frase) não mudou — a task pede para "manter" os dois. Para
  `backoffice`/canal `null`, o ator **é** a frase inteira, então `actorName: null` cai no rótulo
  dedicado "por usuário removido" (`authorship.removedActor`), nunca a frase ficando vazia. `whatsapp`
  sem nome continua na frase genérica antiga (a mesma decisão do D7: "sem nome, a frase genérica que
  já existia") — não veio pedido para "usuário removido" nesse canal.
- **Não existe "pelo sistema" em canal nenhum** (ADR-0068 "toda escrita tem ator humano") — testado
  explicitamente iterando os cinco canais (`office`, `driver_app`, `whatsapp`, `backoffice`, `null`)
  e conferindo que a palavra "sistema" nunca aparece.
- **`TRIP_TIMELINE_ITEM_KEYS` não tem lista "opcional"** (diferente de `TRIP_OCCURRENCE_KEYS` +
  `TRIP_OCCURRENCE_OPTIONAL_KEYS`): o D6 declara todo campo do `TripTimelineItem` como sempre
  presente (nulo quando falta o dado), então `hasExactKeys` com uma lista só já expressa a regra —
  não há janela de deploy API-antes-do-front a proteger aqui, porque a rota inteira é nova nesta
  spec.
- **Sem `TripTimelineDetailPage`/componente visual.** T7 é só tipos, validador, cliente e hook — a
  seção "Linha do tempo" no detalhe da viagem é a T8, que decide como consumir
  `useTripTimeline`/`resolveFieldAuthorshipText` na tela.
- **Paridade lida do arquivo-fonte da API, não restatada como literal** — mesmo raciocínio do
  `catalog-parity.contract.ts` (`test/driver-trip/`): se a API ganhar um `kind`/canal novo, o teste
  vermelho aponta a divergência antes de a tela mostrar uma lista curta. `TRIP_FIELD_CHANNELS` na API
  é um objeto (`{ driverApp: 'driver_app', … }`, não um array `as const`), então a regex de extração
  usa `: 'valor'` (os valores das chaves), e a comparação ordena os dois lados (`sort()`) porque o
  objeto não garante a mesma ordem do array do front.

### TDD

Os testes de `field-occurrence-authorship.contract.ts` (novos casos: `backoffice`, canal `null`,
ator removido, `whatsapp` com nome, "sem sistema") foram escritos contra a assinatura nova de
`resolveFieldAuthorshipText` antes da reescrita da função — vermelho por chave i18n inexistente
(`authorship.backoffice`/`authorship.notRegistered`/`authorship.removedActor`/
`authorship.whatsappWithActor`), verde depois de mover o namespace e acrescentar as quatro chaves
nos dois locales. `timeline.contract.ts` foi escrito contra `tripTimelineFromApi`/`readTripTimeline`
antes de existirem (import de módulo já criado nesta mesma task — T7 não tem uma etapa "API ainda
não existe" como a T5/T6 tinham, porque o contrato da API já estava fechado e testado desde a T6).

### Comandos e contagens

- `bun run typecheck` (raiz, monorepo inteiro) — sem erros.
- `bun run lint` (raiz do frontend, `eslint .`) — sem erros/avisos, após corrigir dois
  `@typescript-eslint/require-await` nos stubs de `fetch` do `timeline.contract.ts` (viraram
  `Promise.resolve(...)` em vez de função `async` sem `await`).
- `bunx prettier --check` nos arquivos alterados/criados — todos conformes.
- De dentro de `apps/frontend-transportada`, `bun test test/trip.contract.test.ts`: **1101 pass, 0
  fail** (18120 `expect()`) — 15 casos novos (`field-occurrence-authorship.contract.ts`: 7 → 12;
  `timeline.contract.ts`: 10 novos).
- `bun run test` (suíte inteira da app, `package.json`): **4499 pass, 0 fail** nos contratos +
  **19 pass, 0 fail** em `test:hooks` — nenhuma falha pré-existente a justificar (a app não tinha
  vermelho antes desta task).
- `bun run build` (`vite build` + PWA) — build concluído, sem erro; os avisos de chunk > 500 kB são
  pré-existentes (`pdf`, `vectorBasemap.service`, `index`), nenhum arquivo desta task entra nessa
  lista.

### Desvios do pedido

- **Filename do teste de autoria mantido** (`field-occurrence-authorship.contract.ts`, não renomeado
  para `field-authorship.contract.ts`): a instrução pediu migrar o conteúdo ("não apagado"), não
  necessariamente o nome do arquivo — o conteúdo interno (describe, imports, casos) já reflete o
  nome/namespace novos.
- **Teste de `useTripTimeline` não escrito à parte**: hooks que só encapsulam `useInfiniteQuery`
  sobre um cliente e uma condição de permissão (o mesmo padrão de `useTripAllowedActions.hook.ts`,
  que também não tem contrato próprio) não têm precedente de teste direto neste módulo — a lógica
  que vale testar (`canReadTrip`, `tripTimelineFromApi`, `readTripTimeline`) já está coberta em
  `timeline.contract.ts`/`trip.constant.ts`. Registrado aqui como desvio explícito, não omitido.

## T8

### Arquivos

- `apps/frontend-transportada/src/modules/trip/components/TripTimeline.component.tsx` (novo): a
  seção "Linha do tempo" — `<section aria-labelledby>` com `<h3>`, `<ol>` de itens (`<li>` com
  `<time dateTime>`), estados carregando (`SkeletonGroup`/`Skeleton`, molde de
  `CteIssuanceStatusPanel`), vazio, erro com "tentar de novo" e "carregar mais" (`Button` do design
  system, desabilitado durante `isFetchingNextPage`). O checkbox "Só esta nota" (`@/components/ui/checkbox`)
  só aparece quando existe nota aberta (`openDocumentId !== null`) e filtra no cliente.
- `apps/frontend-transportada/src/modules/trip/styles/tripTimeline.module.css` (novo): ver "Decisão
  de CSS" abaixo.
- `apps/frontend-transportada/src/modules/trip/shared/tripTimeline.service.ts` (novo, puro/testável):
  `resolveTripTimelineTitle` (título por `kind`, reaproveitando `status.*`/`separationStatus.*` — não
  inventa vocabulário novo), `removeDuplicateDispatchEvents` (o par `trip.dispatched` +
  `trip.status_changed→dispatched` no mesmo `occurredAt`, D5/D8), `filterTripTimelineItemsByDocumentId`
  (o filtro "Só esta nota", por `document.id`).
- `apps/frontend-transportada/src/modules/trip/hooks/useTripTimeline.hook.ts`: **não alterado** — T7
  já entregou a assinatura `{ permissions, tripId }` certa para ser chamada onde a página já tem as
  duas coisas (ver "Onde a linha do tempo é montada" abaixo).
- `apps/frontend-transportada/src/modules/trip/pages/TripDetail.page.tsx`: chama `useTripTimeline`
  e monta `<TripTimeline>` entre `<TripDetail>` e `<TripFinancialPanel>`, atrás de
  `workspace.controller.canReadTrips` (mesma política de leitura do D4). `openDocumentId` vem de
  `workspace.openProofDocumentId` — a nota com o comprovante aberto no detalhe (a única noção de
  "nota selecionada" que a tela já tinha, `TripDeliveryProofLoader`/`onToggleProof`).
- `apps/frontend-transportada/src/modules/trip/locales/{trip,trip.en}.locale.json`: namespace novo
  `eventTimeline.*` — **não** `timeline.*`: essa chave já existe (a linha do tempo de rota da spec
  110, aba de montagem — `driverPayment`, `tollUnknown`, `openEnd`…), e reaproveitá-la colidiria
  string com objeto. `eventTimeline.itemTitle.*` guarda os títulos por `kind` (títulos de item, não
  de seção — o cabeçalho da seção é `eventTimeline.title`, e as duas chaves não podiam ter o mesmo
  nome no JSON).
- `apps/frontend-transportada/src/modules/trip/styles/trip.module.css`: as 18 classes `.timeline*`
  órfãs da spec 110 (trilho, marca de parada/praça/base, pagamento) removidas — ver "Decisão de CSS".
- `test/trip/timeline-view.contract.ts` (novo, importado por `test/trip.contract.test.ts`): as
  funções puras de `tripTimeline.service.ts`.
- `test/trip-timeline-smoke.helper.ts` (novo) e `test/trip-timeline.smoke.spec.ts` (novo, registrado
  em `playwright.config.ts` `testMatch`): mock de `GET /trips/:id/timeline` com os oito `kind`s do D5
  em duas páginas (a segunda só quando o cliente manda `cursor`), exercitando a seção e "carregar
  mais".

### Decisão de CSS: módulo próprio, não as classes órfãs de `trip.module.css`

A spec pedia escolher entre as classes órfãs `.timeline*` (`trip.module.css:2403-2484`, spec 110) e
um módulo novo — a outra saída sai no mesmo commit. Escolhido **módulo próprio**
(`tripTimeline.module.css`), e as 18 classes órfãs (`.timeline`, `.timelineRow`, `.timelineRail`,
`.timelineBody`, `.timelineMeta`, `.timelineDot`, `.timelineBase`, `.timelineOpenEnd`,
`.timelineToll`/`.timelineTollUnknown`, `.timelineBooth`, `.timelineGap`, `.timelineApproximate`,
`.timelinePayment`, `.timelinePaymentMark`, `.timelineRemoved`) foram removidas de `trip.module.css`.

Motivo: confirmado por `grep` que nenhum `.tsx` do módulo `trip` referenciava `styles.timeline*` —
eram mortas desde que a spec que as desenhou terminou. E, mais importante, é um desenho **diferente**:
o CSS órfão é o trilho vertical com marcas geométricas por quilômetro da rota do dia (parada é
número, praça é quadrado, base é losango, pagamento é `R$`) — a linha do tempo de _eventos_ que a
T8 pede é uma lista cronológica de cartões com autoria, o mesmo gênero visual de
`NfeDocumentEventHistoryDrawer.component.tsx` (`nfeWorkspace.module.css` `.eventHistory*`) e
`CteIssuanceStatusPanel.component.tsx` (`cteIssuance.module.css` `.timeline*`, mas ali sim já é o
mesmo gênero — cartão com título/descrição). Forçar o CSS de trilho+km sobre uma lista de eventos
com autoria produziria uma metáfora visual errada (praça, base, pagamento não fazem sentido aqui).

### Onde a linha do tempo é montada

`useTripTimeline({ permissions, tripId })` é chamado em `TripDetail.page.tsx`, não dentro de
`useTripWorkspace.hook.ts` nem dentro de `TripDetail.component.tsx`. Duas razões:

1. **Evita import circular.** `useTripTimeline.hook.ts` importa `getTripClient` de
   `useTripWorkspace.hook.ts` (T7). Se `useTripWorkspace.hook.ts` importasse `useTripTimeline` de
   volta, os dois módulos se importariam um ao outro.
2. **Já existe o precedente exato**: `TripFinancialPanel` (o painel "antes de custos" da instrução)
   é montado do mesmo jeito — hook próprio (`useTripFinancials({ permissions, tripId })`) chamado em
   `TripDetail.page.tsx`, renderizado como irmão de `<TripDetail>`, sem entrar em `useTripWorkspace`.
   `TripTimeline` segue o mesmo molde, e por isso a posição na tela ("depois das paradas/notas, antes
   de custos") saiu literal: `<TripTimeline>` fica entre `<TripDetail>` e `<TripFinancialPanel>`.

### TDD

`test/trip/timeline-view.contract.ts` foi escrito contra `tripTimeline.service.ts` antes da função
existir (import de módulo inexistente — vermelho por módulo não encontrado), cobrindo: o par de
despacho duplicado removido só quando `occurredAt` bate exatamente (e mantido quando não há o par —
viagem anterior ao deploy da D1, e quando o instante diverge); o filtro por nota aberta (com e sem
`documentId`); o título dos oito `kind`s, inclusive os dois casos "nunca id cru" (nota sem
número/série, parada nula) caindo no rótulo genérico em vez de vazar o id.

O smoke (`trip-timeline.smoke.spec.ts`) foi escrito contra o mock antes de rodar — vermelho por
timeout de login na primeira tentativa (faltava `VITE_SMOKE_AUTH_BYPASS=true`, que o script `smoke`
do `package.json` já exporta — rodei o `playwright test` direto para isolar o spec novo, e precisei
repetir a mesma variável manualmente), depois vermelho de novo porque o print mobile capturava o
topo da página (viewport, não a seção — corrigido com `section.screenshot()` +
`scrollIntoViewIfNeeded()` em vez de `page.screenshot()`), verde depois disso.

### Comandos e contagens

- `bun run typecheck` (raiz, monorepo inteiro) — sem erros.
- `bun run lint` (raiz, todas as apps) — sem erros/avisos, após adicionar `<Icon name="chevron-down">`
  ao botão "Carregar mais": `test/trip/action-icons.contract.ts` reprova qualquer `<Button>` do
  módulo sem ícone (web.md §9), e eu tinha deixado o botão só com texto.
- `bunx prettier --check` nos arquivos alterados/criados — todos conformes.
- `bun test test/trip.contract.test.ts`: **1116 pass, 0 fail** (18138 `expect()`) — 15 casos novos
  (`timeline-view.contract.ts`).
- `bun run test` (suíte inteira da app): **4514 pass, 0 fail** nos contratos + **19 pass, 0 fail** em
  `test:hooks`.
- `bun run build` — concluído sem erro; a lista de chunks > 500 kB não ganhou entrada nova
  (`TripDetail.page` cresceu para 281 kB, mas fica abaixo do teto de aviso).
- Smoke: `VITE_SMOKE_AUTH_BYPASS=true PLAYWRIGHT_REUSE_EXISTING_API_SERVER=true bunx playwright test
test/trip-timeline.smoke.spec.ts` (variáveis de `.env` exportadas antes, `set -a; . ../../.env; set
+a`) — **1 passed**. Prints em
  `specs/158-linha-do-tempo-da-viagem/prints/t8-timeline-{desktop,mobile}.png`.

### Revisão de design (web.md §15)

Desktop: cartões consistentes com os vizinhos da tela (mesma borda, fundo, espaçamento e tipografia
de `TripFiscalReadinessPanel`/`TripOccurrences`), contraste ok em claro e escuro (tema único da app).
Sem primitivo cru: `Button`, `Icon`, `Checkbox`, `Skeleton`/`SkeletonGroup` do design system.

**Pendência registrada, não corrigida nesta task**: no print mobile, a barra de navegação lateral
(`position: fixed`, ícones dos workspaces) sobrepõe a coluna de conteúdo ao rolar a página — visível
atrás dos cartões da linha do tempo. Não é um defeito do CSS desta task (`tripTimeline.module.css`
não usa `position: fixed` em lugar nenhum, e a faixa sobreposta tem a largura exata da barra lateral
global) — é comportamento do shell da aplicação, que se manifestaria atrás de **qualquer** seção
rolada para baixo da tela em mobile, não só a linha do tempo. Fica fora do escopo de T8 (RF6 é sobre
a linha do tempo, não sobre o shell), registrado aqui para uma task própria.

### Desvios do pedido

- **`useTripWorkspace.hook.ts` não ganhou `timelineQuery`**: cogitado primeiro (mesmo padrão de
  `occurrencesQuery`/`deliveryProofsQuery`), descartado pelo import circular explicado acima. A T8
  pedia "decidir como consumir" o hook — a decisão foi replicar o molde de `useTripFinancials`, já
  validado na mesma tela.
- **Filtro "Só esta nota" não coberto pelo smoke**: a nota aberta (`openProofDocumentId`) exige
  clicar em "ver comprovante" numa parada antes, o que o smoke desta task não monta (fora do
  `mockTripWorkspaceApi` padrão sem produtos/comprovante). O filtro no cliente já está coberto, sem
  ambiguidade, por `filterTripTimelineItemsByDocumentId` em `timeline-view.contract.ts` — decisão de
  não duplicar em E2E o que a unidade já prova.

## T9

### Correções da revisão (T9)

Sete itens da revisão T9 do orquestrador, cada um com teste que falhava antes (TDD) e passou depois.
`trip-timeline.query.ts` (753 linhas) virou orquestrador (108 linhas) + `trip-timeline-cursor.service.ts`,
`trip-timeline-merge.service.ts` (`application/`) + `trip-timeline-condition.helper.ts`,
`trip-timeline-status.query.ts`, `trip-timeline-stop.query.ts`, `trip-timeline-document.query.ts`
(`infrastructure/`).

**1. [CRÍTICO] Cursor perdia microssegundos.** `occurred_at` é `timestamptz` (µs); o cursor saía de
`Date.toISOString()` (ms). Quando várias linhas compartilham o mesmo `now()` de transação com
microssegundos não-zero, a comparação `(occurred_at, prioridade, id) < cursor` passava a excluir,
na página seguinte, toda linha com o mesmo instante do cursor mas microssegundos maiores — a tupla
inteira comparava falso porque o primeiro componente (`occurred_at`) já não batia.

- Teste que falhava antes: `test/integration/trip-timeline.integration.ts` — "T9 item crítico: 150
  trip_document_events no mesmo now() de banco não perdem os 50 da página 2" (insere 150 linhas num
  único `INSERT`, todas com `defaultNow()` — o mesmo `now()` real de banco, com microssegundos do
  relógio) e "T9 item crítico: troca de status e evento de nota gravados no mesmo now() não se
  perdem entre páginas" (`database.db.transaction` com `tripStatusEvents` + `tripDocumentEvents`).
  Rodados contra a versão anterior do código (cursor em `Date`): a página 2 vinha vazia/incompleta.
  Reproduzido também isolado, direto no Postgres (tabela descartável, 150 linhas com o mesmo
  `now()`): cursor construído como o código antigo fazia (`new Date(occurred_at).toISOString()`,
  milissegundos) devolve **0** linhas na condição `< cursor` para a página 2 (deveriam sobrar 50);
  o mesmo cursor como texto de microssegundos (`to_char`, o formato novo) devolve as **50** linhas
  corretas.
- Correção: `TripTimelineCursor.occurredAt` passou de `Date` para `string` — o mesmo texto com
  microssegundos que `formatTimelineTimestampKey` (`to_char(... 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
  molde de `drizzle-nfe-document.repository.ts`) produz. Cada fonte agora seleciona
  `occurredAtKey` (esse texto) além de `occurredAt` (`Date`, só para exibição); `mergeTripTimeline`
  compara por `occurredAtKey` (lexicográfico, equivalente ao cronológico no formato fixo), e o
  próximo cursor é codificado a partir de `last.occurredAtKey`, nunca de `last.occurredAt`.
- Contagem: `trip-timeline-merge.contract.ts` ganhou 1 teste (µs desempata por chave, não por
  `Date.getTime()`); `trip-timeline.integration.ts` ganhou 2 testes contra Postgres real.

**2. [ALTO] `ORDER BY` com prioridade `asc`.** `timelineOrderExpression` ordenava
`occurredAt desc, prioridade asc, id desc`, enquanto o keyset (`<`) e o merge em memória tratam
prioridade maior como "vem primeiro" (decrescente). O `limit + 1` de cada fonte cortava os itens de
**menor** prioridade no instante, então uma página pequena que cruzasse esse empate divergia da
leitura em página única.

- Teste que falhava antes: "T9 item alto: empate de trip_stop_events (arrived/delivered/returned)
  atravessa página igual à página única" (`trip-timeline.integration.ts`, `limit: 1`) — comparado
  contra a versão anterior (`asc`), a ordem paginada divergia da página única.
- Correção: `timelineOrderExpression` para `desc` na prioridade
  (`trip-timeline-condition.helper.ts`).

**3. [MÉDIO segurança] Cursor forjado → 500.** `parseTripTimelineCursor` aceitava qualquer `id`
string e qualquer `kindPriority` inteiro; um `id` não-uuid ou uma prioridade fora da tabela
estourariam no `::uuid`/`::int` do SQL, virando 500 em vez de 400.

- Teste que falhava antes (rejeitado só depois do fix): `trip-timeline-merge.contract.ts` — dois
  casos "T9 item 3" (id não-uuid, `kindPriority: 999`) — e `timeline.contract.ts` (rota) — "T9 item
  3: 400 TRIP_TIMELINE_CURSOR_INVALID para cursor forjado".
- Correção: `parseTripTimelineCursor` valida `id` contra regex de uuid, `kindPriority` contra
  `Object.values(TRIP_TIMELINE_KIND_PRIORITY)` e `occurredAt` contra o formato exato de
  microssegundos, devolvendo `null` (→ 400 `TRIP_TIMELINE_CURSOR_INVALID` na rota) para qualquer
  desvio.

**4. [MÉDIO] `drizzle-trip-route.repository.ts`.** `markRoutePlanned`, `markCancelled` e `dispatch`
gravavam `recordTripStatusChange` mesmo quando o `UPDATE` de `trips` não afetava linha nenhuma
(`updated === undefined`, corrida com outra transação), usando `updated?.status ?? '<alvo>'` como
status "adivinhado" — evento de transição gravado sem transição real.

- Correção: as três seguem o molde de `DrizzleTripRepository.close`
  (`if (closed === undefined) return null`) — `if (updated === undefined) return tripRow.status`
  (ou `{ tripStatus: tripRow.status }` no `dispatch`), sem gravar evento.
- Coberto pelos testes de corrida já existentes de `trip-lifecycle.integration.ts` (rodados abaixo,
  sem regressão); a corrida em si (linha desaparecendo entre o `SELECT ... FOR NO KEY UPDATE` e o
  `UPDATE`, dentro da mesma trava) não tem cenário determinístico de teste — a trava a torna
  praticamente inatingível em produção, mas o `?? '<alvo>'` era incorreto por construção.

**5. [MÉDIO] Comentário errado.** `drizzle-trip-document.repository.ts` (~L222) e
`drizzle-trip-document-batch.repository.ts` (~L187) diziam que a trava antes do tally é "o inverso
da ordem notas → viagem", mas o `UPDATE` da nota e o evento já foram gravados por `applyTransition`
antes de `recalculateTripStatus` ser chamado — a ordem "notas → viagem" continua preservada. Texto
corrigido nos dois arquivos: a trava vem antes do tally de propósito (a decisão depende do tally que
ainda vai ser lido), não "imediatamente antes do UPDATE" da viagem.

**6. [MÉDIO] Arquivo de 753 linhas, apresentação importando infraestrutura.** Ver o parágrafo acima
de contagem de linhas. `trip-timeline.schema.ts` (rota) passou a importar `parseTripTimelineCursor`
de `application/trip-timeline-cursor.service.ts`, não mais de `infrastructure/trip-timeline.query.ts`.
`test/trip-schema/trip-timeline-query-tenant-safety.contract.ts` agora concatena o código-fonte dos
quatro arquivos de infraestrutura (`trip-timeline.query.ts` + os três `trip-timeline-*.query.ts`)
antes de varrer — nenhum escapa. `trip-timeline.query.ts` caiu de 753 para 108 linhas;
`trip-timeline-status.query.ts` 166, `trip-timeline-cursor.service.ts` 61,
`trip-timeline-merge.service.ts` 71, `trip-timeline-condition.helper.ts` 73 linhas — dentro do teto.
`trip-timeline-stop.query.ts` (236) e `trip-timeline-document.query.ts` (235) ficam pouco acima de
~200: cada um tem duas fontes relacionadas (D5: `trip_stop_events` cobre três `kind`s), e os três
nomes de arquivo (`status`/`stop`/`document`) foram pedidos explicitamente pelo orquestrador — divididos
mais fundo (uma fonte por arquivo) fugiria do nome pedido; registrado aqui como desvio consciente do
teto de ~200 linhas do padrão de código.

**7. [MÉDIO perf] Predicado indexável.** Acrescentado `occurred_at <= <instante do cursor>`
(`timelineIndexablePredicate`) em cada fonte, ao lado do keyset da tupla. EXPLAIN (Postgres 18,
`trip_status_events`, índice `trip_status_events_company_trip_occurred_at_idx` em
`(company_id, trip_id, occurred_at)`, 41 viagens × 300 eventos = 12.300 linhas na empresa): o
planejador já usava `Index Only Scan Backward` **mesmo sem** o predicado extra — Postgres 18
empurra a comparação de tupla `(occurred_at, prioridade, id) < (cursor)` para dentro do índice
quando `occurred_at` é a primeira coluna variável depois das igualdades (`company_id`, `trip_id`).
Com o predicado, o plano permanece `Index Only Scan Backward` (mesmo índice, `Heap Fetches: 101`,
`Buffers: shared hit=8`), agora com a condição extra explícita em `Index Cond`. Nenhuma regressão;
o predicado é redundante-mas-seguro nesta versão do Postgres e protege índices menos favoráveis
(ex.: `trip_document_events_company_document_occurred_idx`, cuja segunda coluna não é `trip_id`).

### Gates (T9)

- `bun run typecheck` (raiz, 6 apps): sem erros, antes e depois do `prettier --write`.
- `bun run lint` (raiz, 6 apps): sem erros/avisos.
- `bunx prettier --check` nos arquivos alterados: 3 arquivos precisaram de `--write` (quebras de
  linha, sem mudança de lógica) — limpo depois.
- `bun --env-file=../../.env.test test --timeout 120000` (api-transportada, contrato): **6575 pass,
  23 skip, 0 fail** (era o mesmo padrão antes da task — nenhuma das 9 falhas pré-existentes de
  `toll-booth-catalog-repository` citadas no pedido apareceu; ambiente atual não as reproduz).
- `DRIZZLE_TEST_DATABASE_URL=... bun --env-file=../../.env.test test
./test/integration/trip-timeline.integration.ts --timeout 120000`: **13 pass, 0 fail** (3 testes
  novos T9 inclusos).
- `DRIZZLE_TEST_DATABASE_URL=... bun --env-file=../../.env.test test
./test/integration/trip-lifecycle.integration.ts ./test/integration/trip-field-office.integration.ts
./test/integration/me-trip.integration.ts
./test/integration/whatsapp-operator-flow-actions.integration.ts --timeout 120000`: **28 pass,
  0 fail**.
- `DRIZZLE_TEST_DATABASE_URL=... bun --env-file=../../.env.test run test:integration` (suíte
  inteira, 81 arquivos): **435 pass, 8 fail** — as 8 falhas são todas em
  `toll-booth-reload.integration.ts` (`ObjectStorageError: Object storage is unavailable`, MinIO
  fora do ar neste ambiente) — infraestrutura, sem relação com esta task; nenhuma falha em
  `trip-*`.
- `bun run --cwd apps/frontend-transportada test`: **19 pass, 0 fail** — contrato da API não mudou
  (formato de `TripTimelineItem` inalterado; só o cursor opaco, que o frontend nunca desserializa).

### Fechamento da T9 (orquestrador)

- **Security-reviewer (Opus): APROVADO COM CORREÇÕES.** M1 (cursor forjado → 500) corrigido em
  `83da0d8c`. B1 (agregação de nomes/nota/motivo para `finance` e separador) e B2 (ator sem FK de
  membership) registrados como aceites em `docs/SECURITY.md` (2026-09-18).
- **Code-reviewer (Opus): REPROVADO → APROVADO** na revalidação de `83da0d8c`. Os sete itens
  (cursor em µs, `ORDER BY` desc, cursor forjado, evento sem linha atualizada, comentário do
  recálculo, divisão do arquivo, predicado indexável) conferidos por caminho:linha. Restam dois
  BAIXOS aceitos: `trip-timeline-stop.query.ts` e `trip-timeline-document.query.ts` com ~235 linhas
  (duas fontes coesas cada) e `localeCompare` sobre chave ASCII de tamanho fixo.
- **D8:** texto da spec emendado ("antes no tempo" = acima na lista do mais recente para o mais
  antigo); o código não mudou.
- **Documentação viva:** `apps/api-transportada/CLAUDE.md` (escritor único, trava, canais, regra D3,
  cursor), `apps/frontend-transportada/CLAUDE.md` (`TripTimeline`, frase de autoria única,
  `eventTimeline.*` ≠ `timeline.*`), `docs/spec/domain-model.md` (`trip_status_events`, canais,
  `ON_DELIVERY_ROUTE`, que faltava) e nota da exceção da trava no recálculo na ADR-0068 §2.
- **Auditoria §15:** sem N+1 (seis consultas em `Promise.all`, uma por fonte), I/O assíncrono,
  predicado indexável por `occurred_at`; logs sem PII (nenhum log novo); nenhum 500 com stack.
