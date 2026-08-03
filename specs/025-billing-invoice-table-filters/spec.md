# Feature 025 — Tabela "Faturas emitidas" no contrato de tabela densa

## Problema e resultado

A 024 fechou a aba **Gerar fatura** (tabela de CT-e elegíveis) dentro do contrato obrigatório de
`docs/frontend/data-tables.md`. A aba vizinha — **Faturas**, a tabela "Faturas emitidas" — ficou para
trás. A auditoria feita ao fim da 024 encontrou três divergências, todas verificadas no código:

1. **Não existe modo avançado.** Não há `billingInvoiceAdvancedFilter.service.ts` no módulo `billing`;
   só a tabela de elegíveis tem o query builder E/OU. O `BillingInvoiceTable.component.tsx` não tem
   toggle **Simples / Avançado**. A § 2 do contrato exige os dois modos em toda tabela densa.
2. **Todo filtro é de valor único**, no frontend e na API. `BillingInvoiceTableFilters`
   (`billingInvoiceTable.service.ts:29`) tem sete campos `string`; `parseBillingInvoiceList`
   (`billing.schema.ts:239`) tem uma allowlist de nove chaves sem nenhuma variante de lista ou faixa; e
   `buildInvoiceListFilters` (`drizzle-billing.repository.ts:557`) compara `status`, `customerDocument` e
   `invoiceNumber` por `eq`. A tabela de elegíveis, depois da 024, já aceita `cteNumberIn`, `nfeNumberIn`,
   `batchIdIn` e as faixas `*From`/`*To`. A § 1 do contrato exige múltiplos valores por campo.
3. **`<input type="date">` cru em quatro campos** (`BillingInvoiceTable.component.tsx:288-297`), com
   `DateRangePicker` disponível no design system e usado pelas outras tabelas. Isso passou despercebido
   porque o guarda existente (`test/design-system/date-range-picker.contract.ts:54`) só varre arquivos
   terminados em `Filters.component.tsx` — e esta tabela tem o painel de filtro **dentro** do arquivo da
   tabela. O contrato não é fraco: o alcance dele é que é estreito demais.

**Resultado esperado:** a tabela "Faturas emitidas" oferece os mesmos filtros da tabela de elegíveis —
número de fatura por lista e faixa (`3, 7, 10-40`), documento do cliente por lista, status por seleção
múltipla, períodos pelo calendário do design system — mais o modo avançado com grupos E/OU; e o guarda do
date picker passa a cobrir qualquer painel de filtro, não só os que estão em arquivo com o nome certo.

## Fora de escopo

- Ordenação no servidor. A listagem continua ordenando por `created_at desc` no banco e reordenando a
  página no cliente, como a 009 deixou e a 023/024 mantiveram.
- Traduzir o filtro avançado para SQL. Ele é avaliado no cliente, sobre a página carregada, exatamente
  como o da tabela de elegíveis — a limitação fica registrada abaixo, não escondida.
- Trocar o cursor da paginação ou o tamanho de página (25).
- Filtro por valor total, observações ou por CT-e contido na fatura. Fica para quem pedir.
- Mudar regra de numeração, total, PDF, ajuste ou cancelamento de fatura.
- **Cancelamento em lote** (débito levantado durante esta feature, vira spec própria). Fatura não é
  removida — a API não tem `DELETE` em `billing`, só `POST /billing/invoices/:id/cancel`, e a fatura fica
  com `status = cancelled`, `cancelledAt` e `cancellationReason`. Hoje isso se faz **uma por vez**, só
  pelo detalhe (`BillingInvoiceDetail.component.tsx`), com motivo de no mínimo 3 caracteres. A barra de
  seleção em massa da tabela (`BillingInvoiceTable.component.tsx:319-330`) só oferece "limpar seleção".
  Fechar essa lacuna é regra fiscal, não filtro de tabela: precisa de motivo único para o lote,
  confirmação explícita, chave de idempotência por fatura e **resultado parcial** (fatura já cancelada ou
  sem permissão não pode derrubar o lote inteiro). Fica fora daqui de propósito.
- Migrar `CteProfileComponentRows` e `CteProfileChargeFields`, que também usam `type="date"`: são campos
  de formulário de cadastro, não painel de filtro, e não entram no alcance do guarda desta feature.
- Migrar o `AdvancedFilterBuilder.component.tsx` do `nfe-workspace`, que usa `type="date"` no valor de
  condição de data. Ali a data é um valor único por condição (dois, no operador "entre"), então o
  substituto certo é o `DatePicker`, não o `DateRangePicker` — e a troca atinge as três tabelas que
  reusam o builder. Fica registrado como débito; o guarda desta feature cobre painéis de filtro em
  `*Table.component.tsx` e `*Filters.component.tsx`, e não alcança o builder.

## Decisões tomadas

| Questão                           | Decisão                                                                                                                                   | Consequência                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Sintaxe do número de fatura       | O mesmo campo único da 024: `3, 7, 10-40` — valores soltos e **uma** faixa                                                                | Um jeito só de escrever filtro de número no produto inteiro.                                                                      |
| Onde mora o parser                | `parseNumberFilterInput` sai de `billing/shared/billingEligibleFilterValue.service.ts` para `modules/shared/numberFilterValue.service.ts` | § 3 do code-standart: o que é usado por mais de uma tela vira transversal. O módulo `billing` passa a importar, não a redeclarar. |
| Como isso vira query              | Valores soltos → `invoiceNumberIn`; a faixa → `invoiceNumberFrom` + `invoiceNumberTo`; os dois presentes combinam por **OU** no `WHERE`   | Mesma semântica da 024: lista e faixa são alternativas do mesmo domínio, não restrições que se anulam.                            |
| Tipo da coluna de número          | `billing_invoices.invoice_number` é `bigint`; compara direto com `BigInt(valor)`, sem `lpad`                                              | Diferente de `nfe_documents.number`, que é `text` e exigiu `lpad` na 024. Aqui a comparação já é numérica no banco.               |
| Teto do número de fatura          | Reaproveita o `FISCAL_NUMBER` de 9 dígitos? **Não** — fatura usa `parsePositiveInteger` (até 19 dígitos), que já é o parser vivo da rota  | Numeração de fatura é interna, não segue o leiaute fiscal de `nCT`. Trocar o teto mudaria o comportamento atual sem motivo.       |
| Documento do cliente              | `customerDocumentIn`, cada valor no mesmo `DOCUMENT` (11 a 14 dígitos) do filtro exato, teto de 100 valores                               | Cobrar uma fatura de cada CNPJ do grupo numa consulta só é o caso real; o teto é o `LIST_FILTER_MAX_VALUES` que já existe.        |
| Status                            | `statusIn` com valores de `BILLING_INVOICE_STATUSES`, sem repetição; select vira seleção múltipla na tela                                 | "Emitida **e** cancelada" hoje só se consegue limpando o filtro, o que não é a mesma consulta.                                    |
| Conflito de parâmetros            | `invoiceNumber` conflita com `invoiceNumberIn` e com a faixa; `customerDocument` com `customerDocumentIn`; `status` com `statusIn`        | Mesma regra de allowlist da 023/024, estendida à rota de faturas. Faixa pela metade continua sendo `400`.                         |
| Onde o filtro simples é aplicado  | **No servidor**, via query string — todos os campos, inclusive os novos                                                                   | A listagem é paginada por cursor: filtrar no cliente só veria 25 faturas e mentiria para quem consulta.                           |
| Onde o filtro avançado é aplicado | **No cliente**, sobre a página carregada, como o da tabela de elegíveis                                                                   | Precedente vivo do repositório. Fica registrado como limitação, com a mesma redação da tabela de elegíveis.                       |
| Campos do modo avançado           | Número, status, cliente, documento, emissão, vencimento, CT-es e total — os mesmos que a tabela já projeta                                | Condição sobre campo que a tabela não mostra seria filtro cego, como a 024 já argumentou para a coluna "Nota".                    |
| Datas                             | Os quatro `type="date"` viram dois `DateRangePicker` (emissão e vencimento), como nas outras tabelas                                      | Os pares `issuedFrom/issuedTo` e `dueFrom/dueTo` já são faixas no estado e já viram uma pílula só (`issuedRange`, `dueRange`).    |
| Alcance do guarda de data         | `date-range-picker.contract.ts` passa a varrer também `*Table.component.tsx`                                                              | O furo não foi a regra, foi o filtro por nome de arquivo. Tabela nova com painel embutido passa a ser pega sozinha.               |
| Pílulas dos filtros novos         | `billingInvoiceFilterPills.service.ts` ganha `valueKeys` para `statusIn` e junta lista + faixa numa pílula só por domínio                 | O componente e a convenção `valueKey`/`valueKeys` já existem desde a 024; só falta alimentá-los com os campos novos.              |

## Critérios de aceite

**Date picker (fase A)**

- Nenhum `type="date"` em `src/**/*Table.component.tsx` nem em `src/**/*Filters.component.tsx`.
- Os períodos de emissão e vencimento da tabela de faturas usam `DateRangePicker`, com rótulos vindos do
  locale e sem hex nem px mágico.
- Limpar o período pelo calendário zera `issuedFrom` **e** `issuedTo` (idem vencimento) e reinicia a
  paginação; a pílula correspondente some.

**API**

- `GET /billing/invoices` aceita `invoiceNumberIn`, `invoiceNumberFrom`, `invoiceNumberTo`,
  `customerDocumentIn` e `statusIn`.
- Devolve `400` para chave fora da allowlist, chave repetida, lista vazia, lista acima de 100 valores,
  faixa pela metade, faixa invertida, valor de status desconhecido, documento fora de 11–14 dígitos e para
  o filtro exato combinado com a lista ou a faixa do mesmo domínio.
- Lista e faixa de número presentes juntas resultam em **OU** entre elas, nunca em interseção.
- `buildInvoiceListFilters` continua colocando `billing_invoices.company_id` como primeira condição em
  todos os casos, com os filtros novos cobertos em `test/billing-infrastructure/list-invoices.contract.ts`.

**Frontend — filtro simples**

- "Número da fatura" aceita `3, 7, 10-40`, mostra mensagem no campo para entrada inválida e **não**
  dispara consulta nesse caso — nunca cai para "sem filtro" em silêncio.
- "Documento do cliente" aceita vários documentos separados por vírgula.
- "Status" é seleção múltipla; limpar restaura o default (todos), nunca uma lista vazia.
- Cada filtro aplicado tem pílula removível; o badge do botão de filtros usa `pills.length` no modo
  simples.
- Qualquer mudança de filtro reinicia a paginação para a primeira página.

**Frontend — filtro avançado**

- Toggle **Simples / Avançado**; grupos com conector E/OU próprio e conector E/OU entre grupos.
- Operadores derivados do tipo do campo; trocar o campo normaliza o operador e limpa o valor; sair de
  "entre" limpa o valor final.
- Condição sem valor é neutra; grupo sem condição preenchida é neutro; modelo sem grupo ativo casa com
  todas as faturas.
- O badge usa `activeConditionCount` no modo avançado; o filtro avançado vira uma pílula própria, com
  editar e remover.

**Transversais**

- Dinheiro em `Decimal`/`numeric`, comparado como decimal em string; `companyId` sempre do contexto
  autenticado.
- Todo texto visível vem do locale, nos dois idiomas, com o pt-BR acentuado (contrato
  `test/shared/locale-accents.contract.ts`).
- Nenhum CNPJ, IE, chave de acesso, razão social real, número de nota real ou XML fiscal em teste,
  fixture, log ou evidência — fixture nova é derivação anonimizada.

## Limitações que ficam registradas

- O filtro avançado avalia a **página carregada**, não a base inteira. É o mesmo comportamento da tabela
  de elegíveis e da tabela de Notas; corrigir isso é traduzir o query builder para SQL nas três telas, e
  vale uma feature própria com ADR.
- Ordenação continua sendo do cliente sobre a página; o servidor só ordena pelo keyset da paginação.
- `customerDocumentIn` e `statusIn` não têm índice dedicado. A listagem já é limitada por empresa e
  cursor; índice entra com `EXPLAIN` na evidência se a consulta doer.
