# Plano técnico — Feature 017

## Contexto e premissas

- `cte_batch_items` já tem `created_at` e `unique (company_id, id)`; a paginação keyset por
  `(created_at desc, id desc)` é a mesma de `drizzle-cte-batch.repository.ts:listBatches`, inclusive o
  formato de cursor `"<iso>::<uuid>"` e o `decodeCursor` por `lastIndexOf('::')`. Não se inventa
  formato novo.
- O índice existente é `(company_id, batch_id, created_at)` — não serve a uma varredura cross-lote
  ordenada por data. A única migration da feature é o índice aditivo
  `(company_id, created_at desc, id desc)`.
- O status do item **é derivado**: `resolveBatchItemStatus` já decide que documento fiscal gravado
  manda sobre a última tentativa (ADR-0018). Filtrar status no SQL sem duplicar essa regra exige
  materializar a mesma precedência na projeção — `coalesce` sobre o documento e sobre a última
  tentativa — e é isso que o repositório vai fazer, reusando `resolveIssuedDocumentStatus`.
- O número do CT-e também é derivado (`cte_fiscal_documents.fiscal_number` quando existe, senão
  `cte_issuance_attempts.fiscal_number` da última tentativa). A faixa filtra sobre o mesmo `coalesce`.
- Um item pode ter **várias** notas (`sender_recipient`). A faixa de número de nota é "existe nota
  vinculada na faixa" — subquery `inArray`, nunca join que multiplique linha.
- O padrão de query params da app é sufixado (`Eq`/`Ne`/`Gt`/`Gte`/`Lt`/`Lte`, `From`/`Until`,
  `Contains`), com allowlist de chaves e rejeição de chave repetida — `parseCteBatchList` é o molde.
- A soma dos selecionados fica no cliente: a seleção é do cliente. Somar em `BigInt` sobre decimal
  escalado dá centavo exato sem endpoint de agregação.
- `docs/frontend/data-tables.md` é contrato, não sugestão: a tabela nova nasce com ordenação, filtro
  simples + avançado, multi-valor, seleção em massa, colunas persistidas e teste de contrato.

## Contrato HTTP

`GET /cte-batch-items` — política `{ permission: 'cte.submit', scope: 'company' }`, a constante
`CTE_SUBMIT_POLICY` de `cte-batch.routes.ts:23`, que é a que **todas** as rotas de lote já usam.
Não existe permissão `ctes.read` no repo — a leitura da rota atual desfez essa suposição do rascunho.
A API **não** tem prefixo de versão: `matchRoute` compara o `pathname` cru contra o `pathname` do
`defineRoute`, e nenhuma constante de `api.constant.ts` carrega `/v1`. O caminho servido é
`/cte-batch-items`. Introduzir versionamento aqui seria mudança transversal, fora do escopo desta
feature.

| Parâmetro                               | Forma                                    | Regra                                   |
| --------------------------------------- | ---------------------------------------- | --------------------------------------- |
| `cursor`                                | `"<iso>::<uuid>"`                        | corrompido → `400`                      |
| `limit`                                 | inteiro                                  | padrão 25, máximo 100, fora → `400`     |
| `batchId`                               | UUID                                     | não-UUID → `400`                        |
| `issuedFrom` / `issuedUntil`            | ISO-8601                                 | `from > until` → `400`                  |
| `cteNumberGte` / `cteNumberLte`         | inteiro positivo                         | `gte > lte` → `400`                     |
| `invoiceNumberGte` / `invoiceNumberLte` | inteiro positivo                         | `gte > lte` → `400`                     |
| `statusIn`                              | lista `a,b,c` de `CTE_ISSUANCE_STATUSES` | vazio, repetido ou desconhecido → `400` |

Resposta: `{ data: CteBatchItemSummary[], page: { nextCursor } }` — o mesmo envelope das outras
listagens. `CteBatchItemSummary` é o `CteBatchItem` que a rota de um lote já serializa, **mais**
`batchId`, `batchName` e `createdAt`, porque a linha agora vive fora do contexto de um lote.

## Arquivos afetados

**api — aplicação**

- `src/cte-batches/application/cte-batch-item.port.ts` — `CteBatchItemQuery` continua sendo a leitura
  de um lote; entra `CteBatchItemListQuery { companyId, cursor, limit, filters? }` e
  `listCompanyItems` no `CteBatchItemReaderPort`. `CteBatchItem` ganha `batchId`, `batchName` e
  `createdAt`.
- `src/cte-batches/application/list-company-cte-items.use-case.ts` (novo) —
  `createListCompanyCteItemsUseCase`, recebe o reader, devolve `{ items, nextCursor }`. Nenhuma regra
  além de repassar `context.companyId`. O nome carrega `company` porque
  `list-cte-batch-items.use-case.ts` já existe e é a leitura dos itens de **um** lote.

**api — infraestrutura**

- `src/cte-batches/infrastructure/drizzle-cte-batch-item.repository.ts` — `listCompanyItems` com
  keyset, `leftJoin` em `cte_fiscal_documents`, `leftJoin` na subquery de última tentativa
  (`selectDistinctOn` por `batchItemId`, `order by attempt_number desc`), `innerJoin` em `cte_batches`
  para `batchName`. Os filtros saem em `buildCompanyItemFilters(...)` **exportada**, no formato de
  `buildBatchItemDocumentFilters`, para o isolamento ser verificável sem banco. `loadCharges` e
  `loadDocuments` passam a aceitar lista de ids em vez de `batchId` fixo (a leitura por lote continua
  chamando com os ids do lote — comportamento inalterado).

**api — apresentação**

- `src/shared/api.constant.ts` — `API_CTE_BATCH_ITEMS_PATH = '/cte-batch-items'`.
- `src/cte-batches/presentation/cte-batch.schema.ts` — `parseCteBatchItemList(url)` no molde de
  `parseCteBatchList`: allowlist, chave repetida, faixas invertidas, `statusIn`.
- `src/cte-batches/presentation/cte-batch.routes.ts` — a rota nova, reusando o `serializeItem` atual.
- `src/main.ts` — composition root liga o caso de uso novo.

**api — banco**

- `drizzle/<ts>_cte_batch_items_company_created_at_idx/{migration.sql,rollback.sql,snapshot.json}` —
  índice aditivo, rollback manual ao lado, no formato do repo.

**frontend**

- `src/modules/cte-batch/shared/cteBatchItemClient.service.ts` (novo) — `listCompanyItems`, `fetch`
  injetado, query string montada só com os filtros presentes.
- `src/modules/cte-batch/shared/cteBatchItemTable.service.ts` (novo) — `CTE_ITEM_COLUMN_KEYS`
  (`cteNumber`, `batchName`, `invoiceNumbers`, `createdAt`, `baseAmount`, `totalAmount`,
  `fiscalAmount`, `status`, `lastErrorCode`), `CteItemTableFilters`, `CTE_ITEM_COLUMNS_STORAGE_KEY`,
  `CTE_ITEM_DEFAULT_HIDDEN_STATUSES = ['authorized', 'cancelled', 'in_flight']`, funções puras de
  filtro/ordenação/serialização de query.
- `src/modules/shared/decimalAmount.service.ts` (novo) — `sumScaledAmounts(values)` e
  `formatAmount(value)`: soma em `BigInt` na escala do valor, formatação por `Intl` só na borda de
  exibição. **Nenhuma soma passa por `Number`.**
- `src/modules/cte-batch/hooks/useCteItemTable.hook.ts` (novo) — filtros (simples/avançado), sort,
  paginação por cursor com pilha de cursores para voltar, `selectedIds`, um
  `Map<id, {baseAmount, totalAmount}>` acumulado a cada página para a soma sobreviver à troca de
  página, preferências de coluna via o mesmo mecanismo da feature 015.
- `src/modules/cte-batch/components/CteItemFilters.component.tsx`,
  `CteItemTable.component.tsx`, `CteItemSelectionBar.component.tsx`,
  `CteItemPagination.component.tsx` (novos).
- `src/modules/cte-batch/components/CteBatchTable.component.tsx` — o menu de colunas deixa de ser
  inline e passa a abrir por botão de ícone na barra da tabela, como em
  `NfeDocumentTable.component.tsx`.
- `src/modules/cte-batch/pages/CteBatchWorkspace.page.tsx` — a tabela de CT-es entra como painel
  principal; a de lotes continua, agora com filtros e colunas recolhidos.
- `src/modules/cte-batch/locales/cteBatch.pt-BR.locale.json` e `.en.locale.json` — nenhum texto solto.
- `src/modules/cte-batch/styles/cteBatch.module.css` — só tokens; campos pelas métricas de
  `docs/frontend/fields.md`; todo select é `@/components/ui/select`.

**docs**

- `docs/frontend/data-tables.md` — a tabela de CT-es entra como segunda referência viva.

## Testes

| Arquivo                                                                                 | Prova                                                                                                                                                    |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api-transportada/test/cte-batch-http/item-list.contract.ts` (novo)                | parse: allowlist, chave repetida, faixa invertida, `limit`, cursor, `statusIn`, envelope e política                                                      |
| `apps/api-transportada/test/cte-batch-infrastructure/item-list.contract.ts` (novo)      | `company_id = $` em **todo** filtro e subquery (é aqui que mora o isolamento de tenant da leitura nova); keyset; faixa por `coalesce`; nota por subquery |
| `apps/api-transportada/test/integration/cte-item-list-repository.integration.ts` (novo) | em Postgres real: o `statusIn` do SQL concorda com `resolveBatchItemStatus`, não vaza tenant, e item de duas notas não duplica linha                     |
| `apps/frontend-transportada/test/cte-batch/item-table.contract.ts` (novo)               | colunas, filtros, status escondidos por padrão, contagem e soma, paginação, contrato de data-table                                                       |
| `apps/frontend-transportada/test/shared/decimal-amount.contract.ts` (novo)              | soma exata em centavos, escalas diferentes, valor negativo, lista vazia, ausência de `Number`                                                            |
| `apps/frontend-transportada/test/design-system/*.contract.ts`                           | continuam verdes (campos, select, largura de layout)                                                                                                     |

Todo arquivo novo entra na lista **explícita** do `test` no `package.json` da app e no `import` do
entrypoint da área.

## Riscos e mitigação

| Risco                                                                 | Mitigação                                                                                                                                                                                                                     |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Duplicar a regra de precedência de status entre repositório e domínio | Na projeção o repositório **chama** `resolveBatchItemStatus`; o `statusIn` precisa da mesma precedência em SQL, então um teste de integração em Postgres real confronta os dois lados (contrato SQL-contra-SQL erraria junto) |
| Join de notas multiplicando a linha do CT-e                           | Faixa de nota por subquery `inArray`; as notas continuam carregadas em `loadDocuments` e agrupadas em `Map`                                                                                                                   |
| Soma perdendo centavo                                                 | `BigInt` sobre decimal escalado, contrato dedicado, proibição de `Number` verificada no teste                                                                                                                                 |
| Seleção somada só na página corrente                                  | Mapa acumulado id → valores, alimentado a cada página; contrato cobre seleção entre páginas                                                                                                                                   |
| Varredura sequencial na listagem cross-lote                           | Índice aditivo `(company_id, created_at desc, id desc)` + `make migration-test`                                                                                                                                               |
| Esconder CT-e que exige ação                                          | Só `authorized`, `cancelled` e `in_flight` nascem escondidos; decisão registrada na spec                                                                                                                                      |

## Gate de saída

`bun run --cwd apps/api-transportada test` · `bun run --cwd apps/frontend-transportada test` ·
`bun run --cwd apps/api-transportada db:check` · `make migration-test` · `make check` · verificação ao
vivo em `http://localhost:53000/cte-batches` com medição, e `evidence.md` sem nenhum dado fiscal real.
