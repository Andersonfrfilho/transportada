# Spec 149 — Evidência

## T1 — fiscal gate · 2026-09-14

Pacote instalado: `@adatechnology/fiscal-provider@0.3.0-rc.7`
(`apps/worker-transportada/node_modules/@adatechnology/fiscal-provider` →
`node_modules/.bun/@adatechnology+fiscal-provider@0.3.0-rc.7`). Fonte conferida, só leitura, em
`~/Documents/personal/adatechnology-packages/packages/backend/fiscal-provider` (mesma versão `0.3.0-rc.7`).
Nada foi alterado nem publicado no pacote.

O worker não tinha XML de evento em `test/fixtures/` (só `cargo-layout-input.fixture.ts`), então a T1 criou um
fixture sintético no molde do fixture do próprio pacote (`test/fixtures/nfe-xml.fixture.ts` →
`buildNfeEventXml`) e passou pelo `importarNfeXml` **real** do pacote instalado:
`apps/worker-transportada/test/fiscal-provider-event/nfe-event-xml.fixture.ts` e
`apps/worker-transportada/test/fiscal-provider-event/nfe-event-fields.contract.ts` (entrypoint
`test/fiscal-provider-event.contract.test.ts`, incluído na lista `test` do `package.json` do worker).

### O que o pacote entrega

| Dado                         | Entrega?  | Prova                                                                                                                                                                 |
| ---------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event.type` = `tpEvento`    | sim       | `dist/types.d.ts:877` `NfeXmlEvent.type: string`; `dist/index.js:6210` (`parseEvent`, `requireFirstString tpEvento`)                                                  |
| `event.statusCode` = `cStat` | sim\*     | `dist/types.d.ts:884` `statusCode?: string`; `dist/index.js:6251` lê `cStat` **só de `retEvento/infEvento`**                                                          |
| `event.protocol`             | sim\*\*   | `dist/types.d.ts:883` `protocol?: string`; `dist/index.js:6244` — `nProt` do `retEvento`, com fallback para `nProt` do `detEvento`                                    |
| texto da CC-e (`xCorrecao`)  | **não**   | `NfeXmlEvent` (`dist/types.d.ts:877-886`) não tem o campo; `parseEvent` (`dist/index.js:6192-6260`, fonte `src/providers/NfeXmlImporter.service.ts:412-433`) não o lê |
| `DfeItem.situacao` (resNFe)  | sim\*\*\* | `dist/types.d.ts:794-795` (`cSitNFe: '1' \| '2' \| '3'`); `dist/index.js:6783` `situacao = String(resNFe.cSitNFe ?? "")`                                              |

\* Sem `retEvento` no XML (só `<evento>`), `statusCode` vem `undefined` — confirmado no teste. A D2 já trata:
sem `statusCode`, não aplica.

\*\* Sem `retEvento`, o `protocol` cai no `nProt` do `detEvento`, que no cancelamento (`110111`) é o protocolo
de **autorização da NF-e**, não o do registro do evento (teste "evento sem retEvento… nProt do detEvento"). A H2
deve gravar `protocol` só quando houver `statusCode` (ou documentar que, sem `retEvento`, o valor é o da NF-e).

\*\*\* `situacao` do `resNFe` sai de `parseDocZip` (interno, `dist/index.js:6758`), acionado só pela consulta
SOAP da distribuição; não há transporte injetável (`NfeDistribuicaoProvider.fetchSefaz` é privado), então a
prova é estática (tipo + linha do dist), não executada. Com `cSitNFe` ausente o valor é `""` (string vazia,
não `undefined`) — a política da T2 deve tratar `""` como "sem efeito". Na distribuição, o `procEventoNFe`
passa pelo `importarNfeXml` (`nfe-distribution-item.mapper.ts` → `xmlImporter.importXml`), então o
`statusCode` também chega pelo trilho da distribuição; o `parseDocZip` não o lê para `procEventoNFe`, mas o
worker não usa aquele caminho para evento.

### Valores reais do `importarNfeXml` (rc.7) sobre os fixtures

- Cancelamento `110111`, `cStat 135`: `{ accessKey: "35260711222333000181550010000000011000000013",
type: "110111", sequence: "1", statusCode: "135", protocol: "135260000000002" }`.
- Cancelamento por substituição `110112` com `cStat` `136`, `155` e `573`: `statusCode` chega igual ao do XML —
  o pacote não filtra; o filtro `{135,136,155}` da D2 é da aplicação.
- CC-e `110110`, `cStat 135` — objeto completo devolvido:
  `{"accessKey":"35260711222333000181550010000000011000000013","type":"110110","sequence":"1","occurredAt":"2026-07-20T13:00:00-03:00","description":"Carta de Correcao","protocol":"135260000000002","statusCode":"135","reason":"Evento registrado e vinculado a NF-e"}`
  — **sem o texto do `xCorrecao`**.

### Vermelho antes

Primeira versão do contrato afirmava que o evento normalizado da CC-e contém o `xCorrecao`:

```
(fail) fiscal provider event contract (spec 149 T1) > CC-e expõe o texto da correção (xCorrecao) no evento normalizado — D18
 6 pass
 1 fail
Ran 7 tests across 1 file.
```

Como a lacuna é do pacote (e mudá-lo exige aprovação), a asserção virou "ainda não expõe — D18 bloqueada":
quando o pacote passar a entregar o campo, o teste falha e obriga a H2 a gravar o texto.

### Gates

- `bun run typecheck` (raiz) → exit 0.
- `bun run lint` (raiz) → exit 0.
- `bun run --cwd apps/worker-transportada test` → **1207 pass, 0 fail**, 86 arquivos; linhas `(fail)`: 0.
  A suíte nova roda na lista (7 testes).
- Integração do worker: não aplicável — a T1 não toca persistência nem banco.
- Prettier `--check` nos arquivos alterados → limpo.

### Decisão pendente com o usuário (D18)

O `statusCode` (D2) e o `situacao` (D3) existem: T2/T3 seguem. O **texto da CC-e não existe** no rc.7 e a
aplicação não pode ler o XML por conta própria. Opções:

1. Mudar o pacote (`NfeXmlEvent.correctionText?: string`, lido de `detEvento/xCorrecao` em `parseEvent`),
   publicar versão nova (ex.: `0.3.0-rc.8`) e atualizar o worker — **exige aprovação para mudar e publicar**.
2. Seguir sem o texto: `nfe_events.correction_text` fica `null` e a tela da H4 mostra só "Carta de correção"
   até o pacote entregar o campo (o teste de lacuna avisa quando).

## T2 — política pura de transição de status · 2026-09-14

Criados `apps/worker-transportada/src/nfe-documents/domain/nfe-document-status.constant.ts`
(`NFE_STATUS_CHANGING_EVENT_TYPES`, `NFE_EVENT_REGISTERED_STATUS_CODES`, `ALLOWED_ORIGIN_STATUSES`) e
`nfe-document-status-transition.policy.ts` (`resolveEventStatusChange`, `resolveSummaryStatusChange`,
`isStatusTransitionAllowed`), sem banco, sem I/O — D1–D4. Reaproveita `NfeDocumentStatus` já definido
no schema copiado do worker (`src/database/nfe.schema.ts`), sem redeclarar o domínio.

Regras aplicadas: só `110111`/`110112` mudam status, e só com `cStat` em `{135,136,155}` — sem
`statusCode` ou com `cStat` fora do conjunto vira `not-applied` (D2); tipo fora da lista (CC-e,
manifestação, EPEC…) é `ignore`, com qualquer `cStat`; resumo `situacao` `'2'` cancela, `'3'` denega,
`'1'` e `''` (cSitNFe ausente, conforme a T1) não têm efeito (D3); `isStatusTransitionAllowed` só
permite `cancelled ← {authorized, unsigned}` e `denied ← {unsigned}` — como `cancelled`/`denied`
nunca aparecem como origem em nenhuma entrada do mapa, nenhuma transição sai deles (D4, terminais). A
aplicação da guarda no `WHERE` do `UPDATE` (D4, D7) e o `warn` de evento não aplicado ficam para a T3,
que consome esta política.

### Vermelho antes

Teste escrito primeiro contra os módulos ainda inexistentes:

```
error: Cannot find module '../../src/nfe-documents/domain/nfe-document-status-transition.policy.js' from
'.../test/nfe-document-status-transition/nfe-document-status-transition.contract.ts'
 0 pass
 1 fail
 1 error
Ran 1 test across 1 file.
```

Depois do código: `bun test ./test/nfe-document-status-transition.contract.test.ts` → **88 pass, 0 fail**.
A suíte cobre, em tabela: os dois tipos que cancelam × cada `cStat` registrado, cada `cStat` fora do
conjunto e sem `statusCode`; os quatro tipos que não mudam status × todo `cStat` (registrado, fora do
conjunto e ausente) — sempre `ignore`; tipo desconhecido; as cinco situações do resumo (`'1'`, `'2'`,
`'3'`, `''`, `'9'`); e as 16 combinações origem×destino de `isStatusTransitionAllowed` mais os reforços
específicos de que nada sai de `cancelled` nem de `denied`.

Arquivo novo (`test/nfe-document-status-transition.contract.test.ts`) entrou na lista explícita `test`
do `package.json` do worker, logo depois de `fiscal-provider-event.contract.test.ts`.

### Gates

- `bun run typecheck` (raiz) → exit 0.
- `bun run lint` (raiz) → exit 0.
- `bun run --cwd apps/worker-transportada test` → **1295 pass, 0 fail** (86 → 88 testes novos), 87
  arquivos. Linhas `(fail)`: 0.
- Integração do worker: não se aplica — a T2 é política pura, sem banco.
- Prettier `--check` nos arquivos alterados → limpo (após `--write` nos três arquivos novos, formatados
  fora do padrão do editor).

## H1 — migration `nfe_event_history` · 2026-09-14

Seguiu o parecer `h1-parecer-architect.md`, aprovado com ajustes. A coluna `correction_text` existe e fica
vazia até o pacote fiscal entregar o texto da CC-e, trabalho paralelo que não é desta task.

### O que foi criado

- Migration `drizzle/20260915021812_nfe_event_history/` (`migration.sql`, `snapshot.json`, `rollback.sql`),
  gerada por `bun run db:generate --name nfe_event_history`. O prefixo é maior que `20260915005629` e não
  precisou de renomeação.
- `nfe_events`: nove colunas nullable, sem DEFAULT (`status_code varchar(3)`, `protocol varchar(20)`,
  `correction_text text`, `import_id uuid`, `origin varchar(16)`, `actor_user_id uuid`,
  `requested_by_user_id uuid`, `document_status_before`/`_after varchar(16)`).
  - FK `nfe_events_company_import_fk` → `nfe_imports(company_id, id)`, RESTRICT/CASCADE.
  - Os oito CHECKs do ajuste 1.
  - **Sem** FK em ator/solicitante e **sem** índice novo.
- `nfe_document_status_changes`:
  - PK UUID;
  - FK de `company_id` e as três FKs compostas (documento, evento, importação);
  - uniques `company_id_id` e `document_target` `(company_id, document_id, status_after)`;
  - os sete CHECKs;
  - índice `nfe_document_status_changes_company_document_changed_id_idx`, que sai sem `NULLS` no SQL:
    `("company_id","document_id","changed_at" DESC,"id" DESC)`.
- Cópia só de colunas no worker (`apps/worker-transportada/src/database/nfe.schema.ts`), com os tipos
  `NfeEventOrigin` e `NfeDocumentStatusChangeCause`. Nada mudou no cron.
- `rollback.sql`, na ordem do ajuste 6: comentário, `BEGIN`, `DROP TABLE`, um único `ALTER TABLE` com os 10
  `DROP CONSTRAINT` e os 9 `DROP COLUMN`, remoção da linha do journal por nome com `ROW_COUNT = 1`, `COMMIT`.
  Sem `CASCADE`.
- Assertion `test/database-migration/nfe-event-history.assertion.ts`, chamada logo depois de
  `assertNfeDocumentListingOrderIndex`.
  - O banco recusa:
    - `manual` sem ator;
    - `automatic` com ator;
    - `origin` sem `import_id`;
    - `protocol` sem `status_code`;
    - `correction_text` em evento `110111`;
    - status fora do domínio;
    - `before` sem `after`;
    - `authorized→denied` e `cancelled→authorized` nas duas tabelas;
    - `summary` com `event_id`;
    - destino repetido (23505);
    - `import_id` de outra empresa (23503).
  - O banco aceita o evento antigo, com as nove colunas nulas.
  - O `EXPLAIN` com `enable_seqscan = off` mostra `Index Scan` pelo índice novo, sem `Sort`.
  - Depois do rollback, a tabela, as colunas e a linha do journal somem; a migration reaplica e a tabela, as
    colunas e o índice voltam.

### Vermelho antes

Contratos de schema escritos antes do schema: `distribution.contract.ts`, a suíte nova
`document-status-changes.contract.ts`, `tables.ts` e `aggregator.contract.ts`.

```
(fail) NF-e distribution schema > stores events independently while keeping tenant, XML, and NSU uniqueness
(fail) NF-e distribution schema > records the fiscal history of each event without trusting the worker for coherence (spec 149 H1)
(fail) NF-e document status change trail schema > keeps one row per reached status, tenant-bound to the document, event, and import
(fail) NF-e schema tenant safety > requires company ownership and a restrictive company relationship on every table
(fail) NF-e schema tenant safety > uses UTC timestamps and excludes secret or raw fiscal payload columns
 32 pass
 6 fail
Ran 38 tests across 1 file.
```

Depois do schema: `test/nfe-schema.contract.test.ts` → **38 pass, 0 fail**.

### Gates

- `bun run typecheck` (raiz) → exit 0.
- `bun run lint` (raiz) → exit 0.
- `bun run db:check` → "Everything's fine".
- Contratos da API, com `bun --env-file=../../.env.test test --timeout 120000` sobre a lista `test` do
  `package.json` → **5790 pass, 23 skip, 0 fail**, 172 arquivos. Linhas `(fail)`: 0. Nenhum skip novo.
- `make migration-test` → **95 pass, 0 fail**, 8 arquivos. Linhas `(fail)`: 0. A integração aplica,
  confere as restrições, reverte e reaplica; a assertion da H1 roda dentro dela.
- `bun run --cwd apps/worker-transportada test` → **1207 pass, 0 fail**, 86 arquivos. Linhas `(fail)`: 0.
- `make worker-integration` → 96 pass, 1 fail. As suítes de NF-e do worker (import, distribution,
  cursor, profile, candidate source) passaram com a cópia nova do schema.
  - A falha está em `osrm-routing-matrix.integration.test.ts` ("ponto fora da área…"): esperado `4511.2`,
    recebido `237538.9`. É distância do OSRM contra o dataset local.
  - O arquivo não toca NF-e nem banco e não muda desde `e066c86f` (2026-08-27). É ambiente, não regressão.
- Prettier `--check` nos arquivos alterados → limpo.

### Desvios do parecer

1. **`tenant-safety.contract.ts`**: a regra "toda tabela NF-e tem `created_at`/`updated_at`" foi excluída
   para `nfe_document_status_changes`, que pelo ajuste 2 só tem `changed_at`. O precedente é
   `processed_messages`. A suíte própria prova que `changed_at` é `timestamptz NOT NULL DEFAULT now()`.
2. **Índice**: o drizzle recebeu `.desc().nullsFirst()`, não `.desc()` puro, no mesmo padrão de
   `nfe_documents_company_updated_issued_id_idx`. É isso que faz o SQL sair sem `NULLS`, que é o que o
   ajuste 2 pede, e o `pg_indexes` confere `changed_at DESC, id DESC`.
3. Três arquivos de teste que o parecer não listou precisaram de uma linha a mais:
   - `static-migration.contract.ts`: a pasta nova na lista explícita de migrations;
   - `database-migration/support.ts`: `nfe_document_status_changes` em `NFE_TABLES`;
   - `nfe-schema.contract.test.ts`: o import da suíte nova. O entrypoint já estava na lista do `package.json`.

## H1b — migration `nfe_document_protocol_presence` · 2026-09-15

A T3 esbarrou num CHECK antigo: `nfe_documents_authorization_protocol_presence_check` exigia
protocolo de toda nota que não fosse `unsigned` (`20260724115644_unsigned_nfe_document_expand`). A D4
permite `unsigned → cancelled` e `unsigned → denied`, e a nota `unsigned` não tem protocolo. Sob a
T3 isso virava violação de CHECK dentro da transação do item e retry sem fim na distribuição. O usuário
escolheu relaxar o CHECK (opção 1), em commit isolado antes da T3.

### O que foi criado

- `drizzle/20260915025926_nfe_document_protocol_presence/`, gerada por
  `bun run db:generate --name nfe_document_protocol_presence` (prefixo maior que `20260915021812`).
  `migration.sql` é um único `ALTER TABLE … DROP CONSTRAINT …, ADD CONSTRAINT …`, com o mesmo nome:
  `("status" <> 'authorized') or ("authorization_protocol" is not null)`. `snapshot.json` gerado.
- `rollback.sql`: restaura `("status" = 'unsigned') or (…)` e remove a linha do journal com
  `ROW_COUNT = 1`. ⚠️ Falha se já houver nota `cancelled`/`denied` sem protocolo: nesse caso, roll-forward.
- Schema da API (`src/database/nfe.schema.ts`) com a expressão nova. O worker não copia CHECKs.
- Assertion `test/database-migration/nfe-document-protocol-presence.assertion.ts`, logo depois da H1:
  - `pg_get_constraintdef` confere a expressão nova;
  - `authorized` sem protocolo → recusado (23514, pela constraint);
  - `unsigned`, `cancelled` e `denied` sem protocolo → aceitos;
  - apaga essas notas, roda o `rollback.sql`, confere a expressão antiga e a linha do journal removida;
  - reaplica e confere a expressão nova de novo.

### Vermelho antes

Contrato de schema (`documents.contract.ts`) com a expressão nova, antes do schema:

```
(fail) normalized NF-e document schema > preserves document identity, decimal values, and immutable XML references per tenant
 37 pass
 1 fail
```

`make migration-test` com a assertion nova, antes da migration:

```
error: NF-e protocol presence migration is required
(fail) Drizzle migration integration > applies, constrains, rolls back, and reapplies the fiscal migration
 94 pass
 1 fail
```

### Gates

- `bun test ./test/nfe-schema.contract.test.ts` → **38 pass, 0 fail**.
- `bun run typecheck` e `bun run lint` (raiz) → exit 0. `bun run db:check` → "Everything's fine".
- `make migration-test` → **95 pass, 0 fail**, 8 arquivos. Linhas `(fail)`: 0.
- Migration aplicada só no banco do `.env.test` (`db:migrate`) e nos bancos descartáveis do
  `migration-test`.
- Contratos da API, `bun --env-file=../../.env.test test --timeout 120000` sobre a lista `test` →
  **5790 pass, 23 skip, 0 fail**, 172 arquivos. Linhas `(fail)`: 0. Nenhum skip novo.
- Prettier `--check` nos arquivos alterados → limpo (o `.sql` não tem parser no Prettier).
- `static-migration.contract.ts`: a pasta nova na lista explícita de migrations.

## T3 — o evento e o resumo mudam a situação da nota · 2026-09-15

Seguiu o `t3-parecer-architect.md` (aprovado com ajustes A1–A7), com o escopo do A5/A6: grava também
`status_code`, `protocol`, origem, ator, solicitante e snapshot. A H2 ficou reduzida à H2' do A7. A
T3 parou uma vez e reportou o CHECK de protocolo que contradizia a D4 (resolvido pela H1b, commit
`aee6dfab`).

### O que foi criado

- `src/nfe-documents/domain/system-distribution-actor.constant.ts` (cópia do cron) e
  `nfe-event-origin.policy.ts` (`resolveNfeEventOrigin`, as três linhas da D14).
- `src/nfe-documents/types/nfe-document-status.types.ts`: provenance, mudança, avisos, resultado e os
  `*Params`/`*Result`.
- `NFE_DOCUMENT_STATUS_LOCK_NAMESPACE = 'nfe-document-status'` em `nfe-document-status.constant.ts`.
- `src/nfe-documents/infrastructure/drizzle-nfe-document-status.persistence.ts`:
  - `lockAccessKey`: `pg_advisory_xact_lock(hashtextextended('nfe-document-status:<empresa>:<chave>', 0))`,
    com a chave como parâmetro;
  - `readDocumentStatus` (sem `FOR UPDATE`);
  - `applyStatusChange`: `WHERE` com `ALLOWED_ORIGIN_STATUSES` e `updated_at = clock_timestamp()`;
  - `recordStatusChange`, com `onConflictDoNothing` na unique `(empresa, nota, status_after)`;
  - `findPendingStatusFromEvents`: o `cStat` é filtrado pela política, não pelo SQL.
- `src/nfe-documents/infrastructure/nfe-document-status-write.persistence.ts`: `writeEventWithStatus`,
  `resolveInitialDocumentStatus`, `recordDocumentInsertChange`, `applySummaryStatus` e
  `logNfeStatusWriteResult`, na ordem do A5.
- Fiação nos dois repositórios, com o lock como primeiro comando da transação e `logger` obrigatório;
  o log roda **depois** do commit. `main.ts` passa o `logger`.
- A1: `storeItemOrSkip` não pula o resumo com situação `'2'`/`'3'` de chave já gravada.

### Vermelho antes

- `bun run typecheck` (worker) → 10 erros (módulos e opção `logger` inexistentes).
- `test/nfe-distribution.contract.test.ts` → **1 fail**: "never skips a summary of a stored note when it
  carries a status change".
- `test/nfe-event-origin.contract.test.ts` → falha de módulo inexistente.
- Integração nova com o domínio já criado e os repositórios ainda sem fiação: **18 fail, 4 pass**. Os 4
  que passavam não dependem do código novo: isolamento sem lock, chave desconhecida e os dois "nunca
  loga chave".
- A primeira rodada com a fiação mostrou 1 fail real, a H6 `unsigned` → `denied` pelo CHECK de
  protocolo (ver H1b). As outras falhas daquela rodada eram do fixture (unique de `nfe_import_items`),
  corrigido.

### Integração (`test/nfe-document-status.integration.test.ts`, 22 casos)

Entrypoint fino com quatro suítes em `test/nfe-document-status/` e um fixture. Usa os dois repositórios
reais e um logger falso:

- **H1**, nos dois trilhos: upload → `manual` com ator; distribuição agendada → `automatic` sem ator e
  sem solicitante; "buscar agora" → `automatic` com solicitante. O `updated_at` sobe, e `changed_at`
  é igual a `updated_at` em microssegundos.
- **H2**, nos dois trilhos: `110111` e `110112` antes da nota deixam o evento `null`/`null`; a nota
  nasce `cancelled`, com filhos; a linha `document_insert` aponta para o evento de menor `created_at, id`.
- **H3**:
  - reprocessamento com nova importação não muda `updated_at` e mantém o snapshot original;
  - o segundo cancelamento grava `cancelled`→`cancelled`, sem linha nova;
  - `findExistingDocument` acha a nota;
  - o evento legado (colunas novas nulas) cancela quando chega de novo, e a linha dele fica intocada.
- **H4**, nos dois trilhos:
  - CC-e, `210200`, `cStat 573`, evento sem `statusCode` e `statusCode` fora do formato não mudam nada;
  - há `warn` só nos três últimos;
  - `status_code` e `protocol` ficam nulos quando o código não é válido.
- **H5**:
  - o cancelamento em A não toca a mesma chave em B;
  - com o controle segurando `(A,K)`, as escritas `(B,K)` e `(A,K2)` terminam em menos de 2 s.
- **H6**:
  - `unsigned` + `'3'` → `denied`, linha `summary` sem `event_id`;
  - `authorized` + `'3'` → nada, com `warn nfe_summary_status_inconsistent`;
  - `authorized` + `'2'` → `cancelled`;
  - chave desconhecida → nada.
- **H7**:
  - lock de sessão numa conexão de controle (`max: 1`), com espera medida em `pg_locks`;
  - nas duas ordens, uma única mudança (`event` em uma, `document_insert` na outra) e
    `updated_at >= created_at`;
  - mais 20 rodadas em `Promise.all` com chaves novas.
- Nenhum log contém chave de acesso.

### Gates

- `bun run typecheck` (raiz) → exit 0. `bun run lint` (raiz) → exit 0.
- `bun run --cwd apps/worker-transportada test` → **1301 pass, 0 fail**, 88 arquivos. Linhas `(fail)`: 0.
  - 1295 da T2, mais 5 da origem e 1 da A1.
  - `nfe-event-origin.contract.test.ts` entrou na lista `test`.
- `make worker-integration ENV_FILE=.env.test` → **95 pass, 4 skip, 2 fail**. Linhas `(fail)`: 2, as duas
  no anexo do agregado (CCMEI e CRLV), com `ObjectStorageError: Object storage is unavailable`.
  - Não vêm da T3. Em A/B, num worktree temporário em `aee6dfab` (sem nenhum código da T3), a mesma
    suíte, com o mesmo `.env.test`, falhou igual: 0 pass, 2 fail, mesmo erro.
  - A suíte não importa arquivo tocado pela T3.
  - Repeti a execução sem recriação do MinIO e as falhas continuaram. São do MinIO do `.env.test`.
  - O osrm pula nesse ambiente.
- `make worker-integration` (`.env`, a condição da H1) → **100 pass, 1 fail**. A única falha é a mesma
  do osrm (`osrm-routing-matrix.integration.test.ts`, esperado `4511.2`, recebido `237538.9`), igual
  à registrada na H1.
  - O JUnit da mesma lista confirma que `nfe-document-status.integration.test.ts` rodou dentro do gate:
    22 casos, 0 falhas, 0 skips; na raiz, 101 testes e 1 falha.
  - O total não se compara direto com o 97 registrado na H1.
- `make migration-test` → **95 pass, 0 fail** (junto com a H1b).
- Contratos da API (`--env-file=../../.env.test`) → **5790 pass, 23 skip, 0 fail** (junto com a H1b).
- Prettier `--check` nos arquivos alterados → limpo.

### Desvios do parecer

1. `changedAt`/`createdAt` trafegam como texto do Postgres (`DatabaseTimestamp`, `::text`) e são gravados
   com `::timestamptz`, em vez de `Date`. Um `Date` corta em milissegundos, e aí `changed_at` deixaria de
   ser igual a `updated_at`.
2. `writeEventWithStatus` devolve `NfeEventWriteResult`, que é `NfeStatusWriteResult` mais `inserted`.
   A distribuição conta os eventos novos à parte dos repetidos.
3. A integração ficou dividida em entrypoint, quatro suítes e um fixture, e não num arquivo único. O
   controle de lock usa `createDrizzleProvider` com `max: 1`, para o lock de sessão ficar numa conexão só.
4. Os dois testes de integração antigos (`nfe-import-repository`, `nfe-distribution-repository`)
   passaram a receber um `logger` vazio, porque a opção virou obrigatória.
5. Achado fora do parecer: o CHECK `nfe_documents_authorization_protocol_presence_check` contradizia a
   D4. Resolvido pela migration da H1b, por decisão do usuário.

## H2' — subida do pacote fiscal e texto da CC-e · 2026-09-15

Escopo do A7 do `t3-parecer-architect.md`: (1) subir `@adatechnology/fiscal-provider` de
`0.3.0-rc.7` para `0.3.1` no worker e na API (cron não depende do pacote — confirmado, sem
ocorrência em `apps/cron-transportada/package.json`); (2) gravar `correctionText` em
`writeEventWithStatus`; (3) inverter o teste de lacuna da T1; (4) integração da CC-e.

### Versões alinhadas

- `apps/worker-transportada/package.json:27` e `apps/api-transportada/package.json:35`:
  `0.3.0-rc.7` → `0.3.1`. `bun.lock` regravado por `bun install`; `bun install --frozen-lockfile`
  passa (exit 0, "Checked 747 installs across 880 packages (no changes)" na segunda rodada).
- Cron não fixa o pacote — nada a alinhar ali.
- Dois contratos de "pin exato" que ninguém tinha listado no plano quebraram ao trocar a versão e
  foram atualizados para `0.3.1`: `apps/worker-transportada/test/environment.contract.test.ts:30`,
  `apps/worker-transportada/test/nfe-distribution/gateway.contract.ts:19` e
  `apps/api-transportada/test/certificate-validation-gateway.contract.test.ts:22`.

### Impacto do diff do pacote (`0.3.0-rc.7` → `0.3.1`, leitura em

`~/Documents/personal/adatechnology-packages`, só leitura, nada alterado nem publicado)

Dois commits mudam `packages/backend/fiscal-provider/src` entre as versões:

1. **`feat(fiscal-provider): CNPJ alfanumérico em todo documento, log e impressão`** — a mudança
   relevante para CT-e/MDF-e/NFS-e. Motivo: o CNPJ virou `[A-Z0-9]{12}[0-9]{2}` pela IN RFB
   2229/2024 e pela NT Conjunta DF-e 2025.001, em produção desde 01/07/2026; o pacote normalizava
   documento com `replace(/\D/g, '')` em ~20 lugares, o que descarta a letra e desloca os dígitos —
   dois CNPJs alfanuméricos distintos podiam colidir na mesma string normalizada. `SefazTaxId.ts`
   (novo) vira fonte única de normalização, DV e formatação, usada por
   `CteXmlBuilder`, `MdfeXmlBuilder`, `NfeXmlBuilder`, `NfseProvider`, `NotaRpNfseProvider`,
   `SatProvider`, `SefazMdfeProvider`, `SefazNfceProvider`, `SefazNfeProvider`,
   `NfeDistribuicaoProvider`, `LogObfuscator` (a tag `<CNPJ>` alfanumérica não era mascarada e o
   documento ia inteiro pro log) e os formatadores de recibo impresso (`CupomPdfBuilder`,
   `DanfceBuilder`, `controlid-cupom`). Pelo autor: "o golden numérico de NF-e, NFC-e, CT-e e MDF-e
   não mudou um byte" — CNPJ puramente numérico calcula exatamente como antes
   (`charCodeAt(0) - 48` reproduz o dígito ASCII). CPF, CEP, telefone, IE/IM, NCM, CFOP, CST e
   CNAE continuam com o filtro antigo. **Efeito para esta base:** nenhuma ação de código aqui — a
   emissão de CT-e/MDF-e/NFS-e usa CNPJ numérico das transportadoras cadastradas — mas é a mudança
   de maior superfície da subida e caberia um teste de fumaça com CNPJ alfanumérico se/quando uma
   empresa cliente vier a ter um.
2. **`feat(fiscal-provider): NfeXmlEvent traz o texto da Carta de Correção`** — é a mudança que a
   D18/H2' precisa: `NfeXmlEvent.correctionText?: string`, lido de `detEvento/xCorrecao`, `trim`,
   `undefined` quando ausente/vazio ou quando `type !== '110110'`. Aditivo, não muda
   `statusCode`/`protocol`/`situacao`. Confirmado no `dist/types.d.ts:887` do pacote instalado.

Nenhuma outra mudança em `src/` entre as duas versões (`git diff --stat` só lista os arquivos dos
dois commits acima).

### `writeEventWithStatus`

`apps/worker-transportada/src/nfe-documents/infrastructure/nfe-document-status-write.persistence.ts`:
grava `correctionText: event.type === '110110' ? (event.correctionText?.slice(0, 1000) ?? null) : null`.
O pacote já garante que `correctionText` nunca é string vazia (vira `undefined`), então o corte só
atua sobre texto não vazio — o CHECK `nfe_events_correction_text_check` exige `null` ou
`char_length between 1 and 1000` quando `event_type = '110110'`.

### Vermelho antes

Teste de lacuna da T1 invertido (`nfe-event-fields.contract.ts`): a asserção antiga
(`not.toContain(CORRECTION_TEXT)`) descrevia a lacuna do rc.7 e, contra o pacote 0.3.1 já
instalado, deixaria de fazer sentido (o evento passa a conter o texto). A nova asserção
(`expect(event.correctionText).toBe(CORRECTION_TEXT)`) é quem fecha o contrato do D18. Depois do
código, os dois contratos de pin de versão citados acima falharam primeiro
(`Expected: "0.3.0-rc.7" / Received: "0.3.1"`) e foram atualizados.

### Integração (`event-trail.integration.ts`, dentro de `nfe-document-status.integration.test.ts`)

Três casos novos, nos dois trilhos (importação e distribuição) onde fazia sentido:

- CC-e grava o texto acentuado (`"Corrigir o endereço de entrega para Rua Açaí, número 42 — São
Paulo"`) sem alteração;
- CC-e com texto de 1500 caracteres é gravada cortada em exatamente 1000;
- cancelamento (`110111`) nunca grava `correctionText` (fica `null`);
- nenhum log (`harness.logs`, que já cobre `info`/`warn` de toda a suíte) contém a palavra
  "Açaí" nem a sequência de 1000 "A" usada no teste de corte.

### Gates

- `bun run typecheck` (raiz) → exit 0.
- `bun run lint` (raiz) → exit 0.
- `bun run --cwd apps/worker-transportada test` → **1302 pass, 0 fail**, 88 arquivos (1300 da T3 +
  2 do teste "cancelamento não expõe texto de correção" e da inversão do teste de lacuna). Linhas
  `(fail)`: 0.
- Contratos da API (`bun --env-file=../../.env.test test --timeout 120000`) → **5790 pass, 23
  skip, 0 fail**, 172 arquivos. Linhas `(fail)`: 0. Nenhum skip novo.
- `make worker-integration ENV_FILE=.env.test` → **99 pass, 4 skip, 2 fail**. As duas falhas são
  as mesmas conhecidas do anexo do agregado (CCMEI e CRLV,
  `ObjectStorageError: Object storage is unavailable`), já registradas na T3 com o mesmo `.env.test`
  e confirmadas de novo aqui (mesma suíte, mesmo erro, arquivo não tocado por esta task).
- `make worker-integration` (`.env`) → **104 pass, 1 fail**. A única falha é a mesma do
  `osrm-routing-matrix.integration.test.ts` (esperado `4511.2`, recebido `237538.9`), registrada na
  H1 e na T3 — ambiente, não regressão desta task.
- `make migration-test` → não roda: H2' não toca migration nem schema.
- Prettier `--check` nos 8 arquivos alterados → limpo, sem `--write` necessário.

### Follow-ups registrados

- **CNPJ alfanumérico (item 1 acima):** sem ação nesta task; se uma transportadora cliente vier a
  operar com CNPJ alfanumérico, vale um teste de fumaça de emissão de CT-e/MDF-e/NFS-e contra o
  pacote — a mudança é aditiva e não regride o caso numérico, mas não foi exercitada aqui.
- A tela (H4) que exibe o texto da CC-e pode passar a mostrar o `correctionText` de verdade, em vez
  de "Carta de correção" genérico — decisão da H4, fora do escopo desta task.

## H3 — `GET /v1/nfe-documents/:id/events` · 2026-09-15

Seguiu o `h1-parecer-architect.md` §3 e §9 (cobertura de índice e a ausência de FK no ator) e o D19
do `spec.md`. T1 marcada `[x]` no `tasks.md` nesta task — a D18 ficou resolvida na H2' (pacote
`0.3.1`), e a T1 já estava com os dois gates fechados desde 2026-09-14; só faltava o checkbox.

### O que foi criado

- `src/nfe-documents/application/nfe-document-event.port.ts`: `NfeDocumentEventEntry`,
  `NfeDocumentEventActor`, `NfeDocumentEventPage`, `NfeDocumentEventRepositoryPort`.
- `src/nfe-documents/application/list-nfe-document-events.use-case.ts`: camada fina, delega ao
  repositório (a nota de outra empresa e a resolução de nome por membership são dele).
- `src/nfe-documents/presentation/nfe-document-events.schema.ts`: `parseDocumentEventList` —
  cursor `<registered_at>::<id>` com microssegundos (mesmo formato de
  `nfe-documents.schema.ts:parseDocumentListCursor`), `limit` padrão 20, teto 100, `400` fora disso
  ou com chave de query desconhecida/repetida.
- `src/nfe-documents/infrastructure/drizzle-nfe-document-event.repository.ts`:
  `DrizzleNfeDocumentEventRepository.listEvents` — dois ramos (`nfe_events` da chave da nota;
  `nfe_document_status_changes` do documento com `cause <> 'event'`), cada um com `limit + 1` e o
  próprio keyset (`(registered_at, id) < (:cursor)`), mesclados em memória por
  `(registered_at, id)` desc — os `limit + 1` de cada ramo bastam para os `limit + 1` da união
  (h1-parecer §3), sem precisar de `UNION ALL`, que o resto do repositório de NF-e não usa em lugar
  nenhum. Nome de ator/solicitante por `left join` em `user_company_memberships` (ativa, mesma
  empresa) + `identity_user_profiles`, no molde de
  `contractor-mail/infrastructure/actor-email.repository.ts`.
- Rota `GET /nfe-documents/:id/events` em `nfe-documents.routes.ts`, dependência `listDocumentEvents`
  fiada em `main.ts` (`DrizzleNfeDocumentEventRepository` + `createListNfeDocumentEvents`).
- Fixtures de teste (`nfe-http.types.ts`, `nfe-http.fixture.ts`, `nfe-http-payload.fixture.ts`,
  `nfe-http-request.fixture.ts`) ganharam o dependente falso e o `documentEventsRequest`.

### Duas decisões que o `spec.md`/`tasks.md` deixam por conta do executor

1. **Permissão.** D19 e a instrução da task dizem "`nfe.read`, a mesma do detalhe". O catálogo
   (`identity/domain/authorization.policy.ts`) não tem `nfe.read` — a permissão real do detalhe
   (`GET /nfe-documents/:id`) é `invoices.read`. Usei `invoices.read`, por ser literalmente "a mesma
   do detalhe"; comentário no código aponta a divergência de nome. Efeito colateral: o `separator`
   já alcança `invoices.read` (lê nota inteira e XML) e passou a alcançar também o histórico —
   `test/separator-role.contract.test.ts` (lista exaustiva, exige decisão por escrito) foi atualizado
   com um comentário justificando: não é dado novo para quem já lê os dois.
2. **"Usuário removido" (D16, H13).** H13 pede "sem id nem nome" quando o ator não tem membership
   ativa na empresa — não só ocultar na tela, mas o endpoint não expor o id cru. Implementado como
   `actor: null` (e `requestedBy: null`) por inteiro nesse caso, nunca `{ id, name: null }`. A string
   "usuário removido" em si é texto de tela (D20 lista entre os textos do `*.locale.json` do
   frontend) — fora do escopo desta task (H4).
3. **OpenAPI.** A task e o D19 pedem "documentado no OpenAPI gerado das rotas" — o repo não tem
   geração de OpenAPI a partir das rotas em lugar nenhum (`grep -rli openapi` não achou nada em
   `apps/api-transportada`). Item não aplicável; nada a gerar nem testar por ausência de rota.

### Contrato de rota (vermelho antes)

`test/nfe-documents/document-events.contract.ts` (58 testes no arquivo agregado, incluindo os já
existentes do módulo): permissão `invoices.read` (403 sem ela); `documentId`/paginação default
repassados ao caso de uso; serialização sem `xmlObjectId` nem "storage" na resposta; `404` quando o
repositório recusa (mapeando H13 de tenant); id malformado não casa a rota (`pathParameterFormat`
padrão do router já filtra por UUID — `404`, nunca chega ao `parse`); cursor com/sem microssegundos,
com chave extra, ou com id inválido → `400`; `limit` acima de 100, `0`, negativo ou não numérico →
`400`; query desconhecida ou repetida → `400`.

Antes do código (sem `nfe-document-events.schema.ts`/rota), o import falhava:

```
error: Cannot find module '../../src/nfe-documents/presentation/nfe-document-events.schema' from
'.../test/nfe-documents/document-events.contract.ts'
```

Depois: `bun test ./test/nfe-documents.contract.test.ts` → **58 pass, 0 fail**, 167 `expect()`.

### Integração (`test/integration/nfe-document-events.integration.ts`, Postgres real)

Três casos, banco descartável por teste (mesmo molde de
`nfe-document-listing-order.integration.ts`): nota com um evento de cancelamento manual (ator com
membership ativa, nome resolvido), uma entrada `document_insert` (nota nascida cancelada, D5, sem
ator/solicitante — origem `automatic`) e um evento de CC-e cujo ator perdeu a membership —
ordenação `registered_at desc` correta entre os dois tipos de entrada, ator da CC-e vem `null`
(H13), resposta sem `xmlObjectId`/`xml_object_id`/"storage"; isolamento entre empresas (`404` via
`ApiError`); paginação com `limit=1` não pula nem repete entrada nas três páginas.

Vermelho antes: a suíte referenciava `DrizzleNfeDocumentEventRepository`, inexistente —
`error: Cannot find module`. Depois:
`bun --env-file=../../.env.test test ./test/integration/nfe-document-events.integration.ts --timeout 120000`
→ **3 pass, 0 fail**, 20 `expect()`.

### Gates

- `bun run typecheck` (raiz) → exit 0.
- `bun run lint` (raiz, API) → exit 0.
- `bun run --cwd apps/api-transportada test` → **5799 pass, 23 skip, 0 fail**, 172 arquivos. Linhas
  `(fail)`: 0.
- `bun --env-file=../../.env.test test ./test/integration/nfe-document-events.integration.ts --timeout 120000`
  → **3 pass, 0 fail**, 20 `expect()`.
- `bun --env-file=../../.env.test run test:integration --timeout 120000` (lista completa, 61
  arquivos) → **301 pass, 4 skip, 2 fail**, 2188 `expect()`. As duas falhas são
  `cte-archive-gateway.integration.ts` (`ObjectStorageError: Object storage is unavailable`,
  MinIO do `.env.test`) — arquivo não tocado por esta task, mesmo defeito de ambiente já registrado
  na T3/H2' para o anexo do agregado. `nfe-document-events.integration.ts` está dentro dos 301 que
  passaram. Rodou em paralelo com a sessão `../spec149-t4` (T4/worker) sobre o mesmo Postgres do
  `.env.test`: nenhuma falha teve cara de corrida de banco, então não repeti.
- Prettier `--check` em todos os arquivos tocados por esta task → limpo, sem `--write`.

### Desvios do plano

1. `plan.md` sugeria `UNION ALL` no SQL; implementado como duas consultas típadas + mescla em
   memória (justificativa acima) — o resultado é equivalente porque cada ramo já traz `limit + 1`
   ordenado, e nenhum outro repositório de NF-e usa `UNION ALL` do drizzle nesta base.
2. Permissão e "usuário removido" — ver seção de decisões acima.
3. OpenAPI — não aplicável, repositório não tem geração de OpenAPI (ver acima).

## H4 — Drawer "Histórico fiscal" na linha da `NfeDocumentTable` · 2026-09-15

Escopo do D20/D13: consumir `GET /nfe-documents/:id/events` (H3) num drawer aberto pela linha da
tabela de Notas, com a linha do tempo, paginação por cursor e os textos em pt-BR (e em inglês, por
paridade com o resto do módulo).

### O que foi criado

- `src/modules/nfe-workspace/shared/nfeDocumentEventClient.service.ts`: cliente HTTP próprio
  (`createNfeDocumentEventClient`), no molde de `tripOccurrenceFeedClient.service.ts` — tipos
  (`NfeDocumentEventEntry`, `NfeDocumentEventPage`) e type guards que espelham a resposta real da
  H3 (`{ data: [...], page: { nextCursor } }`, confirmado lendo `nfe-documents.routes.ts:190-211` e
  `serializeDocumentEvent`), não o `nfe-document-event.port.ts` da API (a app não importa código de
  outra). Arquivo isolado em vez de crescer `nfeWorkspaceClient.service.ts` (já com 796 linhas) —
  um concern por arquivo.
- `src/modules/nfe-workspace/shared/nfeDocumentEventHistory.service.ts`: funções puras que
  traduzem a entrada da API em chaves de locale — `describeNfeEventType` (mapa dos `tpEvento`
  reconhecidos: `110110`/`110111`/`110112`/`210200`/`210210`/`210220`/`210240`, cai no código cru
  para o que a UI ainda não conhece), `describeNfeEventStatus` (D17 — `null` vira "status anterior
  não registrado", nunca recalculado), `describeNfeEventActors` e `describeNfeEventOrigin` (D14).
- `src/modules/nfe-workspace/hooks/useNfeDocumentEventHistory.hook.ts`: estado de abertura/fechamento
  (`target: {documentId, number, series}`) + `useInfiniteQuery` (`getNextPageParam` lendo
  `page.nextCursor`), no molde de `tripOccurrenceFeed.query.ts`.
- `src/modules/nfe-workspace/components/NfeDocumentEventHistoryDrawer.component.tsx`: `useModalDialog`
  - `createPortal` (mesmo idioma de `NfseInvoiceDetailDialog.component.tsx`), `role="dialog"` +
    `aria-modal="true"`; a lista é um `<ol>` com `<time dateTime>`; status anterior→novo não depende só
    de cor (badge com texto + `Icon name="chevron-right"` de separador); "carregar mais" tem
    `aria-live="polite"` anunciando o carregamento; estado vazio e de erro com texto próprio
    (`role="alert"` no erro).
- `NfeDocumentTable.component.tsx`: botão de ícone (`clock`, tooltip "Histórico fiscal") na célula
  de ações de cada linha, ao lado do download do XML; abre `eventHistory.open({ documentId, number,
series })`. `Esc` fecha e o foco volta ao próprio botão da linha — `useModalDialog` já devolve o
  foco a quem estava focado antes de abrir, que é sempre esse botão (nunca outro elemento da linha).
- Locale: `documents.eventHistoryButton` + `documents.eventHistory.*` em
  `nfeWorkspace.locale.json` e `nfeWorkspace.en.locale.json`; `documentStatus.unsigned` acrescentado
  aos dois (a linha do tempo pode mostrar `unsigned` como status anterior, status que a listagem
  hoje não exibe).
- CSS: bloco `.eventHistory*` em `nfeWorkspace.module.css`, drawer fixo à direita (`min(28rem,
100%)` a partir de 40rem, tela cheia abaixo disso) — reaproveita `.badge`/`.badgeReady/Muted/Danger`,
  `.iconAction`, `.ghostAction`, `.cardError`, `.emptyState` e `.srOnly` já existentes no módulo, em
  vez de duplicar.
- `test/nfe-workspace/document-event-history.contract.ts` (16 casos): cliente (envelope real da H3,
  entrada fora do formato recusada, código de erro do envelope, `statusChange` sem evento e ator
  ausente aceitos), as funções puras de tradução por tabela, e contrato estrutural do drawer/tabela/hook
  (`useModalDialog`, `createPortal`, `role="dialog"`, `<ol>`/`<time dateTime>`,
  `aria-live="polite"`, `role="alert"`, presença dos textos nos dois locales). Registrado em
  `test/nfe-workspace.contract.test.ts`.

### Duas decisões que o D14/D16 deixam por conta do executor

1. ~~**"Sistema (distribuição agendada)" vs "usuário removido" são indistinguíveis pela resposta da
   API.**~~ **Resolvido em 2026-09-15 (follow-up desta task, worktree `ordem-notas`).** O contrato
   mudou: `NfeDocumentEventActor` (`nfe-document-event.port.ts`) agora é `{ id, name } | { removed:
true }`; `buildActor` (`drizzle-nfe-document-event.repository.ts`) devolve `null` só quando não
   havia `user_id` gravado (não havia ninguém) e `{ removed: true }` quando havia id mas a membership
   não está mais ativa nesta empresa — nunca mais os dois casos como `null`. `SYSTEM_DISTRIBUTION_ACTOR_USER_ID`
   não tem linha em `identity_user_profiles`, mas ele nunca é gravado como `requested_by_user_id`
   (só como `actor_user_id` de evento `automatic`, e `actor` já não é exibido para eventos
   automáticos) — "Sistema (distribuição agendada)" continua sendo `requestedBy === null` de verdade
   ("ninguém pediu"), agora sem ambiguidade com o solicitante removido. No frontend,
   `nfeDocumentEventHistory.service.ts:displayFor` passou a ler o sinal explícito (`'removed' in
actor`) em vez da heurística por origem; `nfeDocumentEventClient.service.ts` aceita as duas formas
   no type guard. Testes: `test/integration/nfe-document-events.integration.ts` (API, Postgres real)
   e `test/nfe-workspace/document-event-history.contract.ts` (frontend).
2. **Botão do histórico sem checagem própria de permissão.** A tabela inteira já exige
   `invoices.read` para existir (`useNfeWorkspace.hook.ts:READ_PERMISSION`); quem vê a linha já tem
   a mesma permissão que H3 exige (D19 — "a mesma do detalhe"). Igual ao botão de download de XML,
   que também não repete a checagem.

### Gates

- `bun run typecheck` (raiz, as seis apps) → exit 0.
- `bun run lint` (raiz, as seis apps) → exit 0.
- `bun run --cwd apps/frontend-transportada test` → **3638 pass, 0 fail**, 29 arquivos, 34534
  `expect()`. Linhas `(fail)`: 0. `document-event-history.contract.ts` entrou pelo
  `test/nfe-workspace.contract.test.ts`, já na lista do `package.json` — nada novo a adicionar lá.
- `bun run --cwd apps/frontend-transportada build` → sucesso (PWA gerado, 128 entradas de precache).
- Prettier `--check` nos arquivos tocados por esta task → limpo, sem `--write`.

### Desvios do D20/tasks.md

1. **"Drawer com `shadcn/ui` (`Sheet`)" não existe neste repositório** — não há `shadcn/ui`
   instalado; o design system daqui é caseiro (`src/components/ui/`, ver `apps/frontend-transportada/
CLAUDE.md`). Implementado com o mesmo idioma dos diálogos existentes (`useModalDialog` +
   `createPortal`, ex. `NfseInvoiceDetailDialog.component.tsx`), com CSS próprio que ancora o painel
   à direita da tela para ler como drawer, em vez de modal centralizado.
2. Sem ícone específico de "histórico" no catálogo (`icon.tsx`); usado `clock`, o mais próximo
   semanticamente (linha do tempo).

## T4 — CT-e não emite sobre nota cancelada depois da seleção · 2026-09-15

Escopo do plano: a seleção do lote de CT-e (API) confere elegibilidade uma vez, mas o item pode
esperar na fila até a SEFAZ ser chamada — nesse intervalo a nota pode ter sido cancelada ou
denegada por um evento fiscal (T2/T3). O worker relê `nfe_documents.status` **imediatamente antes**
de montar a chamada à SEFAZ, e falha o item sem emitir se a nota não estiver mais `authorized`.
Nada fiscal é cancelado automaticamente: a falha só impede a emissão, ela não toca o CT-e nem a
nota.

### O que foi criado

- `apps/worker-transportada/src/cte-issuance/domain/cte-batch-block-reason.constant.ts`: cópia por
  valor de `CTE_BATCH_BLOCK_REASON.notAuthorized`
  (`apps/api-transportada/src/cte-batches/domain/cte-batch-eligibility.policy.ts`), só o código que
  esta task usa (`CTE_BATCH_DOCUMENT_NOT_AUTHORIZED`) — app não importa código de outra.
- `apps/worker-transportada/src/cte-issuance/infrastructure/drizzle-cte-batch-document-authorization.repository.ts`
  (`DrizzleCteBatchDocumentAuthorizationRepository.isAuthorized`): `inner join` de `cte_batch_items`
  (cópia já existente no worker, `nfeDocumentId` é 1:1 por item) com `nfe_documents`, os dois lados
  filtrados por `company_id`. Item ou nota inexistentes (linha não encontrada) contam como **não**
  autorizado — falha fechada, nunca aberta.
- `apps/worker-transportada/src/cte-issuance/application/cte-issuance-consumer.effect.ts`: novo tipo
  `CteBatchDocumentAuthorizationCheck` e parâmetro opcional `documentAuthorizationCheck` em
  `createCteIssuanceWorkerEffect`. Dentro de `issueDocument`, logo depois do `recordInFlight` e
  **antes** de montar `command`/chamar `recordDiagnostics`/`gateway.issue`: se a checagem devolver
  `false`, grava `writeBack.recordRejected({ errorCode: CTE_BATCH_DOCUMENT_NOT_AUTHORIZED })` e
  lança `CteIssuanceFatalError` (não-retentável, mesmo padrão já usado para `outcome.status ===
'rejected'`). Sem checagem configurada (`undefined`), o comportamento não muda — só a cancelação
  (`executeCancellation`) não é tocada, porque o plano (H8) só cobre a emissão.
- `apps/worker-transportada/src/main.ts`: injeta
  `new DrizzleCteBatchDocumentAuthorizationRepository(database.db)` como
  `documentAuthorizationCheck` na composição real do efeito.
- `apps/worker-transportada/test/cte-issuance-document-authorization.contract.test.ts` (2 casos):
  nota não autorizada falha com `CTE_BATCH_DOCUMENT_NOT_AUTHORIZED`, grava `recordRejected` e
  **nunca** chama `emit` do provedor fake; nota ainda `authorized` segue até `emit` e
  `recordAuthorized` normalmente. Entrou na lista explícita `test` do `package.json` do worker,
  logo depois de `cte-cancellation.contract.test.ts`.

### Vermelho antes

```
error: Cannot find module '../src/cte-issuance/domain/cte-batch-block-reason.constant.js' from
'.../test/cte-issuance-document-authorization.contract.test.ts'
 0 pass
 1 fail
 1 error
Ran 1 test across 1 file.
```

Depois de criar a constante e a checagem (sem fiar `documentAuthorizationCheck` no efeito ainda), o
segundo caso (nota ainda `authorized`) falhava porque a checagem nunca era chamada; depois de
fiar a chamada no `issueDocument`, os dois casos passaram.

### Gates

- `bun run typecheck` (raiz) → exit 0.
- `bun run lint` (raiz) → exit 0.
- `bun run --cwd apps/worker-transportada test` → **1304 pass, 0 fail**, 89 arquivos (1302 da H2' +
  2 desta task). Linhas `(fail)`: 0.
- `make worker-integration ENV_FILE=.env.test` → **99 pass, 4 skip, 2 fail**, rodado duas vezes
  (a segunda para descartar concorrência com a outra sessão no mesmo `.env.test`, spec H3/API). As
  duas falhas, nas duas rodadas, são as mesmas conhecidas do anexo do agregado (CCMEI e CRLV,
  `ObjectStorageError: Object storage is unavailable`), já registradas na T3 e na H2' com o mesmo
  `.env.test` — arquivo não tocado por esta task, mesmo erro, mesma contagem.
- Prettier `--check` nos 6 arquivos alterados/criados → limpo (após `--write` em dois arquivos
  novos, formatados fora do padrão do editor).

### Desvios do plano

Nenhum. O plano cita "reaproveitar a constante" da API — como o worker não importa código da API,
a cópia trouxe só o valor usado (`notAuthorized`), sem redeclarar o `CTE_BATCH_BLOCK_REASON`
inteiro, que hoje não tem outro consumidor no worker.

## T5 — API: listagem, lote/CT-e e viagem expõem o status da nota · 2026-09-15

**Só a parte de API desta task foi executada.** A instrução de execução pediu para parar antes da
parte de tela (aviso "NF-e cancelada após a emissão", textos em `*.locale.json`, contrato de tela),
porque outra sessão mexe em `apps/frontend-transportada` no worktree paralelo `../ordem-notas`
(H4). O que falta para o frontend está descrito no fim desta seção.

### O que já existia (nenhum código novo precisou)

- `GET /nfe-documents` já ordena por `updated_at desc, issued_at desc, id desc`
  (`nfe_documents_company_updated_issued_id_idx`) e já expõe `status` em `NfeDocumentSummary`
  (`describeDocument`, `drizzle-nfe-document.repository.ts:857`/`933`). A T3 (spec 149) já faz o
  `UPDATE` de `status` e `updated_at` juntos, na mesma transação, quando um evento fiscal muda a
  situação da nota (`applyStatusChange`, `updated_at = clock_timestamp()`). H1 (nota cancelada sobe
  ao topo) já era, portanto, consequência das duas peças já existentes — faltava só a prova de
  contrato ligando as duas, que é o que esta task acrescenta.
- `drizzle-trip.repository.ts:694` já seleciona `nfeDocumentStatus: nfeDocuments.status`, e
  `trip.mapper.ts:mapTripDocumentDetail` já expõe isso como `fiscalStatus` em
  `TripDocumentDetail` — incluindo `'cancelled'`. Já coberto por
  `test/integration/trip-repository.integration.ts` (nota `cancelled` vinculada a uma viagem,
  `expect(...).toMatchObject({ fiscalStatus: 'cancelled' })`, com o comentário "nota cancelada não
  bloqueia nem se desvincula sozinha — o status só aparece na leitura"). Nada foi alterado aqui: a
  resposta da viagem já satisfaz o pedido de H8 para "viagem com nota cancelada", e o isolamento de
  tenant do `findById` (cross-company retorna `null`) já é coberto no mesmo arquivo.

### O que faltava e foi criado

`cte-batch-selection.query.ts:215` (usado na **prévia** de seleção do lote) já selecionava
`status`, mas a resposta do **lote já emitido** (`GET` de itens de um lote/CT-e,
`CteBatchItemDocument` em `src/cte-batches/application/cte-batch-item.port.ts`) não — a nota vinha
sem status na tela de acompanhamento de um CT-e já autorizado, exatamente o caso do H8 ("CT-e já
autorizado sobre a nota" → aviso). Adicionado:

- `src/cte-batches/application/cte-batch-item.port.ts`: `CteBatchItemDocument.nfeStatus:
NfeDocumentStatus` (campo novo, obrigatório).
- `src/cte-batches/infrastructure/drizzle-cte-batch-item.repository.ts`: `loadDocuments` passa a
  selecionar `status: nfeDocuments.status` (mesma junção que já existia com `nfe_documents`, nenhuma
  consulta a mais) e a mapear `nfeStatus: row.nfeStatus` em cada `CteBatchItemDocument`.
- A rota (`cte-batch.routes.ts:396`, `serializeItem`) repassa `documents: item['documents']` sem
  reformatar — o campo novo chega à resposta HTTP sem tocar a rota.

### Vermelho antes

Antes de adicionar o campo à fixture de teste do cenário `cte-item-graph.fixture.ts`, rodar o teste
de `derived-status.integration.ts` com a asserção nova falhava por `requiredId` não achar o cenário:

```
error: MISSING_SCENARIO_autorizada_com_nota_cancelada
```

Depois de acrescentar o cenário (`autorizada_com_nota_cancelada`, CT-e autorizado com a nota
`cancelled`) e o `select`/mapeamento em `loadDocuments`, os testes ficaram verdes. O typecheck
sozinho já apontava a lacuna nos três lugares onde `CteBatchItemDocument`/`CteBatchItem` são
literais tipados (antes de eu adicionar `nfeStatus` nas fixtures):

```
error TS2741: Property 'nfeStatus' is missing in type '...' but required in type 'CteBatchItemDocument'.
```

em `test/cte-batch-application/list-items.contract.ts` (`GROUPED_ITEM`, `PENDING_ITEM`) e
`test/fixtures/cte-batch-http.fixture.ts` (`ITEMS_RESULT`) — os três foram atualizados.

### Testes acrescentados

1. `test/integration/nfe-document-listing-order.integration.ts` — novo teste "quando um evento
   fiscal cancela a nota, ela sobe ao topo mesmo com a emissão mais antiga (spec 149 H1)": cancela,
   via `UPDATE` direto (mesmas duas colunas que `applyStatusChange` grava juntas), a nota que hoje
   fica em 3º lugar, com `updated_at` mais novo que todas as outras; confere que ela vem primeiro,
   com `status: 'cancelled'`, e que a ordem das demais não mudou. Contrato negativo de tenant: a
   mesma consulta rodada com o `companyId` da empresa secundária não devolve a nota cancelada
   (`seedTenants` passou a devolver também `otherCompanyId`).
2. `test/integration/cte-item-list-repository/derived-status.integration.ts` — três asserções
   novas dentro do teste existente: o item `autorizada` (CT-e autorizado, nota ainda `authorized`)
   expõe `documents[].nfeStatus === 'authorized'`; o novo cenário `autorizada_com_nota_cancelada`
   expõe `status: 'authorized'` no item e `documents[].nfeStatus === 'cancelled'` no documento
   (H8); e o item equivalente da empresa secundária tem o próprio sinal (`cancelled`) sem depender
   do id da primária — isolamento de tenant.
3. `test/cte-batch-application/list-items.contract.ts` — novo teste "exposes each linked note
   status, so a cancelled note is visible on an authorized CT-e (spec 149 H8)": o item `GROUPED_ITEM`
   ganhou uma segunda nota `cancelled` (a primeira continua `authorized`), e o teste confere que o
   item continua `authorized` (D11) enquanto os dois documentos mostram o próprio status.
4. `test/integration/cte-item-list-repository/cte-item-graph.fixture.ts`: `ItemScenario` ganhou o
   campo opcional `nfeStatus` (default `'authorized'` em `insertInvoice`, comportamento antigo
   preservado) e o cenário novo `autorizada_com_nota_cancelada`. Puramente aditivo: os outros três
   arquivos que reaproveitam esta fixture (`summary.integration.ts`, `billing-status.integration.ts`,
   `cte-export-selection.integration.ts`) já filtram/contam por `ITEM_SCENARIOS` dinamicamente ou
   pelo status **do CT-e** (não da nota), então continuaram verdes sem alteração.

### Gates

- `bun run typecheck` (raiz, as 6 apps) → exit 0.
- `bun run lint` (raiz, as 6 apps) → exit 0.
- `bun run --cwd apps/api-transportada test` → **5800 pass, 23 skip, 0 fail**, 172 arquivos (5799 da
  H3 + 1 teste novo do H8 em `list-items.contract.ts`). Linhas `(fail)`: 0.
- `bun --env-file=../../.env.test test ./test/integration/nfe-document-listing-order.integration.ts
./test/integration/cte-item-list-repository/{derived-status,summary,billing-status}.integration.ts
./test/integration/cte-export-selection.integration.ts --timeout 120000` → **9 pass, 0 fail**, 5
  arquivos — os quatro consumidores da fixture reaproveitada mais o teste de ordenação do H1.
- `bun --env-file=../../.env.test run test:integration --timeout 120000` (lista completa, 61
  arquivos) → **302 pass, 4 skip, 2 fail**, 2203 `expect()`. As duas falhas são
  `cte-archive-gateway.integration.ts` (`ObjectStorageError: Object storage is unavailable`, MinIO
  do `.env.test`) — arquivo não tocado por esta task, mesmo defeito de ambiente já registrado na
  T3/H2'/H3 com o mesmo `.env.test`. Rodou sem repetição — nenhuma falha teve cara de corrida com a
  sessão paralela `../ordem-notas` (H4, frontend) sobre o mesmo Postgres.
- Prettier `--check` nos 7 arquivos alterados → limpo (depois de `--write` em
  `derived-status.integration.ts`, formatado fora do padrão do editor).

### O que faltava para o frontend — concluído em 2026-09-15 (worktree `ordem-notas`)

- **Aviso "NF-e cancelada após a emissão" no lote de CT-e.** `CteBatchItemDocument.nfeStatus`
  (`nfe-documents/T5`) chegou ao frontend: `cteBatchItem.types.ts` ganhou o campo (tipo
  `CteBatchItemDocumentNfeStatus`, cópia por valor de `nfe_documents.status`) e
  `cteBatchItem.validation.ts` passou a exigi-lo e validar contra os quatro valores. `describeItemDocuments`
  (`cteBatchItemActions.service.ts`) repassa o campo, e a nova `hasCteBatchDocumentNfeWarning`
  decide o aviso (`cancelled`/`denied`, nunca `authorized`/`unsigned`). `CteBatchItemsPanel.component.tsx`
  mostra o aviso ao lado da etiqueta da nota, dentro do próprio item do lote — texto **e** ícone
  (`Icon name="alert"`), nunca só a cor (D20). Textos em `cteBatch.locale.json`/`cteBatch.en.locale.json`
  (`items.documentNfeWarning.cancelled|denied`). Contrato vermelho antes: teste novo em
  `test/cte-batch/table-and-items.contract.ts` referenciava `hasCteBatchDocumentNfeWarning` e o
  fixture `CTE_BATCH_AUTHORIZED_ITEM_WITH_CANCELLED_DOCUMENT`, inexistentes — falhava por módulo/campo
  ausente antes do código.
- **Aviso equivalente na nota da viagem: já existia.** `TripDocumentDetail.fiscalStatus` já é lido
  por `hasTripDocumentFiscalWarning`/`TRIP_FISCAL_WARNING_STATUSES` (spec 027,
  `tripDocument.service.ts`) e renderizado em `TripStopList.component.tsx` com texto próprio
  (`detail.fiscalWarning`, "Documento fiscal inválido — confira a situação antes de seguir") — o
  mesmo aviso genérico já cobre `cancelled`/`denied`/`rejected`. Nada foi alterado aqui; a T5 (API)
  só confirmou que `fiscalStatus` chega correto com a nota cancelada pela política de status (spec
  149), o que já estava coberto por `test/integration/trip-repository.integration.ts`.

### Gates (conclusão da T5, frontend)

- `bun run typecheck` (raiz, as 6 apps) → exit 0.
- `bun run lint` (raiz, as 6 apps) → exit 0.
- `bun run --cwd apps/frontend-transportada test` → **3641 pass, 0 fail**, 29 arquivos, 34550
  `expect()`. Linhas `(fail)`: 0.
- `bun run --cwd apps/frontend-transportada build` → sucesso (PWA gerado, 128 entradas de precache).
- Prettier `--check` nos arquivos tocados → limpo, sem `--write`.
- Marcado no `tasks.md`: T5 concluída (API + tela).
