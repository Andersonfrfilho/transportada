# Evidence

Feature 022 — Faturamento, exportação e transmissão a partir da tela de CT-es.

Nenhum dado real de tenant, CNPJ, IE, chave de acesso ou XML fiscal aparece aqui.

## T001 — contrato do filtro por lista de números (vermelho)

`test/cte-batch-http/item-list.contract.ts` (entrypoint já registrado em
`test/cte-batch-http.contract.test.ts`).

```
$ bun test ./test/cte-batch-http.contract.test.ts
(fail) CT-e item listing HTTP contract > forwards cteNumberIn and invoiceNumberIn as parsed lists
Expected: 200
Received: 400
 60 pass
 1 fail
```

Prova: `cteNumberIn`/`invoiceNumberIn` ainda são chaves desconhecidas — o schema devolve 400 antes de
chegar no repositório. Os 60 outros testes (incluindo os novos casos de rejeição para lista vazia,
não numérica, duplicada e combinada com `Gte`/`Lte`) já passam porque qualquer chave desconhecida hoje
é 400 — a rejeição correta por regra específica só é provada depois que a chave existe (T002).

## T002 — `cteNumberIn`/`invoiceNumberIn` implementados (verde)

Schema (`cte-batch.schema.ts`): `parsePositiveIntegerList` + `assertNotCombinedWithRange`.
Repositório (`drizzle-cte-batch-item.repository.ts`): `cteNumberExpression() in (...)` reusando a mesma
expressão derivada do range; `invoiceNumberInCondition` reusando a mesma subquery com escopo de empresa
que `invoiceNumberCondition`.

```
$ bun test ./test/cte-batch-http.contract.test.ts
 61 pass
 0 fail
 199 expect() calls

$ bun test ./test/cte-batch-infrastructure.contract.test.ts
 26 pass
 0 fail
 63 expect() calls
```

Teste de isolamento de tenant (`test/cte-batch-infrastructure/item-list.contract.ts`, mexeu em query):

- `matches an exact list of CT-e numbers over the same derived expression as the range` — mesma
  expressão `coalesce(cte_fiscal_documents.fiscal_number, ...cte_issuance_attempts.fiscal_number)` do
  filtro por faixa, agora com `in (...)`.
- `matches an exact list of invoice numbers through the same company scoped subquery` — a subquery
  contra `nfe_documents` continua filtrando por `company_id` três vezes (outer + os dois lados do join),
  igual ao filtro por faixa que já existia.

```
$ bun run --cwd apps/api-transportada test
 1169 pass
 1 skip
 0 fail
 5421 expect() calls
Ran 1170 tests across 61 files.

$ bun run lint       # silencioso nas 4 apps
$ bun run typecheck  # silencioso nas 4 apps
```

## T003/T004 — campo único de busca por número no frontend (vermelho → verde)

`test/cte-batch/item-table.contract.ts`: novo teste `parses an exact value, a comma list or a
hyphen range from the number search field` cobrindo `parseNumberQuery` (exato, lista, faixa, espaços
ignorados, texto/hífen solto/lista com item não numérico rejeitados) e o teste existente
`serializes only the filled ranges...` reescrito para os dois campos novos (`cteNumberQuery`,
`invoiceNumberQuery`), provando que faixa emite `cteNumberGte`/`Lte`, lista/exato emitem `cteNumberIn`,
e entrada inválida não emite nenhuma chave.

```
$ bun test ./test/cte-batch.contract.test.ts
(fail) CT-e item table contract > serializes only the filled ranges and never a key the API rejects
Expected: "10"
Received: null
(fail) CT-e item table contract > parses an exact value, a comma list or a hyphen range from the number search field
TypeError: parseNumberQuery is not a function
 41 pass / 2 fail
```

Prova do vermelho: os campos `cteNumberFrom`/`cteNumberTo`/`invoiceNumberFrom`/`invoiceNumberTo` ainda
existiam no serviço e `parseNumberQuery` não existia.

Implementado em `cteBatchItemTable.service.ts` (`parseNumberQuery`, `applyNumberQuery`,
`CteItemTableFilters` com `cteNumberQuery`/`invoiceNumberQuery`), `CteItemFilters.component.tsx`
(`NUMBER_QUERY_FIELDS`, `type="text"` no lugar de `type="number"`) e nos locales pt/en
(`cteNumberQuery`, `invoiceNumberQuery`, `numberQueryPlaceholder`).

```
$ bun test ./test/cte-batch.contract.test.ts
 43 pass / 0 fail / 389 expect() calls

$ bun run --cwd apps/frontend-transportada test
 316 pass / 0 fail / 1726 expect() calls, 316 tests across 14 files

$ bun run lint       # silencioso nas 4 apps
$ bun run typecheck  # silencioso nas 4 apps
$ bun run --cwd apps/frontend-transportada build   # build de produção ok
```

## T005 — transmissão a partir da seleção (vermelho → verde)

`test/cte-batch/table-and-items.contract.ts`: novo teste `groups the selection by batch and only
allows transmitting when every batch is ready` cobrindo `groupSelectionByBatch`
(`cteBatchItemActions.service.ts`) — agrupa itens selecionados por `batchId`, inclusive quando a
seleção cruza dois lotes — e `canTransmitSelection` — só libera com `cte.submit` **e** todo lote
envolvido em status transmissível (`error`/`submitted`); sem grupo, sem permissão ou com um lote em
`draft` no meio da seleção, a ação fica bloqueada.

```
$ bun test ./test/cte-batch.contract.test.ts
(fail) CT-e batch table and items contract > groups the selection by batch and only allows
       transmitting when every batch is ready
TypeError: groupSelectionByBatch is not a function
 43 pass / 1 fail
```

Prova do vermelho: `groupSelectionByBatch`/`canTransmitSelection` ainda não existiam em
`cteBatchItemActions.service.ts` (confirmado revertendo o arquivo de implementação com
`git stash push -- <arquivo>` e rodando de novo antes de restaurar).

`test/cte-batch/item-table.contract.ts`: o teste existente `wires the panel...` ganhou as
asserções que provam a segunda metade da task — "a barra de seleção renderiza a ação": o hook
(`useCteItemTable.hook.ts`) contém `canTransmitSelection`/`groupSelectionByBatch`, e o componente
(`CteItemSelectionBar.component.tsx`) contém `canTransmit`/`transmitGroups` e a chave de locale
`cteItems.transmitSelection`; os locales pt/en ganharam essa chave.

```
(fail) CT-e item table contract > wires the panel with locale strings, the design system select
       and collapsed controls
Expected to contain: "canTransmitSelection"
 43 pass / 1 fail
```

Implementado: `groupSelectionByBatch`/`canTransmitSelection` em `cteBatchItemActions.service.ts`;
`CteItemAmounts` (`cteBatchItemSelection.service.ts`) passou a carregar `batchId` — é isso que
sustenta o agrupamento por lote **entre páginas**, do mesmo jeito que já sustentava a soma de
valores entre páginas; `useCteItemTable.hook.ts` recebe `batches` e expõe `canTransmit`/
`transmitGroups` calculados sobre o mapa acumulado (não sobre `visibleItems`, que é só a página
atual); `CteBatchWorkspace.page.tsx` passa `batches` para o hook; `CteItemSelectionBar.component.tsx`
renderiza o botão de transmitir, desabilitado quando `canTransmit` é falso, com o rótulo informando
a contagem de lotes (`transmitGroups.length`); o clique chama um `onTransmit` opcional — a chamada
real a `POST /cte-batches/:id/issue` fica para a T006.

```
$ bun test ./test/cte-batch.contract.test.ts
 44 pass / 0 fail / 403 expect() calls

$ bun run --cwd apps/frontend-transportada test
 317 pass / 0 fail / 1740 expect() calls, 317 tests across 14 files

$ bun run lint       # silencioso nas 4 apps
$ bun run typecheck  # silencioso nas 4 apps
$ bun run --cwd apps/frontend-transportada build   # build de produção ok
```

## T006 — ligar transmissão na CteItemSelectionBar (vermelho → verde)

`test/cte-batch/item-table.contract.ts`: o teste `wires the panel...` ganhou mais três asserções
provando a mutação real: o hook (`useCteItemTable.hook.ts`) contém `getCteIssuanceClient` e
`COMPANY_CTE_ITEMS_QUERY_KEY`; o componente (`CteItemSelectionBar.component.tsx`) contém
`transmitSelection(` chamado a partir do clique — não mais o `onTransmit` opcional interino de T005.

```
$ bun test ./test/cte-batch.contract.test.ts
(fail) CT-e item table contract > wires the panel with locale strings, the design system select
       and collapsed controls
Expected to contain: "getCteIssuanceClient"
 43 pass / 1 fail
```

Prova do vermelho: `getCteIssuanceClient`/`COMPANY_CTE_ITEMS_QUERY_KEY` ainda não eram importados no
hook, e `CteItemSelectionBar` ainda chamava só o `onTransmit?.(...)` opcional.

Implementado: `COMPANY_CTE_ITEMS_QUERY_KEY` passou a ser exportado de `cteBatchItems.query.ts`;
`useCteItemTable.hook.ts` monta um `transmitMutation` (`useMutation`) que, por grupo em
`transmitGroups`, cria o controller com `getCteIssuanceClient()` +
`createCteIssuanceController({client, permissions})` (mesmo primitivo de baixo nível usado pelo
transmit de lote único, sem reusar o hook `useCteIssuanceStatus` inteiro, que é escopado a um único
`batchId`) e chama `controller.issueBatch({batchId, idempotencyKey: crypto.randomUUID()})` uma vez
por lote envolvido via `Promise.all`; ao terminar com sucesso invalida `[COMPANY_CTE_ITEMS_QUERY_KEY]`
(recarrega a listagem). O hook expõe `transmitSelection`/`isTransmitting`.
`CteItemSelectionBar.component.tsx` perdeu o prop `onTransmit` interino: o clique agora chama
`table.transmitSelection(table.transmitGroups)` diretamente e o botão fica desabilitado também
enquanto `isTransmitting` é verdadeiro.

```
$ bun test ./test/cte-batch.contract.test.ts
 44 pass / 0 fail / 406 expect() calls

$ bun run --cwd apps/frontend-transportada test
 317 pass / 0 fail / 1743 expect() calls, 317 tests across 14 files

$ bun run lint       # silencioso nas 4 apps
$ bun run typecheck  # silencioso nas 4 apps
$ bun run --cwd apps/frontend-transportada build   # build de produção ok
```

**Verificação no navegador real:** não realizada — não há ferramenta de automação de navegador
disponível neste ambiente. Decisão explícita do usuário: fechar a task apenas com base nos gates
automatizados (testes de contrato vermelho→verde, `test`, `lint`, `typecheck`, `build`), registrando
aqui que a checagem manual em navegador real ficou pendente. Se um defeito só visível em runtime
aparecer (ex.: erro de rede ao chamar `POST /cte-batches/:id/issue`), tratar como bug separado.

## T007 — contrato de `GET /billing/invoices` (vermelho)

`test/billing-http/list-invoices.contract.ts` (novo; registrado em
`test/billing-http.contract.test.ts`, que já está na cadeia `test` do `package.json`).

Cobre: cursor, filtro por status, período de emissão (`issuedFrom`/`issuedTo`), período de
vencimento (`dueFrom`/`dueTo`), tomador (`customerDocument`), número da fatura (`invoiceNumber`);
rejeição de chave de query desconhecida; e a policy `billing.read`. `test/fixtures/billing-http.fixture.ts`
ganhou `INVOICES_PAGE`, `INVOICES_FILTERS_QUERY`, `listBillingInvoicesRequest()` e o método `list` em
`billingInvoices` (rastreado em `listInvoiceCalls`).

```
$ bun test ./test/billing-http.contract.test.ts
(fail) Billing HTTP invoice listing contract > lists invoices with cursor, status, period and customer filters in stable order
Expected: 200
Received: 404
(fail) Billing HTTP invoice listing contract > rejects an unknown query key before reaching the use case
Expected: 400
Received: 404
(fail) Billing HTTP invoice listing contract > requires billing.read to list invoices
Expected: 403
Received: 404
 11 pass
 3 fail
 63 expect() calls
```

Prova do vermelho: `GET /billing/invoices` ainda não existe em `billing.routes.ts` — qualquer
requisição para o path cai no 404 do roteador antes de chegar em parsing, policy ou use-case. A
implementação (rota, parser, use-case `list`, `drizzle-billing.repository.ts`) fica para a T008, que
também precisa do teste de isolamento de tenant por mexer em query.

## T008 — implementar `GET /billing/invoices` (verde)

Cursor: reusa o mesmo padrão keyset `(createdAt, id)` de `src/shared/keyset-cursor.ts` já usado por
`drizzle-cte-batch-item.repository.ts` — não o padrão de eco de cursor de `listEligibleBillingCtes`.

Implementado:

- `billing.schema.ts`: `parseBillingInvoiceList(url)` — chaves permitidas `cursor`, `customerDocument`,
  `dueFrom`, `dueTo`, `invoiceNumber`, `issuedFrom`, `issuedTo`, `limit`, `status`; rejeita chave
  desconhecida e duplicada; `parseInvoiceStatus` valida contra `BILLING_INVOICE_STATUSES`.
- `billing.routes.ts`: nova rota `GET /billing/invoices` com a mesma policy `BILLING_READ_POLICY` de
  `GET /billing/invoices/:id`, entre a rota de criação e a de detalhe (`matchRoute` filtra por
  `pathname` **e** `method`, então convive com o `POST` no mesmo path).
- `billing.use-case.ts`: `list`/`listInvoices` repassa `context.companyId`, `cursor`, `filters`,
  `limit` para `unitOfWork.listInvoices`.
- `drizzle-billing.repository.ts`: `listInvoices` — `select().from(billingInvoices)`, `orderBy(desc
(createdAt), desc(id))`, `limit(limit + 1)`, fatia em `limit` e codifica o cursor seguinte só se
  sobrou registro. `buildInvoiceListFilters` (exportada, pura) monta as condições: `company_id` sempre
  primeiro, depois o keyset (`invoiceKeysetCondition`), depois os filtros opcionais
  (status/período de emissão/período de vencimento/documento do tomador/número da fatura).
  `mapInvoiceListRecord` omite `itemCount` de propósito (evita N+1 por linha da listagem);
  `serializeInvoice` já trata `itemCount` como opcional, então a resposta HTTP não muda de formato.
- `main.ts`: `billingInvoices.list` ligado a `billing.list({...})`.

```
$ bun test ./test/billing-http.contract.test.ts ./test/billing-infrastructure.contract.test.ts
 20 pass
 0 fail
 86 expect() calls
```

Teste de isolamento de tenant (`test/billing-infrastructure/list-invoices.contract.ts`, mexeu em
query — mesmo padrão de unidade sobre SQL gerado usado em T002):

- `scopes the listing by company even without a single filter` — `buildInvoiceListFilters` sem cursor
  e sem filtro nenhum ainda assim gera `company_id = $1` como única condição.
- `keeps the company filter in front of every optional filter` — com todos os sete filtros opcionais
  preenchidos, `company_id` continua sendo o primeiro parâmetro e nenhum parâmetro vira `undefined`.
- `pages by the same keyset the CT-e item listing uses` — com cursor, a condição gerada é
  `created_at < $ or (created_at = $ and id < $)`, igual ao padrão de `drizzle-cte-batch-item.repository.ts`.
- Mais três testes de forma (`status`/`invoiceNumber`, período de emissão/vencimento independentes,
  documento do tomador) confirmando que cada filtro produz o fragmento SQL esperado sem perder o
  escopo de empresa.

```
$ bun run --cwd apps/api-transportada test
 1178 pass
 1 skip
 0 fail
 5447 expect() calls
Ran 1179 tests across 62 files.

$ bun run lint       # silencioso nas 4 apps
$ bun run typecheck  # silencioso nas 4 apps
```

Nota: a primeira rodada de `typecheck` falhou em `drizzle-billing.repository.ts` por causa do
`exactOptionalPropertyTypes: true` — montar `filters` com `chave: valor ?? undefined` não é atribuível
a uma propriedade opcional (`chave?: string`) sob essa flag. Corrigido com o helper
`withOptionalString(key, value)`, que só inclui a chave no objeto quando o valor é uma string não
vazia (spread condicional em vez de valor `undefined` explícito); confirmado verde na segunda rodada.

## T009 — contrato falhando da tela de faturamento (vermelho)

Escopo: workspace de faturamento passa a ter duas abas via `Tabs` do design system (a aba atual de
seleção/criação e uma nova aba de listagem de faturas); a nova tabela de faturas segue
`docs/frontend/data-tables.md` (ordenação, filtros, colunas persistidas, seleção); locales pt/en
expõem as chaves novas. Nenhum arquivo de produção foi tocado nesta task — apenas os testes.

**Decisão de escopo dos filtros:** `docs/frontend/data-tables.md` (e a regra global de frontend) pedem
filtros multi-valor por padrão, mas `GET /billing/invoices` (T007/T008, já fechado) só aceita
`status` de valor único e `customerDocument`/`invoiceNumber` exatos, sem lista nem faixa numérica —
confirmado direto em `billing.schema.ts`. A tabela de faturas é escopada aos sete filtros reais do
endpoint (`customerDocument`, `dueFrom`, `dueTo`, `invoiceNumber`, `issuedFrom`, `issuedTo`, `status`),
sem inventar multi-select ou builder E/OU que o backend não suporta. Não é uma simplificação de UI
arbitrária — é o contrato real já testado e fechado em T008. Sem novo ADR: a divergência documentada
em `docs/frontend/data-tables.md` é para tabelas que _deveriam_ ter filtro multi-valor e não têm; aqui
o próprio dado no servidor é single-value.

Arquivos de teste criados/editados:

- **Criado** `apps/frontend-transportada/test/billing/invoice-table.contract.ts` — 7 testes contra o
  módulo ainda inexistente `src/modules/billing/shared/billingInvoiceTable.service.ts`: colunas e
  chave de storage versionada; contagem de filtros ativos; serialização de query (só emite as 9 chaves
  que a API aceita — `cursor`, `customerDocument`, `dueFrom`, `dueTo`, `invoiceNumber`, `issuedFrom`,
  `issuedTo`, `limit`, `status` — e nunca uma chave fora dessa lista); ordenação por cabeçalho
  (ciclo neutro→asc→desc→neutro, comparação numérica de `totalAmount`/`invoiceNumber` e não
  lexicográfica de string); seleção por linha e por página inteira; paginação por cursor com histórico
  de volta; persistência de colunas (reorder nos limites, round-trip via storage em memória, fallback
  em storage corrompido/indisponível) reaproveitando o helper genérico
  `modules/shared/tableColumnPreferences.service.ts`.
- **Editado** `apps/frontend-transportada/test/billing/presentation-boundaries.contract.ts` — 2 novos
  testes: (a) o código-fonte de `BillingWorkspace.page.tsx` contém `Tabs`/`TabsItem` importados de
  `@/components/ui/tabs`, as chaves `tabs.create`/`tabs.invoices` e o nome `BillingInvoiceTable`; (b)
  `billingWorkspace.locale.json` e `.en.locale.json` expõem `tabs.*`/`invoices.*` com o **mesmo
  conjunto de chaves** nos dois idiomas (comparação estrutural via `collectKeyPaths`, não substring).
- **Editado** `apps/frontend-transportada/test/billing.contract.test.ts` — adicionada
  `import './billing/invoice-table.contract.js'` (entrypoint já registrado no `test` do
  `package.json`; não precisou de outra edição de registro).

Contrato público desenhado para T010 implementar (`billingInvoiceTable.service.ts`):
`BILLING_INVOICE_COLUMN_KEYS`, `BILLING_INVOICE_COLUMNS_STORAGE_KEY` (`billing.invoices.columns.v1`),
`EMPTY_BILLING_INVOICE_FILTERS`, `countActiveBillingInvoiceFilters`, `serializeBillingInvoiceQuery`,
`nextBillingInvoiceSortState`/`sortBillingInvoices`, `BILLING_INVOICE_FIRST_PAGE` +
`nextBillingInvoicePage`/`previousBillingInvoicePage`/`canGoToPreviousBillingInvoicePage`,
`toggleBillingInvoiceSelection`/`toggleAllBillingInvoiceSelection`,
`reorderBillingInvoiceColumns`/`readBillingInvoiceColumnPreferences`/`writeBillingInvoiceColumnPreferences`
(wrappers finos sobre o helper genérico de colunas).

Prova de vermelho (rodada de novo pelo coordenador para confirmar, não só reportada pelo subagente):

```
$ bun run --cwd apps/frontend-transportada test test/billing.contract.test.ts
317 pass
9 fail
1745 expect() calls
```

As 9 falhas, uma a uma:

- 7 falham com `Cannot find module '../../src/modules/billing/shared/billingInvoiceTable.service'`
  (o módulo não existe — é o que T010 cria).
- `splits the workspace into two design-system tabs...` falha em
  `expect(page).toContain('Tabs')` — a página atual não usa `Tabs`.
- `exposes the new tab and invoice-list locale keys...` falha em
  `expect(ptDictionary.tabs).toBeDefined()` — os locales não têm as chaves novas.

Gates:

```
$ bun run lint       # silencioso nas 4 apps
$ bun run typecheck  # silencioso nas 4 apps
```

Nenhum dado de tenant real usado — fixtures de fatura (`ROW_A`/`ROW_B`/`ROW_C`) são sintéticas com
CNPJ e nomes de empresa fictícios, IDs UUID versão 4 gerados para o teste.

## T010 — implementar abas, tabela de faturas e client/validation (verde)

Implementação que fecha o contrato vermelho de T009, sem alterar nenhuma asserção dos testes escritos
naquela task.

Arquivos criados:

- `src/modules/billing/shared/billingInvoiceTable.service.ts` — funções puras (colunas, filtros,
  serialização de query, ordenação numérica via `BigInt` para `totalAmount`/`invoiceNumber`, seleção
  por linha/página, paginação por cursor com histórico de volta, wrappers finos sobre
  `tableColumnPreferences.service.ts` para persistência de colunas).
- `src/modules/billing/hooks/useBillingInvoiceTable.hook.ts` — espelha `useCteItemTable.hook.ts`:
  estado de filtros/ordenação/página/seleção/colunas, query TanStack ligada a `client.listInvoices`.
- `src/modules/billing/components/BillingInvoiceTable.component.tsx` +
  `src/modules/billing/styles/billingInvoiceTable.module.css` — componente burro: filtros, cabeçalho
  ordenável, zebra via CSS module, seleção em massa, paginação, controle de colunas, todo texto via
  `t('invoices.*')`/`t('tabs.*')`.

Arquivos editados:

- `src/modules/billing/shared/billingClient.service.ts` — novo método `listInvoices`.
- `src/modules/billing/shared/billingResponse.validation.ts` — novo adaptador `invoicePageFromApi`
  reaproveitando o `invoiceFromApi` já existente por item.
- `src/modules/billing/pages/BillingWorkspace.page.tsx` — reescrita para usar `Tabs`/`TabsItem` de
  `@/components/ui/tabs`: aba `create` com todo o conteúdo anterior (filtros, tabela de elegíveis,
  formulário de criação, detalhe/cancelamento, documentos) preservado sem alteração de comportamento;
  aba `invoices` nova, renderizando `BillingInvoiceTable`.
- `src/modules/billing/locales/billingWorkspace.locale.json` e `.en.locale.json` — namespaces
  `tabs.*` e `invoices.*` com o mesmo conjunto de chaves nos dois idiomas.

Prova de verde (rodada pelo coordenador, não só reportada pelo subagente):

```
$ bun run --cwd apps/frontend-transportada test
326 pass
0 fail
1840 expect() calls
Ran 326 tests across 14 files.
```

As 9 falhas de T009 (7 de import do módulo inexistente + 1 de `Tabs` ausente + 1 de chaves de locale
ausentes) agora passam; nenhuma outra suíte do frontend regrediu (CT-e, shared, design-system, etc.
seguem com a mesma contagem de antes).

```
$ bun run lint       # silencioso nas 4 apps
$ bun run typecheck  # silencioso nas 4 apps
$ bun run --cwd apps/frontend-transportada build
✓ 319 modules transformed.
✓ built in 880ms
(aviso pré-existente de chunk > 500kB, não é erro)
```

Duas correções de tipo durante a implementação (ambas no código novo, nenhuma toca nos testes de
T009): `statusClassName` do componente precisou de template literal para não resolver
`string | undefined` sob `exactOptionalPropertyTypes` (mesmo padrão já usado em
`CteItemTable.component.tsx`); `reorderBillingInvoiceColumns` precisou ser tipado com
`BillingInvoiceColumnKey` em vez de `string` genérico, espelhando `reorderCteItemColumns`.

**Gap documentado (não bloqueia o fechamento da task):** o critério de sucesso de T010 em `tasks.md`
inclui "navegador real". Seguindo o precedente já registrado em T006 e a instrução vigente do usuário
("depois eu verifico manualmente as implementações totais pode seguir"), a verificação visual das duas
abas, da tabela nova e da paginação/seleção reais fica para a rodada manual do usuário — não foi
tentada aqui.

## T011 — spike de `pdfkit` sob Bun 1.3.14

**Decisão: fica `pdfkit`. O plano B (`pdf-lib`) não foi acionado.** O risco declarado em `plan.md`
("`pdfkit` publica CJS e carrega fontes AFM do próprio pacote") **não se materializou** — passou na
primeira tentativa, sem shim, sem patch e sem flag de compatibilidade. As duas tentativas previstas
antes da troca não foram necessárias.

Dependências novas em `apps/api-transportada`, pinadas exatas como todo o resto do `package.json`
(o `bun add` grava com caret; corrigido à mão para seguir a convenção do repo, e
`bun install --frozen-lockfile` continua limpo depois disso):

- `pdfkit` 0.19.1 (dependência)
- `@types/pdfkit` 0.17.6 (dev)

Teste: `test/billing-pdf/pdf-engine-spike.contract.ts`, entrypoint `test/billing-pdf.contract.test.ts`,
registrado no `test` do `package.json` entre `billing-infrastructure` e `freight-calculation-engine`.
O spike exercita exatamente os mecanismos de que T016/T017 dependem, não um "hello world":

- **Documento de uma página com texto e tabela** — cabeçalho `%PDF-`, trailer `%%EOF`, mais de 1000
  bytes e exatamente um objeto `/Type /Page` no conteúdo bruto.
- **Métricas AFM carregadas de verdade** — `widthOfString`/`heightOfString` devolvem número finito e
  positivo, e a string longa mede mais que a curta. É a prova direta do risco declarado: se o `.afm`
  do pacote não carregasse sob Bun, isso quebraria ou devolveria zero/NaN.
- **Quebra em várias páginas com rodapé numerado** — 120 linhas viram 4 páginas; o `bufferedPageRange()`
  bate com a contagem de objetos `/Type /Page` nos bytes, provando que o rodapé `Página X de Y` não
  criou página extra.
- **Texto chega ao content stream** — com `compress: false`, a fonte padrão `Helvetica` aparece
  embutida na saída.

```
$ bun test --cwd apps/api-transportada ./test/billing-pdf.contract.test.ts
 4 pass
 0 fail
 15 expect() calls
```

Medição concreta da geração (script descartável, 120 linhas a 16pt de altura, topo 150, limite 700):

```
{"bytes":3271,"pages":4,"rowsPerPage":35,"header":"%PDF-1.3","pdfkit":"0.19.1"}
```

Dois achados que T016/T017 herdam, e é para isso que o spike serviu:

1. **Tabela posicionada não quebra sozinha.** `text(v, x, y)` com coordenada absoluta ignora o fluxo —
   a quebra tem que ser decidida pelo cursor (`if (y > limite) addPage()`). O `invoice-layout.policy.ts`
   precisa carregar esse controle explicitamente; não dá para confiar na paginação automática do pdfkit
   como se faz com texto corrido.
2. **Rodapé exige zerar a margem inferior.** Escrever abaixo de `maxY()` dispara `addPage()` interno e
   o documento cresce sem parar. O padrão que funciona é salvar `page.margins.bottom`, zerar, escrever
   com `lineBreak: false` e restaurar — está isolado no helper `stampFooter` do spike.

Nota de dimensionamento para T017: o `spec.md` estimou ~45 linhas por página. Com altura de linha de
16pt o spike coube 35. Não é divergência de contrato, é parâmetro de layout — T017 ajusta altura de
linha e margens para chegar ao alvo, agora com a fórmula real medida em vez de estimativa.

## T012 — contrato falhando do valor por extenso (vermelho)

Arquivos: `test/billing-domain/invoice-amount-in-words.contract.ts`, entrypoint
`test/billing-domain.contract.test.ts` (novo módulo de camada `domain` para `billing`, inserido no
`test` do `package.json` entre `billing-schema` e `operations-schema`, mesma posição de camada usada
pelos demais módulos — schema → domain → application → http → infrastructure). Contrato desenhado
contra `invoiceAmountInWords(amountScaled: bigint): string` — entrada é o total já escalado em
centavos (inteiro, nunca `number`/float), casando com o padrão `parseScaledDecimal`/`bigint` do resto
do domínio (`shared/decimal.service.ts`). Quatro grupos de casos, cobrindo tudo que a task exige:

- zero e singular do "real" (`0n` → `zero reais`, `100n` → `um real`);
- centavos singular/plural e valor com centavos zerados (`101n` → `um real e um centavo`,
  `10000n`/`100000n` → `cem reais`/`mil reais`, sem cláusula de centavos quando eles são zero);
- milhar com e sem centena redonda no grupo final (`150000n` → `mil e quinhentos reais`, o "e" some
  quando o grupo final tem dezena não redonda: `123456n` → `mil duzentos e trinta e quatro reais e
cinquenta e seis centavos`);
- milhão, incluindo o conector "de" antes de "reais" quando milhão/bilhão é o último grupo não-zero
  (`100000000n` → `um milhão de reais`) e sua ausência quando outro grupo intermediário aparece
  (`123400000n` → `um milhão duzentos e trinta e quatro mil reais`, sem "de").

```
$ bun test ./test/billing-domain.contract.test.ts
error: Cannot find module '../../src/billing/domain/invoice-amount-in-words.service.js' ...
 0 pass
 1 fail
```

`bun run lint` silencioso nas 4 apps. Nenhum CNPJ/IE/valor real envolvido — é conversão numérica pura,
sem fixture de domínio fiscal.

## T013 — implementar invoice-amount-in-words.service.ts (verde)

`src/billing/domain/invoice-amount-in-words.service.ts` (161 linhas) + `invoice-amount-in-words.error.ts`
(15 linhas, `InvoiceAmountOutOfRangeError extends ApiError`, código `BILLING_INVOICE_AMOUNT_OUT_OF_RANGE`).
O limite de grupo suportado (até bilhões, índice 3) não é arbitrário: `total_amount` é
`numeric(14, 2)` (`src/database/billing.schema.ts`), então a parte inteira nunca passa de 999 bilhões —
o guard reflete uma restrição real do banco, não um caso hipotético.

Algoritmo: separa o valor em grupos de 3 dígitos (unidade/centena, milhar, milhão, bilhão), converte
cada grupo com as tabelas padrão de unidades/dezenas/centenas do português (com os casos especiais
"cem" vs "cento" e "mil" sem "um" na frente), e junta os grupos com a regra "só usa 'e' antes do
último grupo quando ele é < 100 ou é uma centena redonda" — que reproduz naturalmente tanto "mil
duzentos e trinta e quatro" (sem conector extra) quanto "mil e quinhentos" (conector antes de uma
centena redonda), sem precisar de tabela de exceções. O conector "de reais" é decidido separadamente:
só aparece quando o grupo não-zero mais baixo é milhão/bilhão (isto é, nada entre a escala e "reais").

```
$ bun test ./test/billing-domain.contract.test.ts
 4 pass
 0 fail
 15 expect() calls

$ bun run test
 1186 pass
 1 skip
 0 fail
 5477 expect() calls
Ran 1187 tests across 64 files.

$ bun run lint        # silencioso nas 4 apps
$ bun run typecheck    # silencioso nas 4 apps
```

Suíte cresceu de 1182 para 1186 pass, exatamente os 4 testes novos, em +1 arquivo (63 → 64). Nenhum
CNPJ, IE, número de nota ou XML real — a função opera sobre um `bigint` sintético.

```
$ bun run --cwd apps/api-transportada test
 1182 pass
 1 skip
 0 fail
 5462 expect() calls
Ran 1183 tests across 63 files.

$ bun run lint                            # silencioso nas 4 apps
$ bun run typecheck                       # silencioso nas 4 apps
$ bun run --cwd apps/api-transportada build   # Bundled 197 modules
$ bun install --frozen-lockfile           # Checked 599 installs, no changes
```

O `typecheck` passou sem tocar em `types` do `tsconfig.json`: mesmo com `"types": ["bun"]`, a
declaração de módulo do `@types/pdfkit` é resolvida pelo import e traz junto o namespace global
`PDFKit`. Nenhum dado real usado — o spike escreve "Transportadora Sintetica LTDA" e destinatários
numerados, sem CNPJ, IE, chave de acesso ou valor vindo de nota real.

## T014 — contrato falhando da consulta do relatório (vermelho)

Criados `test/billing-infrastructure/invoice-report.contract.ts` e
`test/billing-infrastructure/support.ts`, registrados no entrypoint já existente
`test/billing-infrastructure.contract.test.ts` (sem mudança em `package.json` — o entrypoint já estava
na lista).

Decisão de forma da linha, a partir de `spec.md` ("Densidade da tabela do PDF: uma linha por CT-e, com
número/série da NF-e na mesma linha"): a consulta devolve **uma linha por item de fatura** (= um CT-e),
já que `billing_invoice_items` tem `unique(company_id, cte_document_id)` — um CT-e pode empacotar várias
NF-e (via `cte_batch_item_documents`), então `nfeDocuments` na linha é uma lista, e peso bruto/líquido é
a soma de todas as notas empacotadas. "Valor" é ecoado do próprio `billing_invoice_items.total_amount`
(já conhecido, não precisa nova consulta); destinatário é o da primeira NF-e do pacote (mesmo CT-e, um
único destinatário na prática). `nfe_addresses` citada em `spec.md` não entra na forma da linha: nenhum
campo de endereço está no critério de aceite de T014/T015 (só CNPJ e nome), então nenhum join é feito
para dado que a linha não expõe — evita join sem uso.

Contrato cobre dois grupos:

- **Isolamento de tenant** (`PgDialect().sqlToQuery()`, sem banco): cada um dos 6 filter-builders
  (`buildInvoiceItemFilters`, `buildCteDocumentFilters`, `buildItemDocumentFilters`,
  `buildNfeDocumentFilters`, `buildRecipientFilters`, `buildVolumeFilters`) prova `company_id` no SQL
  gerado antes de qualquer outro filtro.
- **Forma do relatório** (stub de query builder em memória, mesmo padrão de
  `test/cte-issuance-infrastructure/support.ts`): soma peso de várias linhas de `nfe_volumes` de uma
  mesma nota; agrupa duas NF-e de um mesmo CT-e na mesma linha preservando a ordem de
  `cte_batch_item_documents.position`; nota sem nenhuma linha em `nfe_volumes` contribui peso zero sem
  quebrar a soma; fatura sem item devolve lista vazia.

Fixture sintética: UUIDs `00000000-…-0009xx`, CNPJs de teste (`112223330001xx`/`445556660001xx`, dígito
verificador não validado — mesmo padrão já usado em `cte-issuance-infrastructure/support.ts`), nomes
fictícios "DESTINATARIO ALFA/BRAVO LTDA". Nenhum CNPJ, número de nota ou chave de acesso real.

```
$ bun test ./test/billing-infrastructure.contract.test.ts
error: Cannot find module '../../src/billing/infrastructure/invoice-report.query.js' from
'.../test/billing-infrastructure/invoice-report.contract.ts'
 0 pass
 1 fail
Ran 1 test across 1 file.

$ bun run lint   # silencioso nas 4 apps
```

Vermelho por módulo inexistente, como esperado antes de T015 implementar `invoice-report.query.ts`.

## T015 — implementar invoice-report.query.ts (verde)

Criado `src/billing/infrastructure/invoice-report.query.ts`. Orquestração em 3 ondas, seguindo o mesmo
padrão de `cte-issuance-payload.query.ts`: (1) `billing_invoice_items` da fatura, ordenado por
`line_number`; (2) em paralelo, `cte_fiscal_documents` (emissão/número/série) e
`cte_batch_item_documents` (quais NF-e cada item empacota, ordenado por `position`); (3) com os ids de
NF-e resultantes, em paralelo, `nfe_documents` (número/série), `nfe_participants` filtrado por
`role='recipient'` e `nfe_volumes`. Peso é somado em `bigint` escalado
(`parseScaledDecimal`/`formatScaledDecimal` com `MONEY_SCALE = 4n`, a mesma escala de
`nfe_volumes.gross_weight`/`net_weight`) — nunca em `number`/float. Nota sem nenhuma linha em
`nfe_volumes` simplesmente não aparece no `Map` de pesos, e `sumWeights` trata ausência como `0n`, sem
`if` especial — "nota sem `<vol>`" não é um caso de erro, é ausência de linha.

Teste de isolamento de tenant: os 6 filter-builders (`buildInvoiceItemFilters`, `buildCteDocumentFilters`,
`buildItemDocumentFilters`, `buildNfeDocumentFilters`, `buildRecipientFilters`, `buildVolumeFilters`) já
escritos no T014 vermelho passam a verde, cada um provando `company_id` como primeiro filtro do SQL
gerado por `PgDialect().sqlToQuery()` — sem tocar em banco real.

```
$ bun test ./test/billing-infrastructure.contract.test.ts
 16 pass
 0 fail
 55 expect() calls
Ran 16 tests across 1 file.

$ bun run --cwd apps/api-transportada test
 1196 pass
 1 skip
 0 fail
 5515 expect() calls
Ran 1197 tests across 64 files.

$ bun run lint        # silencioso nas 4 apps
$ bun run typecheck    # silencioso nas 4 apps
```

Suíte foi de 1186 para 1196 pass (+10 — os testes novos de `invoice-report.contract.ts`; total de
arquivos permanece 64, o arquivo já estava registrado desde T014). Nenhum dado real: fixture reaproveita
os UUIDs sintéticos e CNPJs de teste do T014.

## T016 — contrato falhando do layout do PDF (vermelho → verde)

Criados `test/billing-domain/invoice-layout.contract.ts` (entrypoint já existente
`test/billing-domain.contract.test.ts`, já registrado no `test` do `package.json` — só ganhou o novo
`import`), `src/billing/domain/invoice-layout.policy.ts` e `src/billing/domain/invoice-layout.error.ts`.

**Escopo da task, decidido a partir do texto do aceite:** o critério de T016 fala em "fatura longa
quebra repetindo cabeçalho da transportadora, bloco da fatura e cabeçalho da tabela, com `Página X de
Y`" — mas repetir cabeçalho/rodapé é responsabilidade de **renderização** (pdfkit), que é do
`invoice-pdf.gateway.ts` da T017, não da camada `domain` (regras puras, sem I/O, por `CLAUDE.md`). O que
a `domain` pode e deve garantir sem tocar em pdfkit é a **decisão de paginação**: quantas páginas, quais
linhas em cada uma, numeradas sequencialmente — dado que é exatamente o que `invoice-pdf.gateway.ts`
vai consumir para repetir os cabeçalhos por página. `buildInvoiceLayout({hasFiscalProfile, rows,
rowsPerPage})` devolve `{pageCount, pages: [{pageNumber, rows}]}`; `rowsPerPage` fica como parâmetro
externo (não hardcoded) porque a métrica real de linhas por página depende de medição de fonte do
pdfkit (T011 mediu 35 no spike, `spec.md` estimou ~45) — cálculo que pertence à T017, não à `domain`.

**Perfil fiscal ausente:** a policy recebe `hasFiscalProfile: boolean`, não o objeto de perfil inteiro —
a decisão de layout só precisa saber se existe ou não; o formato de `company_fiscal_profiles` (usado no
cabeçalho impresso) é assunto do gateway em T017. Mantém a `domain` sem depender de tipo de
infraestrutura.

Contrato cobre os quatro casos do aceite:

- fatura curta (10 linhas, `rowsPerPage=45`) → `pageCount === 1`, uma página com as 10 linhas;
- fatura longa (90 linhas) → `pageCount === 2`, `pageNumber` sequencial `[1, 2]`, 45 linhas em cada;
- soma das linhas de todas as páginas (`flatMap` + `parseScaledDecimal`/`formatScaledDecimal` com
  `FISCAL_MONEY_SCALE = 2n`, a escala de `billing_invoices.total_amount`) bate com a soma das linhas
  originais, para uma fatura de 97 linhas que não divide exato por 45 — prova que nenhuma linha se perde
  ou duplica no corte;
- `hasFiscalProfile: false` lança `InvoiceFiscalProfileMissingError` (`extends ApiError`, código
  `BILLING_INVOICE_FISCAL_PROFILE_MISSING`, status 422) — erro de domínio nomeado, não uma condição
  genérica.

Vermelho confirmado revertendo temporariamente os dois arquivos de implementação (`mv` para fora de
`src/billing/domain/`) antes de escrevê-los de fato — não foi só ausência inicial de arquivo, foi uma
checagem deliberada de que o teste falha pela razão certa:

```
$ bun test test/billing-domain.contract.test.ts
error: Cannot find module '../../src/billing/domain/invoice-layout.error.js' from
'.../test/billing-domain/invoice-layout.contract.ts'
 0 pass
 1 fail
 1 error
Ran 1 test across 1 file.
```

Implementação restaurada, `buildInvoiceLayout` faz early-return por page splitting simples
(`Array.slice` em passos de `rowsPerPage`, sem `if` de paginação incompleta — array vazio já cai no
caso de uma página com zero linhas por construção, sem branch dedicado):

```
$ bun test test/billing-domain.contract.test.ts
 8 pass
 0 fail
 29 expect() calls
Ran 8 tests across 1 file.

$ bun run test
 1200 pass
 1 skip
 0 fail
 5529 expect() calls
Ran 1201 tests across 64 files.

$ bun run lint        # silencioso nas 4 apps
$ bun run typecheck    # silencioso nas 4 apps
```

Suíte foi de 1196 para 1200 pass (+4 — os testes novos de `invoice-layout.contract.ts`; total de
arquivos permanece 64, o entrypoint `billing-domain.contract.test.ts` já estava registrado desde T012).
Nenhum dado real: linhas são sintéticas (`{totalAmount: '10.50'}` repetido), sem CNPJ, IE, chave de
acesso ou nome de empresa.

## T017 — gateway pdfkit do PDF da fatura (vermelho → verde)

Contratos escritos antes da implementação e confirmados vermelhos juntos — o de domínio por causa da
reestruturação do layout, o do gateway por ausência do arquivo:

```
$ bun test test/billing-domain.contract.test.ts test/billing-pdf.contract.test.ts
SyntaxError: Export named 'INVOICE_TABLE_COLUMNS' not found in module
  '.../src/billing/domain/invoice-layout.policy.ts'
error: Cannot find module '.../src/billing/infrastructure/invoice-pdf.gateway.js'
 0 pass
 2 fail
 2 errors
```

### Decisões de escopo

**`profile: InvoiceLayoutProfile | null` no lugar de `hasFiscalProfile: boolean`.** T016 fechou com um
booleano placeholder porque o layout ainda não sabia de onde o cabeçalho sairia. T017 conhece
`company_fiscal_profiles`, então a política passou a receber o perfil inteiro e a montar
`carrier.legalName/tradeName/taxLine/addressLine/contactLine`. Os quatro casos de aceite de T016
continuam valendo sem alteração de intenção.

**`totalInWords` saiu de `invoice.fields` para o topo de `InvoiceLayout`.** O bloco da fatura repete em
toda página; o valor por extenso é impresso uma única vez. Manter o extenso dentro do bloco repetido
faria o texto aparecer N vezes. O contrato cobre os dois lados: `countOccurrences(content, 'FATURA')`
é igual a `pageCount`, e `'mil duzentos e trinta e quatro reais'` é exatamente 1.

**Cabeçalho repetido = transportadora + fatura + tomador + cabeçalho da tabela.** É um superconjunto do
mínimo da spec, escolhido para que toda página tenha a mesma capacidade de linhas
(`INVOICE_PDF_ROWS_PER_PAGE = 43`) e a quebra seja aritmética, não dependente de qual página é.

**`rowsPerPage` continua injetado no domínio.** A política decide _paginação_; quem sabe métrica de
fonte é o gateway. O valor 43 vem da geometria A4 do gateway: `TABLE_TOP = 186`,
`TABLE_ROW_HEIGHT = 12`, última linha terminando em 702pt, bem acima do rodapé em 814pt — o bloco de
fechamento cabe mesmo com a página cheia.

### Duas descobertas empíricas (medidas, não presumidas)

**1. O pdfkit não grava texto legível em bytes crus.** O texto vai em hex dentro de arrays `TJ` e é
quebrado por kerning das métricas AFM:

```
[<5452414e53504f52> 30 <54> 120 <41444f52412053494e544554494341204c> 110 <5444> 40 <41> 0] TJ
```

Todas as 9 strings sondadas deram 0 ocorrência em `bytes.toString('latin1')`. O contrato passou a usar
`extractDrawnText()`, que remonta cada `TJ` descartando os ajustes de kerning — é o que permite afirmar
que o cabeçalho foi _desenhado_, não só que o arquivo é um PDF válido. O gateway aceita
`{compress?: boolean}` (padrão `true`) para o teste poder ler o content stream, seguindo o precedente de
injeção opcional de `createCteDocumentDownloadGateway({storage, expiresInSeconds?, now?})`.

**2. Bytes de PDF não são reprodutíveis.** Duas sondagens com a mesma entrada e `info.CreationDate`
fixado deram buffers diferentes; o diff isola a diferença no trailer `/ID [<hex> <hex>]`, que o pdfkit
regenera aleatoriamente a cada render. **Consequência para T018:** o `sha256` gravado em
`billing_invoice_documents` não pode ser usado como chave de idempotência por regeração — repetir a
chamada tem que devolver o documento já arquivado, nunca re-renderizar e comparar hash.

### Verificação

```
$ bun test test/billing-domain.contract.test.ts test/billing-pdf.contract.test.ts
 27 pass
 0 fail
 84 expect() calls

$ bun run test
 1215 pass
 1 skip
 0 fail
 5569 expect() calls
Ran 1216 tests across 64 files.

$ bun run lint        # silencioso nas 4 apps
$ bun run typecheck    # silencioso nas 4 apps
```

Suíte foi de 1200 para 1215 pass (+15: 7 do `invoice-pdf-gateway.contract.ts` novo e 8 do
`invoice-layout.contract.ts` reescrito). O entrypoint `billing-pdf.contract.test.ts` já estava
registrado no `package.json` desde T011 e passou a importar a suíte nova.

Conferência visual: PDF de 45 linhas renderizado fora do repositório e inspecionado página a página —
cabeçalho da transportadora, bloco FATURA e bloco TOMADOR repetem nas duas páginas; a coluna
Destinatário trunca com reticências sem invadir a coluna seguinte; total, valor por extenso e
OBSERVAÇÕES saem uma única vez ao fim da última página; rodapé traz `Fatura 42 · Impresso em
30/07/2026` à esquerda e `Página X de 2` à direita, sem página extra.

Nenhum dado real: perfil, tomador e linhas são sintéticos, sem CNPJ, IE, chave de acesso, razão social
ou número de nota reais.

### Lacuna aberta (fora do escopo de T017)

`spec.md` prevê campo opcional `observations` no `POST /billing/invoices`, mas **não existe coluna
`observations` em `billing_invoices`** e nenhuma task do `tasks.md` a cria. O gateway recebe
`observations` como entrada de renderização e já trata string vazia (não desenha o bloco). Persistir a
observação exige migration + campo no POST — precisa virar task antes de a tela poder editá-la.

## T018 — `POST /billing/invoices/:id/documents` (arquiva, registra, idempotente)

### Contrato antes da implementação (vermelho)

```bash
$ cd apps/api-transportada && bun test ./test/billing-application.contract.test.ts
error: Cannot find module '../../src/billing/application/invoice-document.use-case.js'

$ bun test ./test/billing-infrastructure.contract.test.ts
error: Cannot find module '../../src/billing/infrastructure/invoice-document-archive.gateway.js'

$ bun test ./test/billing-http.contract.test.ts
(fail) gera o PDF ... Expected: 200  Received: 404
(fail) exige a permissão billing.create  Expected: 403  Received: 404
(fail) propaga o erro de perfil fiscal  Expected: 422  Received: 404
 14 pass  3 fail
```

O 404 nos três casos HTTP prova que a rota `POST` não existia — o roteador só conhecia o `GET`
homônimo.

### Cadeia de teste registrada

- `test/billing-application/invoice-document.contract.ts` (8 testes) → importada em
  `test/billing-application.contract.test.ts`
- `test/billing-infrastructure/invoice-document.contract.ts` (5 testes de isolamento de tenant) →
  importada em `test/billing-infrastructure.contract.test.ts`
- 3 testes novos em `test/billing-http/documents-and-cancel.contract.ts` (entrypoint já registrado)

Os três entrypoints já constavam da lista explícita do `package.json`.

### Isolamento de tenant (obrigatório — a task mexe em query)

`drizzle-invoice-document.repository.ts` exporta `buildDocumentInvoiceFilters`,
`buildDocumentFiscalProfileFilters`, `buildInvoiceDocumentFilters` e
`buildInvoiceDocumentListFilters`; o contrato compila cada um com
`new PgDialect().sqlToQuery(and(...filters)!)` e exige `"<tabela>"."company_id" = $` no SQL e o
`companyId` do contexto na primeira posição de `query.params`. O quinto teste prende
`buildBillingDocumentObjectKey` ao prefixo `tenants/<companyId>/billing-invoices/<invoiceId>/` — um
bucket compartilhado sem prefixo por tenant é justamente o vazamento que o contrato barra.

### Verificação final

```bash
$ bun run --cwd apps/api-transportada test
 1232 pass
 1 skip
 0 fail
 5628 expect() calls
Ran 1233 tests across 64 files.

$ bun run lint        # silencioso nas 4 apps
$ bun run typecheck   # silencioso nas 4 apps
```

Suíte foi de 1215 para 1232 pass (+17: 8 de aplicação, 5 de infraestrutura, 3 de HTTP, 1 do
`list` já coberto).

### O que cada garantia prova

- **Arquiva com `sha256`** — `archive.puts` recebe o digest calculado sobre os bytes renderizados, e
  `stored_objects` grava `purpose: 'billing_document'`, `status: 'final'`, mesmo `sha256` e
  `sizeBytes`.
- **Registra em `billing_invoice_documents`** — insert com `(companyId, invoiceId, documentKind,
documentVersion)`, os quatro campos do unique da tabela.
- **Emite `document_generated`** — dentro da mesma transação do insert; payload leva `documentId`,
  `documentKind`, `documentVersion`, `pageCount` e `sha256`.
- **Falha emite `document_failed`** — emitido **fora** da transação, para sobreviver ao rollback; o
  teste de falha do storage confirma zero linha em `billingInvoiceDocuments`/`storedObjects` e o
  evento presente. Empresa sem perfil fiscal cai no mesmo caminho com
  `BILLING_INVOICE_FISCAL_PROFILE_MISSING` (422) e zero `put`.
- **Repetir não duplica** — o segundo `generate` devolve o documento já arquivado sem renderizar:
  `renderer.calls` permanece em 1. Isso é deliberado: os bytes do pdfkit **não são reprodutíveis**
  (o `/ID` do trailer muda a cada render mesmo com `CreationDate` fixo), então `sha256` não serve de
  chave de idempotência por regeneração — o corte tem de acontecer antes de renderizar.
- **Corrida perdida** — `createInvoiceDocument` usa `onConflictDoNothing().returning()`; `null` levanta
  o `InvoiceDocumentRaceError` privado, a transação desfaz tudo que o perdedor escreveu e o vencedor é
  relido fora dela. O teste prova `repository.documents` vazio e o `documentId` do vencedor na resposta.
- **`GET …/documents` com URL assinada real** — o fallback `emptyDocumentPage()` foi removido e a rota
  passou a depender do use case; `JSON.stringify(page)` não contém `objectKey`.
- **Fronteira de tenant no 404** — fatura de outra empresa retorna `BILLING_INVOICE_NOT_FOUND` com
  `renderer.calls` e `events` zerados: uma sondagem cruzada não deixa rastro de auditoria.

### Decisões registradas

- **`POST` responde 200, não 201.** O corpo é idêntico quer a chamada tenha renderizado o PDF, quer
  tenha achado o já arquivado (`expect(second).toEqual(first)`); 200 é o único status que não mente nos
  dois casos, e é o que a regra de idempotência manda quando o `POST` encontra o recurso existente.
- **Política `billing.create`** (e não uma permissão nova) para não exigir mudança na allowlist
  `COMPANY_PERMISSIONS` do frontend.

Nenhum dado real em teste ou fixture: `company-001`, `billing-invoice-001` e um PDF sintético de duas
linhas (`%PDF-1.3 documento sintetico de fatura`).

### Lacuna herdada de T017 (ainda aberta)

`billing_invoices` continua sem coluna `observations`; o repositório fornece `''` ao use case
(constante `INVOICE_OBSERVATIONS`, comentada no arquivo). Persistir a observação segue precisando de
migration + campo no `POST /billing/invoices`.

### Dívida de formatação (pré-existente, fora de T018)

`bun run format:check` acusa 24 arquivos com drift, a maioria criada em tasks anteriores desta feature
e no frontend. Formatei apenas os 5 arquivos que toquei nesta task; os demais seguem pendentes e vão
fazer o `make check` falhar até alguém rodar `bunx prettier --write` na árvore.

## T019 — ação de gerar/baixar o PDF na listagem de faturas (vermelho → verde)

### Vermelho primeiro

Suíte nova `apps/frontend-transportada/test/billing/document-generation.contract.ts`, registrada na
cadeia explícita (`import './billing/document-generation.contract.js'` em
`test/billing.contract.test.ts`, que já constava no `test` do `package.json`).

```
$ bun test apps/frontend-transportada/test/billing.contract.test.ts
 16 pass
 8 fail
 166 expect() calls
Ran 24 tests across 1 file. [86.00ms]
```

As 8 falhas eram `client.generateDocument is not a function`,
`resolveBillingDocumentMessageKey is not a function`, `resolveBillingDocumentActionState is not a
function`, âncoras ausentes no hook e no componente, e as chaves `invoices.documentAction.*` ausentes
nos dois locales.

### Verde

```
$ bun test apps/frontend-transportada/test/billing.contract.test.ts
 24 pass
 0 fail
 211 expect() calls
```

### Gates

```
$ bun run --cwd apps/frontend-transportada test
 335 pass · 0 fail · 1891 expect() calls · 14 arquivos

$ bun run --cwd apps/api-transportada test
 1232 pass · 1 skip · 0 fail · 5628 expect() calls · 64 arquivos

$ bun run lint          # api + worker + cron + frontend, --max-warnings=0
$ bun run typecheck     # tsc --noEmit nas 4 apps
$ bun run --cwd apps/frontend-transportada build   # ✓ built in 945ms + PWA (11 entradas)
```

### O que os testes provam

- **Requisição** — `generateDocument` emite `POST {apiUrl}/billing/invoices/{id}/documents` com
  `authorization: Bearer …`, `cache: 'no-store'` e **corpo vazio** (nenhum `companyId` no payload; a
  empresa vem do contexto autenticado), devolvendo o documento validado.
- **Resposta hostil** — payload com `storageKey` extra é rejeitado com `BILLING_INVALID_DOCUMENTS_RESPONSE`;
  a chave interna do storage nunca vira estado de tela.
- **Erro por código** — `requestJson` passou a ler `error.code` do envelope. Os quatro códigos
  alcançáveis (`BILLING_INVOICE_FISCAL_PROFILE_MISSING` 422, `BILLING_INVOICE_NOT_FOUND` 404,
  `BILLING_INVOICE_DOCUMENT_CONFLICT` 409, `FORBIDDEN` 403) chegam verbatim ao chamador; 502 sem JSON
  e `fetch` rejeitado viram `BILLING_REQUEST_FAILED`. `getInvoice` ganhou o mesmo comportamento.
- **Mensagem traduzida, nunca crua** — `resolveBillingDocumentMessageKey` mapeia cada código para
  `invoices.documentAction.errors.*` e cai em `…errors.unknown` para código desconhecido, `null` e
  mensagem que carregue caminho de storage.
- **Estado de carregamento** — `resolveBillingDocumentActionState` é função pura: só a linha em voo
  fica `isPending`, e enquanto uma geração roda **todas** as linhas ficam `isDisabled` (uma geração por
  vez). Sem permissão `billing.create`, o botão nasce desabilitado.
- **Download** — o controller abre exclusivamente `downloadUrl` e levanta `BILLING_INVALID_DOCUMENT`
  para qualquer outra forma.
- **Paridade de locales** — pt e en têm exatamente o mesmo conjunto de chaves, com âncoras em
  `documentAction.{generate,generating,columnHeader}` e nos cinco `documentAction.errors.*`.

### Correção de contrato API↔frontend (achada nesta task)

`presentDocument` devolvia `documentType: record.documentKind` — ou seja `'pdf'`, o valor do enum
interno. Mas o adaptador do frontend (`mapDocument`) exige `'invoice_pdf'`, e a própria fixture HTTP da
API (`test/fixtures/billing-http.fixture.ts:155`) e os dois smokes do frontend já assumiam
`'invoice_pdf'`. Com o valor antigo, todo `POST` bem-sucedido seria descartado pelo validador do
cliente e o PDF nunca abriria. Corrigido no lado da API — o contrato público não deve vazar o enum
interno — derivando `documentType: \`invoice\_${record.documentKind}\``, e as duas asserções de
`test/billing-application/invoice-document.contract.ts`foram atualizadas para`'invoice_pdf'`.

### Decisões registradas

- **`billing.create` governa o botão**, coerente com a política escolhida em T018 — nenhuma permissão
  nova, nenhuma mudança na allowlist `COMPANY_PERMISSIONS` do frontend.
- **Uma geração por vez.** Com `pendingDocumentInvoiceId` não-nulo, todas as linhas desabilitam. É o
  que evita disparar N renderizações de PDF em paralelo a partir de uma tabela de 25 linhas.
- **Estado de carregamento como função pura**, não só asserção de texto-fonte: o teste exercita o
  comportamento (linha em voo × demais linhas × sem permissão), não a aparência do JSX.
- **Extensão do `billingDocumentDownload.service.ts`** em vez de arquivo novo: gerar, baixar e mapear
  erro são o mesmo conceito (a ação de documento da fatura) e o arquivo continua com 47 linhas.

Nenhum dado real: `billing-invoice-001`, token sintético e mensagem `Falha sintetica de contrato`.

### Pendente de verificação manual

"PDF real aberto no navegador" (critério de sucesso da task) depende de stack de pé com certificado e
storage — fica para a rodada de verificação manual do usuário. Os gates automatizados cobrem tudo que
é verificável sem infra.

### Dívida de formatação (pré-existente, fora de T019)

`bunx prettier --check` ainda acusa 6 arquivos de billing com drift criado em tasks anteriores
(`BillingWorkspace.page.tsx`, `invoice-amount-in-words.service.ts`, `drizzle-billing.repository.ts`,
`invoice-pdf.gateway.ts`, `invoice-report.query.ts`, `test/billing/invoice-table.contract.ts`).
Formatei apenas os arquivos que toquei nesta task.

## T020 — contrato falhando de `POST /cte-batches/items/export` (vermelho)

Três suítes novas, todas registradas em entrypoints que já estavam na lista `test` do `package.json`
(sem mudança no `package.json`):

- `test/cte-issuance-application/export.contract.ts` → `test/cte-issuance-application.contract.test.ts`
- `test/cte-issuance-http/export.contract.ts` → `test/cte-issuance-http.contract.test.ts`
- `test/cte-issuance-schema/export-query-tenant-safety.contract.ts` → `test/cte-issuance-schema.contract.test.ts`

`test/fixtures/cte-issuance-http.fixture.ts` ganhou a dependência `cteExport.exportDocuments`,
o array `exportCalls`, o parâmetro `exportError` e o construtor `exportItemsRequest()` — que
deliberadamente **não** manda `idempotency-key`, provando que exportar é leitura e não pode exigir
chave de idempotência. As 17 asserções das suítes HTTP já existentes continuam verdes com a fixture
estendida.

### Decisões de contrato tomadas aqui

- **Caminho estático não é sombreado.** `matchRoute` (`src/http/router.service.ts:143`) resolve rota
  totalmente estática **antes** de qualquer candidata dinâmica, então `POST /cte-batches/items/export`
  não cai em `POST /cte-batches/:id/issue` com `id="items"`. O contrato fixa isso explicitamente
  (`issueCalls` tem de ficar vazio).
- **Corpo aceita `filters` (mesma forma da listagem) e `itemIds`.** A listagem não tem filtro por id,
  e T022 exige "exportar a seleção" além de "exportar tudo que o filtro alcança" — os dois modos
  precisam caber no mesmo endpoint. Corpo estrito: chave desconhecida (inclusive `companyId`) é 400.
- **Policy `cte.submit`**, a mesma da listagem de itens e do download de documento por item — exportar
  em lote não concede acesso a nada que a tela já não mostre item a item.
- **Teto e vazio como 422 com código estável:** `CTE_EXPORT_LIMIT_EXCEEDED` e `CTE_EXPORT_EMPTY`. O
  use-case pede `CTE_EXPORT_MAX_DOCUMENTS + 1` documentos justamente para detectar o estouro sem
  materializar a coleção inteira.
- **Nome da entrada do ZIP é `<chaveDeAcesso>.xml`**, montado no use-case a partir da chave devolvida
  pela consulta — não do nome do objeto no storage.
- **Isolamento de tenant:** `buildCteExportFilters` (a implementar em
  `src/cte-issuance/infrastructure/cte-export-selection.query.ts`) tem de manter `company_id` como
  primeira condição em todos os quatro cenários — sem filtro, com filtros da listagem, com seleção
  explícita de itens e na restrição a documento autorizado.

Fixtures sintéticas: UUIDs `00000000-…-0007xx`/`0008xx`/`0009xx` e chave de acesso derivada de
sequencial (`'0'.repeat(40)` + 4 dígitos). Nenhum CNPJ, chave de acesso, número de nota ou XML real.

```
$ bun run --cwd apps/api-transportada test ./test/cte-issuance-application.contract.test.ts \
    ./test/cte-issuance-http.contract.test.ts ./test/cte-issuance-schema.contract.test.ts

test/cte-issuance-application.contract.test.ts:
error: Cannot find module '../../src/cte-issuance/application/export-cte-documents.port.js' from
'.../test/cte-issuance-application/export.contract.ts'

test/cte-issuance-http.contract.test.ts:
(fail) CT-e XML export HTTP contract > devolve o arquivo ZIP com nome de download      # 404, esperado 200
(fail) CT-e XML export HTTP contract > não é capturada pela rota de transmissão do lote
(fail) CT-e XML export HTTP contract > aceita os mesmos filtros da listagem
(fail) CT-e XML export HTTP contract > aceita a seleção explícita de itens
(fail) CT-e XML export HTTP contract > deriva a empresa do contexto autenticado e ignora companyId do corpo
(fail) CT-e XML export HTTP contract > rejeita filtro desconhecido e lista combinada com faixa
(fail) CT-e XML export HTTP contract > propaga o 422 de teto excedido com código estável
(fail) CT-e XML export HTTP contract > propaga o 422 de filtro sem documento autorizado
(fail) CT-e XML export HTTP contract > exige a permissão de transmissão de CT-e

test/cte-issuance-schema.contract.test.ts:
error: Cannot find module '../../src/cte-issuance/infrastructure/cte-export-selection.query.js' from
'.../test/cte-issuance-schema/export-query-tenant-safety.contract.ts'

 17 pass
 11 fail
 2 errors
Ran 28 tests across 3 files.

$ bun run lint   # silencioso nas 4 apps
$ bunx prettier --check <os 4 arquivos tocados>   # All matched files use Prettier code style!
```

`exige autenticação antes de qualquer leitura` já passa em vermelho porque a autenticação roda antes de
`matchRoute` — é a asserção que garante que a rota nova não vai abrir buraco de auth ao ser criada.

`typecheck` não roda verde nesta task por construção (os módulos `export-cte-documents.port.ts`,
`export-cte-documents.use-case.ts` e `cte-export-selection.query.ts` só nascem em T021), mesmo padrão
já registrado em T014.

## T021 — use-case, consulta e `cte-archive.gateway.ts` do ZIP em stream (verde)

Implementação que fecha o contrato vermelho de T020, em oito arquivos:

- `src/cte-issuance/domain/cte-export.error.ts` — `CteExportLimitExceededError`
  (`CTE_EXPORT_LIMIT_EXCEEDED`, 422) e `CteExportEmptyError` (`CTE_EXPORT_EMPTY`, 422).
- `src/cte-issuance/application/export-cte-documents.port.ts` — `CTE_EXPORT_MAX_DOCUMENTS = 500`,
  `CTE_EXPORT_CONTENT_TYPE`, e os tipos de seleção/arquivo. `CteExportFilters` é o mesmo
  `CompanyCteItemFilters` da listagem (application → application, sem depender da apresentação).
- `src/cte-issuance/application/export-cte-documents.use-case.ts` — pede
  `CTE_EXPORT_MAX_DOCUMENTS + 1` documentos para detectar o estouro sem materializar a coleção,
  nomeia cada entrada com `${accessKey}.xml` e devolve `cte-xml-AAAAMMDD-HHMMSS.zip`.
- `src/cte-issuance/infrastructure/cte-export-selection.query.ts` — `buildCteExportFilters` e o
  executor com `innerJoin` de `cte_fiscal_documents` e `stored_objects`.
- `src/cte-issuance/infrastructure/cte-archive.gateway.ts` — ZIP em stream com `fflate`.
- `src/cte-issuance/presentation/cte-export.schema.ts` — corpo estrito, sem `companyId`.
- `src/cte-issuance/presentation/cte-issuance.routes.ts` — rota `POST /cte-batches/items/export`.
- `src/main.ts` — ligação no composition root.

Decisões registradas:

1. **`fflate` sem custo novo de supply chain (§4 de segurança, §12 do code-standart).** `fflate@0.8.3`
   já estava no `bun.lock` via `apps/worker-transportada`; a API declara a mesma versão exata, então
   `bun install` fechou com `no changes`. O fallback de ZIP store-mode escrito à mão previsto no
   `plan.md` não foi necessário.
2. **Modo `store`, não `deflate`.** `ZipDeflate` comprime de forma síncrona e travaria o event loop do
   `Bun.serve` com centenas de XMLs; `AsyncZipDeflate` abriria um worker por arquivo (até 500). O ZIP
   sai sem compressão e o ganho fica no `content-encoding` do transporte.
3. **Um objeto por vez, de propósito.** `appendEntries` percorre as entradas sequencialmente com
   `await` dentro do laço — o oposto da regra geral de `Promise.all`, porque paralelizar aqui
   materializaria a coleção inteira em memória, que é exatamente o que a task proíbe.
4. **`context` do use-case estreitado para `{ companyId }`.** A aplicação não precisa de permissão —
   quem decide é a `policy` da rota (`cte.submit`) —, e isso alinha com `ListCompanyCteItemsInput` do
   módulo de lotes.
5. **`parseCteBatchItemFilters` extraído** de `cte-batch.schema.ts` e lido por `(key) => string | null`,
   para query string da listagem e corpo JSON da exportação passarem pela **mesma** validação. Filtro
   divergente entre as duas entradas exportaria coisa diferente do que a tela mostra.

Correção de uma premissa errada do contrato vermelho de T020: a asserção
`"cte_fiscal_documents"."access_key" is not null` foi retirada do teste de tenant safety. `access_key`
é `not null` na tabela, então o predicado seria tautológico; quem garante "só entra item com chave de
acesso" é o `innerJoin` do documento fiscal (a listagem usa `leftJoin`, e é de lá que vem a chave
nula). O teste passou a se chamar `só alcança documento autorizado e não cancelado`, com o motivo no
próprio arquivo.

Teste novo (não previsto em T020, mas necessário: sem ele o gateway de ZIP não teria nenhuma prova):
`test/cte-issuance-infrastructure/cte-archive.contract.ts`, registrado em
`test/cte-issuance-infrastructure.contract.test.ts`. Ele monta o arquivo, **reabre com `unzipSync`** e
confere nome e conteúdo de cada entrada; prova que só há um stream aberto por vez
(`maxOpenStreams() === 1`); e prova que falha do storage interrompe o fluxo em vez de entregar ZIP
truncado. Entradas sintéticas (chave derivada de sequencial, XML `<cteProc sequencia="N">`), sem dado
fiscal real.

```
$ bun run --cwd apps/api-transportada test
 1257 pass
 1 skip
 0 fail
 5697 expect() calls
Ran 1258 tests across 64 files. [614.00ms]

$ bun run lint        # silencioso nas 4 apps
$ bun run typecheck   # silencioso nas 4 apps
$ bun run --cwd apps/api-transportada build
Bundled 213 modules in 18ms
  main.js  0.84 MB  (entry point)

$ bunx prettier --check <os 13 arquivos tocados>
All matched files use Prettier code style!
```

O que isso prova: as três suítes vermelhas de T020 (110 testes em application + schema + http) passaram
a verde sem alterar as asserções, exceto a correção da premissa do `access_key` acima; o ZIP gerado é
lido de volta por um descompactador independente; e o gate completo da API (teste + lint + typecheck +
build) segue verde.

Fica fora desta task e sem evidência: a consulta nova não foi exercida contra Postgres real — a prova
aqui é de SQL construído (`PgDialect.sqlToQuery`), como nas demais tasks de query desta feature. Um
`test/integration/cte-export-selection.integration.ts` seria o próximo degrau se a exportação der
divergência em ambiente.

## T022 — ações de exportar XML na tela de CT-es (vermelho → verde)

Contrato novo `apps/frontend-transportada/test/cte-batch/item-export.contract.ts` (6 testes),
registrado em `test/cte-batch.contract.test.ts`, que já está na lista explícita do `test` do
`package.json` da app. O que ele fixa:

1. `serializeCteExportFilters` traduz o estado da tabela no corpo que a API aceita, e **sempre** emite
   `statusIn: ['authorized']`. Isso não é detalhe de implementação: os chips da listagem escondem
   `authorized` por padrão (`CTE_ITEM_DEFAULT_HIDDEN_STATUSES`), então repassar o recorte da tela
   devolveria `422 CTE_EXPORT_EMPTY` em toda exportação. O teste também confere que nenhuma chave sai
   fora da allowlist de `exportFiltersSchema` — o schema da API é `strict`, chave desconhecida é 400.
2. `buildCteExportRequest` monta `{itemIds}` no escopo de seleção e `{filters}` no escopo do filtro, e
   `expect(Object.keys(body)).not.toContain('companyId')` nos dois — a empresa vem do contexto
   autenticado, nunca do cliente. Seleção vazia e seleção acima de 500 falham **antes** da rede, com
   os mesmos códigos que a API usaria.
3. `canExportCteSelection` exige `cte.submit` e seleção dentro do teto.
4. `exportCompanyItems` faz `POST /cte-batches/items/export` com `Bearer` e `application/json`, lê o
   nome do arquivo do `content-disposition` e devolve os bytes intactos; `CTE_EXPORT_EMPTY`,
   `CTE_EXPORT_LIMIT_EXCEEDED` e `FORBIDDEN` sobem como código, e falha de rede vira
   `CTE_BATCH_REQUEST_FAILED`.
5. `resolveCteExportMessageKey` mapeia cada código numa chave de locale estável, com fallback
   `cteItems.export.errors.unknown` — a UI nunca mostra a mensagem crua da API.
6. A ligação real: `CteItemSelectionBar` e `CteItemFilters` chamam as ações e renderizam
   `exportErrorKey`, `useCteItemTable` compõe `useCteItemExport`, e as duas locales têm as chaves.

Fixture 100% sintética: ids `00000000-0000-4000-8000-0000000007xx`, ZIP de 6 bytes
(`50 4b 03 04 00 00`), nenhum XML, chave de acesso ou número de nota real.

Vermelho antes da implementação:

```
$ bun test apps/frontend-transportada/test/cte-batch.contract.test.ts
 44 pass
 6 fail
error: Cannot find module '../../src/modules/cte-batch/shared/cteBatchItemExport.service'
error: ...exportCompanyItems' is undefined
Ran 50 tests across 1 file. [95.00ms]
```

Implementação: `shared/cteBatchItemExport.service.ts` (tradução de filtro, corpo por escopo, teto,
permissão, mapa de códigos), `shared/cteBatchItemClient.service.ts` ganhou `exportCompanyItems` com um
`requestArchive` próprio — o sucesso é binário e só a falha vem em JSON, então `requestJson` não servia
— e `hooks/useCteItemExport.hook.ts` faz o download via âncora temporária. O recorte de dia
(`toIssuedFromInstant`/`toIssuedUntilInstant`) passou a ser exportado de `cteBatchItemTable.service.ts`
em vez de duplicado, para listagem e exportação não divergirem. O hook ficou separado de
`useCteItemTable.hook.ts` porque este já estava em 187 linhas e o limite do padrão é 200.

Verde e gates:

```
$ bun run --cwd apps/frontend-transportada test
 341 pass
 0 fail
 1958 expect() calls
Ran 341 tests across 14 files. [135.00ms]

$ bun run lint        # silencioso nas 4 apps
$ bun run typecheck   # silencioso nas 4 apps
$ bun run --cwd apps/frontend-transportada build
✓ built in 896ms
PWA v1.3.0 — precache 11 entries (860.45 KiB)

$ bunx prettier --check <os 10 arquivos tocados>
All matched files use Prettier code style!
```

O que isso prova: as seis asserções novas passaram sem afastar nenhuma das 335 anteriores, o corpo
enviado é exatamente o que `cte-export.schema.ts` aceita, e todo erro chega à tela como chave de
locale.

Fica fora desta task e sem evidência: o "download real no navegador" pedido no critério de sucesso —
`saveArchive` monta a âncora e revoga o object URL, mas isso não é exercitado por teste automatizado
(não há DOM nas suítes desta app) nem foi aberto em navegador aqui. Também não há teste do rótulo
com contagem em `pt`/`en` além da existência das chaves.

## Fecho da feature 022 — gate completo do repositório

As 22 tasks (T001–T022) estão fechadas com evidência. Antes de encerrar, 13 arquivos da própria feature
estavam com deriva de formatação e mantinham o `format:check` vermelho — todos passaram por
`bunx prettier --write` (nenhuma mudança de comportamento, só formatação):
os 4 de `src/billing/**` da API, os 5 de `test/billing-*/**`, `BillingWorkspace.page.tsx`,
`test/billing/invoice-table.contract.ts`, `test/cte-batch/table-and-items.contract.ts` e este
`evidence.md`.

```
$ make check        # format:check + lint + typecheck + test + build nas 4 apps
 1257 pass / 1 skip / 0 fail   (api-transportada, 64 arquivos)
  228 pass / 0 fail            (worker-transportada, 37 arquivos)
   24 pass / 0 fail            (cron-transportada, 2 arquivos)
  341 pass / 0 fail            (frontend-transportada, 14 arquivos)
build: api 0.84 MB · worker 225.1 KB · cron 22.34 KB · frontend ✓ built (PWA, 11 entries)
```

O que isso prova: o gate completo do repositório está verde com a feature inteira aplicada — nenhuma
suíte de outra feature regrediu.

Continua sem evidência automatizada, já anotado nas tasks correspondentes: verificação em navegador real
(T006, T019, T022) e a exportação exercida contra Postgres/storage reais (`test/integration/
cte-export-selection.integration.ts` seria o próximo degrau). Fora do escopo desta feature e ainda
aberto: migration + campo no POST para `billing_invoices.observations`, hoje preenchido com `''` pelo
repositório.

## Pós-feature — item 1: smoke do download em navegador real (T019, T022)

Lacuna fechada: o "download real no navegador" que T019 e T022 deixaram sem evidência. Duas suítes
novas em `apps/frontend-transportada/test/responsive.smoke.spec.ts`, rodando em Chromium de verdade
pelo `make smoke` (porta 53100, sem tocar a sessão de `make dev`).

**ZIP de XML de CT-e.** `test/cte-batch-smoke.helper.ts` ganhou o mock de `/cte-batch-items` e de
`POST /cte-batches/items/export`. O corpo do ZIP é um arquivo real de uma entrada, gerado uma vez com
`fflate` (que só existe em `api-transportada`) e congelado em base64 no helper — o frontend não ganhou
dependência nova. O mock devolve `access-control-expose-headers: Content-Disposition`, sem o qual o
cliente cai no nome de fallback `cte-xml.zip` por ser resposta cross-origin. O teste
`operador baixa o ZIP de XML por seleção e por filtro no desktop` prova, por `waitForEvent('download')`:

- o download por seleção sai com o nome vindo do header (`cte-xml-20260722-210000.zip`) e os bytes
  salvos em disco são idênticos ao ZIP servido (`readFileSync(path).equals(...)`);
- o download por filtro repete o mesmo caminho;
- os corpos enviados são exatamente `{itemIds:[…]}` e
  `{filters:{cteNumberIn:['5000'],statusIn:['authorized']}}` — **sem `companyId`**, que vem do contexto
  autenticado, e com o recorte sempre preso a `authorized`.

**PDF da fatura.** `test/billing-smoke.helper.ts` ganhou a rota de storage — registrada no _contexto_,
não na página, porque `window.open(url, '_blank', 'noopener,noreferrer')` abre outro alvo — servindo um
PDF mínimo com `Content-Disposition: attachment`, mais o branch `POST` de
`/billing/invoices/:id/documents` e o `GET` da lista de faturas. O teste
`operador baixa o PDF da fatura pelo painel e pela tabela no desktop` prova os dois caminhos de produto:
"Baixar documento" no painel de detalhe e "Gerar PDF" na tabela de faturas. Ambos terminam em download
com o nome do header e nos mesmos bytes; a URL assinada é buscada pelo navegador duas vezes, uma por
caminho. Verificado por sonda antes de escrever a asserção: com `noopener` + `attachment`, o Chromium
emite o evento `download` na página que abriu, não no popup.

Efeito colateral do passe: 13 smokes existentes estavam vermelhos por deriva de produto, não por
defeito — o workspace de CT-e agora abre na aba "CT-es" (a tabela de lotes exige clicar "Lotes"), o
painel de filtros de lote virou toggle de barra de ferramentas, o construtor avançado passou a usar o
`Select` do design system (`<select>` nativo é proibido, então `selectOption` não serve) e o workspace
de NF-e abre com `cteIssued: 'pending'`, que esconde nota bloqueada por vínculo. Corrigidos os testes,
não o produto.

```
$ make smoke
  29 passed (15.9s)     # eram 14 passed / 13 failed antes deste passe

$ bun run --cwd apps/frontend-transportada test
 341 pass / 0 fail

$ bun run lint        # silencioso nas 4 apps
$ bun run typecheck   # silencioso nas 4 apps
$ bun run --cwd apps/frontend-transportada build   # PWA, 11 entries (860.45 KiB)
```

O que isso prova: o clique do usuário produz arquivo em disco, com o nome que o servidor mandou e os
bytes que o servidor serviu, nos três caminhos de download da feature (ZIP por seleção, ZIP por filtro,
PDF da fatura). `make check` não roda `make smoke` — foi por isso que os 13 vermelhos passaram
despercebidos.

## Pós-feature — item 2: integração da seleção de exportação contra Postgres

Lacuna fechada: até aqui `cte-export-selection.query.ts` só tinha teste de SQL _construído_. Novo
`apps/api-transportada/test/integration/cte-export-selection.integration.ts`, registrado no
`test:integration` do `package.json` da app, roda contra Postgres de verdade em banco descartável,
reaproveitando `test/integration/cte-item-list-repository/cte-item-graph.fixture.ts` (13 cenários de
item por empresa, duas empresas, dados sintéticos).

O que a suíte prova, em SQL executado:

- **Recorte do exportável.** Só saem os dois cenários com documento autorizado vivo. Caem, cada um por
  um motivo diferente: `autorizada_sem_documento` (não existe linha em `cte_fiscal_documents` — é o
  primeiro `innerJoin` agindo), `cancelamento_solicitado` (`cancellationRequestedAt` preenchido) e
  `cancelada` (status `cancelled`).
- **O segundo `innerJoin` resolve o objeto do XML.** Toda linha volta com `bucket` e `objectKey`, e a
  chave conferida contra os `stored_objects` de `purpose = 'cte_document'` daquela empresa.
- **Ordem e teto.** A ordenação por chave de acesso é estável (é dela que sai o nome da entrada no ZIP)
  e `limit: 1` corta na consulta, devolvendo a primeira.
- **Os dois recortes da tela.** `itemIds` de um item exportável devolve uma entrada; `cteNumberIn` com
  o número fiscal do mesmo item chega ao mesmo documento; `statusIn: ['authorized']` iguala o total e
  `statusIn: ['cancelled']` devolve vazio.
- **Isolamento de tenant (obrigatório, a task mexe em query).** `itemIds` de outra empresa no corpo
  devolve `[]`; misturando um item próprio com um alheio volta exatamente uma linha; e os conjuntos de
  chave de acesso e de `objectKey` das duas empresas são disjuntos.

```
$ bun test ./test/integration/cte-export-selection.integration.ts
 1 pass / 0 fail / 23 expect() calls   [784ms]

$ bun run --cwd apps/api-transportada test:integration
 41 pass / 1 skip / 0 fail             [9.27s]

$ bun run --cwd apps/api-transportada test
 1257 pass / 1 skip / 0 fail
$ bun run lint · bun run typecheck     # silenciosos nas 4 apps
$ bunx prettier --check <arquivos tocados>   # All matched files use Prettier code style!
```

Teste de mutação, para o isolamento não passar por acidente: removendo
`eq(cteBatchItems.companyId, input.companyId)` de `buildCompanyItemFilters`, a suíte falha na primeira
contagem (a exportação da empresa A passa a trazer as linhas da B). Arquivo restaurado do backup e
conferido com `diff` logo em seguida.

## Pós-feature — item 3: ZIP ponta a ponta contra o MinIO

Lacuna fechada: `cte-archive.gateway.ts` só tinha teste com storage dublê
(`test/cte-issuance-infrastructure/cte-archive.contract.ts`), então nada provava que o ZIP sobrevive a
um stream de rede de verdade. Novo
`apps/api-transportada/test/integration/cte-archive-gateway.integration.ts`, registrado no
`test:integration` do `package.json` da app, semeia objetos no MinIO local e monta o arquivo com o
gateway real.

O que a suíte prova, com bytes que atravessaram o MinIO:

- **ZIP reabre entrada por entrada.** Três objetos XML sintéticos são gravados sob um prefixo único
  (`integration/cte-archive/<uuid>`), o gateway monta o arquivo, o stream é drenado e reaberto com
  `unzipSync`: os nomes batem com `<chaveSintética>.xml` e cada entrada é byte a byte igual ao que foi
  gravado.
- **Leitura em vários chunks.** Um dos objetos passa dos 200 KiB de propósito — é ele que chega fatiado
  pela rede e exercita o laço de `reader.read()` do gateway.
- **Modo `store` confirmado no arquivo real.** O conteúdo do objeto volumoso aparece literal dentro do
  ZIP, sem deflate — a decisão de não comprimir (para não travar o event loop do `Bun.serve`) é
  verificada no artefato, não só no código.
- **Objeto ausente derruba o stream.** Uma entrada apontando para chave nunca gravada faz o consumo do
  stream rejeitar com `ObjectStorageError` de código `OBJECT_STORAGE_UNAVAILABLE`, em vez de entregar
  ZIP truncado.
- **Sem lixo no bucket.** Os objetos semeados são apagados no `finally` (vale também quando a asserção
  falha) e o provider é fechado.

A suíte pula sozinha quando o storage não está configurado (`OBJECT_STORAGE_*` ou `STORAGE_*`
ausentes), no mesmo espírito do `testWithPostgres`.

```
$ set -a; . .env; set +a
$ bun test --cwd apps/api-transportada ./test/integration/cte-archive-gateway.integration.ts
 2 pass / 0 fail / 7 expect() calls     [231ms]

$ bun test --cwd apps/api-transportada ./test/integration/cte-archive-gateway.integration.ts   # sem env de storage
 0 pass / 2 skip / 0 fail

$ bun run --cwd apps/api-transportada test:integration
 43 pass / 1 skip / 0 fail              [12.42s]

$ bun run --cwd apps/api-transportada test
 1257 pass / 1 skip / 0 fail
$ bun run lint · bun run typecheck      # silenciosos nas 4 apps
$ bunx prettier --check <arquivos tocados>   # All matched files use Prettier code style!
```

Dois testes de mutação, para as asserções não passarem por acidente — cada um derrubado pela asserção
que deveria pegá-lo, e o arquivo restaurado do backup e conferido com `diff` em seguida:

- `break` depois do primeiro `file.push` em `appendEntry` (só o primeiro chunk entra no ZIP): a
  comparação byte a byte falha, e falha **na segunda entrada** — a volumosa. Os objetos pequenos
  chegam em chunk único, o que confirma que é o objeto grande que prova o streaming.
- `ZipPassThrough` trocado por `ZipDeflate`: a comparação de conteúdo continua passando (o
  `unzipSync` infla), e cai só a asserção de modo `store`.

Ciclo de limpeza conferido à parte contra o MinIO (`put` → `head` devolve o objeto → `delete` →
`head` devolve `undefined`), que é exatamente a chamada usada no `finally` da suíte.

## Pós-feature — download de arquivo único abria no navegador em vez de baixar

Achado em teste manual: clicar em "baixar XML" de um CT-e abria o XML na aba. Medido, não deduzido —
a URL assinada do MinIO responde `content-type: application/xml` com `content-disposition: null`, e
sem esse cabeçalho o navegador decide pelo content-type. O mesmo valia para o PDF da fatura. O ZIP de
vários CT-es nunca teve o problema: aquele caminho é outro (blob + âncora `download`), e força o
salvamento.

Correção escolhida: assinar `response-content-disposition` na própria URL. O cabeçalho entra na
assinatura SigV4, então a escolha entre abrir e salvar precisa ser feita na emissão — o cliente não
consegue acrescentá-la depois. Provado contra o MinIO real: adulterar o parâmetro na mão devolve
**403**.

### Pacote `@adatechnology/object-storage-provider` (repo `adatechnology-packages`)

A capacidade já estava no `src` desde `eedd679`, mas nunca saiu em release — faltava changeset, então
o npm seguia no `0.1.1` sem ela. Nada de `src/` foi alterado; entraram só cobertura e o changeset de
bump **minor** (`0.2.0-rc.0`, pre-mode `rc`):

- contrato (servidor S3 sintético): `attachment` + `filename` viram
  `attachment; filename*=UTF-8''<nome-percent-encoded>`; sem `disposition` o parâmetro não sai;
  `filename` sozinho é ignorado; trocar a disposição muda a `X-Amz-Signature` — prova de que vai
  assinado, não como parâmetro solto.
- integração contra o MinIO local: sem disposição o `GET` da URL assinada volta com
  `content-disposition: null` (é isso que abria o XML na aba); com ela volta
  `attachment; filename*=UTF-8''relat%C3%B3rio%20de%20frete.xml`, com os bytes intactos; a URL
  adulterada volta 403.

```
$ bun test test/object-storage.contract.test.ts        13 pass / 0 fail
$ bun run check                                        # tsc --noEmit silencioso
$ bun run test:integration                             2 pass / 0 fail   (MinIO local)
```

Mutação: removido o `ResponseContentDisposition` do `GetObjectCommand` → cai exatamente o teste novo
(12 pass / 1 fail), fonte restaurada e conferida com `git diff --stat`.

### API

Teste antes da implementação, os três primeiros vermelhos e depois verdes:

- `test/cte-issuance-infrastructure/cte-document-download.contract.ts` (novo, registrado no
  entrypoint): o gateway pede a URL com `disposition: 'attachment'` e `filename`, e respeita a
  validade configurada (300 s por padrão).
- `test/billing-infrastructure/invoice-document.contract.ts`: mesmo contrato para o PDF da fatura.
- `test/cte-issuance-application/documents.contract.ts` e
  `test/billing-application/invoice-document.contract.ts`: o nome do arquivo é decidido na aplicação —
  `<chaveDeAcesso>.xml` para o CT-e e `fatura-<numero>.pdf` para a fatura, nunca a chave do objeto no
  bucket (que é um id opaco e vazaria o layout do storage).
- `test/nfe-storage-gateway.contract.test.ts`: o gateway de storage repassa `disposition`/`filename`
  ao provider e continua aceitando a chamada sem eles.

Nenhuma query mudou, então não há novo teste de isolamento de tenant: os dois nomes de arquivo saem de
registros já lidos presos ao `companyId` do contexto.

```
$ bun run --cwd apps/api-transportada test
 1261 pass / 1 skip / 0 fail            [632ms]
$ bun run lint · bun run typecheck      # silenciosos nas 4 apps
```

O typecheck passa com o `0.1.1` ainda instalado (o repasse é de variável, não de literal), então a
CI não quebra enquanto o rc não sai — mas o efeito real no navegador **só existe depois** de
`@adatechnology/object-storage-provider@0.2.0-rc.0` publicado e do bump em
`apps/api-transportada/package.json`. Até lá o campo viaja e o provider antigo o ignora.

Os mocks de smoke (`billing-smoke.helper.ts`, `cte-batch-smoke.helper.ts`) já serviam
`content-disposition: attachment`; com esta correção eles deixam de ser otimistas e passam a
descrever o que o storage realmente devolve.

### Release do pacote e bump da dependência

`0.2.0-rc.0` publicado: PR #23 do repo de pacotes (commit `abde179`, só changeset + testes, nada em
`src/`) mesclado em `main` como `ffc738b`, o workflow `Publish packages` rodou verde
(`gh run watch 30646836007` → `✓ publish in 1m40s`) e o npm confirma:

```
$ npm view @adatechnology/object-storage-provider versions --json
["0.1.1", "0.2.0-rc.0"]
$ npm view @adatechnology/object-storage-provider dist-tags --json
{ "latest": "0.1.1", "rc": "0.2.0-rc.0" }
```

O repo está em pre-mode `rc`, então `latest` continua no `0.1.1` — a dependência tem de ser pinada na
versão exata, e é o que os contratos de pin exigem. Bump em `apps/api-transportada/package.json` e
`apps/worker-transportada/package.json` (as duas apps consomem o provider), mais os quatro contratos
que fixam a versão auditada: `certificate-validation-gateway.contract.test.ts` e
`nfe-storage-gateway.contract.test.ts` na API, `environment.contract.test.ts` e
`nfe-storage-gateway.contract.test.ts` no worker.

Prova de que o artefato instalado do npm — não mais um duble de teste — assina a disposição, gerando
duas URLs pelo `createNfeStorageGateway` real:

```
sem disposicao : null
com disposicao : attachment; filename*=UTF-8''CT-e%20000123.xml
assinatura muda: true
```

A assinatura mudar entre as duas URLs é o que fecha o caso: a disposição entra na string canônica do
SigV4, então ninguém troca `attachment` por `inline` numa URL já emitida sem invalidá-la.

```
$ bun run --cwd apps/api-transportada test      1261 pass / 1 skip / 0 fail
$ bun run --cwd apps/worker-transportada test    228 pass / 0 fail
$ bun run lint · typecheck · build               silenciosos nas 4 apps
```
