# Plano — Feature 025

## O que já existe (levantado antes de planejar)

| Peça                        | Onde                                                                      | Estado                                                                                                  |
| --------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Estado da tabela de faturas | `hooks/useBillingInvoiceTable.hook.ts`                                    | Filtro simples, cursor, seleção, colunas, pílulas; **sem** modo avançado                                |
| Filtros e serialização      | `shared/billingInvoiceTable.service.ts:29`                                | Sete campos `string` de valor único; `serializeBillingInvoiceQuery` emite só chave preenchida           |
| Painel de filtro            | `components/BillingInvoiceTable.component.tsx:264-300`                    | Painel **dentro** do arquivo da tabela; 4 `<input type="date">` crus; `Select` de status de valor único |
| Pílulas da tabela           | `shared/billingInvoiceFilterPills.service.ts`                             | Entregue na 024; `issuedRange`/`dueRange` já viram uma pílula só; usa `valueKey` (singular)             |
| Allowlist da rota           | `billing.schema.ts:239` (`parseBillingInvoiceList`)                       | Nove chaves inline, sem conflitos declarados, sem lista, sem faixa                                      |
| `where` da listagem         | `drizzle-billing.repository.ts:557` (`buildInvoiceListFilters`)           | Já **exportado**; `companyId` é a primeira condição; `eq` em status, documento e número                 |
| Tenant safety da listagem   | `test/billing-infrastructure/list-invoices.contract.ts`                   | Já existe e compila por `PgDialect`; é o seam para provar os filtros novos sem banco                    |
| Query builder de referência | `shared/billingEligibleAdvancedFilter.service.ts` + hook linha 127        | Avaliação no cliente sobre a página; operadores por tipo; contagem de condições ativas                  |
| Parser `3, 7, 10-40`        | `shared/billingEligibleFilterValue.service.ts` (`parseNumberFilterInput`) | Entregue na 024 com retorno tipado (`ok`/`reason`); hoje mora dentro do módulo `billing`                |
| Calendário de período       | `src/components/ui/date-range-picker.tsx`                                 | `from`/`to` + `onChange(from, to)`, rótulos por prop, feriados brasileiros                              |
| Guarda do date picker       | `test/design-system/date-range-picker.contract.ts:52`                     | Varre só `*Filters.component.tsx` — por isso a tabela de faturas escapou                                |
| Chaves de locale            | `billing/locales/billingWorkspace.locale.json` → `invoices.*`             | `filters.*`, `statusOptions.*`, `removeFilter`; falta tudo do avançado e das mensagens de erro          |

## Dependências novas

Nenhuma. Todo componente, parser e seam necessário já está no repositório — a feature é composição.

## Ordem e por quê

1. **Fase A (date picker)** vem primeiro porque é isolada, não toca em API e fecha um furo de guarda que,
   enquanto aberto, deixa qualquer tabela nova repetir o erro.
2. **Fase B (API)** antes do frontend: o contrato da query string é o que o frontend vai serializar.
   Sem isso, o front escreveria parâmetro que a rota recusa com `400`.
3. **Fase C (filtro simples no front)** consome a fase B e reaproveita o parser da 024, que sobe para
   `modules/shared` na mesma task em que ganha o segundo consumidor.
4. **Fase D (filtro avançado)** por último: é puro cliente, não depende de nada da API e é a parte com
   mais superfície de teste.
5. **Fase E** fecha documentação e evidência.

## Riscos e como são contidos

| Risco                                                                                   | Contenção                                                                                                                                          |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mover `parseNumberFilterInput` quebrar a tabela de elegíveis                            | O contrato `test/billing/eligible-number-filter.contract.ts` já cobre o parser; a task move e roda o contrato                                      |
| Ampliar o guarda de data derrubar arquivos fora do escopo                               | A varredura nova cobre `*Table.component.tsx` e `*Filters.component.tsx`; os dois arquivos de `cte-profiles` não casam com nenhum dos dois padrões |
| `statusIn` aceitar valor fora do enum e vazar para o `where`                            | O parser valida contra `BILLING_INVOICE_STATUSES` antes de montar o filtro; teste de `400` na fase B                                               |
| Filtro novo escapar do escopo de empresa                                                | Toda condição nova entra em `buildInvoiceListFilters`, que abre com `eq(companyId)`; contrato de tenant safety estendido na mesma task             |
| Seleção múltipla de status limpar para lista vazia (nenhum resultado em vez de "todos") | `selectionDiffersFromDefault`, a mesma convenção da 024; limpar restaura o default                                                                 |

## Verificação

- **API:** `bun run --cwd apps/api-transportada test` + `bun run lint` + `bun run typecheck` na raiz.
- **Frontend:** `bun run --cwd apps/frontend-transportada test` + `lint` + `typecheck` + `build`.
- **Gate final da feature:** `make check`.

## Modelo

Fases A, C e E: `sonnet`. Fase B é 🧠 (mexe na query e no contrato da rota). Fase D é `sonnet` com T010
marcada 🧠 pelo tamanho do avaliador. O usuário autorizou seguir com o modelo da sessão na 024
("depois eu verifico manualmente as implementações totais pode seguir"); a autorização segue valendo aqui.
