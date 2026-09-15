# Parecer H1: aprovado com ajustes

## Resumo

O desenho do plano está certo no essencial:

- a migration é aditiva, com colunas nullable;
- as FKs compostas levam `company_id`;
- os domínios são VARCHAR + CHECK, sem ENUM;
- a PK é UUID, e isso é correto porque o `id` sai no endpoint;
- `nfe_events` continua sem FK para `nfe_documents`. O contrato já exige isso em `apps/api-transportada/test/nfe-schema/distribution.contract.ts:67`.

Faltam dez ajustes, listados abaixo. Os quatro de maior peso:

1. **Sem FK de membership em `actor_user_id`/`requested_by_user_id`.** `removeMembership` apaga o vínculo com `DELETE` físico (`apps/api-transportada/src/identity/infrastructure/drizzle-company-user.repository.ts:491-503`). Com FK RESTRICT, a trilha passaria a travar a remoção de usuário. Com `SET NULL`/`CASCADE`, a remoção apagaria a auditoria.
2. **`protocol` só pode existir com `status_code`**, pelo fato da T1. O banco garante isso por CHECK.
3. **A máquina de estados D4 vai para o banco**, com CHECK de transição nas duas tabelas.
4. **Unique `(company_id, document_id, status_after)`** em `nfe_document_status_changes`, como idempotência de D7.

O endpoint `GET /v1/nfe-documents/:id/events` fica coberto sem índice novo em `nfe_events`.

## Análise do que já existe

- **`nfe_events` hoje** (`apps/api-transportada/src/database/nfe.schema.ts:590-646`): colunas em `text`, `unique(company_id,id)`, unique `(company_id, target_access_key, event_type, event_sequence)`, e FK só para `stored_objects`. A data em que o TMS registrou o evento é `created_at`; não existe coluna `registered_at`. Então, na H3, `registeredAt` = `nfe_events.created_at` ou `nfe_document_status_changes.changed_at`.
- **`nfe_imports`** tem `unique('nfe_imports_company_id_id_unique')` (`nfe.schema.ts:97`), e é isso que permite a FK composta de `import_id`. `requested_by_user_id` já tem FK RESTRICT para membership (`:102-108`). Todo ator ou solicitante gravado vem desse campo, então a validade dele já está garantida pela cadeia `import_id → nfe_imports`.
- **Ator de sistema:** `SYSTEM_DISTRIBUTION_ACTOR_USER_ID` tem membership por empresa (`apps/api-transportada/src/identity/domain/system-distribution-actor.constant.ts:5-12`). Pela D14 ele **não** é gravado: `automatic` com `requested_by_user_id` nulo significa "Sistema".
- **Worker:** a cópia do schema só tem colunas, sem CHECK nem FK (`apps/worker-transportada/src/database/nfe.schema.ts:246-258`). Não existe teste de paridade de schema no worker. O cron não usa `nfe_events`.
- **Padrão de migration:** o formato está em `drizzle/20260914120000_trip_document_reviews/`. O rollback segue estas regras: começa com comentário `--`, usa `BEGIN`/`COMMIT`, nunca `CASCADE`, apaga a linha do journal por nome e confere `ROW_COUNT = 1` (`test/database-migration/static-migration.contract.ts:298-330`).
- **Contratos que vão ficar vermelhos** (é o vermelho esperado da H1):
  - `test/nfe-schema/distribution.contract.ts:19-31` usa `toEqual` na lista exata de colunas;
  - `test/nfe-schema/tables.ts:5-19` e `aggregator.contract.ts:6-20` listam as tabelas.

## Ajustes: especificação exata para o executor

### 1. `nfe_events`: nove colunas, todas nullable, sem DEFAULT, acrescentadas depois de `created_at`

| coluna                   | tipo          | FK                                                                                                                              |
| ------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `status_code`            | `varchar(3)`  | —                                                                                                                               |
| `protocol`               | `varchar(20)` | —                                                                                                                               |
| `correction_text`        | `text`        | —                                                                                                                               |
| `import_id`              | `uuid`        | `nfe_events_company_import_fk`: `(company_id, import_id) → nfe_imports(company_id, id)`, `ON DELETE RESTRICT ON UPDATE CASCADE` |
| `origin`                 | `varchar(16)` | —                                                                                                                               |
| `actor_user_id`          | `uuid`        | **nenhuma** (ajuste 1)                                                                                                          |
| `requested_by_user_id`   | `uuid`        | **nenhuma** (ajuste 1)                                                                                                          |
| `document_status_before` | `varchar(16)` | —                                                                                                                               |
| `document_status_after`  | `varchar(16)` | —                                                                                                                               |

CHECKs, com estes nomes:

- `nfe_events_status_code_check`: `status_code is null or status_code ~ '^[0-9]{3}$'`
- `nfe_events_protocol_check`: `protocol is null or status_code is not null`
  - Fato da T1: sem `retEvento`, o `nProt` é o da NF-e. Não coloque regex no protocolo: um formato inesperado derrubaria a importação por causa de um campo informativo.
- `nfe_events_correction_text_check`: `correction_text is null or (event_type = '110110' and char_length(correction_text) between 1 and 1000)`
  - A coluna fica vazia até o pacote mudar.
- `nfe_events_origin_check`: `origin is null or origin in ('manual', 'automatic')`
- `nfe_events_origin_actor_check`:
  `(origin is null and actor_user_id is null and requested_by_user_id is null) or (origin = 'manual' and actor_user_id is not null and requested_by_user_id is null) or (origin = 'automatic' and actor_user_id is null)`
- `nfe_events_origin_import_check`: `(origin is null) = (import_id is null)`
- `nfe_events_document_status_check`: `(document_status_before is null or document_status_before in ('authorized','cancelled','denied','unsigned')) and (document_status_after is null or document_status_after in ('authorized','cancelled','denied','unsigned'))`
- `nfe_events_document_status_pair_check`: `(document_status_before is null) = (document_status_after is null)`
  - Cobre D15 (evento antes da nota: `null`/`null`) e D17 (evento antigo).
- `nfe_events_document_status_transition_check`: `document_status_before is null or document_status_before = document_status_after or (document_status_before, document_status_after) in (('authorized','cancelled'), ('unsigned','cancelled'), ('unsigned','denied'))`

**Sem índice novo em `nfe_events`.** Não acrescente índice em `import_id` nem de ordenação, porque a importação nunca é apagada (RESTRICT).

### 2. Tabela nova `nfe_document_status_changes`

Colunas:

| coluna                 | tipo e restrição                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `id`                   | `uuid PRIMARY KEY DEFAULT gen_random_uuid()`                                               |
| `company_id`           | `uuid NOT NULL`, FK para `companies(id)` RESTRICT/CASCADE (o nome padrão do drizzle serve) |
| `document_id`          | `uuid NOT NULL`                                                                            |
| `status_before`        | `varchar(16) NOT NULL`                                                                     |
| `status_after`         | `varchar(16) NOT NULL`                                                                     |
| `cause`                | `varchar(16) NOT NULL`                                                                     |
| `event_id`             | `uuid` (nullable)                                                                          |
| `import_id`            | `uuid` (nullable)                                                                          |
| `origin`               | `varchar(16)` (nullable)                                                                   |
| `actor_user_id`        | `uuid` (nullable, sem FK)                                                                  |
| `requested_by_user_id` | `uuid` (nullable, sem FK)                                                                  |
| `changed_at`           | `timestamptz NOT NULL DEFAULT now()`                                                       |

FKs, todas `ON DELETE RESTRICT ON UPDATE CASCADE`:

- `nfe_document_status_changes_company_document_fk`: `(company_id, document_id) → nfe_documents(company_id, id)`
- `nfe_document_status_changes_company_event_fk`: `(company_id, event_id) → nfe_events(company_id, id)`
- `nfe_document_status_changes_company_import_fk`: `(company_id, import_id) → nfe_imports(company_id, id)`

UNIQUEs:

- `nfe_document_status_changes_company_id_id_unique`: `(company_id, id)`
- `nfe_document_status_changes_document_target_unique`: `(company_id, document_id, status_after)`
  - Os destinos são terminais e não existe rebaixamento, então cada destino só é alcançado uma vez. Reprocessamento, ou corrida em que o lock falhe, não duplica linha.

CHECKs:

- `nfe_document_status_changes_status_check`: `status_before in (os 4) and status_after in (os 4)`
- `nfe_document_status_changes_transition_check`: `(status_before, status_after) in (('authorized','cancelled'), ('unsigned','cancelled'), ('unsigned','denied'))`
- `nfe_document_status_changes_cause_check`: `cause in ('event', 'summary', 'document_insert')`
- `nfe_document_status_changes_event_presence_check`: `(cause = 'summary') = (event_id is null)`
  - Decisão: `document_insert` **leva** o `event_id` do evento que fez a nota nascer cancelada.
  - Impacto na T3: `findPendingStatusFromEvents` devolve `{ to, eventId }`. Havendo mais de um evento aplicável, usa o de menor `created_at, id`.
  - Em `document_insert`, `status_before` é o status do XML (`authorized`/`unsigned`).
- `nfe_document_status_changes_origin_check`, `..._origin_actor_check` e `..._origin_import_check`: mesmas expressões do item 1.

Índice: `nfe_document_status_changes_company_document_changed_id_idx` em `("company_id", "document_id", "changed_at" DESC, "id" DESC)`. O SQL precisa sair sem `NULLS`, igual ao da listagem: `.desc()` no drizzle, como já confere `nfe-document-listing-order-index.assertion.ts:13`.

### 3. Cobertura do endpoint (orientação para a H3; a H1 não cria índice para isso)

- Nota por `(company_id, id)`: coberta pela unique `nfe_documents_company_id_id_unique`.
- Eventos por `(company_id, target_access_key)`: cobertos pelo prefixo da unique `nfe_events_company_access_key_type_sequence_unique`. Uma chave tem poucos eventos, então o `sort` por `created_at desc, id desc` é trivial. Um índice novo em `nfe_events` não compensa o custo de escrita nem o lock de `CREATE INDEX` na migration.
- Mudanças de status por `(company_id, document_id)` com `cause <> 'event'`: cobertas pelo índice do item 2.
- Cursor `<registered_at>::<id>`:
  - o timestamp vai como texto com microssegundos (`to_char`), como na listagem;
  - o keyset `(ts, id) < (:ts, :id)` e o `limit + 1` entram **em cada ramo** antes do `UNION ALL`, e o `order by ts desc, id desc limit` vai por fora.

### 4. Cópia no worker (`apps/worker-transportada/src/database/nfe.schema.ts`)

- Acrescentar as nove colunas em `nfeEvents` com os mesmos nomes e tipos (`varchar` com `length`, `uuid`, `text`).
- Criar `nfeDocumentStatusChanges` só com colunas, sem CHECK nem FK, seguindo o padrão do arquivo.
- Tipos: `NfeEventOrigin = 'automatic' | 'manual'` e `NfeDocumentStatusChangeCause = 'document_insert' | 'event' | 'summary'`, com `$type<>` nas colunas.
- Nada muda no cron.

### 5. Nome da migration e snapshot

- Gerar com `bun run db:generate --name nfe_event_history`.
- **O prefixo do timestamp tem que ser maior que `20260915005629`** (a migration da listagem). Se o gerador der um prefixo menor, renomeie a pasta para `20260915010000_nfe_event_history` antes de rodar `db:check` e o `schema-snapshot.contract.ts`.
- `snapshot.json` é obrigatório (`apps/api-transportada/CLAUDE.md`, seção "Migration à mão é permitida").

### 6. `rollback.sql`

Na ordem:

1. Comentário `--` com copyright e o aviso: "só desfaça antes de haver trilha gravada; depois disso, roll-forward (princípio 5)".
2. `BEGIN;`
3. `DROP TABLE IF EXISTS "nfe_document_status_changes";`
4. Um único `ALTER TABLE "nfe_events"` com `DROP CONSTRAINT IF EXISTS` das nove constraints novas (a FK e os oito CHECKs), seguido de `DROP COLUMN IF EXISTS` das nove colunas.
5. O bloco `DO $$` que apaga `'<pasta>'` de `drizzle.__drizzle_migrations` e levanta exceção se `ROW_COUNT <> 1`.
6. `COMMIT;`

Sem `CASCADE`.

### 7. Contratos vermelhos antes da migration (API)

- `test/nfe-schema/distribution.contract.ts`: lista de colunas nova, os CHECKs novos pelo nome e SQL, a FK `nfe_events_company_import_fk`, e a ausência de FK em `actor_user_id`/`requested_by_user_id`.
- Suíte nova `test/nfe-schema/document-status-changes.contract.ts`: colunas, obrigatórias, `expectGeneratedUuidPrimaryKey`, uniques, índice, FKs e CHECKs.
- Acrescentar `nfeDocumentStatusChanges` em `tables.ts` e `nfe_document_status_changes` em `aggregator.contract.ts`.
- Confirmar que a suíte nova está na lista `test` do `package.json` da API.

### 8. Assertion de banco para `make migration-test`

Arquivo `test/database-migration/nfe-event-history.assertion.ts`, chamado em `database-migration.integration.ts` depois de `assertNfeDocumentListingOrderIndex` (linha 109). Ele prova:

- que o banco **recusa**:
  - `manual` sem ator;
  - `automatic` com ator;
  - `origin` sem `import_id`;
  - `protocol` sem `status_code`;
  - `correction_text` num evento `110111`;
  - status fora do domínio;
  - `before` sem `after`;
  - transição `authorized → denied` e `cancelled → authorized` nas duas tabelas;
  - `summary` com `event_id`;
  - segunda linha com o mesmo `(company, document, status_after)`;
  - FK de `import_id` de outra empresa;
- que uma linha antiga, com as nove colunas nulas, é **aceita**;
- que o `EXPLAIN` com `enable_seqscan = off` da consulta de mudanças usa o índice novo sem `Sort`;
- que depois do rollback a tabela e as colunas somem e a linha do journal também, e que a migration reaplica.

### 9. Impacto na H3 (registrar agora, não é decisão da H1)

Sem FK no ator, o cenário "usuário removido" (H13) é montado inserindo o evento com um `actor_user_id` que não tem membership. Pela UI ele é quase inalcançável: o `nfe_imports_requested_by_membership_fk` já impede apagar o vínculo de quem importou. O nome continua sendo resolvido por `left join` na membership da mesma `company_id`.

### 10. Não usar `metadata`

`status_code` e `protocol` vão para as colunas tipadas, nunca para `nfe_events.metadata`.

## Causa raiz dos ajustes

- **FK de membership no ator.** A trilha de auditoria é imutável, e o vínculo pode ser apagado fisicamente. Qualquer ação de FK (RESTRICT, SET NULL, CASCADE) viola uma das duas coisas: ou trava a remoção do usuário, ou apaga a auditoria.
- **CHECKs novos.** Os fatos da T1 (`protocol` sem `retEvento`, texto da CC-e ausente) e as regras D4/D7 ficavam só na disciplina do worker. A regra da spec, "é o banco que garante", pede que fiquem no schema.

## Recomendações, por prioridade

1. Ajustes 1, 2 e 6 (colunas, tabela, rollback). Esforço médio, impacto alto: corretude e auditoria.
2. Ajustes 7 e 8 (contratos e assertion), antes do SQL. Esforço médio, impacto alto.
3. Ajuste 5 (ordem do prefixo). Esforço baixo; se passar errado, a migration fica fora de ordem no journal.
4. Ajuste 4 (cópia no worker). Esforço baixo; sem ele a T3 e a H2 não compilam.

## Trade-offs

| Decisão                                     | A favor                                                                                 | Contra                                                                          |
| ------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Sem FK no ator/solicitante                  | A trilha sobrevive à remoção do vínculo; a remoção não fica mais travada do que já está | O banco não valida o id direto (a validade vem por `import_id → nfe_imports`)   |
| CHECK de transição no banco                 | D4 garantida pelo Postgres, também contra código futuro                                 | Transição nova no futuro exige migration                                        |
| Unique `(company, document, status_after)`  | Idempotência de D7 sem depender do lock                                                 | Uma transição futura que volte a um destino já visitado exige derrubar a unique |
| Sem índice novo em `nfe_events`             | Nada de lock de build nem custo de escrita na tabela grande                             | `sort` em memória por chave; irrelevante com poucos eventos                     |
| `protocol varchar(20)` sem regex            | Formato inesperado não derruba a importação                                             | Aceita valor fora do padrão de 15 dígitos                                       |
| `event_id` obrigatório em `document_insert` | Rastreia qual evento fez a nota nascer cancelada                                        | A T3 precisa devolver `eventId` de `findPendingStatusFromEvents`                |

## Referências

- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/api-transportada/src/database/nfe.schema.ts:590-646`: `nfe_events` atual; `:97`, a unique de `nfe_imports` que serve à FK composta; `:102-108`, a FK de membership do solicitante.
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/api-transportada/src/identity/infrastructure/drizzle-company-user.repository.ts:491-503`: vínculo apagado com `DELETE` físico.
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/api-transportada/src/identity/domain/system-distribution-actor.constant.ts:5-12`: ator de sistema com membership por empresa.
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/worker-transportada/src/database/nfe.schema.ts:246-258`: cópia só com colunas.
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/api-transportada/test/nfe-schema/distribution.contract.ts:19-31` (lista de colunas) e `:67-69` (proibição de FK para `nfe_documents`).
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/api-transportada/test/nfe-schema/tables.ts:5-19` e `aggregator.contract.ts:6-20`: listas de tabelas.
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/api-transportada/test/database-migration/static-migration.contract.ts:298-330`: regras do rollback.
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/api-transportada/test/database-migration/nfe-document-listing-order-index.assertion.ts`: modelo da assertion com rollback e reaplicação.
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/apps/api-transportada/drizzle/20260914120000_trip_document_reviews/`: formato da migration e do rollback.
- `/Users/anderson.filho/Documents/personal/transportada-wt/ordem-notas/specs/149-evento-sefaz-atualiza-status-nota/evidence.md:22-41`: fatos da T1 (`statusCode` undefined sem `retEvento`, `protocol` com fallback, CC-e sem texto, `cSitNFe` vazio).
