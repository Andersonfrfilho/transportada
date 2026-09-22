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
