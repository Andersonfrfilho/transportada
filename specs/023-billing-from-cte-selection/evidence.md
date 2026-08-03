# Evidências — Feature 023

Cada task fecha aqui com o comando executado, a saída relevante e o que ela prova. Nenhum dado fiscal
real (CNPJ, IE, chave de acesso, razão social, número de nota) entra neste arquivo.

## T001 — Contrato falhando do preview de faturamento

Arquivos novos, registrados na cadeia explícita:

- `test/billing-application/preview.contract.ts` → importado em `test/billing-application.contract.test.ts`
- `test/billing-http/preview.contract.ts` → importado em `test/billing-http.contract.test.ts`
- apoio: `preview`/`previewQueries`/`previewRecords`/`findBillingPreviewByIds` em
  `test/billing-application/support.ts`; `preview`, `previewCalls`, `INVOICE_PREVIEW`,
  `BILLING_INVOICE_PREVIEW_PATH` e `previewBillingInvoiceRequest` em `test/fixtures/billing-http.fixture.ts`

Comando:

```
bun test ./test/billing-application.contract.test.ts ./test/billing-http.contract.test.ts
```

Saída:

```
TypeError: (await createBillingUseCaseForTest(unitOfWork)).preview is not a function.
(fail) billing application preview contract > groups billable CT-e by customer keeping the requested order and decimal sums
(fail) billing application preview contract > reads the tenant from the authenticated context and never from the payload
(fail) billing application preview contract > blocks each non billable CT-e with a stable reason, in the requested order
(fail) billing application preview contract > returns no group when the repository answers nothing for the tenant
Expected: 200 / Received: 404
(fail) Billing HTTP invoice preview contract > answers the grouped preview without cache and without fiscal payload
(fail) Billing HTTP invoice preview contract > rejects every malformed selection before reaching the application
(fail) Billing HTTP invoice preview contract > accepts the maximum selection of one hundred CT-es
(fail) Billing HTTP invoice preview contract > requires the billing create permission

 37 pass
 8 fail
Ran 45 tests across 2 files.
```

`bun run typecheck` na app: sem saída de erro.

O que prova: as oito asserções novas falham pelo motivo certo — a aplicação ainda não expõe `preview`
(TypeError) e a rota `POST /billing/invoices/preview` ainda não existe (404), nenhuma delas por erro de
fixture. Vermelho antes da implementação, como manda a regra. As 37 que passam são as suítes de
faturamento já existentes, provando que a extensão da fixture não quebrou nada.

## T002 — Rota, use-case e query do preview

Implementação:

- `src/shared/api.constant.ts` — `API_BILLING_INVOICE_PREVIEW_PATH = '/billing/invoices/preview'`
- `src/billing/presentation/billing.schema.ts` — `parseBillingInvoicePreviewRequest` (`.strict()`,
  1..100 uuids, `refine` que recusa id repetido)
- `src/billing/presentation/billing.routes.ts` — rota `POST` com `BILLING_CREATE_POLICY` + `serializePreview`
- `src/billing/application/billing.use-case.ts` — `previewInvoice`, `resolveBlockReason`,
  `groupPreviewByCustomer`, constante `BILLING_PREVIEW_BLOCK_REASONS`
- `src/billing/infrastructure/drizzle-billing.repository.ts` — `findBillingPreviewByIds`
- `src/main.ts` — `preview` mapeando `cteIds` da rota para `cteDocumentIds` da aplicação

Regra de bloqueio idêntica à da criação, de propósito: `queryEligibleCtes` e
`reserveCteForActiveInvoice` já tratam **qualquer** item de fatura como bloqueio (cancelar não apaga o
item), então o preview usa `invoiceId != null → already_invoiced`. Se divergisse, o modal prometeria uma
fatura que o `POST` recusaria.

Isolamento de tenant — a query nova é provada contra Postgres real em
`test/integration/billing-repository.integration.ts` (mesmo teste que já semeia duas empresas):

```
set -a && . ./.env && set +a && bun test --cwd apps/api-transportada ./test/integration/billing-repository.integration.ts

 1 pass
 0 fail
 22 expect() calls
Ran 1 test across 1 file. [849.00ms]
```

Asserções novas nesse teste: o CT-e da outra empresa pedido no contexto da própria volta como
`not_found` (não como grupo, não como linha), o serializado do preview não contém o documento do cliente
da outra empresa, e depois de faturado o mesmo id volta como `already_invoiced`.

Gates:

```
bun run --cwd apps/api-transportada test   →  1269 pass · 1 skip · 0 fail (64 arquivos)
bun run typecheck  (raiz, 4 apps)          →  sem erro
bun run lint       (raiz, 4 apps)          →  sem erro
```

O que prova: as oito asserções de T001 ficaram verdes sem afrouxar nenhuma delas, a suíte inteira da API
continua verde e a query nova não enxerga CT-e de outra empresa em banco real.

## T003 — Contrato falhando do preparo da seleção de CT-es para faturar

Arquivo novo, registrado na cadeia explícita:

- `test/cte-batch/item-billing.contract.ts` → importado em `test/cte-batch.contract.test.ts`
  (entrypoint já listado no `test` do `package.json` do frontend)

Cinco asserções, todas com dado sintético (ids `00000000-0000-4000-8000-*`, nenhum documento fiscal
real): o mapa acumulado guarda `fiscalDocumentId` e `status`; item de página já descartada continua
faturável porque a leitura é do mapa, não da página em tela; bloqueio local por status ≠ `authorized`,
por documento fiscal ausente e por id desconhecido, na ordem da seleção; id repetido não duplica o
documento; `canBillSelection` exige `billing.create` **e** ao menos um faturável.

Comando:

```
bun test ./test/cte-batch.contract.test.ts
```

Saída:

```
error: expect(received).toEqual(expected)
-   "fiscalDocumentId": "00000000-0000-4000-8000-000000000801",
-   "status": "authorized",
(fail) cte item billing selection contract > keeps the fiscal document and the status in the accumulated map

error: Cannot find module '../../src/modules/cte-batch/shared/cteBatchBilling.service'
(fail) cte item billing selection contract > bills an item whose page was already discarded, reading only the accumulated map
(fail) cte item billing selection contract > blocks locally what the API would refuse, keeping the selected order
(fail) cte item billing selection contract > never repeats a fiscal document when the same item appears twice in the selection
(fail) cte item billing selection contract > requires the billing create permission and at least one billable CT-e

 50 pass
 5 fail
Ran 55 tests across 1 file.
```

`bun run --cwd apps/frontend-transportada typecheck`:

```
test/cte-batch/item-billing.contract.ts(111,7): error TS2769: ... 'fiscalDocumentId' does not exist in
  type 'Readonly<{ batchId: string; baseAmount: string; totalAmount: string; }>'
test/cte-batch/item-billing.contract.ts(115,42): error TS2339: Property 'fiscalDocumentId' does not exist
test/cte-batch/item-billing.contract.ts(116,42): error TS2339: Property 'status' does not exist
```

O que prova: as cinco falham pelo motivo certo — quatro porque `cteBatchBilling.service` ainda não
existe e uma porque `CteItemAmounts` ainda não carrega os dois campos novos (o typecheck confirma que é
o tipo, não a fixture). As 50 que passam são as suítes de CT-e já existentes, provando que o registro do
novo arquivo na cadeia não quebrou nada.

## T004 — Serviço de faturamento da seleção, snapshot estendido e ação na barra

Implementação:

- `src/modules/cte-batch/shared/cteBatchItemSelection.service.ts` — `CteItemAmounts` passa a guardar
  `fiscalDocumentId` e `status`, preenchidos por `accumulateCteItemAmounts`
- `src/modules/cte-batch/shared/cteBatchBilling.service.ts` (novo) — `BILLING_CREATE_PERMISSION`,
  `CTE_BILLING_BLOCK_REASON`, `collectBillableCtes` (classificação discriminada, sem `!` nem fallback
  para estado impossível) e `canBillSelection`
- `src/modules/cte-batch/hooks/useCteItemTable.hook.ts` — `billingSelection`, `canBill`,
  `billingRequest` (seleção congelada ao abrir), `startBilling`, `closeBilling`
- `src/modules/cte-batch/components/CteItemSelectionBar.component.tsx` — botão **Gerar fatura** com o
  número de faturáveis e dica com a contagem de bloqueados
- `src/modules/cte-batch/locales/cteBatch.locale.json` e `.en.locale.json` — `cteItems.billSelection`
  e `cteItems.billBlocked`

O contrato já existente `item-table.contract.ts` foi ajustado no mesmo commit lógico: a asserção exata
do mapa acumulado e o tipo local `CteItemAmounts` passaram a incluir os dois campos novos — o `toEqual`
é exato de propósito, então o snapshot estendido tinha de ser declarado ali também.

Gates:

```
bun run --cwd apps/frontend-transportada test  →  351 pass · 0 fail (14 arquivos)
bun test ./test/cte-batch.contract.test.ts     →   55 pass · 0 fail (as 5 de T003 verdes)
bun run typecheck  (raiz, 4 apps)              →  sem erro
bun run lint       (raiz, 4 apps)              →  sem erro
bun run --cwd apps/frontend-transportada build →  ✓ built (PWA gerado)
```

O que prova: as cinco asserções de T003 ficaram verdes sem afrouxar nenhuma delas, o botão só habilita
com `billing.create` e ao menos um CT-e autorizado com documento fiscal, e a suíte inteira do frontend
continua verde com o snapshot estendido.

## T005 — Contrato falhando do modal de faturamento

Arquivo novo, registrado na cadeia explícita:

- `test/billing/from-selection.contract.ts` → importado em `test/billing.contract.test.ts`
  (entrypoint já listado no `test` do `package.json` do frontend)

Sete asserções, com clientes anonimizados (`11222333000181` / `44555666000172`) e ids sintéticos:
`previewInvoice` fala `POST /billing/invoices/preview` com `no-store` e corpo só de `cteIds`; recusa
resposta com chave extra (`BILLING_INVALID_PREVIEW_RESPONSE`) e propaga o código de erro da API;
`validateBillingDueDate` exige vencimento e recusa data que não existe no calendário; `submitBillingGroups`
faz **uma requisição por grupo** com `Idempotency-Key` distinta e preserva o grupo que deu certo quando o
outro é recusado; o hook do modal invalida as duas listagens e não monta `fetch` na mão.

Comando:

```
bun test ./test/billing.contract.test.ts
```

Saída:

```
TypeError: client.previewInvoice is not a function.
error: Cannot find module '../../src/modules/billing/shared/billingFromSelection.service'
ENOENT: no such file or directory, open '.../src/modules/cte-batch/hooks/useCteBillingDialog.hook.ts'

 24 pass
 7 fail
Ran 31 tests across 1 file.
```

`bun run --cwd apps/frontend-transportada typecheck`: sem saída de erro (o contrato declara os tipos
do módulo futuro localmente, então o vermelho é de runtime, não de compilação).

O que prova: as sete falham pelo motivo certo — o client ainda não expõe `previewInvoice`, o serviço
`billingFromSelection` não existe e o hook do modal não existe. As 24 que passam são as suítes de
faturamento já existentes.

## T006 — Modal de faturamento a partir da seleção de CT-es

Duas asserções novas foram acrescentadas ao contrato de T005 antes da implementação
(`test/billing/from-selection.contract.ts`, mesmo arquivo já registrado na cadeia): agrupamento dos
bloqueados por motivo preservando a ordem de chegada, e o contrato de acessibilidade/limpeza do
componente (`aria-modal`, `createPortal`, sem `<select>` nativo, sem `fetch(` na mão).

Vermelho antes da implementação:

```
bun test ./test/billing.contract.test.ts

TypeError: groupBillingBlocksByReason is not a function.
ENOENT: no such file or directory, open '.../src/modules/cte-batch/components/CteBillingDialog.component.tsx'

 31 pass
 2 fail
Ran 33 tests across 1 file.
```

Implementação:

- `billingFromSelection.service.ts` ganhou `groupBillingBlocksByReason` (Map por motivo, ordem de
  chegada preservada — mesmo padrão de `groupBlocksByReason` do módulo de emissão).
- `useModalDialog.hook.ts` saiu de `nfe-workspace/hooks/` para `modules/shared/` — o travamento de
  scroll, o foco e o trap de `Tab` agora servem os dois modais sem um módulo importar interno do outro.
- `CteBillingDialog.component.tsx`: overlay em portal para `document.body`, grupos do preview em tabela
  (tomador, documento, contagem, valor) com total somado por `sumScaledAmounts`, bloqueados agrupados
  por motivo com contagem, campo de vencimento em `type="date"` usando `--field-height`/`--field-padding`/
  `--field-font-size`, e uma linha de resultado por grupo (número da fatura emitida ou código do erro).
- `CteItemTable.component.tsx` liga o modal em `table.billingRequest` / `table.closeBilling`.
- Classes `billing*` acrescentadas ao `cteBatch.module.css`, com o modal em tela cheia abaixo de 40rem.
- Chaves `billing.*` em `cteBatch.locale.json` e `cteBatch.en.locale.json`.

Verde e gates:

```
bun run --cwd apps/frontend-transportada test   → 360 pass / 0 fail (2020 expect)
bun run typecheck                               → sem erro (api, worker, cron, frontend)
bun run lint                                    → sem erro (api, worker, cron, frontend)
bun run --cwd apps/frontend-transportada build  → ✓ built in 927ms
```

O que prova: o botão "Gerar fatura" abre um modal que consulta o preview da API, mostra exatamente as
faturas que serão geradas (uma por tomador), explica o que ficou de fora e por quê, e devolve o
resultado grupo a grupo. Nenhum dado fiscal real entrou em teste, fixture ou saída.

**Pendente:** verificação no navegador real — depende do `make dev` ser reiniciado (a API em execução
ainda carrega `@adatechnology/object-storage-provider@0.1.1` enquanto o `package.json` fixa `0.2.0-rc.0`).

## T007 — Contrato falhando dos filtros novos de `GET /billing/eligible-ctes`

Suíte nova `apps/api-transportada/test/billing-http/eligible-filters.contract.ts`, registrada em
`test/billing-http.contract.test.ts`. Fixture: `listEligibleCtesRequest` passou a aceitar a query
como parâmetro (default é a query já usada pelas outras suítes) e `BillingInvoiceCall` ganhou
`batchIdIn`, `cteNumberIn` e `customerName`.

Vermelho:

```
bun test apps/api-transportada/test/billing-http.contract.test.ts
(fail) ... > forwards the list filters and the customer name search to the application
(fail) ... > trims the customer name and keeps a single value list intact
(fail) ... > accepts a list at the maximum size
error: expect(received).toBe(expected)  Expected: 200  Received: 400
 23 pass / 3 fail — Ran 26 tests
```

O 400 é o motivo certo: `parseBillingEligibleList` ainda não conhece `cteNumberIn`, `batchIdIn` nem
`customerName`, então a allowlist recusa as três chaves.

O que prova: o contrato exige que os três filtros cheguem ao caso de uso já normalizados (lista
separada por vírgula, nome do tomador com `trim`) e que continuem recusados com `INVALID_REQUEST`,
sem tocar a aplicação, quando vierem com chave fora da allowlist, chave repetida, lista vazia, item
malformado, lista acima do teto de 100 ou `In` combinado com o campo exato do mesmo domínio. Os
filtros que já existiam seguem cobertos por um caso próprio. Nenhum dado fiscal real na suíte.

## T008 — Filtros novos implementados no schema e no repositório

Implementação:

- `billing.schema.ts`: allowlist da listagem de elegíveis passou a aceitar `batchIdIn`, `cteNumberIn` e
  `customerName`; `parseBillingEligibleList` foi quebrada em `assertEligibleListKeys` (chave fora da
  allowlist, chave repetida e conflito `In` × campo exato) e `parseEligibleListFilters`. As listas são
  separadas por vírgula, com teto de 100 valores e cada item validado item a item (`parseUuidList`,
  `parsePositiveIntegerList`); `parseCustomerName` faz `trim` e exige de 2 a 120 caracteres.
- `main.ts`: os três filtros novos passam para `billing.listEligible`.
- `drizzle-billing.repository.ts`: `queryEligibleCtes` ganhou `batchIdIn` (`inArray` em
  `cteBatchItems.batchId`), `cteNumberIn` (`inArray` em `cteFiscalDocuments.fiscalNumber`, convertendo
  para `BigInt`) e `customerName` (`ilike` em `nfeParticipants.legalName`, mesmo padrão dos outros
  repositórios). `findEligibleCtesByIds` passa `null` nos três — a busca por id não muda.
  `optionalStringArray` trata lista ausente ou vazia como "sem filtro".

Isolamento de tenant (a task mexe em query):

`test/integration/billing-repository.integration.ts` ganhou um bloco que usa os filtros novos com
valores que também casam com a outra empresa — os dois tenants têm o mesmo nome de cliente
(`Cliente <n> Ltda`) e números de CT-e vizinhos. Com `batchIdIn` contendo os dois lotes,
`cteNumberIn: ['1','2']` e `customerName: 'Cliente'`, a consulta devolve **uma** linha, a da empresa
autenticada; filtrar só pelo lote da outra empresa devolve `[]`, e `customerName: 'Cliente 2'`
(o nome do cliente da outra empresa) também devolve `[]`.

```
bun test ./apps/api-transportada/test/integration/billing-repository.integration.ts
 1 pass / 0 fail — 27 expect() calls  (Postgres real em 127.0.0.1:55432)

bun run --cwd apps/api-transportada test → 1274 pass / 1 skip / 0 fail (5797 expect, 64 arquivos)
bun run lint                            → sem erro (api, worker, cron, frontend)
bun run typecheck                       → sem erro (api, worker, cron, frontend)
```

O que prova: T007 fica verde sem afrouxar nenhuma recusa, os filtros chegam ao SQL como `inArray`/
`ilike` e nenhum deles abre caminho para enxergar CT-e de outra empresa. Nenhum dado fiscal real na
suíte — os documentos do seed são anonimizados.

## T008A — `batchName` na projeção de elegíveis (a coluna "lote" precisa de nome)

Motivo: a resposta de `GET /billing/eligible-ctes` só trazia `batchId` (UUID). A tela de faturamento
precisa da coluna "lote" legível — UUID não serve para consultar, que é exatamente a reclamação que
originou a Fase C.

Contrato falhando antes da implementação (fixture passou a exigir `batchName` na resposta):

```
bun test ./apps/api-transportada/test/billing-http.contract.test.ts
 25 pass / 1 fail — expect(received).toEqual(expected)
   - "batchName": "Lote CT-e julho"   (ausente na resposta)
 (fail) lists eligible CT-es with cursor filters and returns sanitized invoice detail
```

Implementação:

- `billing.routes.ts`: `serializeEligibleBillingCte` passa a emitir `batchName`.
- `drizzle-billing.repository.ts`: `queryEligibleCtes` ganhou `innerJoin(cteBatches)` preso a
  `companyId` **e** `id` do item, seleciona `cteBatches.name` e o devolve como `batchName`.

Isolamento de tenant (a task mexe em query): o join do lote usa
`eq(cteBatches.companyId, cteBatchItems.companyId)` além do id, então o nome nunca pode vir do lote
de outro tenant. O teste de integração semeia dois lotes (`Lote 1` e `Lote 2`) em empresas diferentes
e exige que cada empresa leia o nome do próprio lote.

```
bun test ./apps/api-transportada/test/integration/billing-repository.integration.ts
 1 pass / 0 fail — 29 expect() calls  (Postgres real em 127.0.0.1:55432)

bun run --cwd apps/api-transportada test → 1274 pass / 1 skip / 0 fail (5798 expect, 64 arquivos)
bun run lint                            → sem erro (api, worker, cron, frontend)
bun run typecheck                       → sem erro (api, worker, cron, frontend)
```

O que prova: a listagem de elegíveis entrega o nome do lote junto do id, o join não cruza tenant e
nenhuma outra rota mudou de formato.

Fecho no frontend (a validação do cliente é estrita e recusa chave desconhecida): adicionar
`batchName` à fixture deixou `client-and-queries.contract.ts` vermelho com
`BILLING_INVALID_ELIGIBLE_RESPONSE` — prova de que a mudança da API quebraria a tela sem o ajuste.
`billingResponse.validation.ts` (allowlist + type guard + projeção) e o tipo `BillingEligibleCte`
passaram a carregar `batchName`.

```
bun run --cwd apps/frontend-transportada test → 360 pass / 0 fail (2020 expect, 14 arquivos)
bun run lint / bun run typecheck              → sem erro
```

## T008B — Fim do período inclui o dia inteiro em `GET /billing/eligible-ctes`

Motivo: `issuedTo` chega como data (`YYYY-MM-DD`) e virava `new Date('2026-07-22')`, ou seja
meia-noite. Todo CT-e autorizado durante o último dia escolhido sumia da listagem — o filtro de
período da tela nova ficaria mentindo.

Contrato falhando antes da implementação (CT-e semeado com autorização em 22/07 às 20:00):

```
bun test ./apps/api-transportada/test/integration/billing-repository.integration.ts
 0 pass / 1 fail — expect(received).toHaveLength(expected)
   Expected length: 1 / Received length: 0
   (filters { from: '2026-07-22', to: '2026-07-22' })
```

Implementação: `queryEligibleCtes` passa `endOfDay(input.to)` (`T23:59:59.999Z`) no `lte` de
`authorizedAt`. O início do período continua em meia-noite, que já é o comportamento correto.

Isolamento de tenant (a task mexe em query): o bloco de isolamento por `batchIdIn`/`cteNumberIn`/
`customerName` do T008 continua no mesmo teste e segue verde; o filtro de período não afrouxa o
`companyId`, que continua sendo a primeira condição do `and(...)`. O dia anterior (`to: '2026-07-21'`)
continua devolvendo `[]`, provando que o fecho do dia não virou "sempre inclui".

```
bun test ./apps/api-transportada/test/integration/billing-repository.integration.ts
 1 pass / 0 fail — 32 expect() calls  (Postgres real em 127.0.0.1:55432)

bun run --cwd apps/api-transportada test → 1274 pass / 1 skip / 0 fail (5798 expect, 64 arquivos)
bun run lint                            → sem erro (api, worker, cron, frontend)
bun run typecheck                       → sem erro (api, worker, cron, frontend)
```

Pendência anotada, fora do escopo de 023: `listInvoices` trata `issuedTo`/`dueTo` do mesmo jeito
(meia-noite) sobre `billing_invoices.issue_date` e `due_date`. Vale a mesma correção quando a
listagem de faturas for revisitada.

## T009 — Contrato falhando do serviço puro da tabela de elegíveis

Arquivo novo `apps/frontend-transportada/test/billing/eligible-table.contract.ts`, registrado na
cadeia explícita com `import './billing/eligible-table.contract.js'` no entrypoint
`test/billing.contract.test.ts` (que já consta na lista `test` do `package.json` da app).

O contrato cobre, contra dois módulos ainda inexistentes carregados por `loadFutureModule`
(`billingEligibleTable.service` e `billingEligibleAdvancedFilter.service`):

- as seis colunas e a ordem default, com chave de armazenamento própria `billing.eligible.columns.v1`
  (diferente da chave da tabela de faturas);
- serialização de filtros que só emite chave preenchida e só chave da allowlist de
  `parseBillingEligibleList` — inclusive descartando o que a API devolveria 400 (número não numérico,
  lista acima de 100 valores, documento com menos de 11 dígitos, nome com 1 caractere, valor fora do
  formato `MONEY`), e normalizando `12.345.678/0001-99` → `12345678000199`, `350,5` → `350.50`;
- contagem de filtros ativos;
- ordenação `asc → desc → neutro` e comparação pelo valor (CT-e 43 depois de 9 e de 11, dinheiro por
  `compareScaledAmounts`, data pelo instante, texto por `localeCompare`);
- seleção acumulada entre páginas com soma decimal e a lista de documentos de tomador que a seleção
  atravessa (uma fatura é de um tomador só);
- paginação por cursor com pilha de volta e no-op nas bordas;
- persistência de ordem/visibilidade das colunas: sanitização de chave desconhecida, JSON corrompido,
  `storage` nulo (SSR) e `storage` que estoura cota;
- filtro avançado com grupos E/OU aninhados, neutralidade do grupo sem condição ativa, reset de valor
  e operador ao trocar o campo, dinheiro sem float e período que inclui o dia inteiro.

Vermelho antes da implementação, pelo motivo certo (módulo inexistente):

```
bun run --cwd apps/frontend-transportada test
 360 pass / 8 fail (2020 expect, 14 arquivos)
 error: Cannot find module '../../src/modules/billing/shared/billingEligibleTable.service'
 error: Cannot find module '../../src/modules/billing/shared/billingEligibleAdvancedFilter.service'
```

Gates que já valem nesta task (o contrato usa import dinâmico por string, então não quebra o
typecheck):

```
bun run lint      → sem erro (api, worker, cron, frontend)
bun run typecheck → sem erro (api, worker, cron, frontend)
bunx prettier --check apps/frontend-transportada/test/billing/eligible-table.contract.ts → ok
```

## T010 — `billingEligibleTable.service.ts` + `useBillingEligibleTable.hook.ts`

Implementação que fecha o contrato T009. Arquivos novos:

- `src/modules/billing/shared/billingEligibleFilterValue.service.ts` — normalização textual dos
  valores de filtro (`parseCteNumberList`, `normalizeDocumentDigits`, `normalizeNameQuery`,
  `toComparableAmount`, `normalizeMoneyInput`). Dinheiro é convertido por texto + `BigInt`, nunca por
  float; `1.234,56` da tela vira `1234.56` da API.
- `src/modules/billing/shared/billingEligibleTable.service.ts` — colunas, filtros, serialização da
  query (só a allowlist que a API aceita), ordenação, seleção acumulada com `sumScaledAmounts`,
  paginação por cursor com pilha de volta e preferências de coluna em `localStorage`
  (`billing.eligible.columns.v1`).
- `src/modules/billing/shared/billingEligibleAdvancedFilter.service.ts` — grupos E/OU aninhados com
  os tipos `text | number | date | money`; trocar o campo zera valor e operador.
- `src/modules/billing/hooks/useBillingEligibleTable.hook.ts` — orquestra query, filtros, ordenação,
  seleção e colunas. A soma da seleção sobrevive à troca de página por um `useRef` acumulado durante
  o render (mesmo padrão de `useCteItemTable.hook.ts`), não por `setState` no render.

Decisão de blast radius registrada: `listEligibleCtes` passou de argumento plano para
`{cursor, filters, limit}` + serializador, igual ao irmão `listInvoices`. Por isso foram ajustados na
mesma task `billingClient.service.ts`, `useBillingWorkspace.hook.ts`, `BillingWorkspace.page.tsx`, a
fixture `test/billing/billing.fixture.ts` e o contrato pré-existente
`test/billing/client-and-queries.contract.ts` (inclusive o tipo local do módulo, que ainda descrevia
o formato antigo e derrubava o `tsc`).

Sem mudança de query no backend nesta task — nenhum novo teste de isolamento de tenant é exigido.

```
bun run --cwd apps/frontend-transportada test
 368 pass / 0 fail (2103 expect, 14 arquivos)

bun run lint       → sem erro (api, worker, cron, frontend)
bun run typecheck  → sem erro (api, worker, cron, frontend)
bun run --cwd apps/frontend-transportada build → ✓ built in 916ms · PWA precache 11 entries
bunx prettier --check (arquivos novos e editados) → All matched files use Prettier code style!
```

## T011 — contrato falhando da tela "Gerar fatura"

`apps/frontend-transportada/test/billing/eligible-screen.contract.ts`, registrado na cadeia explícita
(`test/billing.contract.test.ts` → entrypoint já listado no `package.json`). Onze testes cobrindo o
que a tela precisa entregar:

- as seis colunas (`cteNumber`, `customerName`, `customerDocument`, `batchName`, `issuedAt`,
  `totalAmount`) vindas de `table.visibleColumns`, com `aria-sort`, ordenação por cabeçalho, seleção
  em massa, contador de resultados e dinheiro por `formatAmount` (sem `Number(`/`parseFloat`);
- paginação por cursor no rodapé (`goToPreviousPage`/`goToNextPage` + `canGoToPreviousPage`/
  `hasNextPage`);
- filtros e colunas recolhidos em controles com `aria-expanded`, pastilha de contagem
  (`activeFilterCount` e `activeConditionCount`), reordenação/visibilidade de coluna e limpar filtros;
- seleção que atravessa mais de um tomador é denunciada antes de gerar a fatura
  (`selection.customerDocuments.length`, `eligible.multipleCustomers`);
- período pelo `DateRangePicker` do design system, `<select>` nativo e `type="date"` proibidos,
  nenhum `style={{` inline, ambos os componentes no mesmo `billingEligibleTable.module.css`;
- filtro simples + construtor avançado com grupos E/OU aninhados no mesmo painel;
- zebra em `tbody tr:nth-child(even)`, campos nos tokens `--field-height`/`--field-padding`/
  `--field-font-size`, sem hexadecimal e sem largura própria (`min(100% -` proibido — a largura vem
  de `--layout-width` na shell);
- a aba "Gerar fatura" troca o grid solto de `input type=text` pela tabela (`workspace-filter-grid`,
  `updateFilter` e `sumSelectedAmount` não podem sobreviver na página);
- locales pt/en com a mesma forma de chaves em `eligible.*` (colunas, filtros, avançado) e os quatro
  rótulos que o `DateRangePicker` exige em `dateRange.*`.

Vermelho antes da implementação, pelo motivo certo (componentes, estilos e chaves inexistentes):

```
bun run --cwd apps/frontend-transportada test
 368 pass / 11 fail (2108 expect, 14 arquivos)
 ENOENT .../src/modules/billing/components/BillingEligibleTable.component.tsx
 ENOENT .../src/modules/billing/components/BillingEligibleFilters.component.tsx
 ENOENT .../src/modules/billing/styles/billingEligibleTable.module.css
 expect(ptKeyPaths).toContain("clearFilters")
   recebido: ["cteNumber","customer","empty","select","summary","title","totalAmount"]
 BILLING_ELIGIBLE_CONTRACT_DATE_RANGE_MISSING
 page ainda contém "workspace-filter-grid" / "updateFilter" / "sumSelectedAmount"
```

Gates que já valem nesta task (o contrato lê fonte por `Bun.file`, então não quebra o typecheck):

```
bun run lint      → sem erro (api, worker, cron, frontend)
bun run typecheck → sem erro (api, worker, cron, frontend)
bunx prettier --check test/billing/eligible-screen.contract.ts test/billing.contract.test.ts → ok
```

## T012 — tela "Gerar fatura" com tabela, filtros e locales

Implementado:

- `src/modules/billing/styles/billingEligibleTable.module.css` — painel, barra de ferramentas,
  painel de filtros, construtor de grupos E/OU, popover de colunas, barra de seleção em massa,
  tabela com zebra em `tbody tr:nth-child(even)`, paginação e rodapé de criação. Campos herdam
  `--field-height-compact`/`--field-padding-compact`/`--field-font-size-compact`; nenhuma largura
  própria (a shell resolve por `--layout-width`); `.tableScroll` recebe `position: relative` para o
  `.srOnly` absoluto não escapar do bloco contêiner e esticar a página.
- `src/modules/billing/components/BillingEligibleTable.component.tsx` — seis colunas vindas de
  `table.visibleColumns` com `aria-sort`, ordenação por cabeçalho, seleção por linha e da página,
  contador de resultados, aviso de seleção multi-tomador, paginação por cursor e dinheiro por
  `formatAmount`.
- `src/modules/billing/components/BillingEligibleFilters.component.tsx` — filtro simples (lote,
  números de CT-e, cliente, documento, valor mínimo/máximo) + período pelo `DateRangePicker` do
  design system, e o construtor avançado com grupos E/OU aninhados. Nenhum `type="date"` e nenhum
  `<select>` nativo.
- `src/modules/billing/shared/billingQueryKey.constant.ts` — as três chaves de query saíram de
  `useBillingWorkspace` para cá; sem isso o hook da tabela e o hook do workspace se importariam em
  ciclo.
- `useBillingWorkspace.hook.ts` — removida a `eligibleQuery` própria (que refazia a mesma busca sem
  filtro em paralelo com a da tabela) e a entrada `eligibleFilters`; a invalidação pós-emissão/
  cancelamento passou a ser por prefixo `[BILLING_ELIGIBLE_LIST_QUERY_KEY, companyId]`.
- `BillingWorkspace.page.tsx` — o grid solto de `input type=text`, o `updateFilter`, o
  `sumSelectedAmount` e a tabela de quatro colunas saíram; a aba usa `BillingEligibleTable` mais um
  painel de criação com resumo da seleção, vencimento no `DateRangePicker` e o botão bloqueado
  enquanto a seleção estiver vazia, misturar tomadores ou faltar vencimento.
- Locales pt/en: `eligible.*` reescrito (colunas, filtros, avançado, ordenação, paginação),
  `dateRange.*` com os quatro rótulos exigidos pelo `DateRangePicker` e `create.selectionSummary`;
  a seção morta `filters` da raiz foi removida.

Verde depois da implementação:

```
bun run --cwd apps/frontend-transportada test
 379 pass / 0 fail (2240 expect, 14 arquivos) — 125 ms

bun run --cwd apps/api-transportada test
 1274 pass / 1 skip / 0 fail (5798 expect, 64 arquivos) — 643 ms

bun run lint       → sem erro (api, worker, cron, frontend)
bun run typecheck  → sem erro (api, worker, cron, frontend)
bunx prettier --check .  → All matched files use Prettier code style!
bun run --cwd apps/frontend-transportada build
 PWA v1.3.0 · precache 11 entries (901.40 KiB) · dist/sw.js gerado
```

O que isso prova: os onze testes que o T011 deixou vermelhos passaram pelo motivo certo — os
componentes, o CSS e as chaves de locale existem e respeitam os contratos de design system (sem
`<select>` nativo, sem `type="date"` em `*Filters.component.tsx`, campos nos tokens de altura,
nenhum módulo declarando largura própria). A suíte da API continua intacta: a task não tocou em
nenhuma query, então nenhum teste novo de isolamento de tenant é exigido.

Pendente e declarado: a conferência em navegador real (parte do critério "navegador real" desta
task) segue bloqueada até o `make dev` ser reiniciado — o processo da API em execução ainda carrega
`@adatechnology/object-storage-provider@0.1.1` enquanto o `package.json` já fixa `0.2.0-rc.0`.

## T013 — contrato falhando do detalhe da fatura

`apps/frontend-transportada/test/billing/invoice-detail.contract.ts`, registrado na cadeia explícita
(`import './billing/invoice-detail.contract.js'` em `test/billing.contract.test.ts`, que já está na
lista `test` do `package.json`).

O contrato exige:

- um serviço puro `billingInvoiceDetail.service.ts` com `BILLING_CANCEL_REASON_MIN_LENGTH === 3` e
  `resolveBillingCancellationState({canCancel, invoiceStatus, isPending, reason})`, na ordem
  permissão → fatura já cancelada → motivo curto → requisição em voo; `abc` (3 caracteres úteis)
  libera, `a` não — a mesma régua de `createCancelDraft`;
- `useBillingInvoiceTable` expondo `activeInvoiceId`/`openInvoice`/`closeInvoice`, e a tabela de
  faturas abrindo o detalhe por `table.openInvoice(item.id)` (chave `invoices.openDetail`);
- `BillingInvoiceDetail.component.tsx` mostrando fatura, documentos e cancelamento no mesmo painel,
  com `formatAmount`, `createBillingDocumentDownloadController` e `resolveBillingCancellationState`;
- fechar pelo próprio painel (`invoiceDetail.close`), estilos em
  `billingInvoiceDetail.module.css` nos tokens (`--field-height`, `--space-*`), sem hexadecimal, sem
  largura própria, sem `style={{`, sem `<select>` nativo e sem `type="date"`;
- a página sem `selectedInvoiceId`, sem `setCancelReason`, sem `invoice.lookup`, sem `cancel.submit`
  e sem os painéis soltos de documentos — nenhuma tela lê id de fatura de campo digitado;
- locales pt/en com `invoiceDetail.*` na mesma forma e as seções mortas `invoice`, `cancel` e
  `documents` removidas da raiz.

Vermelho antes da implementação, pelo motivo certo:

```
bun test test/billing.contract.test.ts
 52 pass / 7 fail (466 expect)
 Cannot find module '../../src/modules/billing/shared/billingInvoiceDetail.service'
 ENOENT .../src/modules/billing/components/BillingInvoiceDetail.component.tsx
 expect(hook).toContain("activeInvoiceId")
 expect(page).toContain("BillingInvoiceDetail")
 BILLING_INVOICE_DETAIL_CONTRACT_LOCALE_MISSING
```

Gates que já valem nesta task (o contrato lê fonte por `Bun.file`, então não quebra o typecheck):

```
bun run lint      → sem erro (api, worker, cron, frontend)
bun run typecheck → sem erro (api, worker, cron, frontend)
```

## T014 — painel de detalhe da fatura no lugar da caixa de UUID

O que foi implementado:

- `src/modules/billing/shared/billingInvoiceDetail.service.ts` — `resolveBillingCancellationState`
  com precedência permissão → status cancelado → motivo curto → requisição em voo, e
  `BILLING_CANCEL_REASON_MIN_LENGTH = 3` (mesma regra de `createCancelDraft`).
- `src/modules/billing/components/BillingInvoiceDetail.component.tsx` — painel único com resumo
  (número, status, cliente, documento, emissão, vencimento, total por `formatAmount`), lista de
  documentos com download e bloco de cancelamento. Duas props (`onClose`, `workspace`), estado do
  motivo interno ao painel, estilo só por token em `styles/billingInvoiceDetail.module.css`.
- `useBillingInvoiceTable.hook.ts` — `activeInvoiceId` / `openInvoice` / `closeInvoice`; limpar
  filtros ou limpar seleção fecha o painel.
- `BillingInvoiceTable.component.tsx` — a célula do número virou botão `invoices.openDetail` que
  chama `table.openInvoice(item.id)`; a linha aberta marca `aria-current`.
- `BillingWorkspace.page.tsx` — saíram o `<input>` de UUID, o painel solto de cancelamento, o painel
  solto de documentos e o `downloadController` de página. O detalhe agora abre na aba "Faturas" logo
  abaixo da tabela, e gerar fatura leva para essa aba já com a nova fatura aberta.
- `useBillingWorkspace.hook.ts` — a entrada `selectedInvoiceId` virou `invoiceId`: quem aponta a
  fatura é a tabela, não um campo digitado.
- Locales pt/en: seções `invoice`, `cancel` e `documents` da raiz aposentadas em favor de
  `invoiceDetail.*` (19 chaves), mais `invoices.openDetail`.

Verificação:

```
bun run --cwd apps/frontend-transportada test
 386 pass / 0 fail (2311 expect) — 14 arquivos

bun run lint         → sem erro (api, worker, cron, frontend)
bun run typecheck    → sem erro (api, worker, cron, frontend)
bun run format:check → All matched files use Prettier code style!
bun run --cwd apps/frontend-transportada build → ✓ built in 914ms (PWA gerado)
```

O que isso prova: os 7 testes de `test/billing/invoice-detail.contract.ts` que estavam vermelhos em
T013 passaram sem afrouxar nenhum contrato existente — incluindo os de design system, que continuam
barrando `<select>` nativo, `type="date"` em filtro, estilo inline e largura própria de módulo.

Pendente declarado: a metade "navegador real" do critério continua em aberto até o `make dev` ser
reiniciado (a API em execução ainda carrega `@adatechnology/object-storage-provider@0.1.1` enquanto o
`package.json` fixa `0.2.0-rc.0`).

## T015 · T016 — Arredondamento comercial no faturamento (defeito de produção)

**Sintoma** — no navegador, o modal "Gerar fatura" respondia
`Nao foi possivel conferir a selecao (BILLING_INVOICE_INVALID_STATE)` para qualquer seleção.

**Causa provada no banco local** (nenhum dado fiscal real reproduzido aqui — só a escala numérica):

```
$ docker exec <postgres> psql -c "select table_name, column_name, numeric_precision, numeric_scale
    from information_schema.columns where column_name in ('total_amount','freight_amount') ..."
 billing_invoice_items | freight_amount | 14 | 2
 billing_invoice_items | total_amount   | 14 | 2
 billing_invoices      | total_amount   | 14 | 2
 freight_calculations  | total_amount   | 19 | 4
```

Todos os CT-e autorizados do ambiente local têm 3ª/4ª casa decimal diferente de zero (padrão
`nn.nnnn`), enquanto `parseMoney` (`billing.use-case.ts`) exigia `fraction.slice(2) === '00'` e
lançava `invoiceInvalidStateError()` (409) caso contrário. A mesma função serve `preview` **e**
`create`, então emitir fatura também estava quebrado.

**T015 — contrato falhando** (`test/billing-application/money-rounding.contract.ts`, registrado em
`test/billing-application.contract.test.ts`):

```
$ bun test apps/api-transportada/test/billing-application.contract.test.ts
 25 pass
 3 fail
      at parseMoney (src/billing/application/billing.use-case.ts:455:41)
      at sumMoney  (src/billing/application/billing.use-case.ts:444:29)
```

Prova: as três falhas apontam para `parseMoney`, confirmando a causa antes de qualquer alteração.

**T016 — implementação**: `parseMoney` passou a converter para décimos de milésimo e arredondar meio
para cima (`(tenThousandths + 50n) / 100n`), preservando a recusa de valor fora do formato numeric.
Como `sumMoney` arredonda item a item antes de somar, o total da fatura continua igual à soma dos
itens gravados — o contrato cobre exatamente isso.

```
$ bun test apps/api-transportada/test/billing-application.contract.test.ts
 28 pass · 0 fail

$ bun run --cwd apps/api-transportada test
 1278 pass · 1 skip · 0 fail (1279 testes, 64 arquivos)

$ bun run lint       → sem saída de erro
$ bun run typecheck  → sem saída de erro
$ bun run format:check → All matched files use Prettier code style!
```

## Fase F — Feriados nacionais nos calendários (T017/T018)

**T017 — contrato falhando**: `test/design-system/brazilian-holiday.contract.ts` (5 testes) exige o
serviço puro `src/components/ui/brazilianHoliday.service.ts` com os 9 feriados fixos, os móveis
derivados da Páscoa (Carnaval −48/−47, Sexta-feira Santa −2, Corpus Christi +60, conferidos contra
Páscoa 2024-03-31, 2025-04-20 e 2026-04-05), lista ordenada/única por ano, busca por data e a marcação
no `DateRangePicker`. Entrypoint `test/design-system.contract.test.ts` passou a importar a suíte.

**T018 — implementação**: serviço com algoritmo de Meeus/Jones/Butcher em UTC e memoização por ano;
o dia feriado ganhou classe própria (`calendarDayHoliday`), `title` com o nome e uma legenda com os
feriados do mês visível no rodapé do calendário. Estilos só com tokens (`--color-copper`, `--space-*`).

## Fase G — Vencimento: data única + prazo em dias (T019/T020)

**T019 — contrato falhando**: `test/billing/due-date-field.contract.ts` (6 testes) fixa
`BILLING_DUE_DATE_TERMS = [5, 10, 15, 20, 30]`, a conversão prazo→data atravessando mês, ano e ano
bissexto (`2026-12-25` + 15 → `2027-01-09`; `2028-02-20` + 10 → `2028-03-01`), a leitura inversa
data→prazo (ou `null`), e que o campo não usa `DateRangePicker`, `<select>` nativo nem `type="date"`.
`test/design-system/date-picker.contract.ts` (5 testes) fixa o `calendar.service.ts` compartilhado e o
`DatePicker` de data única. Ambas as suítes registradas nos entrypoints correspondentes.

```
$ bun run --cwd apps/frontend-transportada test
 97 pass · 11 fail   (falhas exatamente nos contratos novos)
```

**T020 — implementação**:

- `src/components/ui/calendar.service.ts` — matemática do calendário extraída (grade do mês,
  navegação, formatação), consumida pelos dois seletores; sem React.
- `src/components/ui/date-picker.tsx` — `DatePicker` de data única, fecha ao escolher, mesma pele de
  gatilho do `Select` e o mesmo calendário com feriados.
- `src/modules/billing/shared/billingDueDate.service.ts` — prazos comerciais e conversão em UTC.
- `src/modules/billing/components/DueDateField.component.tsx` — `DatePicker` + `Select` de prazo,
  usado tanto na aba "Gerar fatura" quanto no modal de faturamento da seleção de CT-es
  (`CteBillingDialog`), que ainda usava `<input type="date">`.
- Locales `dueDate.*` em pt-BR e en.

```
$ bun run --cwd apps/frontend-transportada test
 402 pass · 0 fail (2383 asserções, 14 arquivos)

$ bun run lint       → sem saída de erro
$ bun run typecheck  → sem saída de erro
$ bun run --cwd apps/frontend-transportada build → built in 944ms (PWA gerado)
```

Pendente de verificação manual no navegador: abrir o calendário e conferir o feriado marcado com o
nome, e gerar uma fatura escolhendo o prazo de 30 dias em vez da data.

## Fase H — A fatura precisa parecer uma fatura

**Diagnóstico verificado no banco antes de codar** (5 faturas geradas pela seleção de CT-es):
cada fatura tem **1 item**, uma por tomador distinto — a regra "uma fatura por tomador" está
correta. O defeito real é que a tabela não mostra vínculo nenhum, e o vencimento gravado como
`2026-08-20 00:00:00+00` era renderizado como `19/08/2026, 21:00:00` (um dia a menos por fuso, com
hora que não existe no domínio).

**T021 — contrato falhando**: `apps/frontend-transportada/test/billing/due-date-display.contract.ts`
(5 testes) fixa `formatCalendarDate('2026-08-20T00:00:00.000Z') === '20/08/2026'` em UTC-3, a virada
de ano, a entrada já em `YYYY-MM-DD`, a ausência de hora e o passthrough de valor inválido; e lê as
fontes para garantir que tabela e detalhe usam o formatador no vencimento e continuam com
`formatMoment` em emissão/criação. Registrada em `test/billing.contract.test.ts`.

**T022 — implementação**: `src/modules/shared/calendarDate.service.ts` lê o instante em UTC
(`getUTCDate/getUTCMonth/getUTCFullYear`); aplicado em `BillingInvoiceTable.component.tsx` e
`BillingInvoiceDetail.component.tsx`.

**T023 — contrato falhando**: `apps/api-transportada/test/billing-http/invoice-items.contract.ts`
(3 testes) exige `items` com `cteNumber`, `accessKey` (44 dígitos), `description` e `totalAmount` no
`GET /v1/billing/invoices/:id`, a quebra do valor em `subtotalAmount`/`discountAmount`/
`surchargeAmount`/`observations`, e que `companyId`, `snapshot`, `storageKey`, `batchItemId` e `xml`
não atravessem a fronteira. Registrada em `test/billing-http.contract.test.ts`.

```
$ bun test test/billing-http.contract.test.ts
 SyntaxError: Export named 'INVOICE_ITEMS' not found   (vermelho projetado)
```

**T024 — implementação**:

- `drizzle-billing.repository.ts` — `mapInvoice` troca o `count(*)` por um `select` de
  `cteAccessKey`/`cteNumber`/`description`/`totalAmount` filtrado por `companyId` + `invoiceId` e
  ordenado por `lineNumber`; `mapInvoiceRecord` passa a receber os itens e derivar `itemCount`.
- `billing.use-case.ts` — o retorno do `create` monta os mesmos itens que acabou de inserir, para a
  resposta da criação e a do replay de idempotência serem idênticas.
- `billing.routes.ts` — `serializeInvoiceItems` expõe só os 4 campos do item.

**Isolamento de tenant** (query nova) em `test/integration/billing-repository.integration.ts`: o
detalhe da fatura do tenant A lista apenas a chave `1000…` e a string da chave do tenant B (`2000…`)
não aparece no payload.

```
$ DRIZZLE_TEST_DATABASE_URL=… bun test ./test/integration/billing-repository.integration.ts
 1 pass · 0 fail (35 asserções)

$ bun run --cwd apps/api-transportada test
 1281 pass · 1 skip · 0 fail (5825 asserções, 64 arquivos)

$ bun run lint        → sem saída de erro
$ bun run typecheck   → sem saída de erro
$ bun run format:check → All matched files use Prettier code style!
```

**T025 — contrato falhando**: `apps/frontend-transportada/test/billing/invoice-items.contract.ts`
(5 testes) exige que o adaptador aceite a fatura com `items`, `subtotalAmount`, `discountAmount`,
`surchargeAmount` e `observations`; que recuse item com valor fora do decimal de dinheiro ou com
campo extra (`snapshot`); que `itemCount` seja coluna da tabela; que o detalhe liste os CT-es; e que
as strings existam em pt e en. Registrada em `test/billing.contract.test.ts`. A fixture
`BILLING_ISSUED_INVOICE` passou a ter a forma nova, o que joga o contrato antigo do client no mesmo
vermelho.

```
$ bun test ./test/billing.contract.test.ts
 70 pass · 5 fail   (vermelho projetado)
```

⚠️ O vermelho expôs um defeito real já em produção local: `rejectExtraKeys` do
`billingResponse.validation.ts` **rejeitaria** a resposta 200 da API depois do T024 — é o mesmo modo
de falha do allowlist defasado que já derrubou o workspace de notas.

**T026 — implementação**:

- `billingResponse.validation.ts` — allowlist estendida, `mapInvoiceItem` valida cada linha
  (`accessKey`, `cteNumber`, `description`, `totalAmount` decimal) e recusa campo extra.
- `billingClient.service.ts` — `BillingInvoiceItem` e `BillingInvoiceSummary` com a quebra de valor.
- `billingInvoiceTable.service.ts` — coluna `itemCount` entre `dueDate` e `totalAmount`, ordenação
  numérica; a chave de storage não muda porque coluna nova entra visível pelo sanitizador.
- `BillingInvoiceTable.component.tsx` — célula da contagem.
- `BillingInvoiceDetail.component.tsx` + `billingInvoiceDetail.module.css` — tabela dos CT-es
  cobertos (número, descrição, chave, valor), com rolagem horizontal própria e zebra por token.
- Locales `invoiceDetail.items*` e `invoices.columns.itemCount` em pt-BR e en.

```
$ bun run --cwd apps/frontend-transportada test
 412 pass · 0 fail (2433 asserções, 14 arquivos)

$ bun run lint        → sem saída de erro
$ bun run typecheck   → sem saída de erro
$ bun run --cwd apps/frontend-transportada build → PWA gerado (11 entradas)
$ bun run format:check → All matched files use Prettier code style!
```

**T027 — contrato falhando**: edição da fatura (`PATCH /v1/billing/invoices/:id`).

Arquivos novos: `test/billing-application/update.contract.ts` (8 testes, registrado em
`test/billing-application.contract.test.ts`) e `test/billing-http/invoice-update.contract.ts`
(20 testes, registrado em `test/billing-http.contract.test.ts`). Arquivos estendidos:
`test/fixtures/billing-http.fixture.ts` (dependência `update`, `updateCalls`, `params.updateError`,
`UPDATED_INVOICE_SUMMARY`, `updateBillingInvoiceRequest` e `content-type` configurável no
`jsonRequest`), `test/billing-application/support.ts` (`detailUpdates` com rollback de transação e
o duplo `updateInvoiceDetails`), `test/billing-schema/billing.contract.ts` (coluna `observations`,
`billing_invoices_observations_check` e `invoice_updated` no check de nome de evento),
`test/database-migration/static-migration.contract.ts` (migration aditiva `*_billing_invoice_observations`
com rollback guardado), `test/cors.contract.test.ts` (preflight PATCH do detalhe da fatura) e
`test/integration/billing-repository.integration.ts` (isolamento de tenant da escrita nova).

O que o vermelho prova:

- o total é **recalculado no servidor** a partir do subtotal gravado (`350.00 - 50.00 + 10.25 =
310.25`); `totalAmount` e `status` enviados pelo cliente são recusados com 400;
- a escrita usa o `companyId` do contexto autenticado — o teste manda `companyId:
'attacker-company'` no input e exige que a persistência receba o da sessão;
- desconto acima do subtotal → 422 `BILLING_INVOICE_DISCOUNT_EXCEEDS_SUBTOTAL`, fatura cancelada →
  409 `BILLING_INVOICE_INVALID_STATE`, ausente/vizinha → 404 `BILLING_INVOICE_NOT_FOUND`, todos sem
  escrita e sem vazar `invoiceId`/`companyId` no corpo do erro;
- a trilha `invoice_updated` guarda os valores anterior e novo e apenas o booleano
  `observationsChanged` — o texto livre do operador nunca entra no payload do evento;
- o preflight PATCH do detalhe responde `access-control-allow-methods: GET, PATCH` e continua 403 nos
  sub-recursos (`/documents`, `/cancel`, `/preview`) e sem `Idempotency-Key`.

```
$ bun run --cwd apps/api-transportada test
 1281 pass · 1 skip · 36 fail   (vermelho projetado, nenhuma suíte pré-existente quebrada)
```

⚠️ Ordem: a migration só ganha timestamp depois de `db:generate`, então o contrato estático procura o
diretório pelo sufixo `_billing_invoice_observations` em vez de posição fixa na lista.

**T028 — implementação verde**: edição da fatura ponta a ponta.

Migration aditiva `drizzle/20260731230527_billing_invoice_observations/` — coluna
`billing_invoices.observations text NOT NULL DEFAULT ''`, `billing_invoices_observations_check`
(`length <= 500`) e ampliação do check de nome de evento para incluir `invoice_updated`, com
`rollback.sql` guardado (transação, `DO $$` conferindo exatamente uma linha do journal por
nome + hash, sem `CASCADE`, nota explícita de que derrubar a coluna descarta as observações e que
estreitar o check falha enquanto existir linha `invoice_updated`).

Implementação:

- `src/database/billing.schema.ts` — coluna, check e `BILLING_EVENT_NAMES` com `invoice_updated`;
- `src/billing/infrastructure/drizzle-billing.repository.ts` — `updateInvoiceDetails` filtrando por
  `companyId` + `id` + `expectedStatus: 'issued'` (linha ausente → 409, que é o mesmo caminho de
  fatura cancelada) e `observations` no mapeamento da fatura;
- `src/billing/application/billing.use-case.ts` — `updateInvoice` dentro da transação: lê a fatura
  pelo tenant autenticado, recusa status ≠ `issued`, recalcula `total = subtotal - desconto +
acréscimo` em centavos `bigint`, 422 quando o desconto passa do subtotal, normaliza a observação
  (colapsa espaço/controle, corta em 500, `'   '` → `''`) e grava o evento `invoice_updated`;
- `src/billing/presentation/billing.schema.ts` — `parseUpdateBillingInvoiceRequest` estrito: só
  `discountAmount`/`observations`/`surchargeAmount`, dinheiro em `^(?:0|[1-9][0-9]{0,11})\.[0-9]{2}$`,
  PATCH vazio recusado;
- `src/billing/presentation/billing.routes.ts` — rota `PATCH /billing/invoices/:id` com
  `Idempotency-Key` obrigatória e política `billing.create` (reaproveitada de propósito: criar uma
  permissão nova exigiria mexer em realm, allowlist do frontend e smoke ao mesmo tempo);
- `src/http/cors.service.ts` — `isBillingInvoiceResourcePath`: PATCH liberado só no recurso da
  fatura, e `allowedMethods` responde `GET, PATCH` ali. `preview` e os sub-recursos continuam fora;
- `src/main.ts` — `update` ligado no composition root.

Ajuste de expectativa no contrato: id de rota fora do formato UUID canônico devolve **404
`NOT_FOUND`** (o roteador nem casa a rota), igual a `/mdfe-manifests/:id` e ao DELETE de item de
lote — o teste pedia 400 e foi alinhado à regra que já vale no repositório.

```
$ bun run --cwd apps/api-transportada test
 1317 pass · 1 skip · 0 fail   (1318 testes, 64 arquivos)
$ bun run lint          → sem saída de erro
$ bun run typecheck     → sem saída de erro
$ bun run format:check  → All matched files use Prettier code style!
$ bun run --cwd apps/api-transportada build → main.js 0.85 MB
$ make migration-test
 10 pass · 0 fail       (migration aplicada e rollback executado em Postgres real)
$ DRIZZLE_TEST_DATABASE_URL=… bun test ./test/integration/billing-repository.integration.ts
 1 pass · 0 fail · 42 expect()   (tenant vizinho recebe 404 e não altera a linha; edição válida
                                  fecha 350.00 - 10.00 + 2.50 = 342.50; 350.01 → 422; cancelada → 409)
```

**T029 — contrato vermelho**: painel de edição da fatura no detalhe.

`apps/frontend-transportada/test/billing/invoice-edit.contract.ts`, registrado em
`test/billing.contract.test.ts` (entrypoint já listado no `test` do `package.json`). O contrato fixa:

- `normalizeBillingAmountInput` traduz o que o operador digita para o dinheiro que a API aceita —
  `'10'` → `'10.00'`, `'10,5'` → `'10.50'` (teclado pt-BR), vazio → `'0.00'`, e devolve `null` em
  `'-1.00'`, `'1.005'`, `'R$ 10,00'` e `'abc'`;
- `resolveBillingInvoiceEditState` recalcula `total = subtotal - desconto + acréscimo` na tela
  (`350.50 - 50.50 + 10.25 = 310.25`), trava o botão com PATCH em voo sem esconder o total previsto,
  e recusa com chave de mensagem própria sem permissão, em fatura cancelada, com valor fora do
  decimal (total `null`), com desconto acima do subtotal e com observação acima de 500 caracteres;
- `createEditDraft` é estrito: normaliza o dinheiro, apara a observação e recusa
  `companyId`, `totalAmount`, `status`, id vazio e campo inválido com `BILLING_INVALID_EDIT_DRAFT`;
- `client.updateInvoice` é `PATCH /billing/invoices/:id`, `cache: no-store`, com Bearer,
  `idempotency-key` e corpo com apenas `discountAmount`/`observations`/`surchargeAmount`;
- `createBillingController.updateInvoice` só existe com `billing.create` (sem ela, `BILLING_FORBIDDEN`
  e zero chamada ao client) e gera a chave de idempotência;
- o hook publica `updateMutation`, o componente usa o estado calculado e as chaves
  `invoiceDetail.edit*`, sem `<select>` nativo e sem `style={{`;
- as chaves de edição existem em pt e en.

```
$ bun test ./test/billing.contract.test.ts
 75 pass · 9 fail   (as 9 falhas são exatamente os 9 testes do contrato novo)
 - Cannot find module '.../shared/billingInvoiceEdit.service'
 - drafts.createEditDraft is not a function
 - client.updateInvoice is not a function
 - forbidden.updateInvoice is not a function
 - hook sem `updateInvoice`/`updateMutation`; detalhe sem `resolveBillingInvoiceEditState`
 - locales sem as chaves `edit*`
```

## T030 — painel editável da fatura (verde)

Implementação sobre o contrato vermelho do T029:

- `src/modules/billing/shared/billingInvoiceEdit.service.ts` (novo) — `BILLING_OBSERVATIONS_MAX_LENGTH`,
  `normalizeBillingAmountInput` (vírgula do teclado pt-BR, vazio → `0.00`, recusa negativo e terceira
  casa) e `resolveBillingInvoiceEditState`, que reaproveita `sumScaledAmounts`/`compareScaledAmounts`
  — dinheiro segue fora de float binário.
- `shared/billingClient.service.ts` — tipo `BillingInvoiceEdit`, `'PATCH'` no union de método e
  `updateInvoice`, com corpo montado só com os campos presentes (`exactOptionalPropertyTypes`).
- `shared/billingDraft.service.ts` — `createEditDraft` estrito; `companyId`, `totalAmount` e `status`
  continuam impossíveis de enviar a partir da tela.
- `shared/billingQueryKey.constant.ts` — `BILLING_INVOICE_LIST_QUERY_KEY` movido para cá e
  reexportado por `useBillingInvoiceTable.hook.ts`, evitando import circular com o hook do workspace.
- `hooks/useBillingWorkspace.hook.ts` — `updateInvoice` no controller (mesma permissão `billing.create`)
  e `updateMutation` invalidando o detalhe e a listagem de faturas.
- `components/BillingInvoiceDetail.component.tsx` — seção "Ajustes da fatura" com desconto, acréscimo,
  total previsto, observações (`maxLength` 500) e botão de salvar. O rascunho guarda o `invoiceId`:
  trocar de fatura volta sozinho para os valores gravados, sem `useEffect`.
- `styles/billingInvoiceDetail.module.css` — `.editGrid`/`.editField`/`.editTotal`/`.editActions` sobre
  `--field-height-compact`, `--field-padding-compact`, `--field-font-size-compact` e `color-mix`; nenhum
  hexadecimal novo.
- `locales/billingWorkspace.locale.json` e `.en.locale.json` — as 11 chaves `invoiceDetail.edit*` nos
  dois idiomas.

```
$ bun run --cwd apps/frontend-transportada test
 421 pass
 0 fail
 2513 expect() calls
Ran 421 tests across 14 files.

$ bun run lint
(sem saída de erro nas 4 apps)

$ bun run typecheck
(tsc --noEmit limpo nas 4 apps)

$ bun run format:check
All matched files use Prettier code style!

$ bun run --cwd apps/frontend-transportada build
dist/index.html                     0.77 kB │ gzip:   0.41 kB
dist/assets/index-CjE3SM4E.css    119.35 kB │ gzip:  16.49 kB
dist/assets/index-W59vEBUd.js     821.15 kB │ gzip: 231.17 kB
✓ built in 1.04s
PWA v1.3.0 — precache 11 entries (925.58 KiB)
```

O que isso prova: a tela de detalhe agora edita desconto, acréscimo e observações da fatura, recusando
na tela os mesmos casos que a API recusa (400 decimal inválido, 409 cancelada, 422 desconto acima do
subtotal) antes de gastar requisição, e a listagem de faturas é invalidada junto com o detalhe.

Pendente: conferência manual no navegador real (Fase H completa).

## T031 — contrato falhando da resolução por lote

Arquivos: `apps/frontend-transportada/test/billing/batch-selection.contract.ts` (novo),
`apps/frontend-transportada/test/billing.contract.test.ts` (registro do novo arquivo na cadeia).

```
$ bun test ./test/billing.contract.test.ts
error: Cannot find module '../../src/modules/billing/shared/billingBatchSelection.service'
(fail) billing batch selection contract > asks the eligible endpoint for the batches, page by page
(fail) billing batch selection contract > follows the cursor until the last page of the batch
(fail) billing batch selection contract > stops at the declared ceiling instead of scanning a batch without end
(fail) billing batch selection contract > groups the batch by customer, keeping the order and the decimal sum
(fail) billing batch selection contract > splits a customer above the invoice ceiling into numbered parts
(fail) billing batch selection contract > never emits a group above what a single invoice accepts

 84 pass
 6 fail
```

O que isso prova: as seis exigências do lote falham pelo motivo certo — o serviço ainda não existe —
antes de qualquer implementação.

## T032 — resolução por lote implementada

Arquivos: `apps/frontend-transportada/src/modules/billing/shared/billingBatchSelection.service.ts`
(novo), `apps/frontend-transportada/src/modules/billing/shared/billingClient.service.ts`
(`listBillableCtesForBatches`).

```
$ bun test ./test/billing.contract.test.ts
 90 pass
 0 fail
 707 expect() calls

$ bun run --cwd apps/frontend-transportada test
 427 pass
 0 fail
 2534 expect() calls
Ran 427 tests across 14 files.

$ bun run lint
(sem saída de erro nas 4 apps)

$ bun run typecheck
(tsc --noEmit limpo nas 4 apps)

$ bun run format:check
All matched files use Prettier code style!

$ bun run --cwd apps/frontend-transportada build
✓ built in 952ms
PWA v1.3.0 — precache 11 entries (926.03 KiB)
```

O que isso prova: o lote inteiro é resolvido pelo endpoint de elegíveis com `batchIdIn`, seguindo o
cursor até acabar ou até o teto de 1000 CT-es (aí devolve `truncated: true`, sem corte silencioso), e
o resultado é agrupado por tomador em ordem estável, com soma decimal exata e fatiamento em partes
numeradas de no máximo 100 CT-es — que é o que uma fatura aceita por requisição.

## T033 — contrato falhando do progresso

Arquivos: `apps/frontend-transportada/test/billing/progress.contract.ts` (novo),
`apps/frontend-transportada/test/billing.contract.test.ts` (registro na cadeia).

```
$ bun test ./test/billing.contract.test.ts
(fail) billing progress contract > turns completed over total into a whole percentage a bar can render
(fail) billing progress contract > reports success and failure counts alongside the percentage
(fail) billing progress contract > announces every finished group while the rest is still running
(fail) billing progress contract > keeps at most the declared number of invoices in flight
(fail) billing progress contract > a refused group neither stops the queue nor loses its place in the result

 90 pass
 5 fail
```

O que isso prova: as cinco exigências do progresso falham antes da implementação — `resolveProgressPercent`
e `resolveBillingProgress` não existem, `submitBillingGroups` ignora `onProgress` (0 eventos) e não
declara concorrência.

## T034 — progresso implementado

Arquivos: `apps/frontend-transportada/src/modules/shared/progress.service.ts` (novo),
`apps/frontend-transportada/src/modules/billing/shared/billingFromSelection.service.ts`
(`BILLING_GROUP_CONCURRENCY`, fila com no máximo 4 faturas em voo, `onProgress`, `resolveBillingProgress`).

```
$ bun test ./test/billing.contract.test.ts
 95 pass
 0 fail
 727 expect() calls

$ bun run --cwd apps/frontend-transportada test
 432 pass
 0 fail
 2554 expect() calls
Ran 432 tests across 14 files.

$ bun run lint
(sem saída de erro nas 4 apps)

$ bun run typecheck
(tsc --noEmit limpo nas 4 apps)

$ bun run format:check
All matched files use Prettier code style!

$ bun run --cwd apps/frontend-transportada build
PWA v1.3.0 — precache 11 entries (926.32 KiB)
```

O que isso prova: o envio deixou de ser um `Promise.all` cego — a fila anda com no máximo 4 faturas
simultâneas, avisa `{completed, total}` a cada grupo concluído, mantém o resultado na posição do grupo
mesmo quando um é recusado, e a porcentagem exposta à barra é inteira e presa entre 0 e 100.

## T035 — contrato falhando da ação de faturar lote

Arquivo: `apps/frontend-transportada/test/cte-batch/batch-billing.contract.ts` (novo), registrado como
primeiro import de `apps/frontend-transportada/test/cte-batch.contract.test.ts`.

```
$ bun test ./test/cte-batch.contract.test.ts
(fail) cte batch billing contract > only a transmitted batch can be invoiced, and only with the billing permission
      error: BILLING_MODULE_MISSING_EXPORT canBillBatch
(fail) cte batch billing contract > the bulk bar bills only the selected batches that accept it
      error: BILLING_MODULE_MISSING_EXPORT collectBillableBatches
(fail) cte batch billing contract > each finished group is announced with its own result, not only with a counter
      TypeError: undefined is not an object (evaluating 'event.outcome.customerDocument')
(fail) cte batch billing contract > the batch row and the bulk bar both offer the invoice action
      Expected to contain: "canBillBatch"
(fail) cte batch billing contract > the batch mode resolves the eligible CT-es itself instead of previewing beyond the cap
      Expected to contain: "collectBillableCtesForBatches"
(fail) cte batch billing contract > the dialog shows an accessible progress bar with the percentage in text
      ENOENT: no such file or directory, open 'src/components/ui/progress.tsx'
(fail) cte batch billing contract > the animated bar respects who asked for less motion and stays on the design tokens
      ENOENT: no such file or directory, open 'src/components/ui/progress.module.css'

 55 pass
 7 fail
 486 expect() calls
Ran 62 tests across 1 file.
```

O que isso prova: o contrato falha pelos motivos certos — não existe regra de faturamento no nível do
lote (`canBillBatch`/`collectBillableBatches`), o evento de progresso ainda não carrega o resultado do
grupo concluído, a ação "Gerar fatura" não aparece nem na linha nem na barra de seleção, o modal ainda
resolve os CT-es pelo preview (que estoura o teto de 100 ids) e a barra de progresso acessível não
existe como componente do design system.

## T036 — ação de faturar lote, modo lote do modal e barra de progresso

Arquivos novos: `apps/frontend-transportada/src/components/ui/progress.tsx` e `progress.module.css`.
Reescritos: `useCteBillingDialog.hook.ts` (dois modos — `request` para itens, `batchIds` para lotes) e
`CteBillingDialog.component.tsx`. Tocados: `cteBatchBilling.service.ts` (`canBillBatch`,
`collectBillableBatches`), `billingFromSelection.service.ts` (`BillingProgressEvent` com `outcome`),
`CteBatchRowActions`, `CteBatchSelectionBar`, `CteBatchTable`, `CteBatchWorkspace.page.tsx`,
`CteItemTable`, locales pt/en e `cteBatch.module.css`.

```
$ bun test ./test/cte-batch.contract.test.ts
 62 pass
 0 fail
 519 expect() calls
Ran 62 tests across 1 file.

$ bun run --cwd apps/frontend-transportada test
 439 pass
 0 fail
 2589 expect() calls
Ran 439 tests across 14 files.

$ bun run lint          # api + worker + cron + frontend, --max-warnings=0
$ bun run typecheck     # tsc --noEmit nas quatro apps
$ bun run format:check
All matched files use Prettier code style!

$ bun run --cwd apps/frontend-transportada build
PWA v1.3.0 — precache 11 entries (932.12 KiB)
```

Navegador real (`make smoke`, Playwright sobre o build de produção):

```
$ make smoke
  ✓  19 test/responsive.smoke.spec.ts:370:1 › operator creates a billing invoice on mobile without horizontal overflow
  ✓  21 test/responsive.smoke.spec.ts:425:1 › billing manager reviews details and cancels an invoice on desktop without horizontal overflow
  ✓  22 test/responsive.smoke.spec.ts:459:1 › operador baixa o PDF da fatura pelo painel e pela tabela no desktop
  29 passed (15.9s)
```

Duas correções de arrasto entraram aqui porque o smoke do faturamento estava vermelho desde tarefas
anteriores desta feature, não por causa do modo lote:

- `test/billing-smoke.helper.ts` — o mock ainda devolvia o CT-e elegível sem `batchName` e a fatura sem
  `discountAmount`, `subtotalAmount`, `surchargeAmount`, `itemCount`, `items` e `observations`, todos
  exigidos por `billingResponse.validation.ts`. O workspace caía em "Nao foi possivel carregar" com 200
  na mão. Fixture nova é anonimizada (`Lote CT-e julho`, chaves de acesso `5…`/`6…` repetidas).
- `test/responsive.smoke.spec.ts` — os três testes de faturamento ainda dirigiam a tela antiga
  (`getByLabel('Vencimento').fill(...)` e um campo "ID da fatura"). A tela atual tem abas
  ("Gerar fatura" / "Faturas"), `DueDateField` (date picker + select de prazo) e o detalhe da fatura
  dentro da aba "Faturas". Os testes passaram a usar `chooseOption`, `openInvoicesTab` e
  `invoiceDetailPanel`.

O que isso prova: o lote ganhou "Gerar fatura" na linha e na barra de seleção (só com `billing.create`
e status `done`/`error`/`submitted`); o modo lote resolve os CT-es pela listagem paginada de elegíveis
em vez do preview (que aceita no máximo 100 ids) e agrupa por tomador no cliente; a barra de progresso
é acessível (`role="progressbar"` com `aria-valuenow`/`aria-valuetext`), mostra porcentagem em texto,
anima listras e respeita `prefers-reduced-motion`; e o fluxo inteiro de faturamento continua de pé em
navegador real nos três viewports.

## T037 — contrato falhando do progresso da transmissão

Arquivo: `apps/frontend-transportada/test/cte-batch/batch-submission-progress.contract.ts` (novo),
registrado como segundo import de `apps/frontend-transportada/test/cte-batch.contract.test.ts`.

```
$ bun test ./test/cte-batch.contract.test.ts
(fail) cte batch submission progress contract > the queue keeps only a few batches in flight instead of firing every request at once
      error: Cannot find module '../../src/modules/cte-batch/shared/cteBatchSubmissionQueue.service'
(fail) cte batch submission progress contract > every finished batch is announced with its own result and the running counter
      error: Cannot find module '../../src/modules/cte-batch/shared/cteBatchSubmissionQueue.service'
(fail) cte batch submission progress contract > a refused batch keeps its own error code without stopping the rest of the queue
      error: Cannot find module '../../src/modules/cte-batch/shared/cteBatchSubmissionQueue.service'
(fail) cte batch submission progress contract > the summary separates what was queued from what failed and keeps the percentage whole
      error: Cannot find module '../../src/modules/cte-batch/shared/cteBatchSubmissionQueue.service'
(fail) cte batch submission progress contract > the bulk bar reports the queue with the same progress bar the invoicing uses
      ENOENT: no such file or directory, open 'src/modules/cte-batch/hooks/useCteBatchSubmission.hook.ts'

 62 pass
 5 fail
Ran 67 tests across 1 file.

$ bunx eslint test/cte-batch/batch-submission-progress.contract.ts --max-warnings=0
$ bunx tsc --noEmit
```

O que isso prova: o contrato falha pelos motivos certos — não existe fila de transmissão
(`submitCteBatches` com teto de simultaneidade, resultado por lote na posição da seleção e código de
erro preservado), não existe resumo de progresso (`resolveCteBatchSubmissionProgress`) nem o hook que
liga a fila à barra de seleção. Hoje a barra ainda faz `submittable.forEach(onSubmit)`, ou seja,
dispara todas as transmissões de uma vez e não reporta nada.

## T038 — progresso da transmissão em lote (verde)

Arquivos: `src/modules/cte-batch/shared/cteBatchSubmissionQueue.service.ts` (novo),
`src/modules/cte-batch/hooks/useCteBatchSubmission.hook.ts` (novo),
`src/modules/cte-batch/components/CteBatchSelectionBar.component.tsx`,
`src/modules/cte-batch/components/CteBatchTable.component.tsx`,
`src/modules/cte-batch/pages/CteBatchWorkspace.page.tsx`,
`src/modules/cte-batch/styles/cteBatch.module.css`, locales pt/en (`transmission.*`) e
`test/responsive.smoke.spec.ts` (smoke novo da fila em navegador real).

```
$ bun test ./test/cte-batch.contract.test.ts
 67 pass
 0 fail
 539 expect() calls
Ran 67 tests across 1 file. [63.00ms]

$ bun run --cwd apps/frontend-transportada test
 444 pass
 0 fail
 2609 expect() calls
Ran 444 tests across 14 files. [163.00ms]

$ bun run lint
$ bunx eslint src test eslint.config.js --max-warnings=0
$ eslint .

$ bun run typecheck
$ bunx tsc --noEmit
$ tsc --noEmit

$ bun run format:check
Checking formatting...
All matched files use Prettier code style!

$ bun run --cwd apps/frontend-transportada build
precache  11 entries (935.09 KiB)
files generated
  dist/sw.js
  dist/workbox-e4022e15.js

$ make smoke
  ✓  14 test/responsive.smoke.spec.ts:238:1 › admin acompanha a transmissão em lote pela barra de progresso no desktop (387ms)
  30 passed (16.3s)
```

O que isso prova: os cinco testes do contrato T037 passam sem alterar o contrato. A fila
(`submitCteBatches`, `CTE_BATCH_SUBMIT_CONCURRENCY = 3`) mantém no máximo três transmissões em voo,
guarda o resultado na posição do lote na seleção, preserva o código de erro por lote sem derrubar os
demais e anuncia cada conclusão (`onProgress`) para a barra andar durante a fila;
`resolveCteBatchSubmissionProgress` devolve percentual inteiro, contagem de sucesso e de erro. A barra
de seleção deixou de fazer `submittable.forEach(onSubmit)`.

O smoke novo prova o comportamento em navegador real: seleção do lote → "Transmitir lotes
selecionados" → uma requisição de submit, `progressbar` com `aria-valuenow=100`, texto
`100% — 1 de 1 lote(s)`, resumo `1 enviado(s) · 0 com erro` e a linha já em "Submetido", sem overflow
horizontal e sem falha de rede.

Decisão de acessibilidade registrada: o botão em lote e o botão de linha compartilham o rótulo
visível "Submeter", então o botão da barra recebeu `aria-label` próprio
(`transmission.bulkSubmit` — "Transmitir lotes selecionados") para leitor de tela e para o smoke
distinguirem um do outro.

Pendente: verificação manual do usuário no navegador (declarada em bloco no fim da feature).

## T039/T040 — a lista de faturas voltou a carregar (verde)

Defeito reproduzido antes de qualquer correção. O banco local tinha 5 faturas e 5 itens, com as 37
migrations aplicadas, e a tela mostrava "Nao foi possivel carregar as faturas.". Causa: o repositório
monta a linha de lista em `mapInvoiceListRecord`, que não devolvia `items`; o `serializeInvoice` da
rota emite `items: undefined`, a chave some do JSON e o guard do frontend exigia `Array.isArray(items)`
— um 200 válido virava `BILLING_INVALID_INVOICES_RESPONSE`.

Contrato falhando (frontend):

```
$ bun test test/billing.contract.test.ts
error: BILLING_INVALID_INVOICES_RESPONSE
      at invoicePageFromApi (src/modules/billing/shared/billingResponse.validation.ts:90:15)
(fail) billing client and queries contract > accepts an invoice list row without the item breakdown
 95 pass  1 fail
```

Contrato falhando (API):

```
$ bun test apps/api-transportada/test/billing-infrastructure.contract.test.ts
SyntaxError: Export named 'buildInvoiceItemCountFilters' not found in module
 0 pass  1 fail
```

Depois da implementação:

```
$ bun run --cwd apps/api-transportada test          → 1321 pass, 1 skip, 0 fail
$ bun run --cwd apps/frontend-transportada test     → 445 pass, 0 fail
$ bun run lint                                      → sem erro
$ bun run typecheck                                 → sem erro
$ bun run --cwd apps/frontend-transportada build    → dist gerado (PWA 11 entries)
$ cd apps/api-transportada && bun --env-file=../../.env test ./test/integration/billing-repository.integration.ts
  1 pass  0 fail  46 expect() calls
```

O que isso prova: `mapInvoiceListRecord(record, itemCount)` passou a carregar `itemCount` e
`observations`, a contagem vem de **uma** query agregada (`countInvoiceItems` +
`buildInvoiceItemCountFilters`) escopada por `company_id` e pelos ids da página — sem N+1 — e o guard
do frontend aceita a linha de lista sem `items`, devolvendo `items: []` e o `itemCount` que veio da
API. O teste de integração roda contra Postgres real: a fatura criada aparece na listagem com
`itemCount: 1` e as observações editadas, sem `items`, e a listagem do tenant vizinho volta vazia —
isolamento preservado na query nova.

Nota apurada no mesmo diagnóstico: o painel de elegíveis vazio **não** era defeito. Os 5 CT-es
autorizados do banco local já estavam faturados (`left join billing_invoice_items` → 0 sem fatura),
então não havia elegível a listar. Isso motivou a Fase J/T041.

## T041 — contrato falhando do CT-e faturado

Arquivos: `apps/api-transportada/test/cte-batch-infrastructure/item-list.contract.ts`,
`apps/api-transportada/test/cte-batch-http/item-list.contract.ts`,
`apps/api-transportada/test/fixtures/cte-batch-http.fixture.ts`,
`apps/api-transportada/test/integration/cte-item-list-repository/billing-status.integration.ts`
(registrado no entrypoint `cte-item-list-repository.integration.ts`),
`apps/frontend-transportada/test/cte-batch/item-table.contract.ts`.

```
$ bun run --cwd apps/api-transportada test
(fail) CT-e item listing billing status filter > reads the invoiced CT-e from a company scoped billing item subquery
(fail) CT-e item listing billing status filter > reports a CT-e without billing item as pending, the same rule the eligibility query uses
(fail) CT-e item listing billing status filter > combines both billing statuses as alternatives, never as a conjunction
(fail) CT-e item listing billing status filter > keeps the company filter in front of the billing status filter
(fail) CT-e item listing HTTP contract > says whether each CT-e is already on an invoice, so the screen can filter it out
(fail) CT-e item listing HTTP contract > forwards the billing status filter as a parsed list
(fail) CT-e item listing HTTP contract > lists the CT-es of the authenticated company with batch, date, and cursor
(fail) CT-e batch HTTP item listing contract > lists the CT-es of a batch with the notes linked to each one
 1323 pass, 1 skip, 8 fail
```

```
$ bun run --cwd apps/frontend-transportada test
(fail) CT-e item table contract > exposes the columns the workspace needs and keeps the storage key versioned
(fail) CT-e item table contract > filters the CT-es already turned into an invoice through a dedicated chip
(fail) CT-e item table contract > reads the tenant item list from the authenticated no-store endpoint
(fail) CT-e item table contract > keeps the paged item envelope strict against tenant and fiscal leakage
(fail) CT-e item table contract > wires the panel with locale strings, the design system select and collapsed controls
 441 pass, 5 fail
```

O que isso prova: o contrato exige `billingStatus` derivado de um `exists` correlacionado sobre
`billing_invoice_items` — a **mesma** regra da elegibilidade de faturamento — com a correlação presa a
`cte_batch_items.company_id`, o que torna o filtro seguro por construção e verificável no SQL gerado
pelo `PgDialect`. Exige também o filtro `billingStatusIn` (`invoiced`/`pending`) rejeitando valor
inválido, lista vazia e duplicata, o campo serializado na rota, e no frontend a coluna, o chip, a
chave de query e os locales pt/en. A suíte de integração fecha o ciclo contra Postgres real,
inclusive o negativo de isolamento: a fatura da empresa A não pode marcar CT-e da empresa B.

## T042 — `billingStatus` na listagem de CT-es

Arquivos: `apps/api-transportada/src/cte-batches/application/cte-batch-item.port.ts`,
`apps/api-transportada/src/cte-batches/infrastructure/drizzle-cte-batch-item.repository.ts`,
`apps/api-transportada/src/cte-batches/presentation/cte-batch.schema.ts`,
`apps/api-transportada/src/cte-batches/presentation/cte-batch.routes.ts`,
`apps/frontend-transportada/src/modules/cte-batch/shared/cteBatchItem.types.ts`,
`.../cteBatchItem.validation.ts`, `.../cteBatchItemTable.service.ts`,
`.../components/CteItemFilters.component.tsx`, `.../components/CteItemTable.component.tsx`,
`.../hooks/useCteItemTable.hook.ts`, `.../locales/cteBatch.locale.json`,
`.../locales/cteBatch.en.locale.json`, `docs/frontend/data-tables.md`.

```
$ bun run --cwd apps/api-transportada test          → 1331 pass, 1 skip, 0 fail
$ bun run --cwd apps/frontend-transportada test     → 446 pass, 0 fail
$ bun run lint                                      → sem erro
$ bun run typecheck                                 → sem erro
$ bun run --cwd apps/frontend-transportada build    → dist gerado (PWA 11 entries)
$ cd apps/api-transportada && bun --env-file=../../.env test ./test/integration/cte-item-list-repository.integration.ts
  2 pass  0 fail  69 expect() calls
$ cd apps/api-transportada && bun --env-file=../../.env test ./test/integration/billing-repository.integration.ts
  1 pass  0 fail  46 expect() calls
```

Leitura do banco local em execução, com o repositório real (`DrizzleCteBatchItemRepository`)
apontando para o Postgres do `docker compose`:

```
{"company":"00000000…","total":5,"byBillingStatus":{"invoiced":5},
 "filteredInvoiced":5,"filteredPending":0,
 "sample":[["authorized","invoiced"],["authorized","invoiced"],["authorized","invoiced"],
           ["authorized","invoiced"],["authorized","invoiced"]]}
```

O que isso prova: `billingStatus` é projetado por um `exists` correlacionado sobre
`billing_invoice_items` preso a `cte_batch_items.company_id` — a mesma regra da elegibilidade — e o
filtro `billingStatusIn` reusa **a mesma expressão** (`not exists` para `pending`), então projeção e
filtro não podem divergir. O SQL gerado é verificado pelo `PgDialect` no contrato, e a integração
contra Postgres real cobre o negativo de isolamento (fatura da empresa A não marca CT-e da empresa
B). A leitura do banco local confirma o diagnóstico da Fase I: os 5 CT-es autorizados já estavam
faturados — agora isso é visível como coluna e filtrável pelo chip, em vez de sumir da tela.

Pendente de verificação humana: o navegador real. O Keycloak local não permite
`direct access grant` em nenhum dos dois clients (`transportada-spa`, `transportada-api`), então a
chamada HTTP autenticada não pode ser feita por `curl` sem alterar o contrato do realm — a conferência
da tela fica para a passada manual.

## Fase J — Cadastro de faturamento da empresa (dados bancários + observações no PDF)

O PDF fechava sem dizer onde pagar. A decisão foi criar o cadastro na empresa em vez de chumbar texto
no gerador: `company_fiscal_profiles` já é a linha única de configuração por empresa, então os seis
campos entram nela e o PDF omite o bloco quando estão vazios.

Migration `20260801040948_company_billing_defaults` — puramente aditiva: seis `add column` com
`default ''` e três `check` (código do banco com 3 dígitos, agência só numérica, observações até 500).
`rollback.sql` escrito à mão ao lado, derrubando constraints e colunas na ordem inversa dentro de uma
transação, com `raise exception` se a linha do journal não sair — sem `cascade`.

Defeito real encontrado no caminho: `drizzle-invoice-document.repository.ts` tinha
`INVOICE_OBSERVATIONS = ''` chumbado, então a coluna `billing_invoices.observations` — que já existia
desde `20260731230527_billing_invoice_observations` — nunca chegava no PDF. Agora as duas fontes são
colunas de verdade, fixadas pelo contrato `DOCUMENT_INVOICE_SELECTION`/`DOCUMENT_FISCAL_PROFILE_SELECTION`.

No frontend o bloco é obrigatório no corpo do PATCH (schema `strict` na API), então o guard de
resposta, o `cleanUpdate` e o `fallbackSettings` foram alinhados juntos — um bloco que a tela não
enviasse voltaria vazio do banco e apagaria o cadastro na primeira gravação.

```
$ bun run --cwd apps/api-transportada test        1353 pass / 0 fail
$ bun run --cwd apps/frontend-transportada test    454 pass / 0 fail
$ bun run --cwd apps/frontend-transportada typecheck · lint   silenciosos
```

Verificação contra a stack local, não contra duble. `GET /company-settings` devolve o bloco com as
seis chaves exatas que o guard do frontend exige, e o `PATCH` faz o ida-e-volta:

```
PATCH /company-settings -> 200
GET billing -> {"bankAccount":"54321-0","bankBranch":"1234","bankCode":"001",
                "bankName":"Banco do Brasil","observations":"Pagamento somente em conta …","pixKey":""}
```

E o PDF gerado depois disso (`POST /billing/invoices/{id}/documents`, extraído com `pdftotext`):

```
Total da fatura: R$ 43,13
Valor por extenso: quarenta e três reais e treze centavos
DADOS PARA PAGAMENTO: Banco 001 - Banco do Brasil · Agência 1234 · Conta 54321-0
OBSERVAÇÕES
Pagamento somente em conta de titularidade da transportadora.
```

Detalhe que quase virou falso negativo: a primeira fatura testada devolveu o PDF antigo, sem o bloco.
A rota é idempotente — acha o documento já arquivado e devolve o mesmo objeto em vez de renderizar de
novo. A prova acima é de uma fatura que ainda não tinha PDF. Consequência para o usuário: fatura já
exportada antes do cadastro continua com o PDF antigo; só uma fatura nova sai com o bloco.

## Fase K — Logo da empresa no cabeçalho do PDF

Segunda metade do cadastro decidido na Fase J. O logo não cabia em coluna de texto: é binário, tem
tipo e tamanho próprios, e o PDF precisa dos bytes. Virou tabela dedicada `company_logos` (migration
`20260801043234_company_logos`, aditiva, com `rollback.sql` ao lado) e três rotas sob a política
`settings.manage`: `GET /company-settings/logo` devolve os bytes crus com `content-type` e `etag`,
`PUT` recebe `multipart/form-data` no campo `file`, `DELETE` responde 204 sem corpo.

Duas decisões que valem registro. A primeira: o tipo declarado pelo cliente não é confiável, então a
API classifica o formato pelos _magic bytes_ e recusa qualquer coisa que não seja PNG ou JPEG — o
`content-type` do multipart entra só como sugestão. A segunda: uma imagem corrompida não pode derrubar
a fatura. O `drawLogo` do gateway engole a falha de desenho e segue imprimindo o documento, porque o
logo é decoração e o documento fiscal é o entregável — contrato
`imagem corrompida não derruba a fatura` em `test/billing-pdf/invoice-pdf-gateway.contract.ts`.

Honestidade de processo: no fatiamento da API o contrato foi escrito **depois** da implementação; no
fatiamento do frontend a suíte `test/company-settings/company-logo.contract.ts` foi escrita **antes** e
rodou vermelha (9 fail / 29 pass) com nenhum arquivo de implementação existindo.

```
$ bun run --cwd apps/api-transportada test          1378 pass / 1 skip / 0 fail — 65 arquivos
$ make migration-test                                 11 pass / 0 fail
$ bun run --cwd apps/frontend-transportada test      463 pass / 0 fail — 14 arquivos
$ bun run --cwd apps/frontend-transportada typecheck · lint · build   silenciosos · build 952ms
```

Verificação contra a stack local, com token real do Keycloak (`transportada-spa`, `local-user`):

```
GET  /company-settings/logo -> 404 {"error":{"code":"COMPANY_LOGO_NOT_FOUND", …}}
PUT  /company-settings/logo -> 200 {"data":{"byteSize":117,"mimeType":"image/png",
                                    "sha256":"16f50cff8a905dc8…","updatedAt":"2026-08-01T04:50:03.075Z"}}
GET  /company-settings/logo -> 200 image/png · 117 bytes · etag "16f50cff8a905dc8…"
                               assinatura dos 4 primeiros bytes: 137,80,78,71 (\x89PNG)
DELETE /company-settings/logo -> 204 (sem corpo) · GET seguinte -> 404
```

O `etag` é o próprio sha256 e bate com o do `PUT`: o armazenamento é sem perda, os bytes que voltam são
os que subiram. `GET /billing/invoices` responde 200 com as 5 faturas e os valores já em duas casas —
o defeito da Fase I continua fechado.

O que **não** foi provado ao vivo: uma fatura nova saindo com a imagem no cabeçalho. A rota de documento
é idempotente e as cinco faturas locais já têm PDF arquivado; `GET /billing/eligible-ctes` devolve
`0` itens, então não há CT-e livre para montar uma sexta fatura. Os elos estão cobertos por contrato —
o repositório lê o logo (`findCompanyLogo`), o use case entrega ao renderizador
(`o logo cadastrado pela empresa chega ao renderizador`) e o gateway desenha `/Subtype /Image` em todas
as páginas — mas a composição inteira contra o banco real fica pendente da próxima emissão de CT-e.
