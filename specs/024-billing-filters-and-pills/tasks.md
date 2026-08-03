# Tasks

Feature 024 — Filtros da tela de faturamento: pílulas, faixa de CT-e e número da nota.

Regras do repo, valendo em toda task: **uma task por vez**; teste de contrato/aceite **antes** da
implementação; arquivo de teste novo registrado na cadeia explícita (entrypoint no `test` do
`package.json` da app, suíte no `import` do entrypoint); **teste de isolamento de tenant obrigatório
sempre que a task mexer em query**; task só fecha com evidência em `evidence.md` (comando, saída, o que
prova). Nenhum CNPJ, IE, chave de acesso, razão social real, número de nota real ou XML fiscal em teste,
fixture, log ou evidência — fixture nova é derivação anonimizada.

Verificação padrão de toda task de API: `bun run --cwd apps/api-transportada test` + `bun run lint` +
`bun run typecheck` na raiz. De toda task de frontend: `bun run --cwd apps/frontend-transportada test` +
`lint` + `typecheck` + `build`.

Modelo: as fases recomendam `sonnet`. O usuário autorizou expressamente seguir com o modelo da sessão
("depois eu verifico manualmente as implementações totais pode seguir") — registrado aqui para não
repetir a pergunta a cada fase.

## Fase A — Checkbox do design system

> 🤖 Modelo: `sonnet`

- [x] T001 Contrato **falhando** `test/design-system/checkbox.contract.ts`: o componente existe com
      `checked`, `onChange`, `indeterminate`, `disabled`, `ariaLabel` e `label`; nenhum `src/**/*.tsx`
      fora dele contém `type="checkbox"`; o CSS usa `appearance: none`, `border-radius: 0`, pinta
      `.input:checked + .box` e `.input:indeterminate + .box` com `--color-copper`, tem anel de foco de
      cobre, área de toque em `@media (pointer: coarse)` e **só** tokens (sem hex, sem `rgb(`);
      `src/styles/index.css` declara `color-scheme: dark`; a regra está em `docs/frontend/checkboxes.md`
      e no `CLAUDE.md`. Dependências: nenhuma. Sucesso: teste vermelho por componente inexistente.

- [x] T002 Implementar `checkbox.tsx` + `checkbox.module.css`, declarar `color-scheme: dark` e migrar os
      14 componentes que usavam `<input type="checkbox">` cru (billing ×2, cte-batch ×5, mdfe-manifest ×4,
      cte-profiles ×1, nfe-workspace ×1, contando menus de coluna, chips e tabelas). Remover as regras
      `accent-color` e o dimensionamento do input nativo dos CSS de módulo; trocar o hack de `ref` do
      indeterminado da tabela de Notas pela prop. Dependências: T001. Sucesso: T001 verde, gates do
      frontend verdes, tabela mostrando traço quando a seleção da página é parcial.

- [x] T003 Escrever `docs/frontend/checkboxes.md` e a linha de regra no `CLAUDE.md`; ajustar
      `test/cte-profiles/layout.contract.ts`, que afirmava o `accent-color` agora removido.
      Dependências: T002. Sucesso: gates verdes, `bun run test` do frontend em 470/0.

## Fase B — Lista **e** faixa de número de CT-e

> 🤖 Modelo: `sonnet` (T005 é 🧠 — mexe na query dos elegíveis)

- [x] T004 Contrato **falhando** de API, em dois arquivos:
      (a) `test/billing-http/eligible-filters.contract.ts` estendido — a rota repassa `cteNumberFrom` +
      `cteNumberTo`; devolve `400` para faixa pela metade, faixa invertida (`from > to`), valor não
      numérico, valor acima de 9 dígitos, chave repetida e `cteNumber` combinado com a faixa; aceita
      `cteNumberIn` e faixa **juntos**.
      (b) `test/billing-schema/eligible-query-tenant-safety.contract.ts` (novo, registrado no entrypoint
      `test/billing-schema.contract.test.ts`) — `buildEligibleCteFilters` compilado por `PgDialect`
      sempre prende `cte_fiscal_documents.company_id`, e lista + faixa saem como `or(... in ..., ... between ...)`,
      no molde vivo de `test/cte-issuance-schema/export-query-tenant-safety.contract.ts`.
      Dependências: nenhuma. Sucesso: teste vermelho.

- [x] T005 🧠 Implementar na API: `ELIGIBLE_LIST_KEYS` ganha `cteNumberFrom`/`cteNumberTo`,
      `ELIGIBLE_LIST_CONFLICTS` ganha os pares novos, `BillingEligibleListFilters` ganha os campos, e o
      `where` inline de `queryEligibleCtes` é **extraído** para
      `src/billing/infrastructure/eligible-cte.query.ts` como `buildEligibleCteFilters(input): SQL[]`
      puro — é o mesmo seam que o módulo de exportação de CT-e já usa, e é o que torna o isolamento de
      tenant testável sem banco. Lista e faixa combinam por
      `or(inArray(fiscalNumber, …), and(gte, lte))`. Dependências: T004. Sucesso: T004 (a) e (b) verdes + gates de API.

- [x] T006 Contrato **falhando** de frontend em `test/billing/eligible-number-filter.contract.ts`:
      `parseNumberFilterInput('3, 7, 10-40')` devolve `{ ok: true, values: ['3','7'], range: { from: '10', to: '40' } }`;
      aceita `10 até 40` e `10 – 40`; devolve `{ ok: false, reason: 'invalid' }` para letra,
      `'range-inverted'` para `40-10`, `'multiple-ranges'` para duas faixas e `'too-many-values'` acima de
      100; entrada vazia devolve `{ ok: true }` sem filtro. A serialização emite `cteNumberIn`,
      `cteNumberFrom` e `cteNumberTo` só quando preenchidos. Dependências: T005. Sucesso: teste vermelho.

- [x] T007 Implementar no frontend: `billingEligibleFilterValue.service.ts` com o parser de retorno
      tipado (o `undefined` silencioso sai), serialização em `billingEligibleTable.service.ts`, estado no
      `useBillingEligibleTable.hook.ts`, campo único "Número do CT-e" com mensagem de erro em
      `BillingEligibleFilters.component.tsx` e as chaves nos dois locales. Dependências: T006.
      Sucesso: T006 verde + gates do frontend.

## Fase C — Filtro e coluna por número da nota

> 🤖 Modelo: `sonnet` (T009 é 🧠 — join novo na query dos elegíveis)

- [x] T008 Contrato **falhando** de API: `parseBillingEligibleList` aceita `nfeNumberIn`,
      `nfeNumberFrom` e `nfeNumberTo` com as mesmas regras de conflito, teto e faixa da fase B; a
      resposta de elegível passa a serializar `nfeNumber` (string, podendo ser `null` quando o item não
      tem nota vinculada). Dependências: T005. Sucesso: teste vermelho.

- [x] T009 🧠 Implementar na API: join com `nfe_documents` por `(company_id, id = cte_batch_items.nfe_document_id)`,
      `nfeNumber` na projeção e no serializador, e `where` comparando `lpad(nfe_documents.number, 9, '0')`
      com o valor também preenchido a 9 dígitos — sem `::bigint`. **Mexe em query → estender
      `test/billing-schema/tenant-safety.contract.ts`** provando que o join novo carrega `companyId` e
      que nota de outra empresa não aparece nem filtra. Dependências: T008. Sucesso: T008 verde + tenant
      safety verde + gates de API.

- [x] T010 Frontend: `nfeNumber` no type guard de `billingResponse.validation.ts`, coluna "Nota" visível
      por padrão em `billingEligibleTable.service.ts` + `BillingEligibleTable.component.tsx`, campo
      "Número da nota" reusando o parser da fase B, chaves nos dois locales, contrato de
      `test/billing/eligible-number-filter.contract.ts` estendido. Dependências: T009. Sucesso: contrato
      verde + gates do frontend.

## Fase D — Pílulas de filtro em todas as tabelas

> 🤖 Modelo: `sonnet`

- [x] T011 Contrato **falhando** `test/design-system/filter-pills.contract.ts`: existe
      `src/components/ui/filter-pills.tsx` recebendo `pills: readonly FilterPill[]` (`id`, `label`,
      `value`, `onRemove`, `onEdit?`) e um `onClearAll`; cada pílula tem botão de remover com
      `aria-label` traduzido; o CSS usa só tokens, `border-radius: 0` e nenhum hex; nenhum
      `*.component.tsx` de módulo monta pílula por conta própria (`buildPills` some do
      `NfeDocumentTable.component.tsx`). Dependências: T010. Sucesso: teste vermelho.

- [x] T012 Implementar o componente e o descritor puro do billing (`billingEligibleFilterPills.service.ts`),
      ligando na aba **Gerar fatura** com uma pílula por filtro simples e uma pílula própria para o filtro
      avançado; o badge do botão de filtros passa a usar `pills.length`. Dependências: T011.
      Sucesso: T011 verde + gates do frontend.

- [x] T013 Migrar a tabela de Notas para o componente compartilhado, movendo `buildPills` do
      `.component.tsx` para `shared/nfeDocumentFilterPills.service.ts`, sem mudar o comportamento coberto
      pelo contrato existente de `nfe-workspace`. Dependências: T012. Sucesso: contrato de nfe-workspace
      verde sem alteração de asserção de comportamento + gates.

- [x] T014 Estender as pílulas às tabelas restantes — faturas emitidas (`billing`), lotes e CT-es
      (`cte-batch`) e manifestos (`mdfe-manifest`) — com o descritor puro de cada módulo.
      Dependências: T013. Sucesso: contrato de cada módulo estendido verde + gates.

- [x] T015 Escrever a regra das pílulas em `docs/frontend/data-tables.md` (§ 1 e § 2, incluindo o badge
      por `pills.length`) e a linha correspondente no `CLAUDE.md`; fechar `evidence.md` com a saída dos
      gates das quatro fases. Dependências: T014. Sucesso: gates verdes e evidência completa.

## Limitações que ficam registradas

- Ordenação e paginação da lista de elegíveis continuam como a 023 deixou (cursor, sem ordenação no
  servidor).
- `lpad(nfe_documents.number, 9, '0')` não usa índice. Aceito enquanto a lista é limitada por empresa,
  status e cursor; índice funcional entra em feature própria, com `EXPLAIN` na evidência.
- Uma faixa por campo. Duas faixas na mesma entrada são recusadas com mensagem, não ignoradas.
