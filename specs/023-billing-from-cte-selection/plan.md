# Plano — Feature 023

## O que já existe (levantado antes de planejar)

| Peça                              | Onde                                                                                                       | Estado                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Criação de fatura                 | `billing.use-case.ts` → `assertEligibleCtes` + `assertSingleCustomer`                                      | Existe; rejeita seleção mista em bloco com `BILLING_CTE_NOT_ELIGIBLE` |
| Elegibilidade por id              | `drizzle-billing.repository.ts` → `findEligibleCtesByIds`                                                  | Existe, só dentro da transação de criação — não há leitura pública    |
| Listagem de elegíveis             | `GET /billing/eligible-ctes` (cursor, `batchId`, `cteNumber`, `customerDocument`, período, faixa de valor) | Existe; sem lista de números, sem lote múltiplo, sem nome do cliente  |
| Payload de elegível               | `serializeEligibleBillingCte` devolve `batchId`, `customerDocument`, `issuedAt`                            | Existe; o frontend descarta os três                                   |
| Barra de seleção de CT-es         | `CteItemSelectionBar.component.tsx` — transmitir, exportar, limpar                                         | Existe; não tem faturar                                               |
| Mapa acumulado da seleção         | `cteBatchItemSelection.service.ts` → `CteItemAmounts { batchId, baseAmount, totalAmount }`                 | Existe; não guarda `fiscalDocumentId` nem `status`                    |
| Tabela no padrão obrigatório      | `useNfeDocumentTable.hook.ts` (Notas) e `useCteItemTable.hook.ts` (CT-es)                                  | Duas referências vivas para copiar                                    |
| Tabela de faturas geradas         | `BillingInvoiceTable.component.tsx` + `useBillingInvoiceTable.hook.ts`                                     | Já no padrão; sem painel de detalhe e sem cancelamento                |
| Seletor de período                | `components/ui/date-range-picker.tsx`                                                                      | Existe, usado na tela de Notas                                        |
| Modal de projeção como referência | `useCteEmissionDialog.hook.ts` + `cteEmission.service.ts` (`groupBlocksByReason`)                          | Existe; é a anatomia que o modal de fatura copia                      |

## Dependências novas

Nenhuma. Tudo que a feature precisa (`DateRangePicker`, `Select`, `Tabs`, `sumScaledAmounts`,
`fflate`/`pdfkit` já instalados) está no repositório.

## Migrations

Nenhuma. Nenhuma tabela nova, nenhuma coluna nova — a feature só lê o que já existe e reusa a escrita de
fatura que já existe.

## Arquivos por fase

**Fase A — preview de faturamento (API)**

- `apps/api-transportada/src/shared/api.constant.ts` — `API_BILLING_INVOICE_PREVIEW_PATH`
- `.../billing/presentation/billing.schema.ts` — `parseBillingInvoicePreviewRequest`
- `.../billing/presentation/billing.routes.ts` — rota + `serializeBillingPreview`
- `.../billing/application/billing.use-case.ts` — `previewInvoice` (agrupa por tomador, classifica bloqueio)
- `.../billing/infrastructure/drizzle-billing.repository.ts` — `findBillingPreviewByIds`
- `test/billing-application.contract.test.ts`, `test/billing-http.contract.test.ts`,
  `test/billing-schema/tenant-safety.contract.ts`

**Fase B — botão e modal na tela de CT-es (frontend)**

- `.../cte-batch/shared/cteBatchItemSelection.service.ts` — snapshot com `fiscalDocumentId` e `status`
- `.../cte-batch/shared/cteBatchBilling.service.ts` — `collectBillableCtes`, `canBillSelection`, agrupamento de bloqueios
- `.../cte-batch/hooks/useCteBillingDialog.hook.ts` — preview, vencimento, confirmação por grupo
- `.../cte-batch/components/CteBillingDialog.component.tsx` + ação em `CteItemSelectionBar.component.tsx`
- `.../billing/shared/billingClient.service.ts` — `previewInvoice`
- locales `cteBatch` pt/en

**Fase C — tela de faturamento no padrão de Notas**

- `apps/api-transportada/.../billing/presentation/billing.schema.ts` + `drizzle-billing.repository.ts` — `cteNumberIn`, `batchIdIn`, `customerName`
- `.../billing/shared/billingEligibleTable.service.ts` — colunas, filtros, serialização, filtro avançado, chave `billing.eligible.columns.v1`
- `.../billing/hooks/useBillingEligibleTable.hook.ts` — cursor com pilha, seleção acumulada, ordenação da página
- `.../billing/components/BillingEligibleTable.component.tsx` + `BillingEligibleFilters.component.tsx` + `styles/billingEligibleTable.module.css`
- `.../billing/pages/BillingWorkspace.page.tsx` — aba "Gerar fatura" passa a ser tabela + rodapé de criação
- locales `billingWorkspace` pt/en

**Fase D — detalhe da fatura no lugar da caixa de UUID**

- `.../billing/components/BillingInvoiceDetail.component.tsx`
- `.../billing/hooks/useBillingInvoiceTable.hook.ts` — linha selecionada dirige detalhe/documentos/cancelamento
- `.../billing/pages/BillingWorkspace.page.tsx` — some o `input` de UUID e o painel solto de cancelamento

## Testes obrigatórios

- **Isolamento de tenant** em `findBillingPreviewByIds` e nos filtros novos de `listEligibleCtes`: id e
  filtro de outra empresa não vazam nem como grupo nem como linha. Sem isso a task não fecha.
- Fase A: agrupamento por tomador com soma decimal em string, classificação dos quatro motivos de
  bloqueio, ordem estável dos grupos.
- Fase B: `collectBillableCtes` sobre o mapa acumulado (item de página já descartada continua faturável),
  bloqueio local sem `fiscalDocumentId`, uma requisição por grupo com chave de idempotência distinta,
  sucesso parcial preservado.
- Fase C: serialização de filtros (chave vazia não vai na query), ida e volta de cursor, reordenação e
  sanitização de colunas, avaliação do filtro avançado (E/OU aninhado, neutralidade), soma acumulada
  entre páginas, contrato de largura/campos/`<select>` do design system.
- Fase D: cancelamento exige `billing.cancel` e motivo ≥ 3; painel some ao limpar a seleção.

## Ordem e por quê

A primeira porque o modal não pode ser escrito contra um endpoint que não existe. B em seguida porque é o
pedido explícito do usuário e entrega valor sozinha. C depois porque é a maior e não bloqueia ninguém. D
por último porque só faz sentido quando a aba de elegíveis já não depende da caixa de UUID.
