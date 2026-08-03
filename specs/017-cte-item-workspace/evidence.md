# Evidências — Feature 017

Nenhum CNPJ, IE, chave de acesso, razão social real, número de nota real ou XML fiscal aparece aqui.
Onde a stack local devolveu dado de tenant, ele está resumido em contagem ou substituído por
`<mascarado>`.

## T001 — Contrato HTTP da listagem (vermelho antes, verde depois)

Arquivo novo `apps/api-transportada/test/cte-batch-http/item-list.contract.ts`, importado por
`apps/api-transportada/test/cte-batch-http.contract.test.ts` (entrypoint já listado no `test` do
`package.json`).

```
$ bun test ./test/cte-batch-http.contract.test.ts
 51 pass
 0 fail
```

Cobre: allowlist de chaves, chave repetida, `limit` padrão 25 / máximo 100, cursor corrompido,
`batchId` não-UUID, faixa invertida em `issued*`/`cteNumber*`/`invoiceNumber*`, `statusIn`
vazio/desconhecido/repetido, a política `CTE_SUBMIT_POLICY` (`{ permission: 'cte.submit', scope:
'company' }`) e o envelope `{ data, page: { nextCursor } }` com `batchId`, `batchName` e `createdAt`
na linha.

## T002 — Isolamento de tenant e forma da query (vermelho antes, verde depois)

Arquivo novo `apps/api-transportada/test/cte-batch-infrastructure/item-list.contract.ts`, importado
por `apps/api-transportada/test/cte-batch-infrastructure.contract.test.ts`. `buildCompanyItemFilters`
é exportada e compilada por `new PgDialect().sqlToQuery(and(...filters))`, então as asserções são
sobre o SQL e os parâmetros reais.

```
$ bun test ./test/cte-batch-infrastructure.contract.test.ts
 19 pass
 0 fail
```

Prova: `company_id = $` no item, no documento fiscal, na tentativa, na subquery de notas e no lote;
keyset `(created_at desc, id desc)` sobre o cursor `"<iso>::<uuid>"`; faixa de número de CT-e sobre o
`coalesce(cte_fiscal_documents.fiscal_number, <última tentativa>)`; faixa de número de nota por
`in (select ...)` — nunca join que multiplique linha; `statusIn` sobre o status derivado.

Ajuste de expectativa durante a task: o encoder de `timestamp` do Drizzle converte `Date` em string
ISO dentro de `sqlToQuery`, então os parâmetros de data são asseverados como string ISO (o instante
continua fixado exatamente). Nenhuma mudança de produção foi necessária por causa disso.

## T003 — Leitura `listCompanyItems`

`bun run typecheck` limpo e a suíte inteira da app verde depois da reescrita do repositório:

```
$ bun run typecheck
(sem saída — 0 erro)

$ bun run test
 1143 pass
 1 skip
 0 fail
 (61 arquivos)
```

A precedência de status na projeção **chama** `resolveBatchItemStatus`/`resolveIssuedDocumentStatus`;
o SQL apenas projeta as fontes. `loadCharges`/`loadDocuments` passaram a receber lista de ids sem
mudar o comportamento da leitura por lote — provado pelas 1143 asserções verdes, que incluem a suíte
antiga de leitura de um lote.

## T004 — Caso de uso, parse, rota e composition root

Suíte de `cte-batch-http` verde (acima) e verificação **ao vivo** na stack local, autenticada pelo
code flow PKCE do realm local (`local-user`), com o corpo reduzido a contagens — nenhum valor fiscal
transcrito:

```
GET /cte-batch-items?limit=2                                        → 200 rows=2 keys=18 statuses=["pending","authorized"] nextCursor=present
GET /cte-batch-items?limit=2&statusIn=pending                       → 200 rows=1 keys=18 statuses=["pending"]              nextCursor=null
GET /cte-batch-items?limit=2&statusIn=authorized                    → 200 rows=2 keys=18 statuses=["authorized"]           nextCursor=present
GET /cte-batch-items?invoiceNumberGte=<mascarado>&invoiceNumberLte=<mascarado>
                                                                    → 200 rows=2 keys=18 statuses=["pending","authorized"] nextCursor=null
GET /cte-batch-items?limit=200                                      → 400 code=INVALID_REQUEST
GET /cte-batch-items?banana=1                                       → 400 code=INVALID_REQUEST
GET /cte-batch-items?cteNumberGte=10&cteNumberLte=5                 → 400 code=INVALID_REQUEST
GET /cte-batch-items?issuedFrom=2026-07-31T…&issuedUntil=2026-07-01T… → 400 code=INVALID_REQUEST
GET /cte-batch-items?statusIn=pending,pending                       → 400 code=INVALID_REQUEST
GET /cte-batch-items?statusIn=nope                                  → 400 code=INVALID_REQUEST
GET /cte-batch-items?cursor=quebrado                                → 400 code=INVALID_REQUEST
GET /cte-batch-items?batchId=nao-uuid                               → 400 code=INVALID_REQUEST
```

O que isso prova, além do parse: o envelope tem 18 campos por linha (os do item mais `batchId`,
`batchName` e `createdAt`); o `statusIn` separa de fato `pending` de `authorized` no banco real; a
faixa de número de nota com duas notas distintas devolve **duas** linhas, não quatro — a subquery não
multiplica linha; e `nextCursor` só vem quando existe página seguinte.

Achado do caminho: a rota é servida em `/cte-batch-items`, sem prefixo de versão — `matchRoute`
compara o `pathname` cru e nenhuma constante de `api.constant.ts` carrega `/v1`. O rascunho de
`spec.md`/`plan.md` dizia `/v1/...`; os documentos foram corrigidos.

## T005 — Índice keyset aditivo

Contrato de schema primeiro (vermelho antes de existir o índice), depois a coluna de índice em
`src/database/cte-batch.schema.ts` e a migration gerada.

```
$ bun test ./test/cte-batch-schema.contract.test.ts
 12 pass
 0 fail

$ bun run --cwd apps/api-transportada db:check
Everything's fine 🐶🔥

$ make migration-test
 Container transportada-local-postgres-1  Healthy
$ bun test ./test/database-migration.contract.test.ts ./test/integration/local-identity-seed.integration.ts
 9 pass
 0 fail
 182 expect() calls
```

`drizzle/20260730121112_cte_batch_item_company_keyset_index/migration.sql` cria
`cte_batch_items_company_created_at_id_idx` em `(company_id, created_at DESC, id DESC)`, sem tocar em
dado. O `rollback.sql` ao lado segue o formato do repo: cabeçalho de licença, aviso de rollback
manual, `BEGIN/COMMIT`, `DROP INDEX IF EXISTS` e remoção da linha do journal exigindo exatamente uma
linha via `GET DIAGNOSTICS` (hash `ba96dfe6…`). O `make migration-test` aplica migration e rollback em
Postgres descartável — os 9 testes verdes incluem a asserção da lista de diretórios de migration, que
passou a conter o diretório novo.

## T006 — Status derivado em Postgres real (achou bug e consertou)

Arquivos novos: `apps/api-transportada/test/integration/cte-item-list-repository.integration.ts`
(entrypoint fino), `.../cte-item-list-repository/cte-item-graph.fixture.ts` e
`.../cte-item-list-repository/derived-status.integration.ts`. O entrypoint foi registrado na lista
**explícita** de `test:integration` no `package.json` da app.

O grafo semeado tem **duas empresas** com 13 cenários cada, um item por situação: sem tentativa,
`pending`, `in_flight`, `rejected` (tentativa 1 em voo + tentativa 2 recusada), `failed`,
`retry_scheduled`, `reconciliation_required`, tentativa autorizada **com** documento autorizado,
tentativa autorizada **sem** documento, documento autorizado com tentativa recusada depois
(ADR-0018), documento autorizado com `cancellation_requested_at`, documento `cancelled` (com
protocolo, justificativa ≥ 15 e `cancelled_at`) e tentativa `cancelled` sem documento. Todos os
números são sintéticos (nota `900000+i` e `900900`, chave de acesso `<sufixo>` + zeros): **nenhum dado
fiscal real entra na fixture**.

Vermelho primeiro — e o vermelho era bug de produção, não do teste:

```
$ DRIZZLE_TEST_DATABASE_URL="$DATABASE_URL" bun test ./test/integration/cte-item-list-repository.integration.ts
 error: expect(received).toEqual(expected)
 @@ -4,3 +4,3 @@
       "aa258def-…",
 -     "b96aa52c-…",
 0 pass
 1 fail
 20 expect() calls
```

As 14 primeiras asserções (o status esperado de cada cenário) passaram — a leitura sem filtro
classifica certo. Quem errava era o `statusIn`: `statusCondition` tratava `authorized` e `cancelled`
**só** pelo documento fiscal, então o item cuja tentativa já está autorizada mas cujo documento ainda
não foi gravado — a janela real entre a resposta da SEFAZ e a escrita do documento — aparecia como
`authorized` na lista e desaparecia ao filtrar por `authorized`. É exatamente o erro que um contrato
SQL-contra-SQL não pega, porque os dois lados erram juntos.

Correção em `src/cte-batches/infrastructure/drizzle-cte-batch-item.repository.ts`: `statusCondition`
passou a ser "documento manda; **sem** documento, vale a última tentativa" para todo status, com o
ramo de tentativa extraído em `attemptStatusCondition`. O contrato de infraestrutura foi atualizado
para a forma correta (o parâmetro de status aparece duas vezes e `cte_fiscal_documents.status is null`
entra no ramo de fallback).

Verde depois:

```
$ DRIZZLE_TEST_DATABASE_URL="$DATABASE_URL" bun test ./test/integration/cte-item-list-repository.integration.ts
 1 pass
 0 fail
 58 expect() calls

$ bun test ./test/cte-batch-infrastructure.contract.test.ts
 19 pass
 0 fail

$ bun run lint
(sem saída — 0 erro)

$ bunx tsc --noEmit
(sem saída — 0 erro)

$ bun run test
 1144 pass
 1 skip
 0 fail
 (61 arquivos)
```

O que o teste prova, além do bug: para **cada** um dos 8 status de `CTE_ISSUANCE_STATUSES`, o
`statusIn` devolve exatamente os ids que a leitura sem filtro classifica naquele status (e nenhuma
linha com outro status); `statusIn` com a lista inteira devolve os 13 itens; a segunda empresa tem o
mesmo grafo e **nenhum** id vaza entre elas, com e sem `statusIn`; a faixa de número de nota do item
de duas notas devolve **uma** linha (com dois documentos dentro dela), não duas; a faixa larga devolve
os 13 itens sem duplicar; a faixa de número de CT-e isola o item pelo `coalesce`
documento→tentativa; e o keyset em páginas de 3 não sobrepõe nem reordena em relação à leitura
completa.

## T007 — Contrato de soma decimal (vermelho)

Arquivos novos: `apps/frontend-transportada/test/shared/decimal-amount.contract.ts` e o entrypoint
`apps/frontend-transportada/test/shared.contract.test.ts`, registrado no `test` do `package.json` da
app (a área `shared` ainda não tinha entrypoint de teste).

```
$ bun test test/shared.contract.test.ts
error: Cannot find module '@/modules/shared/decimalAmount.service' from
'…/test/shared/decimal-amount.contract.ts'
 0 pass
 1 fail
 1 error
```

Vermelho pelo motivo certo: o serviço ainda não existe. O contrato fixa: lista vazia → `'0.00'`;
`['0.1','0.2']` → `'0.30'` (onde float daria `0.30000000000000004`); escala do resultado é a mais larga
da seleção (`['1.05','2.0001']` → `'3.0501'`); sinal negativo preservado; exatidão acima de
`Number.MAX_SAFE_INTEGER` (`['9007199254740992.00','0.01']` → `'9007199254740992.01'`); rejeição de
`''`, `' '`, `'abc'`, `'1,5'`, `'1.2.3'`, `'1e3'`, `'+1.00'`, `'.5'`, `'1.'` e de casa além de
`AMOUNT_MAX_SCALE = 4`; `formatAmount` em moeda pt-BR direto da string (`'90071992547410.01'` →
`'90.071.992.547.410,01'`, sem deriva) e erro em vez de `NaN`; e varredura do próprio fonte proibindo
`Number(`, `Number.`, `parseFloat(`, `parseInt(` e `.toFixed(` — `Intl.NumberFormat` continua
permitido — exigindo `BigInt`.

## T008 — Soma decimal em `BigInt` (verde)

`apps/frontend-transportada/src/modules/shared/decimalAmount.service.ts` (novo): `parseScaledAmount`
converte a string em `{ units: bigint, scale }` sem passar por binário, `rescale` alinha as escalas por
`10n ** BigInt(...)`, `toDecimalString` reconstrói a string com o sinal, e `formatAmount` entrega a
**string** ao `Intl.NumberFormat` (a API aceita string decimal desde o Intl NumberFormat V3 — é o que
evita a conversão para `double` na exibição).

```
$ bun test test/shared.contract.test.ts
 12 pass
 0 fail
 38 expect() calls

$ bun run typecheck
(sem saída — 0 erro)

$ bun run lint
(sem saída — 0 erro)

$ bunx prettier --check src/modules/shared/decimalAmount.service.ts test/shared/decimal-amount.contract.ts
(verde depois do --write)

$ bun run test
 270 pass
 0 fail
 (14 arquivos)
```

Único ponto de atrito: a tipagem do TS para `Intl.NumberFormat.format` é mais estreita que a spec
(`StringNumericLiteral`), então há um `toNumericLiteral` de uma linha convertendo `string` em
`` `${number}` `` — com o motivo no comentário. Nenhum `Number(`/`parseFloat(`/`toFixed(` no módulo, o
que o próprio contrato verifica varrendo o fonte.

## T009 — Contrato da tabela de CT-es (vermelho)

`apps/frontend-transportada/test/cte-batch/item-table.contract.ts` (novo) + `import` em
`apps/frontend-transportada/test/cte-batch.contract.test.ts` (entrypoint já registrado no `test` do
`package.json` da app). Fixtures sintéticas locais ao arquivo — nenhum CNPJ, IE, chave real ou XML.

O que o contrato fixa, além do padrão de `docs/frontend/data-tables.md`:

- `CTE_ITEM_COLUMN_KEYS` com as 11 colunas da tela (número do CT-e, status, lote, notas, emissão,
  base, frete, valor fiscal, criação, último erro, chave) e `CTE_ITEM_COLUMNS_STORAGE_KEY`
  (`cte-batch.items.columns.v1`) distinto do da tabela de lotes;
- `CTE_ITEM_DEFAULT_HIDDEN_STATUSES = ['authorized','cancelled','in_flight']` ausente de
  `EMPTY_CTE_ITEM_FILTERS.statuses` — CT-e já enviado à SEFAZ só aparece quando o chip revela — e
  `countActiveCteItemFilters` tratando o padrão como “sem filtro”;
- serialização da query só com o que está preenchido, faixa de data virando ISO
  (`2026-07-01T00:00:00.000Z` / `2026-07-31T23:59:59.999Z`, que é o que `z.iso.datetime()` da API
  aceita) e **nenhuma** chave fora da allowlist de `parseCteBatchItemList` (`statusIn` omitido quando
  todos os status estão marcados);
- ordenação por cabeçalho comparando **valor**: frete `9.0000` antes de `43.1316` (comparação
  lexicográfica de string inverteria);
- soma entre páginas pelo mapa acumulado: `accumulateCteItemAmounts` + `summarizeCteItemSelection`
  devolvendo `{ count, baseAmount, totalAmount }` — duas páginas somam `2016.9600` de base e
  `90.7632` de frete, e id que saiu do filtro não infla contagem nem soma;
- paginação por cursor com volta (`CTE_ITEM_FIRST_PAGE`, `nextCteItemPage`, `previousCteItemPage`,
  `canGoToPreviousCteItemPage`), incluindo “última página não avança”;
- preferências de coluna em `localStorage` com sanitização de chave desconhecida e degradação em
  storage quebrado;
- client HTTP autenticado `no-store` em `/cte-batch-items`, sem `idempotency-key` e sem `companyId`
  na query;
- envelope `{ data, page: { nextCursor } }` estrito em `createCompanyCteItemPageAdapter` — recusa
  `companyId`, `xml`, `totalAmount` numérico, `batchName` não-string, `createdAt` nulo, `batchId`
  ausente e `nextCursor` não-string;
- varredura de fonte: componentes `CteItem*` usando `useTranslation`, sem `<select` nativo e sem
  `style={{`, `CteItemFilters` importando `@/components/ui/select`, tabela com `aria-sort` e
  `aria-expanded` (menu de colunas em botão), e as duas locales com o bloco `cteItems`.

```
$ bun test test/cte-batch.contract.test.ts
error: Cannot find module '../../src/modules/cte-batch/shared/cteBatchItemTable.service'
(fail) CT-e item table contract > exposes the columns the workspace needs and keeps the storage key versioned
(fail) CT-e item table contract > hides the CT-es already sent to SEFAZ until a chip reveals them
(fail) CT-e item table contract > serializes only the filled ranges and never a key the API rejects
(fail) CT-e item table contract > sorts by header through the value, not through the string
(fail) CT-e item table contract > counts the selection and sums it across pages from the accumulated map
(fail) CT-e item table contract > walks the cursor forward and back without losing the first page
(fail) CT-e item table contract > persists item column order and visibility apart from the batch table
(fail) CT-e item table contract > reads the tenant item list from the authenticated no-store endpoint
TypeError: createCompanyCteItemPageAdapter is not a function
(fail) CT-e item table contract > keeps the paged item envelope strict against tenant and fiscal leakage
ENOENT: .../components/CteItemPagination.component.tsx
(fail) CT-e item table contract > wires the panel with locale strings, the design system select and collapsed controls

 18 pass
 10 fail
 181 expect() calls
```

$ bunx eslint test/cte-batch/item-table.contract.ts → sem saída (0 erro)

Vermelho pelo motivo certo: as 10 asserções novas falham por ausência dos módulos/arquivos que T010,
T011 e T012 vão criar; as 18 do contrato de lote seguem verdes.

## T010 — Serviço puro e client HTTP da tabela de CT-es

Arquivos:

- `apps/frontend-transportada/src/modules/cte-batch/shared/cteBatchItemTable.service.ts` (novo) —
  `CTE_ITEM_COLUMN_KEYS`, `CTE_ITEM_COLUMNS_STORAGE_KEY = 'cte-batch.items.columns.v1'`,
  `CTE_ITEM_STATUS_VALUES`, `CTE_ITEM_DEFAULT_HIDDEN_STATUSES`, `EMPTY_CTE_ITEM_FILTERS`,
  `toggleCteItemStatus`, `countActiveCteItemFilters`, `serializeCteItemQuery`,
  `nextCteItemSortState`, `sortCteItems` e os invólucros de preferência de coluna;
- `.../shared/cteBatchItemSelection.service.ts` (novo) — `accumulateCteItemAmounts`,
  `summarizeCteItemSelection`, `CTE_ITEM_FIRST_PAGE`, `nextCteItemPage`, `previousCteItemPage`,
  `canGoToPreviousCteItemPage`, reexportados pelo serviço da tabela para manter os dois arquivos
  dentro do limite de tamanho do padrão;
- `.../shared/cteBatchItemClient.service.ts` (novo) — `createCteBatchItemClient` com
  `listCompanyItems` em `GET /cte-batch-items?…`, `cache: 'no-store'`, `Bearer`, sem
  `idempotency-key` e sem `companyId` na query;
- `.../shared/cteBatchItem.validation.ts` — a task previa arquivo novo, mas ele já existia (a
  validação dos itens de um lote); o adaptador novo `createCompanyCteItemPageAdapter` entrou nele
  reaproveitando `itemFromApi`, mais `batchId`/`batchName`/`createdAt` e o envelope
  `page.nextCursor`;
- `src/modules/shared/tableColumnPreferences.service.ts` (novo) — porta genérica de preferência de
  coluna, para a tabela de CT-es não duplicar `cteBatchTable.service.ts`;
- `src/modules/shared/decimalAmount.service.ts` — `compareScaledAmounts` (ordenação por valor em
  `BigInt`; comparação de string colocaria `'9.0000'` depois de `'43.1316'`).

Decisões que a serialização fixa: dia virado em instante completo (`T00:00:00.000Z` /
`T23:59:59.999Z`, porque a API valida `z.iso.datetime()`); `statusIn` omitido quando a seleção é
total ou vazia (não restringe nada) e sempre na ordem canônica de `CTE_ITEM_STATUS_VALUES` (chave de
cache estável); nenhuma chave fora da allowlist de `parseCteBatchItemList`.

```
$ bun test test/cte-batch.contract.test.ts
(fail) CT-e item table contract > wires the panel with locale strings, the design system select and collapsed controls

 27 pass
 1 fail
 267 expect() calls
```

```
$ bun run typecheck   → tsc --noEmit, sem saída
$ bun run lint        → eslint ., sem saída
$ bunx prettier --write <arquivos novos> → unchanged
```

O único vermelho restante é a varredura de fonte dos componentes `CteItem*`, que T011 e T012 criam.

## T011 — Hook e query da tabela de CT-es

Arquivos:

- `apps/frontend-transportada/src/modules/cte-batch/queries/cteBatchItems.query.ts` (novo) —
  `getCteBatchItemClient()` (apiUrl do `identityEnvironment`, token do `KeycloakAuthProvider`) e
  `useCompanyCteItemsQuery`, com `queryKey` = `['company-cte-items', companyId,
serializeCteItemQuery(request)]`: a chave carrega o recorte inteiro (filtros + cursor + limite), então
  trocar filtro nunca reaproveita cache de outro recorte;
- `.../hooks/useCteItemTable.hook.ts` (novo) — filtros, ordenação, paginação por cursor com pilha de
  volta (`CTE_ITEM_FIRST_PAGE`, `nextCteItemPage`, `previousCteItemPage`), `selectedIds` que
  atravessam páginas, mapa acumulado `id → {baseAmount, totalAmount}` e preferências de coluna pelo
  mecanismo da feature 015.

Decisões:

- o mapa acumulado vive num `useRef` recalculado no próprio render por `accumulateCteItemAmounts`
  (operação idempotente para os mesmos itens). Não usa `useEffect`: a regra do repo proíbe efeito para
  transformar dado, e acumulação entre fetches não se deriva de props;
- qualquer mudança de filtro ou de status chama `restartPagination()` — cursor de um recorte aplicado a
  outro devolveria a página errada;
- `toggleAllSelection` opera **na página visível** somando à seleção existente, para o "selecionar
  todos" não apagar o que já foi selecionado em páginas anteriores (é justamente o que a soma total
  precisa preservar);
- **desvio de escopo declarado:** T011 previa "filtros simples/avançado". O painel avançado com grupos
  E/OU aninhados **não** foi implementado: a filtragem desta tabela acontece no servidor, página por
  página, e um construtor E/OU avaliado no cliente filtraria só a página em tela — a contagem e a soma
  mentiriam. Ficou um único painel com os campos de faixa (data, número de CT-e min/max, número de nota
  min/max, lote) e os chips de status, que é o que a tela pede. Se o construtor E/OU for desejado,
  precisa de suporte de query na API primeiro.

```
$ bun run typecheck   → tsc --noEmit, sem saída
$ bun run lint        → eslint ., sem saída
$ bun test test/cte-batch.contract.test.ts
(fail) CT-e item table contract > wires the panel with locale strings, the design system select and collapsed controls
 27 pass · 1 fail · 267 expect()
```

O vermelho restante é a varredura dos componentes `CteItem*`, escopo de T012.

## T012 — Componentes da tabela de CT-es e painel na página

Arquivos:

- `apps/frontend-transportada/src/modules/cte-batch/components/CteItemTable.component.tsx` (novo) —
  painel com barra de ícones (filtro e organização das colunas em botão `aria-expanded`, pílula com a
  contagem de filtros ativos, limpar filtros só quando há filtro/ordenação), cabeçalho com `aria-sort`
  por coluna, seleção por linha e por página, zebra e faixa de seleção;
- `.../components/CteItemFilters.component.tsx` (novo) — painel recolhido: lote pelo
  `@/components/ui/select`, `Emitido de`/`Emitido até`, número de CT-e mín./máx., número de nota
  mín./máx. e chips de situação;
- `.../components/CteItemColumnsMenu.component.tsx` (novo) — popover de visibilidade e reordenação;
- `.../components/CteItemSelectionBar.component.tsx` (novo) — contagem + base e total somados por
  `formatAmount`;
- `.../components/CteItemPagination.component.tsx` (novo) — anterior/próxima por cursor;
- `.../components/CteItemIcons.component.tsx` (novo) — ícones `aria-hidden` do módulo;
- `.../pages/CteBatchWorkspace.page.tsx`, `.../styles/cteBatch.module.css`,
  `.../locales/cteBatch.locale.json`, `.../locales/cteBatch.en.locale.json`.

Decisões:

- os ícones saíram para arquivo próprio e o popover de colunas também, para nenhum componente passar
  do limite de 200 linhas do padrão do repo;
- o gatilho do menu de colunas fica na barra da tabela (é ele que carrega `aria-expanded` e o rótulo
  `cteItems.columnsMenu`); o conteúdo do menu é filho, montado só quando aberto;
- os campos do painel de filtro usam a métrica **compacta** de `docs/frontend/fields.md`
  (`--field-height-compact` + padding e corpo compactos), a mesma do `triggerCompact` do select, para
  campo e select fecharem na mesma linha;
- `.iconActionActive` repete as declarações de `.iconAction` em vez de `composes:` — nenhum stylesheet
  do repo usa `composes`;
- `itemStatus.reconciliation_required` faltava nos dois locales (o status existe em
  `CTE_ITEM_STATUS_VALUES`); sem a chave o chip mostraria a chave crua.

```
$ bun test test/cte-batch.contract.test.ts test/design-system.contract.test.ts
 50 pass · 0 fail · 378 expect()

$ bun run typecheck   → tsc --noEmit, sem saída
$ bun run lint        → eslint ., sem saída
$ bunx prettier --check "src/modules/cte-batch/**"
All matched files use Prettier code style!

$ bun run test        (suíte inteira do frontend)
 280 pass · 0 fail · 1560 expect()

$ bun run build       → ✓ built in 932ms (PWA gerado)
```

Prova: a varredura de T009 (`wires the panel with locale strings, the design system select and
collapsed controls`) passou a verde — os quatro componentes existem, todos com `useTranslation`, sem
`<select` nativo e sem `style={{`, com o select do design system no filtro, `aria-sort` e
`aria-expanded` na tabela, `formatAmount` na barra de seleção e `cteItems.previousPage` na paginação —
e os contratos de design system (largura de layout, select, métrica de campo) seguem verdes com o CSS
novo.

## T013 — Controles da tabela de lotes recolhidos em botões de ícone

Contrato antes da implementação, no arquivo de contrato de lote que já existia
(`test/cte-batch/table-and-items.contract.ts`), teste
`collapses the batch filters and the columns menu behind icon triggers in the table bar`. Ele afirma,
lendo o texto-fonte: `styles.tableToolbar` e `aria-expanded` na tabela, os rótulos vindo de
`t('filters.title')` e `t('columns.title')`, **exatamente uma** ocorrência de `<CteBatchFilters` e de
`<CteBatchColumnsMenu` na tabela e cada uma precedida de `?` (recolhido = montado só quando aberto), a
página sem renderizar nem importar `CteBatchFilters`, e o painel de filtros virando corpo de painel
(`styles.filterPanel`, sem `cte-batch-filters-title` e sem `styles.panel}`).

```
$ bun test test/cte-batch.contract.test.ts   (antes da implementação)
 28 pass · 1 fail · 314 expect()
 error: expect(received).toContain(expected)  Expected to contain: "styles.tableToolbar"
```

Implementação:

- `CteBatchTable.component.tsx` ganhou `styles.tableToolbar` na cabeça do painel, com o gatilho de
  filtro (`aria-expanded`, `aria-label={t('filters.title')}`, pastilha `filterCountPill` com a
  contagem de filtros ativos), o gatilho de colunas dentro de `columnsMenuWrap` (`aria-expanded`,
  `aria-label={t('columns.title')}`) e o botão de limpar, que só aparece com filtro ou ordenação
  ativa. `CteBatchFilters` e `CteBatchColumnsMenu` passam a ser montados só quando abertos;
- `CteBatchFilters.component.tsx` deixou de ser `<section className={styles.panel}>` com título
  próprio e virou `<div className={styles.filterPanel}>` — o título agora é o `aria-label` do gatilho,
  então não há mais dois títulos concorrendo na tela;
- `CteBatchColumnsMenu.component.tsx` virou `.columnsPopover` com `role="menu"` e botões de ícone
  (`MoveUpIcon`/`MoveDownIcon`), no mesmo desenho do menu de colunas de CT-e; o CSS morto
  (`.columnsMenu`, `.columnsRow`) saiu do módulo;
- a tabela ficaria acima de 200 linhas com a barra nova, então a barra de ações em massa e as ações de
  linha saíram para `CteBatchSelectionBar.component.tsx` e `CteBatchRowActions.component.tsx`
  (`CteBatchTable` fechou em 196 linhas);
- o módulo de ícones criado em T012 foi renomeado `CteItemIcons.component.tsx` →
  `CteBatchIcons.component.tsx`, porque agora as duas tabelas (lote e CT-e) consomem o mesmo conjunto;
- `.filterPanel` passou a aplicar a métrica compacta também em `input[type='search']` e
  `input[type='text']` — o filtro de lote tem campo de busca, que ficaria mais alto que os de data e
  número dentro do mesmo painel;
- `CteBatchWorkspace.page.tsx` não renderiza nem importa mais `CteBatchFilters`.

```
$ bun test test/cte-batch.contract.test.ts test/design-system.contract.test.ts
 51 pass · 0 fail · 397 expect()

$ bun run test        (suíte inteira do frontend)
 281 pass · 0 fail · 1579 expect()

$ bun run typecheck   → tsc --noEmit, sem saída
$ bun run lint        → eslint ., sem saída
$ bunx prettier --check "src/**/*.{ts,tsx,css}"
All matched files use Prettier code style!

$ bun run build       → ✓ built in 914ms (PWA gerado)
```

Prova: o teste novo de T013 saiu de vermelho (`styles.tableToolbar` ausente) para verde, e os contratos
de design system (largura de layout, select, métrica de campo) seguem verdes com o CSS novo — ou seja,
os controles de lote passaram a abrir por ícone sem quebrar altura de campo nem largura de layout.

## T014 — Tabela de CT-es registrada como segunda referência viva

Contrato antes da implementação, em `apps/frontend-transportada/test/cte-batch/item-table.contract.ts`
(o contrato de data table desta feature), teste
`registers the CT-e table as a living reference of the data table rule`. Ele segue o molde dos
contratos de design system (`field-metrics`, `layout-width`, `select`), que também asseveram a regra
escrita: exige `docs/frontend/data-tables.md` citando `cte-batch`,
`CTE_ITEM_DEFAULT_HIDDEN_STATUSES`, `nextCursor`, `sumScaledAmounts`, `useCteItemTable` e o próprio
arquivo de contrato, e o `CLAUDE.md` apontando para o documento.

```
$ bun test test/cte-batch.contract.test.ts   (antes da implementação)
 29 pass · 1 fail · 328 expect()
 error: expect(received).toContain(expected)  Expected to contain: "cte-batch"
```

Implementação:

- `docs/frontend/data-tables.md` ganhou, no topo, a tabela de **referências vivas** (Notas em
  `nfe-workspace` = contrato base; CT-es em `cte-batch` = § 7) e a nova **§ 7**, que registra o que a
  tabela de CT-es acrescenta: paginação por cursor com pilha de cursores visitados para o botão de
  voltar (`nextCursor` opaco, reset para `CTE_ITEM_FIRST_PAGE` a cada troca de filtro/ordenação),
  filtro e ordenação no **servidor** com faixa serializada só quando preenchida, status escondido por
  padrão via constante exportada (`CTE_ITEM_DEFAULT_HIDDEN_STATUSES`), soma decimal da seleção
  sobrevivendo à troca de página por mapa acumulado `id → { baseAmount, totalAmount }` com
  `sumScaledAmounts` (`BigInt`, nunca `Number`), onde cada camada mora e os controles recolhidos em
  botão de ícone;
- a § 6 (evidência de teste) passou a listar os dois contratos de referência;
- `CLAUDE.md` passou a citar as **duas** referências vivas, para o próximo agente não reabrir a
  discussão de qual tabela copiar.

Correção de rota aproveitada aqui: `bun run format:check` da raiz acusava arquivos desta feature fora
do padrão do Prettier (o `snapshot.json` gerado em T005, o repositório tocado em T003 e os quatro
documentos de `specs/017-cte-item-workspace/`). Ficariam vermelhos no `make check` de T015. Todos
formatados; a linha do T015 no `tasks.md` foi reescrita porque tinha um code span quebrado em duas
linhas, o que fazia o Prettier oscilar (reformatava e continuava acusando).

```
$ bun test test/cte-batch.contract.test.ts
 30 pass · 0 fail · 333 expect()

$ bun run test        (suíte inteira do frontend)
 282 pass · 0 fail · 1586 expect()

$ bun run format:check   (raiz do monorepo)
All matched files use Prettier code style!
```

Prova: o teste de T014 saiu de vermelho (documento sem menção a `cte-batch`) para verde, com o
documento citando os símbolos reais do código — se alguém renomear `useCteItemTable`,
`CTE_ITEM_DEFAULT_HIDDEN_STATUSES` ou `sumScaledAmounts` sem atualizar a regra, o contrato quebra.

## T015 — Gate completo e verificação ao vivo

### Gate automatizado

```
$ make check
 exit 0 — format:check + lint + typecheck + test + build
 test: 6 · 1144 · 228 · 24 · 282 pass · 0 fail
 build do frontend: ✓ built in 960ms (PWA gerado)

$ bun run --cwd apps/api-transportada db:check
Everything's fine 🐶🔥

$ make migration-test
 9 pass · 0 fail · 182 expect()
```

Achado do caminho: o banco de desenvolvimento local estava uma migration atrás (35 de 36) — a de
T005 nunca tinha sido aplicada. Depois de `db:migrate`, `pg_indexes` lista
`cte_batch_items_company_created_at_id_idx`, então a medição abaixo exercita mesmo o índice keyset.

### Medição ao vivo em `/cte-batches`

Stack local de pé (infra em docker, API em 53001, worker em 53002, frontend em 53000), sessão
autenticada de verdade pelo code flow PKCE do realm `transportada-local` como `local-user` — o mesmo
caminho do `smoke:auth`, dirigido por um script descartável de Playwright fora do repositório
(o client `transportada-spa` tem `directAccessGrantsEnabled: false`, então não existe atalho por
`curl`). Valores em dinheiro mascarados; nenhum número de nota, chave de acesso ou razão social
transcrito.

```
[1] requisição inicial      → /api/cte-batch-items?limit=25&statusIn=failed,pending,
                               reconciliation_required,rejected,retry_scheduled
    esconde "authorized"/"cancelled"/"in_flight"?   true / true / true
    linhas na tela          = 1
    envelope tem page.nextCursor?  true (valor=null)

[2] filtros recolhidos       aria-expanded=false · painel montado=0
    colunas recolhidas       aria-expanded=false · popover montado=0
    após clicar              painel montado=1 · popover montado=1

[3] chip "Autorizado" marcado? false   ·   chip "Pendente" marcado? true
    ao marcar "Autorizado"   linhas 1 → 4
    query                    → ...&statusIn=authorized,failed,pending,reconciliation_required,
                               rejected,retry_scheduled

[4] faixa de nota            → ...&invoiceNumberGte=<mascarado>&invoiceNumberLte=<mascarado>&statusIn=...
    cteNumberGte serializado? false · issuedFrom serializado? false
    linhas com a faixa       = 4

[5] selecionar a página      linhas=4 · barra="4 CT-e(s) selecionado(s)"
    soma exibida             ["BASE SELECIONADA","R$ <mascarado>","TOTAL SELECIONADO","R$ <mascarado>"]
    soma recalculada (BigInt, fora do app)  confere? base=true total=true

[6] paginação                contador="4 de até 25 por página"
                             anterior desabilitado=true · próxima desabilitada=true

[7] API limit=2              status=200 linhas=2 nextCursor=presente
    página seguinte pelo cursor  status=200 linhas=2 · ids repetidos=0
    cursor corrompido → 400 INVALID_REQUEST · faixa invertida → 400 INVALID_REQUEST
```

O que cada bloco prova, na stack real e não em mock:

- **Status escondidos por padrão** — a primeira requisição já sai sem `authorized`, `cancelled` e
  `in_flight` no `statusIn`, e a tela mostra 1 linha; marcar o chip "Autorizado" refaz a consulta com
  o status incluído e a lista passa a 4 linhas. O default é a constante exportada, não um `if` na tela.
- **Controles recolhidos** — filtro e organização de colunas nascem com `aria-expanded=false` e o
  conteúdo **não está no DOM** (`fieldset`/`[role="menu"]` contam 0); só depois do clique é montado.
- **Filtro por faixa no servidor** — preencher mínimo e máximo de número de nota serializa
  `invoiceNumberGte`/`invoiceNumberLte` na query string, enquanto as faixas vazias (`cteNumber*`,
  `issued*`) continuam ausentes: chave vazia não é serializada.
- **Contagem e soma da seleção** — "selecionar a página" acende a barra com a contagem e as duas
  somas; recalculando as mesmas linhas fora do app, em `BigInt` sobre as strings decimais do envelope,
  os dois valores batem com o que a tela exibe. Dinheiro não passou por float em nenhum ponto.
- **Lista paginada** — o envelope traz `page.nextCursor` (null quando não há próxima página, o que
  desabilita corretamente o botão com as 4 linhas do banco local) e, forçando `limit=2` na mesma
  sessão autenticada, a API devolve `nextCursor` e a página seguinte vem com **ids disjuntos** — o
  keyset anda de fato. Cursor corrompido e faixa invertida continuam `400 INVALID_REQUEST` com a
  sessão válida, isto é, a rejeição é do parse e não da autenticação.

Limite honesto da medição: o banco local tem 4 `cte_batch_items` numa empresa só, então a paginação da
**tela** (25 por página) não tem como virar de página — por isso a ida e volta de cursor foi provada
no endpoint, com `limit=2`, e não pelo botão. O resto foi medido na interface.
