# Tasks

Feature 025 — Tabela "Faturas emitidas" no contrato de tabela densa.

Regras do repo, valendo em toda task: **uma task por vez**; teste de contrato/aceite **antes** da
implementação; arquivo de teste novo registrado na cadeia explícita (entrypoint no `test` do
`package.json` da app, suíte no `import` do entrypoint); **teste de isolamento de tenant obrigatório
sempre que a task mexer em query**; task só fecha com evidência em `evidence.md` (comando, saída, o que
prova). Nenhum CNPJ, IE, chave de acesso, razão social real, número de nota real ou XML fiscal em teste,
fixture, log ou evidência — fixture nova é derivação anonimizada.

Verificação padrão de toda task de API: `bun run --cwd apps/api-transportada test` + `bun run lint` +
`bun run typecheck` na raiz. De toda task de frontend: `bun run --cwd apps/frontend-transportada test` +
`lint` + `typecheck` + `build`.

Modelo: as fases recomendam `sonnet`; T005 e T010 são 🧠. O usuário autorizou seguir com o modelo da
sessão na 024 ("depois eu verifico manualmente as implementações totais pode seguir") — registrado aqui
para não repetir a pergunta a cada fase.

## Fase A — Calendário do design system no painel de faturas

> 🤖 Modelo: `sonnet`

- [x] T001 Contrato **falhando** em `test/design-system/date-range-picker.contract.ts`: a varredura de
      `type="date"` passa a cobrir também `*Table.component.tsx`, e o novo conjunto varrido tem mais
      arquivos que o antigo (asserção de alcance, para o guarda não encolher em silêncio).
      Dependências: nenhuma. Sucesso: teste vermelho apontando
      `src/modules/billing/components/BillingInvoiceTable.component.tsx`.

- [x] T002 Trocar os quatro `<input type="date">` do painel de faturas por dois `DateRangePicker`
      (emissão e vencimento), com um `setDateRange(field, from, to)` no `useBillingInvoiceTable.hook.ts`
      que grava os dois extremos numa atualização só e reinicia a paginação. Chaves novas nos dois
      locales (`invoices.filters.issuedRange`, `dueRange` e os rótulos do calendário). Dependências: T001.
      Sucesso: T001 verde, gates do frontend verdes, pílula de período aparecendo e sumindo pelo
      calendário.

## Fase B — Lista, faixa e seleção múltipla na rota de faturas

> 🤖 Modelo: `sonnet` (T005 é 🧠 — mexe no `where` da listagem)

- [x] T003 Contrato **falhando** em `test/billing-http/list-invoices.contract.ts`: a rota repassa
      `invoiceNumberIn`, `invoiceNumberFrom`, `invoiceNumberTo`, `customerDocumentIn` e `statusIn`;
      devolve `400` para chave fora da allowlist, chave repetida, lista vazia, lista acima de 100 valores,
      faixa pela metade, faixa invertida, status desconhecido, documento fora de 11–14 dígitos e para o
      exato combinado com lista ou faixa do mesmo domínio; aceita `invoiceNumberIn` e faixa **juntos**.
      Dependências: nenhuma. Sucesso: teste vermelho.

- [x] T004 Implementar o parser: `parseBillingInvoiceList` ganha `INVOICE_LIST_KEYS`,
      `INVOICE_LIST_CONFLICTS` e `INVOICE_LIST_RANGES` como constantes de módulo (a allowlist inline sai),
      mais `parsePositiveIntegerList`, `parseDocumentList`, `parseInvoiceStatusList` e a faixa por
      `parsePositiveInteger`. `BillingInvoiceListInput` e `BillingInvoiceListFilters` ganham os campos.
      Dependências: T003. Sucesso: T003 verde + gates de API.

- [x] T005 🧠 Implementar o `where`: `buildInvoiceListFilters` passa a emitir `inArray` para
      `invoiceNumberIn` (convertendo cada valor para `BigInt`), `customerDocumentIn` e `statusIn`, e
      `or(inArray(...), and(gte, lte))` quando lista e faixa de número vêm juntas. **Mexe em query →
      estender `test/billing-infrastructure/list-invoices.contract.ts`** provando, por `PgDialect`, que
      `company_id` continua sendo a primeira condição em cada combinação nova e que a lista com faixa sai
      como `or`. Dependências: T004. Sucesso: contrato de tenant safety verde + gates de API.

## Fase C — Filtro simples multi-valor na tela

> 🤖 Modelo: `sonnet`

- [ ] T006 Contrato **falhando** em `test/billing/invoice-filters.contract.ts` (novo, registrado no
      entrypoint `test/billing.contract.test.ts`): `serializeBillingInvoiceQuery` emite `invoiceNumberIn`,
      `invoiceNumberFrom`/`invoiceNumberTo`, `customerDocumentIn` e `statusIn` só quando preenchidos e
      nunca junto do exato correspondente; `countActiveBillingInvoiceFilters` conta o domínio uma vez, não
      uma por chave; e `describeBillingInvoiceFilterPills` devolve uma pílula por domínio, com `valueKeys`
      para status. Dependências: T005. Sucesso: teste vermelho.

- [ ] T007 Implementar no frontend: mover `parseNumberFilterInput` para
      `src/modules/shared/numberFilterValue.service.ts` (o módulo `billing` passa a importar de lá),
      trocar `BillingInvoiceTableFilters` para o formato multi-valor, ligar o campo "Número da fatura" com
      mensagem de erro, "Documento do cliente" por lista e o `Select` de status em modo múltiplo com
      `selectionDiffersFromDefault`, e estender as pílulas. Chaves nos dois locales. Dependências: T006.
      Sucesso: T006 verde, contrato da tabela de elegíveis intacto, gates do frontend.

## Fase D — Modo avançado (grupos E/OU)

> 🤖 Modelo: `sonnet` (T010 é 🧠 — o avaliador)

- [ ] T008 Contrato **falhando** em `test/billing/invoice-advanced-filter.contract.ts` (novo, registrado
      no mesmo entrypoint): campos e tipos de `BILLING_INVOICE_CONDITION_FIELD_TYPE`; operadores derivados
      do tipo; troca de campo normaliza operador e limpa valor; sair de "entre" limpa `valueTo`; condição
      sem valor é neutra; grupo sem condição preenchida é neutro; `E`/`OU` dentro do grupo e entre grupos;
      `countActiveBillingInvoiceConditions` conta só condição com valor; dinheiro comparado por decimal em
      string, sem float. Dependências: T007. Sucesso: teste vermelho.

- [ ] T009 🧠 Implementar `shared/billingInvoiceAdvancedFilter.service.ts` no molde do
      `billingEligibleAdvancedFilter.service.ts`, com os campos que a tabela já projeta (número, status,
      cliente, documento, emissão, vencimento, CT-es, total). Dependências: T008. Sucesso: T008 verde.

- [ ] T010 Ligar o modo avançado na tela: estado e avaliação no `useBillingInvoiceTable.hook.ts`, toggle
      **Simples / Avançado** e reuso do `AdvancedFilterBuilder` no `BillingInvoiceTable.component.tsx`,
      badge por `pills.length` no simples e `activeConditionCount` no avançado, pílula própria do avançado
      com editar e remover, chaves nos dois locales. Dependências: T009. Sucesso: gates do frontend +
      contrato de pílulas e de locale acentuado verdes.

## Fase E — Regra escrita e fechamento

> 🤖 Modelo: `sonnet`

- [ ] T011 Atualizar `docs/frontend/data-tables.md` acrescentando a tabela de faturas como terceira
      referência viva (o que ela demonstra: filtro simples **no servidor** com lista + faixa, avançado no
      cliente) e a linha correspondente no `CLAUDE.md`; fechar `evidence.md` com a saída dos gates das
      cinco fases e `make check`. Dependências: T010. Sucesso: gates verdes e evidência completa.

## Limitações que ficam registradas

- O filtro avançado avalia a página carregada, não a base inteira — mesma limitação da tabela de
  elegíveis e da tabela de Notas.
- Ordenação continua no cliente sobre a página; o servidor só ordena pelo keyset da paginação.
- `customerDocumentIn` e `statusIn` sem índice dedicado; medir com `EXPLAIN` antes de criar.
- `CteProfileComponentRows` e `CteProfileChargeFields` seguem com `type="date"`: são formulários de
  cadastro, fora do alcance do guarda de painel de filtro.
