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

## T4 — repositório escritor único e abertura na transação

Fechada em 2026-09-22, contra a infra Docker do projeto (Postgres de teste na 65432).

- `bun run lint` e `bun run typecheck` (raiz, seis apps) — limpos.
- `bun --env-file=../../.env.test test --timeout 120000` — **6990 pass, 23 skip, 0 fail** (183 arquivos).
- `bun --env-file=../../.env.test test ./test/integration/trip-occurrence-case-write-guard.integration.ts`
  — **3 pass, 0 fail**: abertura em `allowed`/`blocked`, `unset` que não abre nada, e a corrida real
  entre duas transições na mesma tratativa (a perdedora recebe 409, nunca 404 e nunca silêncio).
- Integração de ocorrência que poderia ter regredido — `occurrence-type-catalog-seed`,
  `trip-occurrence-attachment`, `trip-field-office`, `trip-field-authorship` — **30 pass, 0 fail**.

⚠️ A suíte de integração **completa** não fechou nesta rodada: o processo que a rodava em segundo
plano não devolveu resultado. Rodaram os arquivos acima, que são os que a T4 toca. Fica registrado
como o que faltou, não como verde.

⚠️ As 8 falhas conhecidas por `OBJECT_STORAGE_UNAVAILABLE` (CT-e e pedágio) são credencial do
`.env.test` local — `STORAGE_SECRET_KEY=replace-me` contra o `minio-local-password` que o
`compose.yaml` fixa. O template do repositório já foi corrigido (`df3093365`); o arquivo local do
usuário não é editável daqui. Não contam contra esta task, e nenhuma delas toca ocorrência.
