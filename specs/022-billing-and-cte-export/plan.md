# Plano — Feature 022

## O que já existe (levantado antes de planejar)

| Peça                               | Onde                                                                                              | Estado                                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Filtro de número de CT-e/nota      | `cteBatchItemTable.service.ts` (`cteNumberFrom/To`, `invoiceNumberFrom/To`) → `cteNumberGte/Lte`… | Existe, só como faixa                                        |
| Transmissão de lote                | `POST /cte-batches/:id/issue` → `cte_issuance_attempts` + `cte_issuance_outbox` → worker          | Existe, exposta só no painel do lote                         |
| Criação de fatura                  | `billing.use-case.ts`, `POST /billing/invoices`, tomador único validado                           | Existe                                                       |
| Tabelas de fatura                  | `billing_invoices`, `_items`, `_events`, `_documents`                                             | Existem; `_documents` sempre vazia                           |
| Listagem de faturas                | —                                                                                                 | **Não existe** (só `GET /billing/invoices/:id`)              |
| Geração de documento               | —                                                                                                 | **Não existe** nenhuma linha de código nem biblioteca de PDF |
| Dados cadastrais da transportadora | `company_fiscal_profiles` (razão social, fantasia, CNPJ, IE, endereço, telefone, e-mail, banco)   | Existem                                                      |
| Peso e destinatário por nota       | `nfe_volumes` (bruto/líquido), `nfe_participants` + `nfe_addresses`                               | Existem                                                      |
| Download de XML                    | `GET /cte-batches/:id/items/:itemId/documents` → `createDownloadUrl` (URL assinada)               | Existe, um item por vez                                      |

## Dependências novas

| Pacote          | Onde               | Para quê                                       | Plano B                                                      |
| --------------- | ------------------ | ---------------------------------------------- | ------------------------------------------------------------ |
| `pdfkit`        | `api-transportada` | Desenhar o PDF com fluxo de página e paginação | `pdf-lib` (puro JS, mas sem fluxo — todo layout na mão)      |
| `@types/pdfkit` | `api-transportada` | Tipagem                                        | —                                                            |
| `fflate`        | `api-transportada` | Montar o ZIP da exportação em memória          | ZIP `store` (sem compressão) escrito à mão, se `fflate` doer |

Risco declarado: `pdfkit` publica CJS e carrega fontes AFM do próprio pacote. A primeira task da fase C
é um spike que prova a geração sob Bun 1.3.14 antes de qualquer layout. Se falhar duas vezes, troca por
`pdf-lib` sem replanejar a feature — o resto do desenho não depende da biblioteca.

## Arquivos por fase

**Fase A — tela de CT-es (frontend + filtro na API)**

- `apps/api-transportada/src/cte-batches/presentation/cte-batch.schema.ts` — `cteNumberIn`, `invoiceNumberIn`
- `apps/api-transportada/src/cte-batches/infrastructure/drizzle-cte-batch-item.repository.ts` — `inArray`
- `apps/frontend-transportada/src/modules/cte-batch/shared/cteBatchItemTable.service.ts` — parser de número
- `.../components/CteItemFilters.component.tsx`, `.../CteItemSelectionBar.component.tsx`
- `.../hooks/useCteItemTable.hook.ts` — agrupar seleção por lote, mutation de transmissão
- locales `cteBatch` pt/en

**Fase B — listagem de faturas**

- `apps/api-transportada/src/billing/presentation/billing.routes.ts` + `billing.schema.ts` — `GET /billing/invoices`
- `.../billing/application/billing.use-case.ts` + `.../infrastructure/drizzle-billing.repository.ts` — `list`
- `apps/frontend-transportada/src/modules/billing/` — abas, `InvoiceListTable.component.tsx`, hook, client, validation
- locales `billingWorkspace` pt/en

**Fase C — PDF**

- `apps/api-transportada/src/billing/domain/` — `invoice-amount-in-words.service.ts`, `invoice-layout.policy.ts`
- `.../billing/application/generate-invoice-document.use-case.ts` + `.port.ts`
- `.../billing/infrastructure/invoice-pdf.gateway.ts`, `invoice-report.query.ts` (peso/destinatário)
- `.../billing/presentation/billing.routes.ts` — `POST /billing/invoices/:id/documents`
- frontend: ação de gerar/baixar na listagem

**Fase D — exportação de XML**

- `apps/api-transportada/src/cte-issuance/presentation/cte-issuance.routes.ts` — `POST /cte-batches/items/export`
- `.../cte-issuance/application/export-cte-documents.use-case.ts` + `.../infrastructure/cte-archive.gateway.ts`
- frontend: ação na barra de seleção e no painel de filtros

## Testes obrigatórios

- **Isolamento de tenant** em toda query nova — `test/*-schema/tenant-safety.contract.ts`: listagem de
  faturas, consulta de peso/destinatário e seleção da exportação. Sem isso a task não fecha.
- Contrato antes da implementação em toda task, na cadeia explícita do `package.json` da app.
- Fase C: teste do valor por extenso sobre inteiro escalado (centavos, singular/plural, zero) e teste de
  paginação do layout (cabe em uma página × quebra em duas, com soma batendo o total).
- Fase D: teste de teto (422), de filtro vazio (422) e de que o ZIP só contém itens da empresa.

## Ordem e por quê

A entra primeiro porque é a única que muda o que o operador faz todo dia sem depender de nada novo. B
antes de C porque a listagem é onde o botão de PDF vai morar. D por último porque é a que tem mais risco
de I/O e a que menos bloqueia o resto.

## Migrations

Nenhuma. Todas as tabelas necessárias já existem. Se a fase C precisar de coluna nova em
`billing_invoices` para `observations`, ela entra com migration + rollback ao lado, na própria task.
