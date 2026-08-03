# Evidência — Feature 025

Uma seção por task, na ordem em que fecharam. Cada seção traz o comando, a saída relevante e o que ela
prova. Nenhum dado fiscal real aparece aqui.

## Estado inicial (auditoria que originou a feature)

Levantamento feito ao fim da 024, com os gates todos verdes (frontend 529/0, api 1393/0/1 skip,
worker 228/0, cron 24/0, `lint`/`typecheck`/`format:check` limpos).

```
$ grep -rl 'type="date"' src --include='*.tsx'
src/modules/cte-profiles/components/CteProfileComponentRows.component.tsx
src/modules/cte-profiles/components/CteProfileChargeFields.component.tsx
src/modules/nfe-workspace/components/AdvancedFilterBuilder.component.tsx
src/modules/billing/components/BillingInvoiceTable.component.tsx
```

Prova o item 3 da spec: o painel de filtro da tabela de faturas usa data nativa. O guarda existente
(`test/design-system/date-range-picker.contract.ts:54`) filtra por `endsWith('Filters.component.tsx')` e
por isso não vê esse arquivo.

```
$ find src/modules/billing/shared -name 'billingInvoice*'
billingInvoiceFilterPills.service.ts
billingInvoiceTable.service.ts
```

Prova o item 1: não existe `billingInvoiceAdvancedFilter.service.ts` — o query builder E/OU só existe
para a tabela de elegíveis.

`billingInvoiceTable.service.ts:29` (`BillingInvoiceTableFilters`, sete campos `string`),
`billing.schema.ts:239` (allowlist de nove chaves, sem lista nem faixa) e
`drizzle-billing.repository.ts:557` (`eq` em status, documento e número) provam o item 2.

## T001 — guarda do date picker passa a varrer a tabela com painel embutido

O contrato deixou de filtrar por um nome de arquivo só. `FILTER_PANEL_MARKS` agora tem
`Filters.component.tsx` **e** `Table.component.tsx`, e um teste novo afirma que o conjunto varrido é
maior que o de painéis dedicados e inclui a tabela de faturas — o guarda não pode encolher em silêncio.

Vermelho antes da implementação:

```
$ bun test test/design-system.contract.test.ts
(fail) date range picker contract > rejects native date inputs in filter panels
error: expect(received).toEqual(expected)
- []
+ [ "src/modules/billing/components/BillingInvoiceTable.component.tsx" ]
```

Prova que o furo era de alcance, não de regra: com a varredura ampliada, o arquivo aparece sozinho.

## T002 — dois `DateRangePicker` no lugar dos quatro `type="date"`

Mudanças:

- `billingInvoiceTable.service.ts` ganhou `BILLING_INVOICE_DATE_RANGES` (`issuedRange` → `issuedFrom`/
  `issuedTo`, `dueRange` → `dueFrom`/`dueTo`) com `satisfies` amarrando os nomes a
  `keyof BillingInvoiceTableFilters` — par de campos errado não compila.
- `useBillingInvoiceTable.hook.ts` expõe `setDateRange(field, from, to)`, que grava os dois extremos numa
  atualização só e reinicia a paginação. Meia faixa nunca chega a virar consulta.
- `billingInvoiceFilterPills.service.ts` passou a ler o par da constante em vez de repetir os nomes nas
  duas funções (descrever e limpar).
- `BillingInvoiceTable.component.tsx` renderiza dois `DateRangePicker` com rótulos do locale.

Nenhuma chave de locale nova foi necessária: `invoices.filters.issuedRange`, `invoices.filters.dueRange`
e `dateRange.*` já existiam nos dois idiomas desde a T014 da 024.

```
$ bun test test/design-system.contract.test.ts
 59 pass, 0 fail, 210 expect() calls

$ bun run --cwd apps/frontend-transportada test
 530 pass, 0 fail, 2926 expect() calls across 14 files

$ bun run lint && bun run typecheck        # raiz, 4 apps
(sem diagnóstico)

$ bun run --cwd apps/frontend-transportada build
✓ built in 1.19s — PWA v1.3.0, precache 11 entries (963.77 KiB)
```

T001 verde com a implementação, suíte inteira do frontend verde, gates limpos. Fase A fechada.

## T003 — contrato da rota de faturas para lista, faixa e seleção múltipla

`test/billing-http/list-invoices.contract.ts` ganhou quatro testes de aceite (lista de número, documento
e status; faixa sozinha; lista **com** faixa; listas no tamanho máximo) e um de recusa que percorre 22
consultas malformadas numa varredura só. `listBillingInvoicesRequest` passou a aceitar a query por
parâmetro, como o `listEligibleCtesRequest` já fazia desde a 024.

Vermelho antes da implementação:

```
$ bun test ./test/billing-http.contract.test.ts
(fail) forwards the invoice number list, the customer document list and the status list
(fail) forwards an invoice number range on its own
(fail) forwards an invoice number list and range together
(fail) accepts the lists at the maximum size
   Expected: 200
   Received: 400
 61 pass, 4 fail
```

Os quatro falham por `400`: a allowlist inline da rota não conhecia nenhuma das chaves novas. O teste de
recusa já passava — tudo fora da allowlist é `400` hoje — e fica como rede de regressão: depois da T004
ele prova que a recusa continua valendo para as formas erradas das chaves agora aceitas.

## T004 — allowlist, conflitos e faixas como constantes de módulo

- `INVOICE_LIST_KEYS`, `INVOICE_LIST_CONFLICTS` e `INVOICE_LIST_RANGES` viraram constantes ao lado das
  equivalentes de elegíveis; a allowlist inline saiu de dentro de `parseBillingInvoiceList`.
- `assertEligibleListKeys` virou `assertListQueryKeys({allowedKeys, conflicts, ranges, url})` — as quatro
  checagens (chave desconhecida, chave repetida, exato × lista, faixa pela metade) passaram a ser uma só
  implementação para as duas rotas, em vez de um par copiado.
- Parsers novos: `parsePositiveIntegerList`, `parsePositiveIntegerRange` (recusa faixa invertida por
  `BigInt`), `parseDocumentList` e `parseInvoiceStatusList` (recusa valor repetido e valor fora de
  `BILLING_INVOICE_STATUSES`).
- `BillingInvoiceListFilters` passou a ser `Omit<BillingInvoiceListInput, 'cursor' | 'limit'>`: os dois
  tipos não podem mais divergir campo a campo.

Número de fatura segue em `parsePositiveInteger` (até 19 dígitos), **não** no `FISCAL_NUMBER` de 9 —
numeração de fatura é interna e não segue o leiaute de `nCT`, como a spec decidiu.

```
$ bun test ./test/billing-http.contract.test.ts
 65 pass, 0 fail, 405 expect() calls

$ bun run --cwd apps/api-transportada test
 1398 pass, 1 skip, 0 fail, 6347 expect() calls across 65 files

$ bun run typecheck        # raiz, 4 apps
(sem diagnóstico)
```

T003 verde e nenhuma regressão nas outras 64 suítes da API — inclusive as de elegíveis, que passaram a
usar o `assertListQueryKeys` compartilhado.

## T005 — `where` com lista, faixa e o caminho inteiro do filtro até a query

O `or` de lista com faixa já existia: `buildNumberFilter`, privado dentro de `eligible-cte.query.ts` desde
a 024, com exatamente a semântica exigida. Em vez de reescrever, saiu para
`src/billing/infrastructure/number-filter.query.ts` e passou a servir os três domínios de número
(`cteNumber`, `nfeNumber`, `invoiceNumber`) — uma implementação só, sem cópia.

- `BillingInvoiceListFilterInput.filters` ganhou `customerDocumentIn`, `invoiceNumberFrom`,
  `invoiceNumberIn`, `invoiceNumberTo` e `statusIn`.
- `buildInvoiceListFilters` emite `inArray` para documento e status e delega o número a
  `buildNumberFilter`. `eq(companyId)` continua sendo a primeira condição da lista, antes de qualquer
  filtro opcional.

**Lacuna encontrada lendo o caminho completo, não pelo teste:** o composition root (`src/main.ts`) montava
`filters` campo a campo, com sete chaves fixas. As cinco chaves novas eram parseadas pela rota e
descartadas ali — a tela filtraria e nada mudaria, sem erro nenhum. Corrigido com um seam derivado por
resto, `toBillingInvoiceListFilters`, mais o contrato que fecha o furo:

```
$ bun test ./test/billing-http.contract.test.ts
(fail) Billing invoice filter forwarding contract > carries every parsed filter down to the compiled where
```

O teste percorre `parseBillingInvoiceList` → `toBillingInvoiceListFilters` → `buildInvoiceListFilters`
compilado por `PgDialect` e exige que as nove chaves informadas cheguem a fragmentos de SQL. Nenhum teste
cobria `main.ts` antes disso; agora a chave nova que a rota aceitar tem de aparecer na query.

Contrato de tenant safety (`test/billing-infrastructure/list-invoices.contract.ts`): `company_id` aparece
antes de `invoice_number in` na combinação de lista + faixa + documento + status, `params[0]` é o
`companyId` e nenhum parâmetro sai `undefined`. Forma da query: `in` sobre `bigint`
(`[COMPANY_ID, 3n, 7n]`), intervalo fechado (`[COMPANY_ID, 10n, 40n]`) e a combinação em `or`
(`[COMPANY_ID, 3n, 7n, 10n, 40n]`) — em `and`, `3,7` mais `10-40` devolveria zero linha.

```
$ bun test ./test/billing-http.contract.test.ts ./test/billing-infrastructure.contract.test.ts
 99 pass, 0 fail, 516 expect() calls

$ bun run --cwd apps/api-transportada test
 1404 pass, 1 skip, 0 fail, 6370 expect() calls across 65 files

$ bun run lint && bun run typecheck && bun run format:check        # raiz, 4 apps
(sem diagnóstico) — All matched files use Prettier code style!
```

Fase B fechada.
