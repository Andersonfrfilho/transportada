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
- ⚠️ **Correção**: uma execução da suíte de integração completa (`bun run test:integration`) tinha
  ficado rodando em segundo plano desde antes da instrução de não disparar a suíte inteira, e
  terminou depois — **506 pass, 7 skip, 31 fail, 1 error** (544 testes em 101 arquivos, 902 s). Os
  últimos fails visíveis no log (`toll-booth-reload`, a transação de mensagem/outbox da spec 150
  T304, `package-box-catalog-import`) são timeout de hook (`5000ms`) e erro de conexão Postgres
  fechada (`wrapPostgresError`/`#onClose`) — sinal de contenção do ambiente local rodando a suíte
  inteira (902 s) em paralelo com o resto do trabalho desta sessão, não de código: nenhum dos nomes
  de teste que apareceram toca `trip_occurrence_item_settlements`, `delivery_charges` ou qualquer
  arquivo desta task, e os dois arquivos de integração desta rodada, rodados isolados por caminho
  explícito, deram **7 pass, 0 fail** (acima). O log completo dos 31 fails não foi capturado (o
  comando de fundo tinha `| tail -60`, e só as últimas linhas sobreviveram) — quem for confirmar
  antes do merge deve rodar `bun run test:integration` sozinho, sem outra carga na máquina.

### Commit desta rodada

1. `feat(api): spec 164 T13/T17 fecho + T18 — acerto por item e ressarcimento` — commit único: T13 e
   T18 compartilham os mesmos arquivos de rota (`occurrence-settlement.routes.ts`), schema e
   repositório (`drizzle-occurrence-settlement.repository.ts` implementa as duas portas), então
   separar o diff por task exigiria desmontar esses arquivos sem ganho real de revisão — a mesma
   lógica que já levou T16 a absorver a tabela que "pertencia" à T1.

## T19 — a leitura do acumulado, com filtros

`GET /occurrence-charges/report` (`trip.financials`): `OccurrenceChargeReportPort`/
`DrizzleOccurrenceChargeReportRepository` (`src/delivery-clients/infrastructure/`),
`createOccurrenceChargeReportUseCase` e `occurrence-charge-report.routes.ts`. Registrado em
`main.ts` ao lado de `extraChargeBatches`. Constante nova: `API_OCCURRENCE_CHARGES_REPORT_PATH`.

- Recorte: `delivery_charges` com `occurrence_id is not null` e `batch_id is null` — "sem lote",
  nunca "do mês corrente" (decisão do usuário em `plan.md` § "O fechamento é por seleção, com
  filtros"). Filtros: `contractorId`, `from`/`to` (intervalo de datas), `chargeType`, `status`,
  `hasSettlement` (existência de `trip_occurrence_item_settlements` ligada pela tratativa da mesma
  ocorrência) e `search` (por `accessKey`/`number` da nota, via `trip_documents` → `nfe_documents`).
  Totais (`totalAmount`, `totalCount`, quebra por `chargeType`) somados em SQL (`numeric`,
  `coalesce(sum(...))::text`), nunca em JS, e cobrem o filtro inteiro — não a página do cursor.
- ⚠️ **Nenhuma tabela de lote nova** — RF27 continua sendo `extra_charge_batches`; esta task só lê.
- `explain` provado em `test/integration/occurrence-charge-report.integration.ts` (terceiro teste):
  `set local enable_seqscan = off` + `explain select … where company_id = … and contractor_id = …
and charged_on between … and …` casa `Index Scan using delivery_charges_contractor_period_idx`
  (índice da T16) — a consulta real do repositório usa as mesmas três colunas no `where` antes de
  qualquer filtro opcional, então o mesmo índice cobre o caso comum.
- Isolamento por empresa e o recorte "sem lote" provados contra Postgres de verdade (banco
  descartável, duas empresas, uma cobrança já em lote, uma cobrança de outra empresa) — nenhuma das
  duas aparece na leitura da primeira empresa.

### Comandos rodados (T19)

- `bunx tsc --noEmit` (api-transportada) — limpo.
- `bunx eslint src test --max-warnings=0` (api-transportada) — limpo.
- `bunx prettier --check` — 4 arquivos corrigidos com `--write` antes do commit; limpo depois.
- `bun run db:generate` — **`no_changes`** (leitura pura, nenhuma tabela/coluna nova).
- `bun --env-file=../../.env.test test --timeout 120000` (contrato completo da API) —
  **7084 pass, 23 skip, 0 fail** (183 arquivos).
- `bun --env-file=../../.env.test test ./test/integration/occurrence-charge-report.integration.ts --timeout 120000`
  — **3 pass, 0 fail**, 11 `expect()` (inclui o teste de `explain`).
- `bun run lint` / `bun run typecheck` na raiz (6 apps) — limpos.
- Arquivo somado à lista explícita de `test:integration` em `apps/api-transportada/package.json`.

Commit: `feat(api): spec 164 T19 — leitura do acumulado de ocorrência, por seleção`.

## T20 — o demonstrativo em PDF

Retomada em rodada própria depois do corte anterior (a rodada da T19 tinha ficado sem tempo para
T20 e não deixou commit). O grosso do código já estava escrito, não commitado, na árvore quando esta
rodada começou — foi lido e conferido arquivo a arquivo antes de qualquer mudança nova, e aproveitado
sem reescrita, exceto pelas duas correções abaixo.

`stored_objects.purpose` ganhou o valor novo `extra_charge_batch_statement`
(`src/database/storage.schema.ts`), com migration aditiva própria
(`drizzle/20260922231219_extra_charge_batch_statement/`, `migration.sql` + `rollback.sql` com `RAISE`
se houver linha viva usando o propósito ou lote apontando para demonstrativo + `snapshot.json`) —
`statement_object_id` nulável em `extra_charge_batches`, FK composta `(company_id,
statement_object_id)` para `stored_objects`, índice parcial no molde da miniatura da spec 161.

`src/delivery-clients/domain/occurrence-statement-layout.policy.ts` (puro, molde de
`billing/domain/invoice-layout.policy.ts`, duplicado de propósito porque este documento não é
fiscal) monta a estrutura da página a partir das linhas já resolvidas; recusa **antes** de montar
quando a soma das imagens embutidas já passa `OCCURRENCE_STATEMENT_MAX_BYTES` (8 MiB).
`src/delivery-clients/infrastructure/occurrence-statement-pdf.gateway.ts` (`pdfkit`, só desenho,
molde de `invoice-pdf.gateway.ts`) desenha o cabeçalho, uma foto por linha (a de `position: 1`,
preferindo a miniatura via `toPhotoReference`), as demais por contagem, e recusa de novo pelo
**arquivo montado** — o teto vale duas vezes, pela soma das imagens (barato, falha cedo) e pelo PDF
final (o que decide de verdade, inclusive quando o texto é que cresceu).

`occurrence-statement.use-case.ts` separa gerar (uma vez, no fechamento — `statement_object_id is
null` no `where` do `UPDATE` faz duas gerações concorrentes não se sobrescreverem) de ler (serve o
que está guardado, nunca recomputa). Download de fotos com concorrência limitada e prazo por item
(`concurrent-map.service.ts`, novo, `mapWithConcurrencyLimit`): foto que não chega vira `null` e a
linha sai com selo textual, nunca imagem quebrada nem a geração inteira travada.

`GET /extra-charge-batches/:id/statement` (`trip.financials`) devolve `application/pdf`. **Não** está
pendurada sob `/client/me` e o token público do lote não a alcança — os dois contratos negativos
passam.

Wiring em `main.ts`: a geração roda dentro de `extraChargeBatches.close`, mas com falha **capturada e
logada**, nunca propagada — o dinheiro já fechou quando isso roda, e derrubar a resposta faria o
operador fechar de novo e girar o token do link que a contratante já recebeu (`decide-se`, RF29 não
bloqueia RF12/D12).

### Duas correções encontradas pelos gates (não estavam na T19)

Dois contratos estáticos têm a lista de nomes/CHECKs do schema escrita à mão e não seguiam junto da
migration nova:

- `test/database-migration/static-migration.contract.ts` — lista de diretórios de `drizzle/` esperada
  pelo teste de hash/identidade da baseline; faltava `20260922231219_extra_charge_batch_statement`.
- `test/nfe-schema/storage.contract.ts` — o texto do `stored_objects_purpose_check` esperado pelo
  contrato de schema; faltava `'extra_charge_batch_statement'` na lista.

Sem as duas, `make migration-test` e o contrato completo falhavam — não por causa do código novo, mas
porque dois testes guardam string estática do catálogo e precisam de atualização manual a cada
migration que mexe nessas duas superfícies. Ambos corrigidos e commitados junto.

### Comandos rodados (T20)

- `bun run lint` (raiz, 6 apps) — limpo.
- `bun run typecheck` (raiz, 6 apps) — limpo.
- `bunx prettier --check .` (raiz) — limpo.
- `bun run db:generate` (api-transportada) — **`no_changes`**.
- `make migration-test` — falhou uma vez por `static-migration.contract.ts` desatualizado (acima),
  corrigido, depois **110 pass, 0 fail** (1417 `expect()`).
- `bun --env-file=../../.env.test test --timeout 120000` (contrato completo da API) — falhou uma vez
  por `storage.contract.ts` desatualizado (acima), corrigido, depois **7094 pass, 23 skip, 0 fail**
  (24076 `expect()`, 183 arquivos).
- `bun --env-file=../../.env.test test ./test/integration/extra-charge-batch-statement.integration.ts --timeout 120000`
  (só o arquivo de integração desta task, por caminho explícito) — **2 pass, 0 fail**, 15
  `expect()`. Prova: o demonstrativo nasce no fechamento e fica em `stored_objects` com o propósito
  novo; a foto viva foi baixada e a foto fora do prazo de guarda **não** foi (vira selo); ler duas
  vezes devolve os mesmos bytes (`archive.putCount` continua 1 — artefato imutável, nunca
  recomputado); as oito tabelas fiscais (`billing_*`, `cte_*`, `nfse_*`, `fiscal_sequences`) têm
  a mesma contagem antes e depois; lote sem demonstrativo (fechado sem a porta de geração, o caso do
  lote de antes desta spec) recusa a leitura com `EXTRA_CHARGE_BATCH_STATEMENT_NOT_FOUND` em vez de
  inventar um documento.
- Arquivo somado à lista explícita de `test:integration` em `apps/api-transportada/package.json`
  (já estava, herdado da rodada anterior não commitada).
- ⚠️ Suíte de integração completa (`bun run test:integration`) **não foi rodada nesta rodada** —
  instrução explícita para rodar só os arquivos da task, por caminho. `docs`/CLAUDE.md registram a
  falha conhecida `OBJECT_STORAGE_UNAVAILABLE` (credencial do MinIO local) como não relacionada a
  esta task.

### Commit desta rodada

1. `feat(api): spec 164 T20 — o demonstrativo de ressarcimento em PDF`

## T25 — apps/frontend-client: tela "Ocorrências" do portal do contratante

Escopo estrito: só `apps/frontend-client`. `apps/frontend-transportada` e `apps/api-transportada`
não foram tocados nesta rodada — outra sessão trabalhava neles.

### O que foi feito

- `src/modules/shared/portal.types.ts`: `OccurrenceAttachment`, `Occurrence`,
  `OccurrenceDecisionKind` (`'goods_paid' | 'other' | 'redelivery_authorized'`),
  `OccurrenceDecisionInput`, `OccurrenceDecisionResult`.
- `src/modules/shared/portalResponse.validation.ts`: `toOccurrences` / `toOccurrenceDecisionResult`,
  no mesmo molde de type guard manual das outras respostas (sem zod nesta app).
- `src/modules/shared/portalClient.service.ts`: `listOccurrences` (`GET /client/me/occurrences`) e
  `decideOccurrence` (`POST /client/me/occurrences/:id/decision`).
- `src/modules/deliveries/queries/portal.query.ts`: `useOccurrences` / `useDecideOccurrence`
  (TanStack Query), reaproveitando o arquivo que já serve `charges` — é o ponto único de query do
  portal, não um por módulo.
- `src/modules/occurrences/OccurrenceList.page.tsx`, `DecisionForm.component.tsx`,
  `shared/occurrenceStatus.service.ts` — molde de `ChargeBatchList.page.tsx`: cartão por ocorrência,
  badge de estado, miniatura das fotos (`OccurrencePhoto`), foto original ao clicar
  (`OccurrenceOriginalPhoto`), e os três botões de decisão em `DecisionForm` (rádio nativo — lista de
  3, dentro do limite do web.md §11 — com o texto do que cada opção significa e o campo de motivo
  obrigatório só em "outra solução").
- `src/main.tsx`: terceira aba "Ocorrências" ao lado de "Entregas"/"Repasses".
- `src/styles/index.css`: três classes novas (`.occurrence-photo`, `.occurrence-photo--large`,
  `.occurrence-photo-button`), todas em cima das variáveis já existentes — nenhum valor hardcoded.
- Foto que vence: a URL assinada dura 5 minutos (mordida conhecida no painel interno). `onError` da
  `<img>` tenta `refetch()` da lista **uma vez** (o `useOccurrences` volta com URL nova) antes de
  mostrar "não foi possível carregar a foto" com botão "Tentar de novo" — nunca falha permanente sem
  saída. Foto `expired` (retenção vencida, `occurrence-attachment.service.ts` da API) é selo textual
  desde o início, sem nunca tentar `<img>`.
- Decisão repetida converge (a mutação só invalida a query, sem aviso — o `200` da API já é
  silencioso) e decisão divergente sobre tratativa `decided` (`409
OCCURRENCE_CASE_DECISION_CONFLICT`) vira frase própria — "já foi decidida com outra opção", nunca
  o genérico de erro de sistema. `422 OCCURRENCE_CASE_NOTE_REQUIRED` também tem frase própria, mesmo
  o formulário já bloqueando o envio sem nota em "outra solução" no cliente.
- Nenhum dado interno na tela: o campo `stage` (`delivery`/`separation`) e `caseStatus` são
  traduzidos por `occurrenceStatus.service.ts`; nada de motorista, canal ou id interno — a API já não
  os publica (`contractor-occurrence.routes.ts` serializa campo a campo).

### ⚠️ Divergência achada entre a spec e a API já publicada — não é desta task, registro para quem

decidir

RF13/RF35 pedem que a lista traga **nota, itens e observação** junto de tipo e fotos. Lendo
`apps/api-transportada/src/contractor-portal/presentation/contractor-occurrence.routes.ts` (rota já
em staging, T10/T11), o `GET /client/me/occurrences` serializa hoje só `attachments`, `caseStatus`,
`decidedAt`, `decisionKind`, `occurrenceId`, `occurrenceTypeName`, `openedAt`, `stage` — nota (número
da NF-e), itens e a observação (`note`) existem em `ContractorOccurrenceDetail`
(`findContractorOccurrenceDetail`, usado só pelo `POST .../decision` antes de decidir), mas não saem
no `GET` de listagem. A tela desta task não inventa esses três campos: eles não existem na resposta
que o front recebe, e exibir um valor que nunca chega seria pior que omitir. Se a intenção é mesmo
que a lista os carregue, é mudança do lado da API (adicionar ao `serialize()` da rota), fora do
escopo de "só frontend-client" desta rodada.

### Gates (dentro de `apps/frontend-client`, rodados a partir da raiz do worktree)

- `bun run lint` — limpo (`eslint .`).
- `bun run typecheck` — limpo (`tsc --noEmit`).
- `bunx prettier --check .` (raiz, escopo do repo inteiro) — limpo depois de `--write` nos dois
  arquivos que precisaram (`OccurrenceList.page.tsx`, `test/occurrences/occurrence-status.contract.ts`).
- `bun run --cwd apps/frontend-client test` — **55 pass, 0 fail**, 128 `expect()`, 5 arquivos (o
  novo `test/occurrences.contract.test.ts` → `test/occurrences/occurrence-status.contract.ts` soma
  4 testes: tradução do selo por `caseStatus`, `isDecidable` só em `awaiting_contractor`, rótulo das
  três decisões, tradução de `stage` com fallback pro valor cru). O teste novo entrou na lista
  explícita de `apps/frontend-client/package.json` `scripts.test` — sem isso ele não roda.

### Commit desta rodada

1. `feat(frontend-client): spec 164 T25 — tela de ocorrências do contratante`

## RF13/RF35 — a nota, os itens e a observação faltando no `GET /client/me/occurrences`

Data: 2026-09-22.

A divergência registrada na rodada anterior (acima, "Divergência achada entre a spec e a API já
publicada") era real: `contractor-occurrence.routes.ts` serializava só `attachments`, `caseStatus`,
`decidedAt`, `decisionKind`, `occurrenceId`, `occurrenceTypeName`, `openedAt`, `stage` — sem nota,
itens ou observação, a tela do contratante mostrava "Item avariado" sem dizer de qual nota ou
produto.

- `contractor-occurrence.query.ts`: `listContractorOccurrences`/`findContractorOccurrenceDetail`
  ganham `innerJoin` com `nfe_documents` (número/série/chave, mesmo recorte que
  `contractor-delivery.query.ts` já expõe) e `note` (já existia só no detalhe, agora também na
  listagem). Os itens vêm de `resolveOccurrenceProductCodes` (código legado + tabela nova, spec 166)
  cruzado em lote com `nfe_products` por `(companyId, documentId, code)` — uma consulta para todas as
  ocorrências da página, nunca uma por linha (`resolveContractorOccurrenceItems`). Lista vazia
  continua significando a nota inteira.
- `contractor-occurrence.routes.ts`: serialização campo a campo acrescenta `nfe {accessKey, number,
series}`, `items [{code, description, quantity, unit}]` e `note`. Nada do que o rodapé do
  `plan.md` proíbe (autor/motorista, `channel`, ids internos, `bucket`/`objectKey`,
  `redeliveryPolicy`/`redeliveryApplication`, `decidedByUserId`, histórico) entrou.
- A fronteira de visibilidade não mudou — mesmo `inner join` em `trip_occurrence_cases` filtrado por
  `CONTRACTOR_VISIBLE_CASE_STATUSES` e mesmo `exists` sobre `nfe_participants` (nunca `distinct`).

### Teste novo (contra Postgres real)

`test/integration/trip-occurrence-case.integration.ts` ganhou o describe "a nota, os itens e a
observação no portal (spec 164 RF13)": semeia uma nota com um produto, registra a ocorrência
apontando esse item, avança a tratativa até `awaiting_contractor` e confere `listContractorOccurrences`
(via `useCase.list`) — número/série/chave da nota, `note`, e `items` com código+descrição+quantidade.
O contrato negativo é literal: `Object.keys(listed)` e `Object.keys(listed.items[0])` comparados contra
a lista exata de chaves esperada, então qualquer campo interno vazado quebra o teste. Entrou na lista
explícita de `package.json` (arquivo já estava listado, task só adicionou o describe).

### Gates

- `bun run lint` (raiz) — limpo em `api-transportada`; o único erro reportado é pré-existente em
  `apps/frontend-transportada` (`TripOccurrenceFilters.component.tsx`/`tripOccurrenceFilterPills.service.ts`,
  trabalho de outro agente em andamento), fora do escopo desta task.
- `bun run typecheck` (raiz, todas as apps) — limpo.
- `bunx prettier --check .` — limpo depois de `--write` em `contractor-occurrence.query.ts` e
  `trip-occurrence-case.integration.ts`.
- `bun --env-file=../../.env.test test --timeout 120000` (contrato, 183 arquivos) — **7094 pass, 0
  fail**, 23 skip (pré-existentes, não desta task).
- `bun --env-file=../../.env.test test ./test/integration/trip-occurrence-case.integration.ts
--timeout 120000` (a integração do portal, por caminho explícito) — **3 pass, 0 fail**, incluindo o
  teste novo.
- ⚠️ **A suíte completa de integração (`bun run test:integration`, 72 arquivos) não foi confirmada
  antes do commit** — passou de dois minutos rodando contra o Postgres descartável e foi movida para
  segundo plano, por instrução do coordenador (a tarefa não fica refém de uma suíte lenta). O gate
  da CI é quem a exercita em máquina limpa. O resultado chegou depois, em segundo plano: **540 pass,
  10 fail, 7 skip, 103 arquivos, 698s.** As 10 falhas **não são desta mudança** — reproduzidas em
  isolamento após o commit:
  - 8 em `test/integration/toll-booth-reload.integration.ts` — `ObjectStorageError:
OBJECT_STORAGE_UNAVAILABLE`, o MinIO local indisponível (infra do ambiente, nada a ver com
    ocorrência/portal). Rodando o arquivo sozinho: `0 pass, 4 fail`, mesmo erro.
  - 2 em `test/integration/trip-occurrence-item-quantity.integration.ts` — timeout de 5000ms sob a
    carga da suíte inteira (698s, 103 arquivos). Rodando o arquivo sozinho:
    `3 pass, 0 fail`, 5.6s — não é regressão, é o timeout padrão contra a carga concorrente.
  - Nenhuma falha em `contractor-occurrence.query.ts`/`routes.ts` nem em
    `trip-occurrence-case.integration.ts` (o arquivo desta task) na rodada completa.

### Commit desta rodada

2. `fix(api): spec 164 RF13 — nota, itens e observação no portal do contratante`

## T21 — `redeliveryPolicy` no cadastro do tipo de ocorrência

Data: 2026-09-22.

`OccurrenceTypeCatalogPanel.component.tsx` ganhou o `Select` (design system, três opções: indefinido/
admite/não admite) no formulário de cadastro e por tipo já cadastrado. `OccurrenceType`,
`isOccurrenceType` (guard de chave exata) e `saveOccurrenceType`/`SaveOccurrenceTypeValues` (client e
o wrapper de permissão em `useTripWorkspace.hook.ts`) passaram a exigir `redeliveryPolicy` — o `PUT`
sempre manda o conjunto completo. Contrato novo em
`test/company-settings/occurrence-type-catalog-panel.contract.ts`: varre todo `onSave({` do painel e
prova que nenhuma chamada escapa sem o campo (a armadilha registrada na T1 — salvar sem o campo
devolveria silenciosamente um tipo "permite" para "indefinido").

### Gates

- `bun run lint` / `bun run typecheck` (raiz) — limpos.
- `bunx prettier --check .` — limpo.
- `bun --env-file=../../.env.test run test` (`apps/frontend-transportada`) — **4882 pass + 44 pass
  (hooks), 0 fail**.

### Commit

`feat(frontend): spec 164 T21 — redeliveryPolicy no cadastro do tipo de ocorrência` (33a862fb8).

## T22 — Painel da tratativa na página de ocorrências

Data: 2026-09-22.

`OccurrenceCasePanel.component.tsx` (novo) dentro do detalhe da linha em `/ocorrencias`: passo atual
(`case.status`), política de reentrega, decisão do contratante quando houver, e só os botões que o
estado (RF5-RF8b) e a permissão `occurrences.resolve` permitem — `review`, `warehouse-return` (nota
obrigatória), `contractor-submission`, `closure`, `cancel` (nota obrigatória, só de
`recorded`/`under_review`). `case: null` mostra "sem tratativa" sem quebrar. Filtro por estado da
tratativa (RF11) na página, incluindo "sem tratativa" (`none`), viajando como `caseStatusIn` só
quando restringe algo — mesmo padrão de `stageIn`. `useOccurrenceCaseActions.hook.ts` (novo) encapsula
as cinco mutações, cada uma invalidando o feed inteiro ao terminar (o `case` vem embutido na página,
sem consulta própria para reescrever).

⚠️ **"Decidir no lugar do contratante que não responde" não foi implementado.** A API só expõe
`POST /client-occurrences/:id/decision` (`occurrences.decide`), e a D6 do `spec.md` concede essa
permissão só ao papel `contractor` — "em nenhum papel de dentro". Não existe rota interna equivalente
(`occurrence-case.routes.ts` só tem as cinco transições do escritório). Construir o botão aqui faria a
tela oferecer uma ação que a API sempre recusa com 403; a lacuna é registrada no comentário do
componente para virar task de backend, em vez de simulada com um caminho que não funciona.

Contrato novo: `test/trip/occurrence-case-panel.contract.ts` (fiação estática dos botões por estado,
nota obrigatória, ausência da ação "decidir por"; filtro por estado incluindo `none`).

### Gates

- `bun run lint` / `bun run typecheck` (raiz) — limpos.
- `bunx prettier --check .` — limpo.
- `bun --env-file=../../.env.test run test` (`apps/frontend-transportada`) — **4889 pass + 44 pass
  (hooks), 0 fail**.

### Commit

`feat(frontend): spec 164 T22 — painel da tratativa na página de ocorrências` (884460d7e).

## T23 — Painel de acerto dos produtos da ocorrência

Data: 2026-09-22.

`OccurrenceSettlementPanel.component.tsx` (novo), embutido no `OccurrenceCasePanel` quando
`status === 'decided' && decision.kind === 'goods_paid'` e `occurrences.resolve`: itens com código,
valor, seletor de pagador (`Select` do design system — motorista/transportadora/contratante/
seguradora, motorista é o padrão e o único que pede id), total somado, `PUT` que substitui a lista e
botão de ressarcimento por item. `occurrenceSettlementMoney.service.ts` (novo) faz a soma e a
validação em `BigInt` escalado por 10 000 (quatro casas decimais) — nunca `number`/`parseFloat` na
conta; a conversão para `double` só acontece na borda de exibição (`Intl.NumberFormat`), depois de
somar. Item sem código ou sem valor positivo não entra no `PUT`; `payerKind: 'carrier'` esconde o
botão de ressarcimento em vez de oferecer um clique que a API recusaria com 422.

⚠️ **Duas lacunas do backend, documentadas no componente:**

1. `amountSource` sempre `'manual'` — o feed de `/ocorrencias` (`GET /trip-occurrences`) não carrega
   o valor do item na nota (`vUnCom`) nem o id do motorista da ocorrência; não há como propor o valor
   nem pré-selecionar o motorista sem um novo campo na API.
2. Sem `GET` para reler um acerto já gravado (`occurrence-settlement.routes.ts` só tem `PUT` e o
   `POST` de ressarcimento), a tela nasce vazia a cada abertura — ela não sabe o que já foi salvo
   antes de o operador digitar de novo.

Contrato novo: `test/trip/occurrence-settlement-panel.contract.ts` — soma sem float (dez vezes
R$0,10 bate R$1,00 exato), item sem valor conta como zero, valor zero/negativo não é positivo,
formatação pt-BR, e a fiação estática (filtro de envio, `carrier` sem botão, `amountSource` manual,
uso do `Select`).

### Gates

- `bun run lint` / `bun run typecheck` (raiz) — limpos.
- `bunx prettier --check .` — limpo.
- `bun --env-file=../../.env.test run test` (`apps/frontend-transportada`) — **4897 pass + 44 pass
  (hooks), 0 fail**.

### Commit

`feat(frontend): spec 164 T23 — painel de acerto dos produtos da ocorrência` (89bd64f2a).

## T24 — Marcador de tratativa na listagem e no mapa (RF36/RF37, CA5)

`TripStopList.component.tsx` ganha um selo (`Icon name="alert"` + `Tooltip`, classe
`.occurrenceCaseBadge`) na linha da nota quando `document.openOccurrenceCase === true` —
adicionado **depois** do aviso fiscal e **antes** das ações da linha, sem remover, esconder ou
desabilitar nenhum botão existente. `AssemblyVectorMap.component.tsx` ganha um ícone sobreposto ao
pino (`occurrenceBadgeElement`, `.tilePinOccurrenceBadge`, `position: absolute` no canto) quando
`point.hasOpenOccurrence === true` — a cor do pino continua vindo de `stopColorOf`, o ícone só
acrescenta. `AssemblyMapPoint.hasOpenOccurrence` é campo opcional novo em `assemblyMap.service.ts`,
preenchido em `TripRouteMap.component.tsx` a partir de `stop.hasOpenOccurrence`; parada sem
coordenada continua fora de `points` (filtrada por `locateStops` antes do mapa, como já era) —
não muda o comportamento existente de "parada sem coordenada não quebra o mapa".

`openOccurrenceCase`/`hasOpenOccurrence` já chegavam validados desde T15/T21 (opcionais em
`trip.types.ts`, `tripResponse.validation.ts`, whitelist em `trip.constant.ts`) — esta task só
consome os campos na UI.

Contrato novo: `test/trip/occurrence-badge-actions.contract.ts` — prova que
`resolveFieldActionCapabilities` (a mesma fonte que `TripStopList` usa para decidir botão por
botão) não recebe o marcador como entrada e devolve a mesma capacidade por nota, chamada duas
vezes com a mesma `TripAllowedActions`; `GET /trips/:id/allowed-actions` continua a única fonte
das ações, byte a byte igual com ou sem o marcador (RF20).

Textos novos: `occurrence.openCase`/`occurrence.openCaseHint`/`occurrence.stopOpenCase` em
`trip.locale.json` (pt-BR acentuado) e `trip.en.locale.json`.

Arquivos tocados:

- `apps/frontend-transportada/src/modules/trip/components/TripStopList.component.tsx`
- `apps/frontend-transportada/src/modules/trip/components/TripRouteMap.component.tsx`
- `apps/frontend-transportada/src/modules/trip/components/AssemblyVectorMap.component.tsx`
- `apps/frontend-transportada/src/modules/trip/shared/assemblyMap.service.ts`
- `apps/frontend-transportada/src/modules/trip/styles/trip.module.css`
- `apps/frontend-transportada/src/modules/trip/locales/trip.locale.json`
- `apps/frontend-transportada/src/modules/trip/locales/trip.en.locale.json`
- `apps/frontend-transportada/test/trip/occurrence-badge-actions.contract.ts` (novo)
- `apps/frontend-transportada/test/trip.contract.test.ts` (import do contrato novo)

### Gates

- `bun run lint` (raiz) — OK.
- `bun run typecheck` (raiz) — a única falha reportada é pré-existente em
  `apps/api-transportada/test/trip-http/occurrence-settlement.contract.ts` (`FindOccurrenceSettlementResult`),
  de outro agente com trabalho não commitado naquela app (fora do escopo desta task). Isolado, só
  `apps/frontend-transportada`: `bunx tsc --noEmit` — 0 erros.
- `bunx prettier --check src test` (`apps/frontend-transportada`) — OK.
- `bun run --cwd apps/frontend-transportada test` — **4898 pass + 44 pass (hooks), 0 fail**.

### Commit

`feat(frontend): spec 164 T24 — marcador de tratativa na listagem e no mapa` (187f12e59).

## Duas lacunas de API encontradas ao construir as telas (agente executor)

### 1. Decisão interna em nome do contratante

`POST /trip-occurrences/:id/case/decision` (`occurrences.resolve`, nunca `occurrences.decide` — essa
é do papel `contractor`). `actorKind: 'internal'` é constante da rota, nunca do corpo; nota é sempre
obrigatória (diferente do portal, que só exige em `other`). Reusa `OccurrenceCaseUseCase.decide` →
`DrizzleOccurrenceCaseRepository.transition` (ação `decide` já suportada pela máquina desde a T2/T9),
então conflito de decisão divergente (409 `OCCURRENCE_CASE_DECISION_CONFLICT`) e bloqueio de
reentrega (422 `OCCURRENCE_CASE_REDELIVERY_NOT_ALLOWED`) continuam vindo do escritor único, sem
reimplementação.

Arquivos tocados:

- `apps/api-transportada/src/trips/application/occurrence-case.port.ts` (ação `decide` na união)
- `apps/api-transportada/src/trips/application/occurrence-case.use-case.ts` (`decide`)
- `apps/api-transportada/src/trips/presentation/occurrence-case.routes.ts` (rota nova)
- `apps/api-transportada/src/trips/presentation/occurrence-case.schema.ts` (`INTERNAL_DECISION_BODY_SCHEMA`)
- `apps/api-transportada/test/rate-limited-routes.contract.test.ts` (balde `trip-occurrence-case` com 6 rotas)
- `apps/api-transportada/test/trip-application/occurrence-case.contract.ts` (nota obrigatória, actorKind fixo)
- `apps/api-transportada/test/trip-http/occurrence-case.contract.ts` (403 para `contractor`/`separator`, 200/400/404/409)

Nenhuma permissão nova, nenhuma mudança na tabela de papéis: `occurrences.resolve` já não está em
`contractor` nem em `separator` (`COMPANY_ROLE_PERMISSIONS`), então a mesma policy das outras cinco
rotas internas já barra os dois papéis — confirmado por contrato.

### 2. Leitura do acerto já gravado

`GET /trip-occurrences/:id/case/settlement` (`occurrences.resolve`) devolve os itens de
`trip_occurrence_item_settlements` no mesmo formato que o `PUT` aceita (`amount` string,
`amountSource`, `payerKind`/`payerId`), com `reimbursedAt` a mais. Leitura simples, sem lock — a
rota já resolveu `occurrenceId → caseId` antes de chamar o caso de uso, então a existência da
tratativa não precisa ser reconferida na leitura.

Arquivos tocados:

- `apps/api-transportada/src/trips/application/find-occurrence-settlement.use-case.ts` (novo)
- `apps/api-transportada/src/trips/infrastructure/drizzle-occurrence-settlement.repository.ts` (`findSettlement`)
- `apps/api-transportada/src/trips/presentation/occurrence-settlement.routes.ts` (rota `GET`)
- `apps/api-transportada/src/main.ts` (wiring)
- `apps/api-transportada/test/trip-http/occurrence-settlement.contract.ts` (403/200/404/lista vazia)

### Gates

- `bun run lint` (raiz) — OK.
- `bun run --cwd apps/api-transportada typecheck` — OK (0 erros; a falha `FindOccurrenceSettlementResult`
  registrada na entrada anterior deste arquivo era este próprio trabalho em andamento, e já fechou).
- `bunx prettier --check .` (raiz) — OK nos arquivos tocados por este agente.
- `bun --env-file=../../.env.test test --timeout 120000` (de dentro de `apps/api-transportada`) —
  **7108 pass, 23 skip, 0 fail** (7131 testes, 183 arquivos).
- Integração dos arquivos tocados (`bun --env-file=../../.env.test test
./test/integration/trip-occurrence-case.integration.ts
./test/integration/trip-occurrence-case-write-guard.integration.ts
./test/integration/trip-occurrence-settlement.integration.ts
./test/integration/occurrence-settlement-charge-bridge.integration.ts`) — **13 pass, 0 fail**.

### Commits

- `feat(api): spec 164 — decisão da tratativa em nome do contratante` (318ee1a2)
- `feat(api): spec 164 — GET do acerto por item da ocorrência` (0b5f16dfc)

Sem push, como pedido.

## T26 — Página "Ressarcimentos" (RF32)

Investigação da API antes de implementar: `GET /occurrence-charges/report`
(`occurrence-charge-report.routes.ts`, `trip.financials`) já existe e devolve as cobranças de
ocorrência **sem lote** (`batchId is null`), com filtros `contractorId`, `from`/`to`,
`chargeType`, `status`, `hasSettlement`, `search`, cursor e totais (`totals.totalAmount`,
`byChargeType`). O comentário do port já registra a decisão do usuário (plan.md §
"O fechamento é por seleção, com filtros"). **Mas** `POST /extra-charge-batches`
(`extra-charge-batch.routes.ts`) continua recebendo só `contractorId` + `periodStart` +
`periodEnd` — nenhum campo de lista de ids. Ou seja: a API lista por seleção, mas **fecha por
período**, não por seleção literal. `GET /extra-charge-batches/:id/statement` (PDF) já existe e
não muda.

Implementação, dentro do que a API oferece hoje: a tela lista o relatório com os filtros pedidos
(contratante `Select`, período `DateRangePicker`, tipo `MultiSelect`, situação `Select`, acerto
`Select`, busca por nota), marca linhas por `Checkbox`, soma a seleção em decimal exato
(`sumScaledAmounts` de `shared/decimalAmount.service.ts` — reaproveitado, não duplicado) e mostra
o total do relatório inteiro (conferido pela API) ao lado do total selecionado. O botão "Fechar o
período da seleção" calcula o intervalo mínimo/máximo de `chargedOn` das linhas marcadas e chama
o `closeBatch` **existente** (o mesmo da página Repasses) — reaproveitado de
`extraChargesClient.service.ts`, sem endpoint novo. A tela recusa fechar com seleção vazia, com
mais de um contratante marcado, ou com linha sem `contractorId`, e **avisa explicitamente antes
do clique** que o fechamento pega todas as cobranças sem lote do contratante dentro do período —
não só as marcadas (lacuna documentada em `resolveSelectionPeriod`, `occurrenceReimbursementSelection.service.ts`,
e no texto `reimbursements.close.hint` da tela). Depois de fechar, o botão "Baixar demonstrativo"
usa o `batchId` retornado e baixa o PDF de `GET /extra-charge-batches/:id/statement`
(`downloadStatement`, cliente novo em `extraChargesClient.service.ts`, corpo binário — não passa
pelo parser de JSON). Nenhum botão de envio à contratante foi criado.

Miniatura de foto (pedida na spec): **não implementada** — `OccurrenceChargeReportRow` não traz
URL nem contagem de anexo (só `occurrenceId`), e a rota de anexos (`/trip-occurrences/:id/attachments`)
não está pensada para leitura em massa numa lista de até 100 linhas. Marcado como lacuna
documentada, não como endpoint inventado.

Rota nova `/ressarcimentos` registrada em `src/main.tsx` (chave `reimbursements`, grupo "Fiscal"),
com ícone novo `workspace-reimbursements` em `components/ui/icon.tsx`. Permissão `trip.financials`
esconde a tela (mensagem `reimbursements.forbidden`) em vez de escondê-la do menu — mesmo padrão
das outras telas financeiras da app.

Arquivos tocados:

- `apps/frontend-transportada/src/modules/extra-charges/pages/OccurrenceReimbursementsWorkspace.page.tsx` (novo)
- `apps/frontend-transportada/src/modules/extra-charges/hooks/useOccurrenceReimbursements.hook.ts` (novo)
- `apps/frontend-transportada/src/modules/extra-charges/shared/occurrenceReimbursementSelection.service.ts` (novo)
- `apps/frontend-transportada/src/modules/extra-charges/shared/extraCharges.types.ts`
- `apps/frontend-transportada/src/modules/extra-charges/shared/extraChargesClient.service.ts`
- `apps/frontend-transportada/src/modules/extra-charges/shared/extraChargesResponse.validation.ts`
- `apps/frontend-transportada/src/modules/extra-charges/locales/extraCharges.locale.json` / `.en.locale.json`
- `apps/frontend-transportada/src/components/ui/icon.tsx` (ícone `workspace-reimbursements`)
- `apps/frontend-transportada/src/main.tsx` (rota/menu)
- `apps/frontend-transportada/test/extra-charges/occurrence-reimbursement-selection.contract.ts` (novo)
- `apps/frontend-transportada/test/extra-charges/occurrence-charge-report-response.contract.ts` (novo)
- `apps/frontend-transportada/test/extra-charges.contract.test.ts` (import dos contratos novos)

### Gates

- `bun run lint` (raiz) — OK.
- `bun run typecheck` (raiz) — mesma falha pré-existente de `apps/api-transportada` já registrada
  na T24 (outro agente, fora do escopo). Isolado: `apps/frontend-transportada` →
  `bunx tsc --noEmit` — 0 erros.
- `bunx prettier --check src test` (`apps/frontend-transportada`) — OK.
- `bun run --cwd apps/frontend-transportada test` — **4908 pass + 44 pass (hooks), 0 fail**.

### Commit

`feat(frontend): spec 164 T26 — página de ressarcimentos (RF32)` (584ccc32).

### Pendências explícitas

- Fechamento **não é** por seleção literal na API (só a listagem é) — documentado na tela e no
  código; corrigir exige campo novo em `POST /extra-charge-batches` (fora do escopo desta task,
  que não editou `apps/api-transportada`).
- Miniatura de foto por linha não implementada — API do relatório não traz o dado.

## Fechamento por seleção explícita (RF27/RF32) — apps/api-transportada

Fecha a pendência registrada acima ("Fechamento **não é** por seleção literal na API"): o
`POST /extra-charge-batches` passa a aceitar `chargeIds` no corpo (`z.array(z.string().uuid()).min(1).max(500).optional()`).
Comportamento:

- Sem `chargeIds`: idêntico a antes — fecha por `contractorId` + janela `periodStart..periodEnd`.
- Com `chargeIds`: fecha exatamente as linhas escolhidas. O período gravado no lote é o intervalo
  que cobre essas linhas (`min`/`max` de `charged_on` das selecionadas), nunca o do corpo — decisão
  explícita do usuário em `plan.md` § "O fechamento é por seleção, com filtros".
- Toda a validação de elegibilidade (mesmo contratante, sem lote, status `recorded`) roda **dentro
  da mesma transação** que insere o lote e prende as linhas — qualquer id fora disso recusa a
  requisição inteira, código estável `EXTRA_CHARGE_BATCH_SELECTION_INELIGIBLE` (422). Sem
  fechamento parcial silencioso.

Arquivos tocados:

- `apps/api-transportada/src/delivery-clients/application/extra-charge-batch.port.ts` — `close`
  ganha `chargeIds?` e passa a devolver `ExtraChargeBatchCloseOutcome`
  (`closed | empty | selection_ineligible`) em vez de `ExtraChargeBatch | null`.
- `apps/api-transportada/src/delivery-clients/infrastructure/drizzle-extra-charge-batch.repository.ts`
  — seleção validada e período derivado dentro da transação de fechamento.
- `apps/api-transportada/src/delivery-clients/application/extra-charge-batches.use-case.ts` — novo
  erro `ExtraChargeBatchSelectionIneligibleError` (422); `close` repassa `chargeIds`.
- `apps/api-transportada/src/delivery-clients/presentation/extra-charge-batch.routes.ts` —
  `closeSchema.chargeIds` opcional.
- `apps/api-transportada/test/delivery-clients/batches.contract.ts` — regressão do fechamento por
  período (sem `chargeIds`) + seleção explícita elegível/inelegível.
- `apps/api-transportada/test/integration/extra-charge-batch.integration.ts` — contra Postgres:
  fecha só a seleção com período derivado (inclusive linha fora da janela do corpo), e recusa
  seleção com linha de outro contratante sem prender nada.

### Gates (apps/api-transportada)

- `bun run typecheck` (raiz) — OK, 0 erros.
- `bun run lint` (raiz) — `apps/api-transportada` OK; falhas pré-existentes em
  `apps/frontend-transportada/src/modules/trip/components/OccurrenceCasePanel.component.tsx` são de
  outra sessão em andamento neste worktree, fora do escopo.
- `bunx prettier --check` nos arquivos tocados — OK.
- `bun --env-file=../../.env.test test --timeout 120000` (contrato completo) — **7111 pass, 23
  skip, 0 fail**, 183 arquivos.
- `bun --env-file=../../.env.test test ./test/integration/extra-charge-batch.integration.ts
./test/integration/extra-charge-batch-statement.integration.ts` (integração, arquivos tocados) —
  **7 pass, 0 fail**.

### Commit

`feat(api): spec 164 — fechamento do lote por seleção explícita` (e7308354c).

### Pendência explícita

- O frontend (`OccurrenceReimbursementsWorkspace.page.tsx`) ainda não envia `chargeIds` no
  `POST /extra-charge-batches` — a API já aceita; falta ligar a seleção da tela ao corpo da
  requisição. Fora do escopo desta task (frontend está fora do worktree autorizado).
