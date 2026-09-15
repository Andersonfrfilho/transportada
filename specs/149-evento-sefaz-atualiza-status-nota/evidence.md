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
