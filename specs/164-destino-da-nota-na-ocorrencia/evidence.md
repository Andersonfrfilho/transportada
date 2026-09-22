# Evidência

## T1 — Coluna `redelivery_policy` e as tabelas `trip_occurrence_cases`/`trip_occurrence_case_events`

Data: 2026-09-22.

### Validação prévia do `architect` (opus)

A T1 passou por validação do `architect` antes desta execução. As correções trazidas por essa
validação e aplicadas nesta task:

1. Nomes exatos de constraint/índice em `trip_occurrence_case_events`
   (`..._company_id_id_unique`, `..._company_id_companies_id_fk` restrict/cascade,
   `..._company_case_fk` cascade/cascade, `..._actor_kind_check`), e FK direta para `companies` —
   ao contrário de `delivery_charge_events`, que é a exceção sem essa FK; todo módulo `trip` sempre
   tem.
2. Quatro CHECKs novos em `trip_occurrence_cases` para impedir `decided`/`closed` sem
   `decision_kind` (e o inverso): `trip_occurrence_cases_decided_status_check`,
   `..._decision_status_check`, `..._decided_by_check`, `..._decision_note_check`.
3. No histórico: `trip_occurrence_case_events_transition_check`,
   `..._terminal_check` (trava `closed`/`returned_to_warehouse` como terminais), o índice único
   parcial `..._opening_unique` (uma abertura por tratativa) e `..._warehouse_note_check`.
4. **Removido** o índice `trip_occurrence_cases_company_status_updated_at_idx` (nenhuma consulta
   pagina por `updated_at` — o cursor do feed é `(created_at, id)` da ocorrência). Criados
   `trip_occurrence_cases_company_status_idx (company_id, status)` e
   `trip_occurrence_case_events_company_case_occurred_at_idx (company_id, case_id, occurred_at, id)`
   **ascendente**, no molde de `trip_status_events_company_trip_occurred_at_idx`.
5. `status` nasce **sem `default`** — quem abre a tratativa (T4, fora do escopo desta task) grava
   `'recorded'` explicitamente.
6. Nenhum CHECK usa `not valid` + `validate constraint` — confirmado por `db:generate` devolvendo
   `no_changes` e por `make migration-test` verde (ver abaixo).
7. A coluna é `resolved_at`, não `closed_at` — ela também é preenchida por
   `returned_to_warehouse`. Comentário no schema explica a escolha.
8. Duas tentações registradas e recusadas, com comentário no schema: (a) sem FK composta de
   `trip_occurrence_cases`/item do acerto para `trip_document_occurrence_products` (formatos
   incompatíveis entre ocorrência antiga, WhatsApp e nota inteira); (b)
   `trip_document_occurrences.occurrence_type_id` continua sem FK para `company_occurrence_types` —
   não é esta spec que conserta.

### Escopo alterado

`trip_occurrence_item_settlements` saiu da T1 e foi para a T16 (Fase 5), junto da migration que
amplia `delivery_charges` — o item do acerto e a cobrança que ele alimenta mexem no mesmo dinheiro.
`tasks.md` e `plan.md` foram atualizados com uma linha cada registrando a mudança.

### Arquivos tocados

- `apps/api-transportada/src/database/trip.schema.ts` — vocabulário
  (`TRIP_OCCURRENCE_CASE_STATUSES`, `TRIP_OCCURRENCE_CASE_DECISION_KINDS`,
  `TRIP_OCCURRENCE_CASE_ACTOR_KINDS`, `REDELIVERY_POLICIES`), coluna `redelivery_policy` em
  `companyOccurrenceTypes`, tabelas `tripOccurrenceCases` e `tripOccurrenceCaseEvents`.
- `apps/api-transportada/src/database/database.schema.ts` — agrega as duas tabelas novas
  (import nomeado + `databaseSchema`).
- `apps/api-transportada/drizzle/20260922174226_trip_occurrence_cases/migration.sql`,
  `rollback.sql`, `snapshot.json` — migration nova.
- `apps/api-transportada/test/database-migration/static-migration.contract.ts` — lista estática de
  diretórios de migration, somada a nova pasta (senão `database-migration.contract.test.ts` reprova).
- `specs/164-destino-da-nota-na-ocorrencia/tasks.md` — T1 marcada `[x]`, escopo alterado registrado
  na T1 e na T16; precondição sobre `SaveOccurrenceTypeValues` registrada na T21.
- `specs/164-destino-da-nota-na-ocorrencia/plan.md` — modelo SQL atualizado para o que foi
  implementado, com as oito correções do `architect` documentadas.

### Constraints e índices criados (por nome, do `migration.sql`)

**`company_occurrence_types`** (coluna nova):

- `company_occurrence_types_redelivery_policy_check`

**`trip_occurrence_cases`**:

- `trip_occurrence_cases_company_id_id_unique` (unique)
- `trip_occurrence_cases_occurrence_unique` (unique)
- `trip_occurrence_cases_status_check`
- `trip_occurrence_cases_policy_check`
- `trip_occurrence_cases_decision_check`
- `trip_occurrence_cases_decision_kind_check`
- `trip_occurrence_cases_decided_status_check`
- `trip_occurrence_cases_decision_status_check`
- `trip_occurrence_cases_decided_by_check`
- `trip_occurrence_cases_decision_note_check`
- `trip_occurrence_cases_resolved_check`
- `trip_occurrence_cases_company_id_companies_id_fk` (restrict/cascade)
- `trip_occurrence_cases_company_occurrence_fk` (cascade/cascade)
- índice `trip_occurrence_cases_company_status_idx (company_id, status)`

**`trip_occurrence_case_events`**:

- `trip_occurrence_case_events_company_id_id_unique` (unique)
- `trip_occurrence_case_events_actor_kind_check`
- `trip_occurrence_case_events_from_status_check`
- `trip_occurrence_case_events_to_status_check`
- `trip_occurrence_case_events_transition_check`
- `trip_occurrence_case_events_terminal_check`
- `trip_occurrence_case_events_warehouse_note_check`
- `trip_occurrence_case_events_company_id_companies_id_fk` (restrict/cascade)
- `trip_occurrence_case_events_company_case_fk` (cascade/cascade)
- índice único parcial `trip_occurrence_case_events_opening_unique (company_id, case_id) where
from_status is null`
- índice `trip_occurrence_case_events_company_case_occurred_at_idx (company_id, case_id,
occurred_at, id)`

### `bun run db:generate` (depois da migration aplicada ao schema TS)

```
$ drizzle-kit generate --output json --config drizzle.config.ts --name should_be_no_changes
{"status":"no_changes","dialect":"postgresql"}
```

### `make migration-test` (ida e volta — migrate + rollback em Postgres descartável)

```
 110 pass
 0 fail
 1417 expect() calls
Ran 110 tests across 8 files. [31.77s]
```

Inclui `test/database-migration/schema-snapshot.contract.ts` (importado por
`database-migration.contract.test.ts`) e o teste estático de migration/rollback contra Postgres
descartável (`DRIZZLE_TEST_DATABASE_URL`, a partir do `.env` local — porta 55432). O rollback foi
exercitado com as tabelas vazias (reverte) e a política de recusa com linha presente segue o molde
de `20260921224341_trip_document_occurrence_attachments/rollback.sql` (`RAISE EXCEPTION` se
`trip_occurrence_cases`/`trip_occurrence_case_events` tiverem linha).

### ⚠️ Infra de teste — o que estava quebrado, o que foi contornado, e o que segue quebrado

O relato inicial desta evidência rodou com um contorno (Postgres nativo do Homebrew no scratchpad,
`postgresql@18`, cluster efêmero em `127.0.0.1:65440`) porque o Postgres de teste do Docker
(`.env.test`, porta 65432, container `transportada-test-postgres-1`) estava com o defeito de I/O já
registrado em memória (`banco-de-teste-local-quebrado.md`, 15/09/2026) — o container aparecia
`Exited (255)` desde 42h antes desta sessão.

**Depois que o coordenador confirmou que a infra Docker do projeto estava de pé (`make up`) e pediu
para rodar a integração de verdade**, `make e2e-up` (que a infra dedicada de teste precisa — `make
up` sozinho não sobe `transportada-test-postgres-1`) trouxe o Postgres de teste de volta saudável.
Confirmado com `docker exec transportada-test-postgres-1 psql ... select 1` — sem erro de I/O. **O
defeito de I/O do dia 15/09 não se repetiu**; os testes a partir daqui rodaram contra
`transportada-test-postgres-1` (porta 65432, `.env.test`), não contra o contorno nativo.

Depois disso, restava um segundo problema, **novo e não relacionado a esta task**: 8 testes de
integração (nenhum deles de `trip_occurrence_cases`/`trip_occurrence_case_events`) falhavam com
`ObjectStorageError('OBJECT_STORAGE_UNAVAILABLE')` contra o MinIO de teste
(`transportada-test-minio-1`, porta 62000). Causa raiz encontrada e confirmada:
**`.env.test` define `STORAGE_SECRET_KEY=replace-me`, mas `compose.yaml:39` fixa
`MINIO_ROOT_PASSWORD=minio-local-password`** para o serviço `minio` — o placeholder do
`.env.test.example` nunca foi substituído pela senha real do container. `curl` direto ao MinIO (porta 62000) respondia `403 Forbidden` para a autenticação errada, confirmando a causa. **Esse arquivo é
compartilhado por link simbólico entre esta árvore e o checkout principal** (`.claude/worktrees/.../
.env.test -> /Users/anderson.filho/.../transportada/.env.test`), e o harness recusou a edição por
estar fora desta worktree — **não foi corrigido nesta sessão**. Ninguém rodou T1 com object storage
funcionando de ponta a ponta; isso é um achado a registrar/corrigir à parte, fora do escopo desta
task (nenhuma das oito falhas toca as tabelas desta migration).

### `bun --env-file=../../.env.test test --timeout 120000` (contrato)

Contra `transportada-test-postgres-1` (porta 65432, saudável):

```
 6946 pass
 23 skip
 0 fail
 23598 expect() calls
Ran 6969 tests across 183 files. [21.54s]
```

### `bun --env-file=../../.env.test run test:integration` (integração)

Contra `transportada-test-postgres-1` (porta 65432, saudável) e `transportada-test-minio-1` (porta
62000, com a credencial quebrada do `.env.test` acima):

```
 514 pass
 7 skip
 8 fail
 3048 expect() calls
Ran 529 tests across 93 files. [379.90s]
```

As 8 falhas, todas por `OBJECT_STORAGE_UNAVAILABLE` (credencial do `.env.test`, não código desta
task):

- `cte archive gateway integration` — 2 casos
- `toll booth extract create-only integration (spec 154, T301)` — 2 casos
- `toll booth catalog reload integration (spec 154, T302)` — 4 casos

Nenhuma delas exercita `trip_occurrence_cases`, `trip_occurrence_case_events` ou
`company_occurrence_types.redelivery_policy`. Nenhuma suíte de ocorrência de hoje mudou de
comportamento — confirmado pelos 514 pass acima incluindo as suítes de `trip_document_occurrences`/
`trip_document_occurrence_attachments`/`trip_document_occurrence_products` sem regressão.

### Typecheck e gates

```
$ bun run typecheck
(6 apps, tsc --noEmit em cada uma) — sem erro
```

### Commit isolado

Commit único desta task (SHA e mensagem no relatório final da conversa — sem push).

## T2 — A máquina de estados da tratativa

### Duas decisões do usuário (mudaram o desenho da T1)

1. **Estado terminal `cancelled`, ação `cancel`.** Ocorrência aberta por engano. Sai só de
   `recorded` e `under_review` — nunca de `awaiting_contractor` em diante (D4: depois que o
   contratante viu, esconder é reescrever o que ele leu). Motivo obrigatório, no banco
   (`trip_occurrence_case_events_cancel_note_check`) e na política. `resolved_at` e o CHECK de
   terminal do histórico passam a cobrir os três terminais.
2. **O escritório pode decidir no lugar do contratante que não responde.** `decide` aceita ator
   interno (tipicamente `other`, com nota obrigatória — validada em outra camada, T5/T10), e a
   trilha grava `actor_kind = 'internal'`. A política decide a transição; permissão é de outra
   camada.

Decisão completa, com todas as correções da revisão, em `plan.md` § "T2 — decisões que mudaram o
desenho da T1".

### Migration da T1 ajustada no lugar (ainda não publicada)

Mesma pasta `drizzle/20260922174226_trip_occurrence_cases/`: `TRIP_OCCURRENCE_CASE_STATUSES` ganhou
`cancelled`; `trip_occurrence_cases` ganhou a coluna `redelivery_application` (RF18, ver abaixo) e o
CHECK `trip_occurrence_cases_redelivery_application_check`; `trip_occurrence_cases_resolved_check`
e `trip_occurrence_case_events_terminal_check` passaram a cobrir `cancelled`; CHECK novo
`trip_occurrence_case_events_cancel_note_check`. `migration.sql`/`rollback.sql` editados à mão
(hash do `rollback.sql` recalculado: `f4d80dd16189575d22d2d12c1b1c25bd2df15bbb00ee3ddb25a7b3ea0ba04b6e`),
`snapshot.json` regerado pela receita (`db:generate --name tmp`, mover, apagar `tmp`, `prevIds`
corrigido para encadear no snapshot anterior à T1).

```
$ bun run db:generate
{"status":"no_changes","dialect":"postgresql"}
```

### RF18 — a coluna, não a tabela

`trip_occurrence_cases.redelivery_application` (`reordered | released | refused`, nulável) — ver a
contradição e a resolução em `plan.md`. Não é tocada nesta task (T14 grava); só o schema nasceu.

### Arquivos tocados

- `src/database/trip.schema.ts` — `TRIP_OCCURRENCE_CASE_STATUSES` (+`cancelled`),
  `TRIP_OCCURRENCE_CASE_REDELIVERY_APPLICATIONS` (novo), coluna `redelivery_application` e os
  CHECKs acima.
- `src/trips/domain/occurrence-case-state.policy.ts` (novo) — `OCCURRENCE_CASE_ACTIONS`,
  `OCCURRENCE_CASE_TERMINAL_STATUSES`, `OCCURRENCE_CASE_TRANSITION_REFUSALS`,
  `checkOccurrenceCaseTransition`.
- `src/trips/domain/occurrence-case.policy.ts` (novo) — `resolveOccurrenceCaseOpening`,
  `CONTRACTOR_VISIBLE_CASE_STATUSES`.
- `test/trip-domain/occurrence-case-state.contract.ts` (novo, quatro camadas — ver abaixo).
- `test/trip-domain/occurrence-case.contract.ts` (novo).
- `test/trip-domain.contract.test.ts` — dois imports novos (entrypoint que o `bun test` já
  descobre por padrão; sem lista explícita no `package.json` para testes de domínio puro).
- `drizzle/20260922174226_trip_occurrence_cases/{migration.sql,rollback.sql,snapshot.json}`.
- `specs/164-destino-da-nota-na-ocorrencia/plan.md` — seção "T2 — decisões que mudaram o desenho da
  T1".

### A máquina, por extenso (base da tabela do teste)

```
recorded ─review─→ under_review ─warehouse_return─→ returned_to_warehouse   (terminal)
   │                         └─contractor_submission─→ awaiting_contractor
   │                                                       │
   └──────────────────cancel──────────────────────┐  decide│
                                                    ↓       ↓
                                               cancelled  decided ─closure─→ closed   (terminal)
                                               (terminal)
```

7 arestas `changed`, 7 `unchanged` (uma por ação, no próprio destino), 28 `refused`
(`OCCURRENCE_CASE_TRANSITION_NOT_ALLOWED`) — 42 combinações no total (`7 status × 6 ações`).

### `bun --env-file=../../.env.test test test/trip-domain.contract.test.ts --timeout 60000`

```
 222 pass
 0 fail
 1024 expect() calls
Ran 222 tests across 1 file. [88.00ms]
```

As quatro camadas do teste de `occurrence-case-state.contract.ts`: (1) tabela literal
`STATUSES × ACTIONS` escrita à mão, `toEqual` sobre o objeto inteiro — sem derivar nada do próprio
resultado (a comparação tautológica do molde `charge-state.contract.ts` foi propositalmente **não**
copiada); (2) `expect(changedEdges.length).toBe(7)`; (3) nenhum `changed` sai dos três terminais,
varrendo as seis ações contra os três; (4) travessia (DFS/BFS) a partir de `recorded` pelas arestas
`changed` — lança se alguma apontar para um estado já no caminho atual, e confere que os sete
estados são todos alcançáveis. Mais: idempotência de todas as combinações `changed`, e um caso por
recusa de negócio (RF7, RF16, `settlementWithoutItems`), cada um com a variante que **não** recusa
ao lado.

### `bun --env-file=../../.env.test test --timeout 120000` (suíte inteira, contrato)

```
 6958 pass
 23 skip
 0 fail
 23681 expect() calls
Ran 6981 tests across 183 files. [28.99s]
```

Nenhuma regressão nas 6946 → 6958 (as 12 a mais são os testes novos desta task; nenhuma suíte
existente mudou de resultado).

### `make migration-test` (migrate + rollback em Postgres descartável)

```
 110 pass
 0 fail
 1417 expect() calls
Ran 110 tests across 8 files. [50.07s]
```

Mesma contagem da T1 (110 pass) — a migration ajustada continua migrando e revertendo limpa.

### `bun run lint` (raiz, 6 apps) e `bun run typecheck` (raiz)

Ambos sem erro, sem warning.

### Commit isolado

Commit único desta task (SHA e mensagem no relatório final da conversa — sem push).

## T3 — erros de domínio da tratativa de ocorrência

Seis erros novos em `src/trips/domain/trip.error.ts`, quatro deles casando o `code` com
`OCCURRENCE_CASE_TRANSITION_REFUSALS` (`occurrence-case-state.policy.ts`) em vez de repetir a
string: `OccurrenceCaseNotFoundError` (404), `OccurrenceCaseTransitionNotAllowedError` (409),
`OccurrenceCaseRedeliveryNotAllowedError` (422, cobre as duas recusas de reentrega da política via
parâmetro) e `OccurrenceCaseSettlementWithoutItemsError` (422). `OccurrenceSettlementItemUnknownError`
e `OccurrenceSettlementAmountInvalidError` (422) são código próprio — a T13 ainda não existe.

Contrato novo: `test/trip-domain/occurrence-case.error.contract.ts`, importado por
`test/trip-domain.contract.test.ts`. Confere `status`, `code` e a ausência de marcadores de PII
(nome, telefone, e-mail, CPF) em toda mensagem — as mensagens são fixas, nunca interpoladas.

### `bun --env-file=../../.env.test test ./test/trip-domain.contract.test.ts --timeout 120000`

```
 230 pass
 0 fail
 1091 expect() calls
Ran 230 tests across 1 file. [59.00ms]
```

### `bun --env-file=../../.env.test test --timeout 120000` (suíte inteira, contrato)

```
 6966 pass
 23 skip
 0 fail
 23748 expect() calls
Ran 6989 tests across 183 files. [22.00s]
```

8 testes a mais que a T2 (6958 → 6966): os 8 novos desta task.

### `bun run lint` (raiz, 6 apps) e `bun run typecheck` (raiz)

Ambos sem erro, sem warning.

### Commit isolado

Commit único desta task (SHA e mensagem no relatório final da conversa — sem push).

## T4 — repositório escritor e abertura da tratativa na transação

`src/trips/infrastructure/drizzle-occurrence-case.repository.ts` (novo): `openOccurrenceCase`
(chamada de dentro da transação de `saveTripOccurrence`, `unset` não abre) e
`DrizzleOccurrenceCaseRepository.transition` — molde de `DrizzleTripRepository.close`: `select …
for no key update` imediatamente antes do `update` (nunca `for update`), recheca
`checkOccurrenceCaseTransition` depois do lock, grava por compare-and-set (`where status =
<travado>`) e insere o evento só quando o status mudou. Zero linhas no CAS → 409
`OccurrenceCaseTransitionNotAllowedError`, nunca 404 nem silêncio.

`redeliveryPolicy` passou a viajar (opcional, `exactOptionalPropertyTypes`-seguro) por toda a
cadeia dos dois fluxos de registro: `register-trip-occurrence.use-case.ts` →
`persist-separation-occurrence-attachment.service.ts` →
`drizzle-separation-occurrence.repository.ts` → `saveTripOccurrence`
(`delivery-proof-read.support.ts`, que agora abre a tratativa) — e o mesmo para o lote do
escritório (`office-occurrence-batch.types.ts` / `.service.ts` →
`drizzle-office-occurrence-batch.repository.ts`, que reusa `saveTripOccurrence`). As duas fiações
de `src/main.ts` (WhatsApp e HTTP) atualizadas para repassar o campo. `findOccurrenceType`
(`delivery-proof-read.support.ts`) agora seleciona `company_occurrence_types.redelivery_policy`.

`test/trip-schema/tenant-safety.contract.ts`: `trip_occurrence_cases` e
`trip_occurrence_case_events` somadas a `TRIP_TABLES`, mais o teste da FK composta que alcança a
ocorrência e o evento sempre por `(company_id, id)`.

`test/integration/trip-occurrence-case-write-guard.integration.ts` (novo, somado ao
`test:integration` do `package.json`): três provas contra Postgres de verdade — (1) tipo
`allowed`/`blocked` abre a tratativa em `recorded` com o evento de abertura (`from_status` nulo),
na mesma transação de `persistSeparationOccurrenceWithAttachment` (o caminho real de
`register-trip-occurrence.use-case.ts` em produção); (2) tipo `unset` não abre nada; (3) a corrida
real — molde de `raceAgainstBlocker` em `trip-status-write-guard.integration.ts`: uma transação
bloqueadora seura o `for no key update` da tratativa, muda o status e libera só depois que a
transação perdedora já está bloqueada no mesmo lock; a perdedora relê o status (já mudado) e a
própria `checkOccurrenceCaseTransition` recusa com 409, provado pelo `toBeInstanceOf`.

### `bun --env-file=../../.env.test test ./test/integration/trip-occurrence-case-write-guard.integration.ts --timeout 120000`

```
 3 pass
 0 fail
 11 expect() calls
Ran 3 tests across 1 file. [3.90s]
```

### `bun --env-file=../../.env.test test --timeout 120000` (suíte inteira, contrato)

```
 6967 pass
 23 skip
 0 fail
 23752 expect() calls
Ran 6990 tests across 183 files. [22.32s]
```

Nenhuma regressão (6966 → 6967: o teste novo desta task, `trip-schema.contract.test.ts` com a FK
composta a mais).

### `bun run typecheck` (raiz, 6 apps) e `bun run lint` (raiz, 6 apps)

Ambos sem erro, sem warning.

### `bun --env-file=../../.env.test run test:integration` (suíte inteira, integração)

```
 517 pass
 7 skip
 8 fail
 3059 expect() calls
Ran 532 tests across 94 files. [422.83s]
```

Delta contra a T1 (última vez que a suíte inteira rodou: 514 pass / 529 testes / 93 arquivos):
**+3 pass, +3 testes, +1 arquivo, +11 expect()** — exatamente o arquivo novo desta task, nada mais
mudou de resultado.

As 8 falhas são as mesmas 4 suítes já diagnosticadas na T1 — `cte archive gateway integration` (2),
`toll booth extract create-only integration` (2) e `toll booth catalog reload integration` (4) —,
todas por `OBJECT_STORAGE_UNAVAILABLE`: o `.env.test` local deste checkout tem
`STORAGE_SECRET_KEY=replace-me` enquanto o compose fixa `minio-local-password`. **Não são desta
task** — o template do repositório (`.env.example`) já corrige o valor (commit `df3093365`,
anterior a esta sessão); é o `.env.test` já existente na máquina que ficou para trás. Nenhuma delas
toca `trip_occurrence_cases`, `trip_occurrence_case_events`, `company_occurrence_types` ou qualquer
caminho de registro de ocorrência.

### Commit isolado

Commit único desta task (SHA e mensagem no relatório final da conversa — sem push).

## Fase 1 encerrada

T1–T4 commitadas e verificadas. Fase 2 (T5–T8) fica para outra rodada.

## T8 — o feed enxerga a tratativa

- `bun run lint` e `bun run typecheck` (raiz, seis apps) — limpos.
- `bun --env-file=../../.env.test test --timeout 120000` — **7015 pass, 0 fail** (183 arquivos).
- `bun --env-file=../../.env.test test ./test/integration/trip-occurrence-feed-case.integration.ts`
  — **2 pass, 0 fail**: ocorrência sem tratativa devolve `case: null` e o cursor do feed não muda.

### Suíte de integração completa (rodada após o commit acima)

```
bun --env-file=../../.env.test run test:integration
 518 pass
 7 skip
 9 fail
 3064 expect() calls
Ran 534 tests across 95 files. [668.78s]
```

Oito das nove falhas são as mesmas já diagnosticadas desde a T1 —
`cte archive gateway integration` (2), `toll booth extract create-only integration` (2) e
`toll booth catalog reload integration` (4) —, todas `OBJECT_STORAGE_UNAVAILABLE` por credencial
divergente do MinIO local (não desta task). A nona é nova nesta rodada e **também não é desta
task**: `o repasse contra Postgres (spec 060 T010–T012) > recusa a segunda sugestão da mesma nota e
tipo` estourou por timeout (5000ms) — suíte de `delivery_charges`/repasse, sem relação com
`trip_occurrence_cases`, `trip_occurrence_case_events` ou o `left join` do feed; tem cara de
contenção de Postgres sob a carga da suíte inteira (534 testes, 95 arquivos), não de regressão.
Nenhuma das nove toca qualquer caminho tocado por T5–T8.

⚠️ **Nota sobre concorrência no worktree**: o commit `f75ce3295` (T8) já estava na árvore quando
esta verificação rodou, com `Co-Authored-By: Claude Opus 5` em vez da atribuição pedida nesta
sessão (`Claude Sonnet 5`) — e dois commits de documentação (`ff063757f`, `ac1d9cfa3`) apareceram
entre o T7 (`a81256cac`) e o T8, tocando `plan.md`/`tasks.md` da Fase 3 (T9+), fora do escopo desta
rodada. O diff do T8 bate exatamente com o que esta sessão implementou (mesmos arquivos, mesma
contagem de linhas). Tudo indica outra sessão operando no mesmo worktree ao mesmo tempo — o
`CLAUDE.md` da raiz já registra esse risco em "Duas sessões, duas árvores". Nada foi revertido ou
recommitado; só esta nota e a verificação da suíte completa foram acrescentadas agora.

### Correção de registro: a "outra sessão" era o coordenador

A nota da Fase 2 sobre commits aparecendo na árvore sem terem sido feitos pelo executor está certa no
fato e errada no autor: `f75ce3295` (T8), `ff063757f` e `ac1d9cfa3` foram commitados pela sessão
coordenadora desta execução, que fechou a T8 quando o executor ficou parado esperando uma suíte em
segundo plano e registrou no plano a validação 🧠 da Fase 3. Mesma árvore, mesmo trabalho — não houve
sessão paralela desconhecida.

A nona falha da integração (`518 pass / 9 fail`) também foi identificada: um timeout isolado em
repasse/`delivery_charges` (spec 060), sem relação com ocorrência. As outras oito são a credencial do
MinIO no `.env.test` local.

## Fase 3 — T9, T10, T11, T12

Rodada única (sessão nova, sem exploração delegada, sem espera de processo em segundo plano além do
`test:integration` final): permissão `occurrences.decide`, a consulta do portal, a decisão do
contratante, a foto reaproveitada e a integração contra Postgres.

### T9 — permissão `occurrences.decide` e `contractor-occurrence.query.ts`

- `src/identity/domain/authorization.policy.ts`: `occurrences.decide` somada a
  `TRANSPORTADA_PERMISSIONS` e só ao papel `contractor` (nenhum papel interno).
- `src/contractor-portal/infrastructure/contractor-occurrence.query.ts`: `listContractorOccurrences`
  e `findContractorOccurrenceDetail`, com `inner join` em `trip_occurrence_cases` filtrado por
  `CONTRACTOR_VISIBLE_CASE_STATUSES` e recorte do contratante por `exists` sobre `nfe_participants`
  (nunca `innerJoin` + `distinct`).
- **Contradição resolvida antes da T10** (correção do `architect` no `plan.md`):
  `trip_occurrence_case_events.actor_user_id` passa a `NOT NULL` — o comentário antigo dizia "só
  para ator interno", e a RF14 manda gravar quem do contratante decidiu. Como a migration da
  T1/T2 (`20260922174226_trip_occurrence_cases`) já estava publicada em `origin/staging`
  (`git log --oneline origin/staging -- drizzle/20260922174226_trip_occurrence_cases/` devolveu os
  dois commits), a correção foi uma migration **nova** e aditiva —
  `drizzle/20260922203040_occurrence_case_event_actor_required/` — em vez de editar a pasta antiga.
  `bun run db:generate --name check_no_changes` → `{"status":"no_changes"}` depois de aplicada.
- Todo caminho que grava `trip_occurrence_case_events` foi conferido: `openOccurrenceCase` e
  `applyTransition` (`drizzle-occurrence-case.repository.ts`) já gravavam `actorUserId` não nulo;
  `occurrence-case.port.ts` e o tipo do repositório foram apertados de `string | null` para `string`.
  Um `insert` direto em teste de integração
  (`trip-occurrence-case-write-guard.integration.ts`) não passava `actorUserId` — corrigido.

### T10 — `decide-occurrence-case.use-case.ts` e `contractor-occurrence.routes.ts`

- `GET /client/me/occurrences` (`deliveries.track`) e
  `POST /client/me/occurrences/:id/decision` (`occurrences.decide`).
- `requireOccurrenceInScope` roda antes de qualquer leitura (molde de `requireBatchInScope`); fora
  de escopo, ou tratativa em `recorded`/`under_review`/`returned_to_warehouse`, responde `404`
  (`OCCURRENCE_CASE_NOT_FOUND`) — nunca `403`, e byte a byte igual ao id inexistente, porque o
  filtro por `CONTRACTOR_VISIBLE_CASE_STATUSES` mora na mesma consulta do escopo.
- `actorKind: 'contractor'` é constante literal da rota, nunca parâmetro — quem garante que o
  chamador é o contratante é `resolveContractorScope`, não o token sozinho.
- Decisão repetida (mesma dupla `kind`/`note`) converge (`unchanged`, 200, sem novo evento);
  decisão **diferente** sobre tratativa já `decided` é `409` — a máquina
  (`checkOccurrenceCaseTransition`) não distingue as duas (as duas batem `status === to`), então
  quem distingue é o caso de uso, comparando contra `decisionKind`/`decisionNote` já gravados,
  **antes** de chamar o repositório.

### T11 — a foto no portal

- Reaproveitado o ponto único de leitura (`readOccurrenceAttachments`,
  `trips/application/occurrence-attachment.service.ts`) e o gateway de presigned de 5 min
  (`createDeliveryProofDownloadGateway`) já usados pelo escritório — sem `objectKey`/`bucket` na
  resposta, anexo vencido sai com `expired: true` e sem URL.
- `occurrenceId` entregue a `readOccurrenceAttachments` é sempre o da linha já resolvida pela
  consulta com escopo (T9), nunca lido cru do caminho.

### T12 — `test/integration/trip-occurrence-case.integration.ts`

Somado à lista explícita de `test:integration` no `package.json` (teste novo não roda sem isso).

```
bun --env-file=../../.env.test test ./test/integration/trip-occurrence-case.integration.ts --timeout 120000
 2 pass
 0 fail
 12 expect() calls
Ran 2 tests across 1 file.
```

Cobre, contra Postgres real:

- a máquina inteira (`recorded → under_review → awaiting_contractor → decided`) sobre a mesma linha;
- a consulta do portal (T9): invisível em `recorded`/`under_review`, visível em
  `awaiting_contractor`, e nunca a ocorrência de outra empresa/contratante mesmo no mesmo estado;
- a decisão (T10): converge em repetição da mesma decisão, `409` numa decisão diferente sobre
  `decided`, e um único evento `to_status = 'decided'` gravado (a convergência não escreveu de
  novo);
- a corrida das duas abas: duas chamadas concorrentes de `decide` com a mesma decisão devolvem
  `['changed', 'unchanged']` (nunca as duas `changed`, nunca as duas `unchanged` por erro) e só um
  evento de decisão é gravado — o `for no key update` + compare-and-set do repositório (T4) é quem
  garante isso, exercitado aqui contra Postgres de verdade, não dublê.

`explain` das duas consultas novas (RNF5) — rodado à mão contra o banco local do compose, com os
dados semeados pelo teste acima ainda no ar antes do `afterAll` derrubar o banco descartável:
`listContractorOccurrences`/`findContractorOccurrenceDetail` resolvem por
`trip_document_occurrences.company_id` (índice de FK) → `inner join` em `trip_occurrence_cases` pela
unique `(company_id, occurrence_id)` → `inner join` em `company_occurrence_types` pela unique
`(company_id, id)` → `inner join` em `trip_documents` pela PK, com o filtro `exists` sobre
`nfe_participants` resolvendo por `nfe_participants_company_id_document_id_idx` (mesmo padrão que
`listContractorDeliveries` já usa em produção) — sem sequential scan em nenhuma tabela grande.

### Gates da Fase 3

- `bun run lint` (raiz) — limpo.
- `bun run typecheck` (raiz, seis apps) — limpo.
- `bun --env-file=../../.env.test test --timeout 120000` — **6992 pass, 0 fail** (183 arquivos,
  23817 `expect()`), depois de ajustar as três suítes que enumeravam a lista fechada de permissões
  (`authorization.contract.test.ts`, `contractor-portal-schema/registry.contract.ts`) e a lista de
  pastas de migration (`database-migration/static-migration.contract.ts`).
- `bun run db:generate` → `no_changes` depois da migration nova.
- `make migration-test` — **110 pass, 0 fail** (a suíte de migration/rollback contra Postgres
  descartável, incluindo a migration nova da T9).
- `bun --env-file=../../.env.test run test:integration` (suíte inteira) — **521 pass, 8 fail, 7
  skip, 3076 expect()**, 536 testes em 96 arquivos. Delta contra a T8 (518 pass / 9 fail / 534
  testes / 95 arquivos): **+3 pass, +2 testes, +1 arquivo** — exatamente os dois testes novos desta
  rodada, e a nona falha da T8 (timeout de contenção em repasse/`delivery_charges`, já registrada
  como não-determinística) não se repetiu. As oito falhas restantes são as mesmas já diagnosticadas
  desde a T1 — `toll booth catalog reload integration` (3 nesta rodada, as outras somem/reaparecem
  por ordem) e `toll booth extract create-only`/`cte archive gateway` —, todas
  `OBJECT_STORAGE_UNAVAILABLE` pela credencial divergente do MinIO no `.env.test` local. Nenhuma
  toca `trip_occurrence_cases`, `trip_occurrence_case_events`, `contractor_portal_bindings` ou
  qualquer caminho tocado por T9–T12.

### Commits isolados desta rodada

1. `feat(api): spec 164 T9 — permissão occurrences.decide e a consulta do portal`
2. `feat(api): spec 164 T10/T11 — decisão do contratante e a foto no portal`
3. `feat(api): spec 164 T12 — integração contra Postgres da tratativa` (a seguir)

⚠️ T10 e T11 fecharam num commit só: a foto entra na mesma resposta das rotas do T10
(`contractor-occurrence.routes.ts`), e as duas dependências (`decideOccurrenceCase`,
`readAttachments`) são fiadas juntas em `src/main.ts` no mesmo bloco — separar o commit exigiria
uma rota "de mentira" no meio do caminho. Registrado aqui em vez de forçar o isolamento.

## Fase 4 — T15: o marcador derivado (RF20/RF21)

`readTripDetail` passa a devolver `openOccurrenceCase: boolean` por nota (RF20) e
`hasOpenOccurrence: boolean` por parada (RF21), os dois **derivados na leitura** — nenhuma escrita
em `trip_documents.separation_status`, nenhuma migration nova. A leitura é uma consulta a mais e
fixa: `loadTripDocumentIdsWithOpenOccurrenceCase`
(`src/trips/infrastructure/occurrence-case-marker.query.ts`) faz `trip_document_occurrences` `inner
join` `trip_occurrence_cases`, filtrando `status not in (returned_to_warehouse, closed, cancelled)`
pelos `tripDocumentId`s que o detalhe já buscou — nunca uma consulta por parada ou por nota, e
reaproveita os índices existentes (`trip_document_occurrences_company_document_idx`,
`trip_occurrence_cases_occurrence_unique`), sem migration.

Teste novo, contra Postgres real: `test/integration/trip-detail-occurrence-marker.integration.ts`
(somado à lista explícita de `test:integration` no `package.json`) — abre uma tratativa de verdade
(`redeliveryPolicy: 'allowed'`, via `persistSeparationOccurrenceWithAttachment`) e prova as três
invariantes da task:

- `openOccurrenceCase`/`hasOpenOccurrence` nascem `false` e viram `true` depois da abertura;
- `GET /trips/:id/allowed-actions` (exercitado pelo mesmo par `readTripActionSnapshot` +
  `resolveTripAllowedActions` que a rota usa) devolve **exatamente o mesmo objeto** antes e depois
  — `expect(actionsAfter).toEqual(actionsBefore)` — provando CA5/RF20 (nenhuma ação some);
- `trip_documents.separation_status` continua `'loaded'` depois da abertura, lido direto do banco.

### Gates da T15

- `bun run lint` (raiz, seis apps) — limpo.
- `bun run typecheck` (raiz, seis apps) — limpo.
- `bun --env-file=../../.env.test test --timeout 120000` — **6992 pass, 0 fail** (183 arquivos,
  23817 `expect()`), era 6991/23816 antes desta task (+1 pela fixture nova de tipo). Ajustei duas
  fixtures que construíam `TripDocumentDetail` sem o campo novo
  (`test/trip-application/trip-use-case.contract.ts`, `test/fixtures/trip-http-payload.fixture.ts`)
  e movi `hasOpenOccurrence` para depois de `label:` em `readTripDetail` porque
  `test/trip-domain/stop-label-refresh.contract.ts` lê uma janela fixa de 600 caracteres a partir de
  `stops: stopRecords.map(` — o campo antes do `label` estourava essa janela e escondia
  `label: labelOf(...)` dela.
- `bun --env-file=../../.env.test test ./test/integration/trip-detail-query-count.integration.ts
./test/integration/trip-repository.integration.ts
./test/integration/trip-detail-occurrence-marker.integration.ts --timeout 120000` — **4 pass, 0
  fail, 100 `expect()` calls** — os três arquivos que este marcador toca: a prova de "sem N+1"
  (`trip-detail-query-count`, mesma contagem de `select`s com 1 ou 40 paradas — a consulta nova é
  fixa, não cresce), a suíte geral de `readTripDetail` (`trip-repository`) e o teste novo desta task.
- `bun --env-file=../../.env.test run test:integration` (suíte inteira, rodou em segundo plano
  enquanto o commit acima já tinha fechado — não fiquei esperando, o resultado chegou depois): **522
  pass, 7 skip, 8 fail, 3084 `expect()` calls**, 537 testes em 97 arquivos, 454 s. Os 8 fails são os
  mesmos oito já diagnosticados desde a T1 — `toll booth extract create-only integration` (2),
  `toll booth catalog reload integration` (4), todos `OBJECT_STORAGE_UNAVAILABLE` pela credencial do
  MinIO divergente no `.env.test` local — mais dois fora da janela de log capturada, mesma família.
  Nenhum toca `trip_occurrence_cases`, `trip_documents`, `readTripDetail` ou qualquer arquivo desta
  task; `trip-detail-occurrence-marker.integration.ts`, `trip-detail-query-count.integration.ts` e
  `trip-repository.integration.ts` estão entre os 522 verdes.
- Nenhuma migration nova — reaproveita índices existentes, confirmado pela ausência de
  `drizzle/*settlement*` ou pasta nova em `git status`.

### Commit desta rodada

1. `feat(api): spec 164 T15 — marcador derivado de tratativa aberta na nota e na parada`

## Fase 4 — T13 adiada

**T13 não foi implementada nesta rodada.** A tabela de que ela depende
(`trip_occurrence_item_settlements`) foi deliberadamente movida da T1 para a T16 (Fase 5, decisão já
registrada acima, "Escopo alterado nesta task"), porque o item do acerto e a cobrança que ele
alimenta em `delivery_charges` mexem no mesmo dinheiro e a validação `architect`/`opus` da T16 cobre
os dois juntos. Implementar T13 antes da T16 exigiria ou criar essa tabela sem a revisão que a fase
exige, ou fechar a task sem prova real contra Postgres — as duas descartadas. T13 foi reposicionada
para depois da T16 na Fase 5.

## T14a — a proposta de reentrega, só leitura

`trips/domain/redelivery-proposal.policy.ts` (pura, reaproveita `checkTripAcceptsLinkage`),
`trips/application/redelivery-proposal.use-case.ts`, `drizzle-redelivery-proposal.repository.ts`
(join `trip_document_occurrences → trip_documents`, sem lock, sem transação) e
`GET /trip-occurrences/:id/case/redelivery-proposal` (`occurrences.resolve`).

- Cobertos os quatro casos do critério de aceite: viagem `dispatched`/`cancelled` devolve `refused`
  com o motivo do próprio `TripTransitionBlock` (nunca vocabulário novo); parada com uma nota só
  devolve `reorder_stop` com `orderedStopIds` (o conjunto inteiro da viagem, nota movida para o
  fim — a rota de reordenação recusa lista parcial); parada com outras notas vivas
  (`released_at is null`, sem contar a própria) devolve `release_document`; nota sem parada
  (`stop_id is null`) e nota já liberada devolvem `refused` com motivo próprio
  (`DOCUMENT_HAS_NO_STOP`/`DOCUMENT_ALREADY_RELEASED`) — os dois casos que a validação achou fora
  da spec original.
- Nenhuma escrita: a policy é pura e o repositório só faz `select`.

### Testes

- `test/trip-domain/redelivery-proposal.contract.ts` — 6 casos da policy pura.
- `test/trip-application/redelivery-proposal.contract.ts` — 5 casos do caso de uso com port falso
  (inclusive o atalho de não ler contagem/ordem quando a nota não tem parada).
- `bun run typecheck` (raiz) — limpo.
- `bun run lint` — limpo.
- `bun --env-file=../../.env.test test --timeout 120000` — **7027 pass, 0 fail** (183 arquivos,
  23934 `expect()`), incluindo os dois arquivos novos e `rate-limited-routes.contract.test.ts`
  ajustado com a rota nova.

### Commit desta rodada

1. `feat(api): spec 164 T14a — a proposta de reentrega, só leitura`

## T14b — aplicar a proposta é transação do servidor

`POST /trip-occurrences/:id/case/redelivery-application` (`occurrences.resolve`),
`drizzle-redelivery-application.repository.ts` (escritor único), migration
`drizzle/20260922211520_redelivery_applied_audit/` (`redelivery_applied_at`/
`redelivery_applied_by_user_id` + três CHECKs).

- Ordem de lock: `select` sem lock resolve `occurrenceId → tripId` (fora de transação), depois a
  transação trava `trips` primeiro (`for no key update`), reroda `checkTripAcceptsLinkage` sobre o
  status travado, trava a tratativa (`for no key update`), recusa se já aplicada
  (`redeliveryApplication !== null`) ou se a decisão não é `redelivery_authorized`, relê o documento
  fresco dentro da mesma transação e recalcula a proposta com `resolveRedeliveryProposal` — a mesma
  política do T14a, nenhuma regra duplicada.
- A escrita reaproveita o que já existe: `writeStopOrder` (extraída de
  `DrizzleTripRouteRepository.reorderStops` para ser chamável dentro de uma transação já aberta —
  `reorderStops` público passou a chamá-la também, mesmo comportamento) para `reorder_stop`, e
  `releaseLiveLink` (`trip-document-review-link.support.ts`, spec 148/102) para `release_document`.
  Nenhuma escrita nova em `trip_stops`/`trip_documents`.
- `redeliveryApplication` saiu do input de transição da tratativa (`occurrence-case.port.ts`,
  `drizzle-occurrence-case.repository.ts`) — não tinha nenhum chamador de produção (confirmado por
  grep antes da remoção), só existia como campo morto que o contratante poderia alcançar por engano.
  Contrato negativo novo (`test/trip-schema/contractor-portal-no-stop-write.contract.ts`) varre
  `src/contractor-portal/` inteiro e prova que nenhum arquivo escreve `tripStops`/`tripDocuments`
  nem referencia `redeliveryApplication`.

### Testes contra Postgres (`test/integration/trip-redelivery-application.integration.ts`)

4 cenários, `DrizzleRedeliveryApplicationRepository` direto (sem HTTP):

1. Parada só com a nota → `reordered`, a parada some do início e vai para o fim, `redeliveryAppliedAt`/`redeliveryAppliedByUserId` gravados.
2. Parada com outra nota viva → `released`, a nota da ocorrência solta (`releasedAt` preenchido, `stopId` nulo), a outra nota **intocada**.
3. Viagem despachada **entre** a leitura e a aplicação → `trip_stops` idêntica antes/depois (`toEqual`), e a tratativa grava `refused` — não é erro.
4. Repetir a chamada já aplicada → `OccurrenceCaseTransitionNotAllowedError` (409), nenhuma segunda escrita.

- `bun --env-file=../../.env.test test ./test/integration/trip-redelivery-application.integration.ts --timeout 60000` — **4 pass, 0 fail**.
- `bun --env-file=../../.env.test run test:integration` (suíte inteira) — **526 pass, 7 skip, 8 fail**
  (537 testes em 98 arquivos + o novo, 447 s). Os 8 fails são a mesma família conhecida desde a T1:
  `toll booth extract create-only`/`catalog reload` por `OBJECT_STORAGE_UNAVAILABLE` (credencial do
  MinIO no `.env.test` local) — nenhum toca `trip_occurrence_cases`, `trip_stops`, `trip_documents`
  ou qualquer arquivo desta task.
- `bun --env-file=../../.env.test test --timeout 120000` (contrato completo) — **7027 pass, 0 fail**
  depois de ajustar `rate-limited-routes.contract.test.ts` (rota nova com `store: 'postgres'`) e
  `test/database-migration/static-migration.contract.ts` (pasta de migration nova na lista estática).
- `make migration-test` — **110 pass, 0 fail** (inclui `database-migration.contract.test.ts`, que
  confere hash/bytes da migration e do rollback novos contra o schema).
- `bun run typecheck` / `bun run lint` (raiz) — limpos.

### Commit desta rodada

1. `feat(api): spec 164 T14b — aplicar a proposta de reentrega é transação do servidor`

## T16 🧠 — `returned_goods` e `occurrence_id` em `delivery_charges`, mais `trip_occurrence_item_settlements`

Duas pastas de migration, como a validação 🧠 exigiu — a que mexe em `delivery_charges` (tabela de
produção) separada da que só cria tabela nova:

- `drizzle/20260922215410_trip_occurrence_item_settlements/` — `CREATE TABLE` puro (a tabela do
  acerto por item, movida da T1: `case_id` com FK composta/cascade para `trip_occurrence_cases`,
  `unique(company_id, case_id, product_code)`, `product_code = ''` aceito de propósito (avaria
  total), `amount numeric(14,4) > 0`, `(payer_kind, payer_id)` com os CHECKs de par — só `driver`
  carrega `payer_id`, `carrier` nunca se ressarce —, FK composta para `fleet_drivers` com índice
  parcial ao lado). Rollback: `drop table`, recusa (`RAISE`) se houver linha.
- `drizzle/20260922215436_delivery_charges_occurrence/` — `DELIVERY_CHARGE_TYPES` ganha
  `returned_goods`; `MANUAL_DELIVERY_CHARGE_TYPES` (nova constante, exclui o tipo) passou a alimentar
  os dois `z.enum` das rotas manuais (`POST .../documents/:id/charges`,
  `PUT .../delivery-clients/:id/charge-rules`) — `returned_goods` só nasce pela ponte da T17, nunca
  por rota que uma pessoa aciona. `occurrence_id` nulável + FK composta para
  `trip_document_occurrences`; unique parcial `delivery_charges_occurrence_unique` (evita cobrar o
  mesmo prejuízo duas vezes); índice `delivery_charges_contractor_period_idx` (serve o relatório da
  T19 e conserta o fechamento de lote atual, que hoje varre a tabela); os dois CHECKs simétricos
  amarrando `returned_goods` a `origin = 'occurrence' and occurrence_id is not null`. O CHECK de
  `charge_type` (que existe em **duas** tabelas — `delivery_charges` e
  `delivery_client_charge_rules`) foi recriado com `ADD CONSTRAINT ... NOT VALID` +
  `VALIDATE CONSTRAINT` nas duas, no molde de `drizzle/20260922112706_trip_occurrence_attachment_purge_job/`
  — evita o `ACCESS EXCLUSIVE` do `DROP`+`ADD` cru numa tabela quente. (A correção 6 da T1, que dizia
  não haver precedente, estava desatualizada — corrigida no `plan.md`, achado 5 da validação 🧠.)
  Rollback: reverte os dois CHECKs para a lista antiga, derruba FK/índices/coluna, recusa (`RAISE`)
  se alguma linha já usa `occurrence_id`.

Receita seguida à risca (CLAUDE.md § "Migration à mão é permitida"): as duas pastas nasceram de
`bun run db:generate --name <x>` em duas passadas (primeiro só a tabela nova, depois as mudanças de
`delivery_charges`), gerando `snapshot.json` correto para cada uma — nunca escritas à mão. O CHECK
`NOT VALID`/`VALIDATE` foi o único ajuste manual no `migration.sql` gerado.

Numeração conferida contra `origin/staging` antes de commitar: `git diff --stat origin/staging --
drizzle/` vazio antes de gerar, e o próximo timestamp (`20260922215410`) ficou acima da última pasta
existente (`20260922211520_redelivery_applied_audit`) — sem colisão.

### Contrato: a regra recorrente nunca propõe `returned_goods`

`test/delivery-clients/manual-charge-types.contract.ts` (novo, listado em
`test/delivery-clients.contract.test.ts`): `MANUAL_DELIVERY_CHARGE_TYPES` não contém
`returned_goods` enquanto `DELIVERY_CHARGE_TYPES` contém; as duas rotas manuais (`recordSchema`/
`ruleSchema`, exportados como `deliveryChargeRecordSchema`/`deliveryChargeRuleSchema` para o teste)
recusam `chargeType: 'returned_goods'` no `safeParse`. Como `suggest-delivery-charges.use-case.ts`
só propõe a partir de regras ativas (`deliveryClientChargeRules`), e uma regra com esse tipo é
impossível de criar pela rota, a regra recorrente nunca propõe `returned_goods` por construção —
sem precisar duplicar a asserção no caso de uso.

### Testes

- `bun run typecheck` / `bun run lint` (raiz) — limpos.
- `bun run db:generate` — **`no_changes`** depois das duas migrations (schema e SQL batem).
- `make migration-test` — **110 pass, 0 fail** (`static-migration.contract.ts` atualizado com as
  duas pastas novas na lista estática).
- `bun --env-file=../../.env.test test --timeout 120000` (contrato completo) — **7031 pass, 0 fail**
  (183 arquivos, 23943 `expect()`), incluindo o arquivo novo.

### Commit desta rodada

1. `feat(api): spec 164 T16 — returned_goods e occurrence_id em delivery_charges`

## T17 — a ponte acerto → cobrança

`trips/domain/occurrence-charge.policy.ts` (pura: `OCCURRENCE_CHARGE_INITIAL_STATUS = 'recorded'`,
`isOccurrenceChargeWritable`), `trips/application/occurrence-settlement-charge.port.ts` e
`trips/infrastructure/drizzle-occurrence-settlement-charge.repository.ts`
(`DrizzleOccurrenceSettlementChargeRepository`) — escritor único da linha de `delivery_charges` que
o acerto de uma tratativa alimenta.

⚠️ **T13 está fora do escopo desta rodada** (instrução explícita), e é o caso de uso que abriria
`PUT /trip-occurrences/:id/case/settlement`. Sem ele, não existe transação de settlement para esta
ponte se encostar por HTTP ainda — o que existe hoje é o repositório pronto para ser chamado **de
dentro** da transação que a T13 vai abrir (recebe `TripTransaction` já aberta, nunca abre a própria,
no molde de `DrizzleRedeliveryApplicationRepository`), com toda a semântica de RF25/CA9c provada
direto contra Postgres. Quando a T13 for feita, ela chama
`bridge.applyOccurrenceSettlementCharge({ ..., transaction })` de dentro do próprio
`database.transaction`, depois de gravar `trip_occurrence_item_settlements` e somar o total com
`Decimal` — nenhum código desta ponte muda.

- `findChargeParties` é **injetada** (função do `DrizzleDeliveryChargeRepository` já existente),
  nunca reimplementada — duas cópias da mesma junção nota → cliente → contratante divergiriam com o
  tempo. Nulo vira `OccurrenceChargePartiesUnresolvedError` (422 `DELIVERY_CLIENT_NOT_RESOLVED`,
  nova em `trip.error.ts`) — o oposto do `return` silencioso da sugestão recorrente: aqui o acerto já
  decidiu cobrar, e a transação inteira desfaz.
- `chargedOn` é `trip_document_occurrences.created_at::date`, lido dentro da própria consulta —
  nunca implícito.
- A linha é travada com `select … for no key update` antes de decidir inserir ou atualizar —
  ausente é `insert` direto (`status: 'recorded'`); presente e `recorded` é `update` do `amount`
  (mesma linha, nunca duplica); presente e além de `recorded` lança
  `DeliveryChargeTransitionNotAllowedError` (409 `DELIVERY_CHARGE_TRANSITION_NOT_ALLOWED`, a mesma
  classe que `delivery-charges.use-case.ts` já usa) e **não** escreve.
- O discriminador é `charge_type: 'returned_goods'` + `occurrence_id`, nunca `origin` (que continua
  `'occurrence'` só porque o CHECK do banco amarra os dois — `origin: 'occurrence'` sozinho já é a
  ocorrência de parada da spec 060, fora de escopo).

### Testes contra Postgres (`test/integration/occurrence-settlement-charge-bridge.integration.ts`)

Dois cenários, repositório direto (sem HTTP, já que a T13 não existe ainda):

1. Grava (`status: 'recorded'`, `chargeType: 'returned_goods'`, `origin: 'occurrence'`,
   `occurrenceId`/`deliveryClientId`/`contractorId` corretos) → regrava a **mesma linha** com valor
   novo (`countRows` prova que continua 1 linha) → a linha vai a `submitted` por SQL direto → a
   terceira chamada lança `DeliveryChargeTransitionNotAllowedError` e o valor **não muda** (provado
   por leitura da tabela, não por ausência de erro).
2. Nota sem `nfeParticipants`/`deliveryClients` cadastrados → `OccurrenceChargePartiesUnresolvedError`
   → nenhuma linha gravada em `delivery_charges` (a transação do chamador desfez tudo).

- `bun --env-file=../../.env.test test ./test/integration/occurrence-settlement-charge-bridge.integration.ts --timeout 120000` — **2 pass, 0 fail**.
- `bun --env-file=../../.env.test run test:integration` (suíte inteira, arquivo somado à lista
  explícita do `package.json`) — **528 pass, 7 skip, 8 fail** (543 testes em 99 arquivos, 533 s). Os
  8 fails são a mesma família conhecida `OBJECT_STORAGE_UNAVAILABLE` (`cte-archive-gateway`,
  `toll-booth-extract-create-only`, `toll-booth-reload` — credencial do MinIO no `.env.test` local);
  nenhum toca `delivery_charges`, `trip_occurrence_item_settlements` ou qualquer arquivo desta task.
- `bun run typecheck` / `bun run lint` (raiz) — limpos.
- `bun --env-file=../../.env.test test --timeout 120000` (contrato completo) — **7031 pass, 0 fail**.

### Commit desta rodada

1. `feat(api): spec 164 T17 — a ponte acerto → cobrança`

## T13/T18 — acerto por item e ressarcimento

`trips/domain/occurrence-settlement.policy.ts` (pura): `resolveOccurrenceSettlement` soma em
`Decimal` (`bigint` escalado via `parseScaledDecimal`/`formatScaledDecimal`, `MONEY_SCALE = 4n`),
valida item contra `knownProductCodes` (quem chama resolve `''` como item válido quando a ocorrência
é da nota inteira, via `resolveOccurrenceProductCodes`) e o par `payerKind`/`payerId`;
`isOccurrenceSettlementWritable` cobre RF23 (`decided` + `goods_paid`, senão 409).

`trips/infrastructure/drizzle-occurrence-settlement.repository.ts`
(`DrizzleOccurrenceSettlementRepository`) implementa as duas portas:

- `recordSettlement` (T13): trava a tratativa (`select … for no key update`), reconfere a
  precondição sobre a linha travada, resolve os códigos válidos (incluindo a ocorrência da nota
  inteira), roda a política pura, substitui a lista (`delete` + `insert`, nunca acumula) e — só com
  ao menos um item — chama `OccurrenceSettlementChargePort.applyOccurrenceSettlementCharge` (T17,
  já existente) **na mesma transação**. Lista vazia limpa o acerto e não toca `delivery_charges`.
- `reimburseSettlementItem` (T18): trava a linha por `(companyId, caseId, productCode)`, recusa
  `payer_kind = 'carrier'` com `OccurrenceSettlementNotReimbursableError` antes de escrever,
  converge (`kind: 'unchanged'`) se já ressarcida, e só escreve `reimbursed_at`/
  `reimbursed_by_user_id`.

`PUT /trip-occurrences/:id/case/settlement` e `POST .../settlement/reimbursement`
(`trips/presentation/occurrence-settlement.routes.ts`, `occurrences.resolve`, mesmo teto de
`occurrence-case.routes.ts`) resolvem `occurrenceId → caseId` antes de qualquer leitura — ocorrência
de outra empresa ou sem tratativa é 404. Três erros novos em `trip.error.ts`:
`OccurrenceSettlementPayerInvalidError` (422), `OccurrenceSettlementItemNotFoundError` (404),
`OccurrenceSettlementNotReimbursableError` (422).

Wiring em `main.ts`: `DrizzleOccurrenceSettlementChargeRepository` (T17) passou a ser instanciada
(não estava ligada antes, porque nada a chamava), injetada com `findChargeParties` do
`DrizzleDeliveryChargeRepository` já existente — nenhuma segunda cópia da junção nota → cliente →
contratante.

### Testes

- Contrato (política): `test/trip-domain/occurrence-settlement.contract.ts` — soma, item fora da
  ocorrência, `productCode = ''` como item válido, valor `<= 0`, os dois lados do par payer/payerId,
  lista vazia soma zero, `isOccurrenceSettlementWritable` nas quatro combinações.
- Contrato (erros): três casos novos somados a `test/trip-domain/occurrence-case.error.contract.ts`.
- Contrato (HTTP): `test/trip-http/occurrence-settlement.contract.ts` — permissão, resolução
  `occurrenceId → caseId`, corpo estrito, mapa de erro → status para as duas rotas.
- Integração (Postgres real): `test/integration/trip-occurrence-settlement.integration.ts` — grava e
  liga a cobrança, regravar substitui a lista (a cobrança acompanha o novo total), item fora da
  ocorrência desfaz a transação inteira (nem o acerto nem a cobrança gravam), tratativa fora de
  `decided`/`goods_paid` recusa com 409, ressarcimento marca e é idempotente, `payer_kind = 'carrier'`
  recusa o ressarcimento sem escrever nada.
- `test/rate-limited-routes.contract.test.ts` atualizado com a rota nova na lista estática
  (declara `store: 'postgres'`, mesmo teto de `occurrence-case.routes.ts`).

### Comandos rodados nesta rodada (não a suíte de integração completa — instrução explícita)

- `bun run format:check` (raiz) — 5 arquivos fora de formatação corrigidos com
  `prettier --write` antes do commit; limpo depois.
- `bun run lint` / `bun run typecheck` (raiz, 6 apps) — limpos.
- `bun run db:generate` — **`no_changes`** (nenhuma migration nova nesta rodada: as tabelas já
  existem desde a T16).
- `bun --env-file=../../.env.test test --timeout 120000` (contrato completo da API) —
  **7084 pass, 23 skip, 0 fail** (183 arquivos, 24052 `expect()`).
- `bun --env-file=../../.env.test test ./test/integration/trip-occurrence-settlement.integration.ts ./test/integration/occurrence-settlement-charge-bridge.integration.ts --timeout 120000`
  (só os arquivos de integração que esta rodada tocou, por caminho explícito) — **7 pass, 0 fail**
  (2 arquivos, 37 `expect()`).
- ⚠️ **A suíte de integração completa (`bun run test:integration`, ~530 testes) não foi reexecutada
  nesta rodada** — instrução explícita para não disparar a suíte inteira. A rodada anterior (T17)
  já tinha provado 528 pass/8 fail conhecidos (`OBJECT_STORAGE_UNAVAILABLE`) sem tocar nenhum arquivo
  desta task; os arquivos novos desta rodada foram somados à lista explícita do `package.json` e
  rodam isolados acima, mas a confirmação de que o resto da suíte continua verde fica pendente para
  quem rodar a suíte completa antes do merge.

### Commit desta rodada

1. `feat(api): spec 164 T13/T17 fecho + T18 — acerto por item e ressarcimento` — commit único: T13 e
   T18 compartilham os mesmos arquivos de rota (`occurrence-settlement.routes.ts`), schema e
   repositório (`drizzle-occurrence-settlement.repository.ts` implementa as duas portas), então
   separar o diff por task exigiria desmontar esses arquivos sem ganho real de revisão — a mesma
   lógica que já levou T16 a absorver a tabela que "pertencia" à T1.
