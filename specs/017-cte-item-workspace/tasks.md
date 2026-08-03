# Tasks

Feature 017 — Área de trabalho de CT-es em `/cte-batches`.

Regras do repo, valendo em toda task: **uma task por vez**; teste de contrato **antes** da
implementação; arquivo de teste novo registrado na cadeia explícita (entrypoint no `test` do
`package.json` da app, suíte no `import` do entrypoint); teste de isolamento de tenant sempre que a
task mexer em query; task só fecha com evidência em `evidence.md` (comando, saída, o que prova).
Nenhum CNPJ, IE, chave de acesso, razão social real ou XML fiscal em teste, fixture, log ou evidência.

`[P]` = pode rodar em paralelo com a anterior sem tocar nos mesmos arquivos.

## Fase A — Listagem de CT-es do tenant (api)

- [x] T001 Teste de contrato HTTP **falhando** antes da implementação: `GET /cte-batch-items`
      com allowlist de chaves, rejeição de chave repetida, `limit` padrão 25 / máximo 100 / fora do
      intervalo → `400`, cursor corrompido → `400`, `batchId` não-UUID → `400`, faixa invertida em
      `issued*`, `cteNumber*` e `invoiceNumber*` → `400`, `statusIn` vazio/desconhecido/repetido →
      `400`, a política `{ permission: 'cte.submit', scope: 'company' }` (a mesma constante
      `CTE_SUBMIT_POLICY` que as outras rotas de `cte-batch.routes.ts` já usam — não existe
      `ctes.read` no repo), e envelope `{ data, page: { nextCursor } }` com
      `batchId`, `batchName` e `createdAt` na linha —
      `apps/api-transportada/test/cte-batch-http/item-list.contract.ts` (novo) + `import` em
      `apps/api-transportada/test/cte-batch-http.contract.test.ts` — evidência: saída do `bun test`
      com o arquivo novo listado e falhando pelo motivo certo.

- [x] T002 Teste de contrato de infraestrutura **falhando**, sobre `buildCompanyItemFilters` exportada:
      `company_id = $` presente em **todo** filtro (item, documento fiscal, tentativa, notas, lote),
      keyset `(created_at desc, id desc)` com o cursor `"<iso>::<uuid>"`, faixa de número de CT-e sobre
      o `coalesce` documento→tentativa, faixa de número de nota por subquery (nunca join que
      multiplique linha) e `statusIn` sobre o status derivado —
      `apps/api-transportada/test/cte-batch-infrastructure/item-list.contract.ts` (novo) + `import` em
      `apps/api-transportada/test/cte-batch-infrastructure.contract.test.ts`. O isolamento de tenant da
      leitura nova é asseverado **neste** arquivo (é onde `buildCompanyItemFilters` é compilada por
      `PgDialect().sqlToQuery`, contando os `company_id = $` de item, documento, tentativa, nota e
      lote); `test/cte-batch-schema/tenant-safety.contract.ts` cobre schema, não query montada —
      **mexe em query: isolamento de tenant obrigatório** — evidência: saída falhando.

- [x] T003 🧠 Implementar a leitura: `CteBatchItemListQuery` + `listCompanyItems` no port,
      `listCompanyItems` no repositório (keyset, `leftJoin` do documento fiscal, `leftJoin` da subquery
      de última tentativa, `innerJoin` do lote para `batchName`, filtros em
      `buildCompanyItemFilters` exportada), `loadCharges`/`loadDocuments` passando a aceitar lista de
      ids sem mudar o comportamento da leitura por lote, e a precedência de status **chamando**
      `resolveBatchItemStatus`/`resolveIssuedDocumentStatus` em vez de reimplementar —
      `apps/api-transportada/src/cte-batches/application/cte-batch-item.port.ts`,
      `apps/api-transportada/src/cte-batches/infrastructure/drizzle-cte-batch-item.repository.ts` —
      evidência: T001/T002 verdes + `bun run typecheck`.

- [x] T004 Caso de uso, parse e rota: `createListCompanyCteItemsUseCase` repassando **só**
      `context.companyId` (nunca payload do cliente), `parseCteBatchItemList` no molde de
      `parseCteBatchList`, `API_CTE_BATCH_ITEMS_PATH`, a rota registrada e o composition root ligado.
      O nome do arquivo é `list-company-cte-items.use-case.ts` porque
      `list-cte-batch-items.use-case.ts` já existe e é a leitura de **um** lote —
      `apps/api-transportada/src/cte-batches/application/list-company-cte-items.use-case.ts` (novo),
      `apps/api-transportada/src/cte-batches/presentation/cte-batch.schema.ts`,
      `apps/api-transportada/src/cte-batches/presentation/cte-batch.routes.ts`,
      `apps/api-transportada/src/shared/api.constant.ts`, `apps/api-transportada/src/main.ts` —
      evidência: suíte de `cte-batch-http` verde + `curl` autenticado na stack local mostrando o
      envelope (valores mascarados na evidência).

- [x] T005 Migration aditiva do índice `(company_id, created_at desc, id desc)` de `cte_batch_items`,
      com rollback manual ao lado no formato do repo (licença, aviso de rollback manual,
      `BEGIN/COMMIT`, remoção da linha do journal com `GET DIAGNOSTICS` exigindo exatamente 1) —
      `bun run --cwd apps/api-transportada db:generate --name cte_batch_items_company_created_at_idx` —
      evidência: `bun run --cwd apps/api-transportada db:check` + `make migration-test`.

- [x] T006 Teste de integração em Postgres real provando que o SQL de status derivado de
      `buildCompanyItemFilters` concorda com `resolveBatchItemStatus`: sem o banco, o contrato de
      infraestrutura só compara SQL com SQL — se a precedência estiver errada, os dois lados erram
      juntos. Semear, no molde de `test/integration/billing-repository.integration.ts`
      (`withDisposableDatabase` + `runDatabaseMigrations`), um item por situação — só tentativa
      `pending`/`rejected`/`in_flight`, tentativa autorizada **com** documento autorizado, documento
      `cancelled`, documento autorizado com `cancellation_requested_at` preenchido, e item sem
      tentativa nenhuma — e afirmar, para **cada** status de `CTE_ISSUANCE_STATUSES`, que
      `listCompanyItems({ filters: { statusIn: [status] } })` devolve exatamente os ids que
      `resolveBatchItemStatus` classifica naquele status ao ler a lista inteira sem filtro. Cobrir
      também o isolamento (segunda empresa com o mesmo grafo, `statusIn` não vaza linha) e a faixa de
      número de nota com item de duas notas (não duplica linha) —
      `apps/api-transportada/test/integration/cte-item-list-repository.integration.ts` (novo),
      registrado na lista **explícita** de `test:integration` no `package.json` da app
      (`apps/api-transportada/package.json:22`) — evidência: saída do `bun test` com
      `DRIZZLE_TEST_DATABASE_URL` apontando para o Postgres local.

## Fase B — Soma decimal no frontend

- [x] T007 Teste de contrato **falhando** de `sumScaledAmounts`: soma exata em centavos, escala 2 e
      escala 4 na mesma lista, valor negativo, lista vazia devolvendo `'0.00'`, valor com mais casas
      que a escala rejeitado, e varredura provando que o módulo não usa `Number`/`parseFloat` —
      `apps/frontend-transportada/test/shared/decimal-amount.contract.ts` (novo) + `import` em
      `apps/frontend-transportada/test/shared.contract.test.ts` (criando o entrypoint e registrando-o
      no `test` do `package.json` se ainda não existir) — evidência: saída falhando.

- [x] T008 Implementar `sumScaledAmounts` e `formatAmount` em `BigInt`, com `Intl` só na formatação —
      `apps/frontend-transportada/src/modules/shared/decimalAmount.service.ts` (novo) — evidência:
      T007 verde.

## Fase C — Tabela de CT-es (frontend)

- [x] T009 Teste de contrato **falhando** da tabela de CT-es, cobrindo o contrato de
      `docs/frontend/data-tables.md` mais o que esta feature pede: as colunas de
      `CTE_ITEM_COLUMN_KEYS`; `CTE_ITEM_DEFAULT_HIDDEN_STATUSES = ['authorized','cancelled','in_flight']`
      ausente do filtro inicial e revelável por chip; faixas de data, número de CT-e e número de nota
      serializadas na query string só quando preenchidas; paginação por cursor com volta; contagem de
      selecionados; soma de frete e de base **entre páginas** (mapa acumulado); ordenação por
      cabeçalho; limpar filtros; colunas persistidas em `localStorage`; nenhum texto solto (toda
      string vindo de locale) —
      `apps/frontend-transportada/test/cte-batch/item-table.contract.ts` (novo) + `import` em
      `apps/frontend-transportada/test/cte-batch.contract.test.ts` — evidência: saída falhando.

- [x] T010 Serviço puro e client HTTP: `CTE_ITEM_COLUMN_KEYS`, `CteItemTableFilters`,
      `CTE_ITEM_COLUMNS_STORAGE_KEY`, `CTE_ITEM_DEFAULT_HIDDEN_STATUSES`, serialização de query e
      validação por type guard manual (sem zod, como o resto do frontend) —
      `apps/frontend-transportada/src/modules/cte-batch/shared/cteBatchItemTable.service.ts` (novo),
      `.../shared/cteBatchItemClient.service.ts` (novo), `.../shared/cteBatchItem.validation.ts` (novo)
      — evidência: parte de T009 verde.

- [x] T011 Hook `useCteItemTable`: filtros simples/avançado, sort, paginação por cursor com pilha de
      volta, `selectedIds`, mapa acumulado id → `{baseAmount, totalAmount}` para a soma sobreviver à
      troca de página, preferências de coluna pelo mecanismo da feature 015 —
      `apps/frontend-transportada/src/modules/cte-batch/hooks/useCteItemTable.hook.ts` (novo) +
      `.../queries/cteBatchItems.query.ts` (novo, TanStack Query) — evidência: T009 verde.

- [x] T012 Componentes: `CteItemFilters` (painel recolhido em botão de ícone, campos nas métricas de
      `docs/frontend/fields.md`, todo select pelo `@/components/ui/select`), `CteItemTable` (zebra,
      ordenação, seleção, menu de colunas em botão), `CteItemSelectionBar` (contagem + somas),
      `CteItemPagination`; a página passa a ter o painel de CT-es —
      `apps/frontend-transportada/src/modules/cte-batch/components/CteItem*.component.tsx` (novos),
      `.../pages/CteBatchWorkspace.page.tsx`, `.../styles/cteBatch.module.css`,
      `.../locales/cteBatch.pt-BR.locale.json`, `.../locales/cteBatch.en.locale.json` — evidência:
      T009 verde + contratos de design system verdes.

- [x] T013 Recolher os controles da tabela de **lotes**: `CteBatchColumnsMenu` deixa de ser inline e
      abre por botão de ícone na barra da tabela, como em `NfeDocumentTable.component.tsx`; o painel de
      filtros de lote segue o mesmo gatilho — contrato antes, no arquivo de contrato de lote existente
      —`apps/frontend-transportada/src/modules/cte-batch/components/CteBatchTable.component.tsx`,
      `.../components/CteBatchFilters.component.tsx` — evidência: suíte de `cte-batch` verde.

## Fase D — Fechamento

- [x] T014 `docs/frontend/data-tables.md` registra a tabela de CT-es como segunda referência viva, com
      o que ela acrescenta (paginação por cursor, soma de seleção entre páginas, status escondido por
      padrão) — evidência: contrato de data-table verde.

- [x] T015 Gate completo e verificação ao vivo: `make check`,
      `bun run --cwd apps/api-transportada db:check`, `make migration-test`, e medição na stack local
      em `/cte-batches` provando lista paginada, filtros por faixa, status escondidos por padrão,
      contagem e soma da seleção — evidência em `specs/017-cte-item-workspace/evidence.md`, sem dado
      fiscal real.
