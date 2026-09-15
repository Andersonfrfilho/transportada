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
