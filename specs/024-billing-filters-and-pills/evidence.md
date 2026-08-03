# Evidência — Feature 024

## Fase A — Checkbox do design system

### T001 · contrato antes da implementação

Comando: `bun run --cwd apps/frontend-transportada test`

Vermelho esperado antes da implementação: `test/design-system/checkbox.contract.ts` falhava por
`src/components/ui/checkbox.tsx` não existir e por 14 arquivos `src/**/*.tsx` conterem
`type="checkbox"`.

### T002 · implementação e migração

14 componentes migrados: `BillingEligibleTable`, `BillingInvoiceTable`, `CteBatchColumnsMenu`,
`CteBatchFilters`, `CteBatchTable`, `CteItemColumnsMenu`, `CteItemFilters`, `CteItemTable`,
`MdfeManifestColumnsMenu`, `MdfeManifestCreationPanel`, `MdfeManifestFilters`, `MdfeManifestTable`,
`ProfileField`, `NfeDocumentTable`.

Regras removidas dos CSS de módulo (o input nativo deixou de ser dimensionado e pintado fora do
design system):

- `nfeWorkspace.module.css` — `.checkOption input { … accent-color }` e `.selectCell input { … accent-color }`
- `cteProfiles.module.css` — `.fieldGrid .checkboxField input, .fieldGroup > .checkboxField input { … accent-color }`

Prova na página logada (`javascript_tool`, sem screenshot):

| Medida                                                   | Valor                                                    |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `getComputedStyle(document.documentElement).colorScheme` | `dark`                                                   |
| Caixa do checkbox                                        | `20px × 20px`, `border-radius: 0px`                      |
| Marcado                                                  | `background-color: rgb(213, 138, 71)` (`--color-copper`) |
| Cabeçalho com 2 de 5 linhas marcadas                     | `indeterminate === true`, traço renderizado              |

Nota de leitura: a primeira medição devolveu um `oklab(...)` escuro. Causa: `document.hidden === true`
congela a transição do CSS no meio. Com `transition = 'none'` o valor volta a `rgb(213, 138, 71)`.
Não era defeito de código.

### T003 · gates

Comando: `bun run --cwd apps/frontend-transportada test`

```
470 pass
0 fail
```

`bun run lint` e `bun run typecheck` na raiz: sem erro.

Fora de escopo, pré-existente: `bun test` (varredura, não o script declarado) reporta 1 erro em
`test/responsive.smoke.spec.ts` — arquivo Playwright que o runner do Bun não deve carregar.

`test/cte-profiles/layout.contract.ts` foi ajustado: afirmava `accent-color: var(--color-copper)` em
`cteProfiles.module.css`, declaração que a migração removeu. Passou a afirmar o import do design
system e a **ausência** de `accent-color`.

## Fase B — Lista e faixa de número de CT-e

### T004 · contrato antes da implementação

Comando: `bun test ./test/billing-schema.contract.test.ts ./test/billing-http.contract.test.ts`

```
54 pass
4 fail
1 error
```

As 4 falhas são as asserções novas da faixa (`200` esperado, `400` recebido — a chave ainda não estava
na allowlist). O `1 error` é o import de `src/billing/infrastructure/eligible-cte.query.ts`, que ainda
não existia. Vermelho pelas duas razões certas.

### T005 · implementação

- `src/billing/infrastructure/eligible-cte.query.ts` (novo) — `buildEligibleCteFilters(input): SQL[]`,
  com o recorte de elegibilidade e todos os filtros. É o seam que torna o isolamento de tenant
  verificável sem banco, no mesmo molde de `cte-export-selection.query.ts`.
- `drizzle-billing.repository.ts` — o `where` inline de 36 linhas virou `and(...buildEligibleCteFilters(input))`;
  `endOfDay` e os imports `ilike`/`isNotNull`/`isNull` migraram junto.
- `billing.schema.ts` — `cteNumberFrom`/`cteNumberTo` na allowlist, `ELIGIBLE_LIST_RANGES` recusando
  faixa pela metade, `ELIGIBLE_LIST_CONFLICTS` recusando exato + faixa, e `parseFiscalNumber` /
  `parseFiscalNumberList` / `parseFiscalNumberRange` (`^[1-9][0-9]{0,8}$`, o `nCT` de 9 dígitos do
  leiaute; faixa invertida é `400`).
- `main.ts` — os dois campos novos no repasse de filtros para `billing.listEligible`.

Lista e faixa combinam por `or`, não por `and`: em `and`, uma seleção disjunta (`3,7` mais `10-40`)
devolveria zero linha. O contrato de tenant safety verifica o `or` no SQL compilado.

### Gates

```
$ bun run --cwd apps/api-transportada test
1387 pass · 1 skip · 0 fail · 6214 expect() calls

$ bun run lint      → sem erro
$ bun run typecheck → sem erro
```

Três falhas apareceram numa execução intermediária (`Drizzle migrations` ×2 e `tenant fiscal schema` ×1)
com `ENOENT … drizzle/.omc/migration.sql`. Causa: a camada OMC gravou estado de sessão em
`apps/api-transportada/drizzle/.omc/state/sessions/<id>/pre-tool-advisory-throttle.json` (um arquivo de
4K, gitignorado), e o teste de migrations percorre **todo** subdiretório de `drizzle/` esperando
`migration.sql`. Removido o diretório, a suíte fecha em 0 fail. Não tem relação com esta feature — mas
vale como aviso: qualquer diretório estranho dentro de `drizzle/` quebra três testes.

### T006 · contrato antes da implementação (frontend)

Comando: `bun test ./test/billing.contract.test.ts`

```
99 pass
7 fail
```

As 7 falhas: `parseNumberFilterInput is not a function` (o parser ainda não existia) e as três asserções
de serialização (`cteNumberIn`/`cteNumberFrom`/`cteNumberTo` recebendo `null`). Vermelho pelas razões
certas.

### T007 · implementação (frontend)

- `billingEligibleFilterValue.service.ts` — `parseCteNumberList` (que devolvia `undefined` para tudo que
  desse errado) foi substituído por `parseNumberFilterInput`, de retorno tipado:
  `{ ok: true, values?, range? }` ou `{ ok: false, reason }` com `NUMBER_FILTER_REASONS`
  (`invalid`, `multiple-ranges`, `range-inverted`, `too-many-values`). O padrão de número é o mesmo
  `^[1-9][0-9]{0,8}$` da API; os separadores de faixa aceitos são `-`, `–`, `—` e `até`.
- `billingEligibleTable.service.ts` — a serialização emite `cteNumberIn`, `cteNumberFrom` e
  `cteNumberTo`, cada um só quando preenchido.
- `useBillingEligibleTable.hook.ts` — `filterErrors` derivado do parser, sem estado próprio.
- `BillingEligibleFilters.component.tsx` — `aria-invalid` no campo, `role="alert"` com a mensagem
  traduzida abaixo dele e placeholder `Ex.: 3, 7, 10-40` no campo de CT-e.
- Locales pt/en: rótulo passou a "Numero do CT-e", mais `filters.hints` e `filters.errors`.
- `--color-alert` entrou em `src/styles/index.css` — o `#ff5f57` que já existia solto em
  `nfeWorkspace.module.css` virou token para o código novo não repetir o hex. Migrar os usos antigos
  fica fora do escopo desta feature.

Entrada inválida continua **não** virando requisição (a API responderia 400), mas agora o operador vê o
motivo em vez de a tela filtrar por nada — que era o furo que motivou a feature.

### Gates

```
$ bun run --cwd apps/frontend-transportada test
478 pass · 0 fail · 2799 expect() calls

$ bun run lint      → sem erro
$ bun run typecheck → sem erro
$ bun run --cwd apps/frontend-transportada build → PWA gerado, 11 entradas
```

Pendência registrada, não introduzida aqui: o locale pt do billing continua sem acentuação. As chaves
novas foram escritas no mesmo padrão do arquivo para não misturar dois estilos na mesma tela.

## Fase C — Filtro e coluna por número da nota

### T008 — contrato vermelho antes da implementação (API)

`test/billing-http/eligible-filters.contract.ts` ganhou três testes: encaminhamento de
`?nfeNumberIn=3,7&nfeNumberFrom=10&nfeNumberTo=40`, encaminhamento de `?nfeNumberIn=123456` sozinho
(com `nfeNumberFrom` indefinido) e uma tabela de recusa cobrindo faixa pela metade, faixa invertida,
valor não numérico, número com 10 dígitos, lista vazia, lista com buraco, `0`, chave repetida e 101
valores — todos exigindo 400/`INVALID_REQUEST` com `listEligibleCalls` vazio.
`test/billing-http/create-and-query.contract.ts` passou a exigir `nfeNumber` na resposta (`'4521'` no
primeiro item e `null` no segundo, que a fixture criou sem nota vinculada).

```
$ bun test ./test/billing-http.contract.test.ts
57 pass · 3 fail
```

As três falhas eram exatamente as esperadas: 400 no lugar de 200 nos dois encaminhamentos (chaves fora
da allowlist) e ausência de `nfeNumber` no serializador.

### T009 — implementação

- `eligible-cte.query.ts`: `buildNumberFilter` virou genérico por objeto de opções (coluna +
  conversor), de modo que CT-e (coluna `bigint`) e nota (expressão de texto) dividem a mesma semântica
  de lista **ou** faixa. `nfe_documents.number` é texto sem preenchimento e sem índice, então a
  comparação usa `lpad(number, 9, '0')` dos dois lados — `::bigint` estouraria em qualquer linha fora
  do padrão numérico.
- `buildEligibleNfeDocumentJoin()` foi exportado justamente para o predicado do join ficar compilável
  e, portanto, verificável sem banco.
- `drizzle-billing.repository.ts`: `leftJoin` (não `innerJoin`) com `nfe_documents`, para o join novo
  não conseguir encolher a lista de elegíveis; `nfeNumber` na projeção e no mapeamento; os três
  filtros encaminhados em `listEligibleCtes` e fixados em `null` em `findEligibleCtesByIds`.
- `billing.schema.ts`: as três chaves na allowlist, o par `['nfeNumberFrom','nfeNumberTo']` na
  validação de faixa (faixa pela metade é recusada) e o parse reusando `parseFiscalNumberList` /
  `parseFiscalNumberRange` — mesmo teto de 100 valores da fase B.
- `billing.routes.ts`: `nfeNumber: record['nfeNumber'] ?? null` — item sem nota vinculada mantém a
  chave com `null` em vez de sumir do payload.
- `main.ts`: os três campos encaminhados para `billing.listEligible`.

### Tenant safety (query)

O `test/billing-schema/tenant-safety.contract.ts` é de schema (tipo de coluna, `not null`, FK, UTC),
não de query — a prova de isolamento da query vive em
`test/billing-schema/eligible-query-tenant-safety.contract.ts`, criado na fase B e estendido aqui com
três testes: `lpad(...)` presente e `::bigint` ausente com os parâmetros preenchidos (`000000010`),
lista e faixa de nota unidas por `or`, e o join carregando
`"nfe_documents"."company_id" = "cte_batch_items"."company_id"` além do `id`. Sem essa condição o join
alcançaria nota de outra empresa pelo id sozinho.

### Gates

```
$ bun test ./test/billing-schema.contract.test.ts ./test/billing-http.contract.test.ts
74 pass · 0 fail · 455 expect() calls

$ bun run --cwd apps/api-transportada test
1393 pass · 1 skip · 0 fail · 6268 expect() calls

$ bun run lint      → sem erro
$ bun run typecheck → sem erro
```

O typecheck acusou `nfeNumberIn` ausente em `BillingInvoiceCall` (o tipo da fixture de chamadas
gravadas); os três campos foram declarados lá e a rodada seguinte ficou limpa.

### T010 — contrato vermelho

`test/billing/eligible-number-filter.contract.ts` ganhou cinco testes: serialização do filtro de nota
(`nfeNumberIn` / `nfeNumberFrom` / `nfeNumberTo`), tratamento de faixa, lista e entrada inválida,
`EMPTY_BILLING_ELIGIBLE_FILTERS.nfeNumberQuery === ''` somando na contagem de filtros ativos, nota
`null` aceita pelo adaptador de resposta e nota não-texto e não-nula recusada.
`eligible-table.contract.ts` e `eligible-screen.contract.ts` passaram a exigir `nfeNumber` entre as
colunas (sete agora), entre os campos de condição do filtro avançado e `nfeNumberQuery` entre os
filtros.

```
$ bun test ./test/billing.contract.test.ts
103 pass · 8 fail
```

### T010 — implementação

- `billingClient.service.ts` e `billingResponse.validation.ts`: `nfeNumber: null | string` no tipo,
  `'nfeNumber'` na allowlist e guarda `input.nfeNumber !== null && !isString(...)` — CT-e sem nota
  vinculada continua listável, com a chave presente e `null`.
- `billingEligibleTable.service.ts`: `'nfeNumber'` logo depois de `'cteNumber'` em
  `BILLING_ELIGIBLE_COLUMN_KEYS` (visível por padrão), `nfeNumberQuery` nos filtros e no vazio, a
  serialização reusando `parseNumberFilterInput` da fase B, e `compareNoteNumbers` ordenando por
  `BigInt` com nota ausente no fim — comparar como texto colocaria `43` antes de `9`.
- `useBillingEligibleTable.hook.ts`: `collectFilterErrors` passou a acumular os erros dos dois campos
  numéricos em vez de só o de CT-e.
- `BillingEligibleFilters.component.tsx` e `BillingEligibleTable.component.tsx`: campo de texto com
  dica e célula caindo para vazio quando não há nota.
- `billingEligibleAdvancedFilter.service.ts`: `nfeNumber` como campo numérico do construtor E/OU —
  a coluna nova não podia ser a única sem filtro avançado. Linha sem nota não satisfaz condição
  numérica nenhuma.
- Locales pt e en: `columns.nfeNumber`, `filters.nfeNumberQuery` e a dica `Ex.: 3, 7, 10-40`; o
  `errors.invalid` perdeu o "de CT-e" porque agora serve aos dois campos.

### Gates

```
$ bun test ./test/billing.contract.test.ts
111 pass · 0 fail · 790 expect() calls

$ bun run --cwd apps/frontend-transportada test
483 pass · 0 fail · 2819 expect() calls

$ bun run --cwd apps/frontend-transportada build → ok (PWA, 11 entradas de precache)
$ bun run lint      → sem erro
$ bun run typecheck → sem erro
```

O typecheck acusou `nfeNumber` ausente no elegível sintético de
`test/billing/batch-selection.contract.ts`; o campo foi preenchido lá e a rodada seguinte ficou limpa.

## Fase D — Pílulas de filtro

### T011 — contrato vermelho

`test/design-system/filter-pills.contract.ts` (registrado em `test/design-system.contract.test.ts`)
exige: `src/components/ui/filter-pills.tsx` exportando `FilterPill` (`id`, `label`, `value`,
`onRemove`, `onEdit?`) e `FilterPills` com `pills` e `onClearAll`; todo texto visível entrando por
prop (`removeLabel`, `clearAllLabel`) porque o design system não tem tradutor — nenhum
`useTranslation` lá dentro; `onEdit` opcional de verdade; tira vazia não renderiza nada;
`filter-pills.module.css` com `border-radius: 0`, só token, sem hex nem `rgb()`, e alvo de toque em
`@media (pointer: coarse)`; nenhum `*.component.tsx` de módulo montando pílula própria; a regra
escrita em `docs/frontend/data-tables.md` e no `CLAUDE.md`.

```
$ bun test ./test/design-system.contract.test.ts
50 pass · 8 fail
```

As oito falhas são os oito testes novos: `filter-pills.tsx` e o CSS ainda não existem,
`NfeDocumentTable.component.tsx` continua sendo o único ofensor com `buildPills` +
`styles.filterPill`, e a documentação ainda não cita o componente compartilhado.

### T012 — componente compartilhado + descritor do billing

Contrato novo `test/billing/eligible-filter-pills.contract.ts` (registrado em
`test/billing.contract.test.ts`) sobre
`src/modules/billing/shared/billingEligibleFilterPills.service.ts`: sem filtro aplicado a lista sai
vazia; uma pílula por filtro preenchido na ordem declarada em `BILLING_ELIGIBLE_PILL_FIELDS`;
`issuedFrom`/`issuedTo` colapsam numa única pílula `issuedRange`, com `…` no lado aberto; a pílula do
avançado só existe com condição ativa e vai por último; valor só de espaço é aparado;
`clearBillingEligibleFilterField` limpa apenas o campo alvo, limpa as duas pontas do intervalo e
devolve os filtros intactos para `advanced` (que vive noutra fatia de estado).

```
$ bun test ./test/billing.contract.test.ts   (antes da implementação)
111 pass · 6 fail   → Cannot find module 'billingEligibleFilterPills.service'
```

Implementação:

- `src/components/ui/filter-pills.tsx` + `filter-pills.module.css` — componente sem tradutor
  (`removeLabel`, `editLabel`, `clearAllLabel` entram por prop), `pills.length === 0` devolve `null`,
  botão de remover com `aria-label`, só design token, `border-radius: 0` e alvo de toque ampliado em
  `@media (pointer: coarse)`.
- `billingEligibleFilterPills.service.ts` — puro e agnóstico de locale: recebe `formatDay` injetado
  (em produção, o `formatCalendarDate` já existente) e devolve `{ field, labelKey, value }`.
- `useBillingEligibleTable.hook.ts` — nova ação `clearFilterField(field)`, que reseta o modelo
  avançado quando o campo é `advanced` e, nos demais, delega ao descritor; sempre limpa a seleção e
  volta para a primeira página, porque cursor de uma consulta não vale para outra.
- `BillingEligibleTable.component.tsx` — tira de pílulas logo abaixo do painel de filtros; a pílula
  do avançado ganha `onEdit` que reabre o painel; `const activeCount = pills.length`.
- Locales pt/en: `eligible.removeFilter`, `removeAdvanced`, `editAdvanced`, `advancedPill` e
  `eligible.filters.advanced`.

Duas asserções de `test/billing/eligible-screen.contract.ts` foram tocadas, e vale registrar por quê:

- `not.toContain('Number(')` é a guarda de dinheiro sem float binário — ela estava certa e a
  violação era minha (`Number(descriptor.value)` só para alimentar o plural do i18n). O componente
  passou a usar `table.activeConditionCount`, que já é número, e a guarda continua de pé.
- `toContain('table.activeFilterCount')` virou `toContain('const activeCount = pills.length')`. Essa
  é a mudança de comportamento que a própria T012 pede: o badge conta pílulas, então um intervalo de
  datas com as duas pontas preenchidas passa a valer 1, e não 2.

```
$ bun test ./test/billing.contract.test.ts      → 117 pass · 0 fail
$ bun run test (frontend)                       → 495 pass · 2 fail
$ bun run lint                                  → sem erro
$ bun run typecheck                             → sem erro
$ bun run --cwd apps/frontend-transportada build → ok (PWA, 11 entradas de precache)
```

As duas falhas restantes são, propositalmente, do contrato da T011 e não fecham nesta task:
`forbids a module component from assembling its own pill` só passa quando a T013 tirar o `buildPills`
do `NfeDocumentTable.component.tsx`, e `states the rule for every future table` espera a T015 citar
`components/ui/filter-pills` em `docs/frontend/data-tables.md` e no `CLAUDE.md`.

### T013 — tabela de Notas no componente compartilhado

Contrato novo `test/nfe-workspace/filter-pills.contract.ts` (registrado em
`test/nfe-workspace.contract.test.ts`) sobre
`src/modules/nfe-workspace/shared/nfeDocumentFilterPills.service.ts`: filtro intocado não descreve
nada; um descritor por campo de texto preenchido, na ordem declarada, com valor só de espaço aparado;
o valor dos campos de seleção sai como **chave** (`valueKey`) e não como texto, porque o descritor não
tem tradutor — `documentStatus.cancelled` para o status e `filters.cteIssuedIssued` / `filters.all`
para o CT-e emitido, que só vira pílula quando sai do default `pending`; número e data colapsam em uma
pílula cada, com `…` no lado aberto; o símbolo do operador acompanha o valor.

```
$ bun test ./test/nfe-workspace.contract.test.ts   (antes da implementação)
0 pass · 1 fail   → Cannot find module 'nfeDocumentFilterPills.service'
$ bun test ./test/nfe-workspace.contract.test.ts   (depois)
101 pass · 0 fail
```

Migração do componente:

- `buildPills` saiu do `NfeDocumentTable.component.tsx` (86 linhas) e virou o serviço puro acima; no
  componente restaram `toPill` (traduz `labelKey`/`valueKey` e liga `clearFilter`) e
  `savedAdvancedPill` (a única com `onEdit`, que reabre o construtor).
- A tira manual de `<span className={styles.filterPill}>` foi trocada pelo `<FilterPills>`
  compartilhado, que ganhou o botão de limpar tudo (`documents.clearAll` → `table.clearAllFilters`),
  que a tela antes não oferecia ali.
- O badge do modo simples passou a contar `pills.length`, com a pílula do avançado já dentro da lista
  — antes era `pills.length + (showAdvancedPill ? 1 : 0)`; o modo avançado segue em
  `activeConditionCount`.
- As oito regras `.filterPill*` de `nfeWorkspace.module.css` foram removidas por terem ficado órfãs;
  `CloseIcon` ficou, ainda em uso na barra de seleção.
- Locale pt: `documents.builder.savedLabel` novo, e `savedPill` reduzido a `{{count}} condição(ões)` —
  o rótulo "Filtro avançado" agora vem separado do valor, e mantê-lo no `savedPill` duplicaria o texto
  dentro da pílula.

```
$ bun run test (frontend)                        → 503 pass · 1 fail
$ bun run lint                                   → sem erro
$ bun run typecheck                              → sem erro
$ bun run --cwd apps/frontend-transportada build → ok (PWA, 11 entradas de precache)
```

O lint acusou `EMPTY_FILTERS` e `FilterKey` órfãos no componente depois da migração; os dois imports
foram removidos e a rodada seguinte ficou limpa.

A asserção `forbids a module component from assembling its own pill`, da T011, passou a verde aqui —
nenhum `*.component.tsx` monta mais pílula própria. A falha remanescente é só
`states the rule for every future table`, que espera a documentação da T015.

## T014 — pílulas nas quatro tabelas restantes

Vermelho antes da implementação (contratos escritos primeiro, todos por `Cannot find module`):

```
$ bun test test/shared.contract.test.ts test/billing.contract.test.ts \
      test/cte-batch.contract.test.ts test/mdfe-manifest.contract.test.ts
0 pass · 4 fail
```

Contratos novos: `test/shared/filter-pill-values.contract.ts` (5),
`test/billing/invoice-filter-pills.contract.ts` (6), `test/cte-batch/filter-pills.contract.ts` (8) e
`test/mdfe-manifest/filter-pills.contract.ts` (4) — registrados nos entrypoints das respectivas áreas.

Implementação:

- `src/modules/shared/filterPill.service.ts` concentra o que apareceu em dois ou mais módulos:
  `OPEN_RANGE_MARK`, `RANGE_SEPARATOR`, `SELECTION_SEPARATOR`, `describeRangeValue` e
  `selectionDiffersFromDefault`.
- Descritores puros novos: `billingInvoiceFilterPills`, `cteBatchFilterPills`, `cteItemFilterPills`
  e `mdfeManifestFilterPills`. Nenhum traduz: devolvem `labelKey` e, para seleção, `valueKey`
  (valor único) ou `valueKeys` (múltipla escolha) — quem traduz é o componente.
- Cada hook ganhou `clearFilterField`, sempre pelo `clear*FilterField` do próprio módulo. Nos filtros
  de faixa a remoção zera as duas pontas; nos de seleção múltipla com default não-vazio
  (`statuses` e `billingStatuses` dos CT-es) a remoção devolve o **default**, não uma seleção vazia —
  seleção vazia esconderia a tabela inteira.
- `<FilterPills>` renderizado logo abaixo do painel de filtros nas quatro telas. O badge do botão de
  filtros passou a contar pílulas (`pills.length`), como na T012; nas telas com modo avançado
  (`cte-batch` e `mdfe-manifest`) o modo avançado mantém a contagem do construtor de condições, já
  que ali as pílulas não descrevem as condições.
- Em `MdfeManifestFilters` o botão "Limpar filtros" da toolbar só aparece quando não há pílula na
  tela — com pílulas, o "limpar tudo" já vem nelas e dois controles iguais lado a lado confundiriam.

Locales: `invoices.filters.issuedRange`, `invoices.filters.dueRange`, `invoices.removeFilter`,
`filters.removeFilter` e `cteItems.removeFilter` (pt e en). O contrato de paridade pt/en pegou as três
chaves faltantes em inglês na primeira rodada — corrigidas antes dos gates.

```
$ bun run test (frontend)                        → 526 pass · 1 fail
$ bun run lint                                   → sem erro
$ bun run typecheck                              → sem erro
$ bun run --cwd apps/frontend-transportada build → ok (PWA, 11 entradas de precache)
```

A única falha segue sendo `states the rule for every future table`, da T011, que a T015 fecha.
O `prettier --check` ainda acusa quatro arquivos de `company-settings`, débito anterior a esta feature
e fora do escopo da task.

## T015 — regra escrita e fechamento da feature

Documentação, sem código de produção novo.

- `docs/frontend/data-tables.md` ganhou a **§ 8 — Pílulas de filtro ativo (obrigatório)**: componente
  único `@/components/ui/filter-pills` (`components/ui/filter-pills.tsx`, agnóstico de i18n), descritor
  puro por módulo em `shared/<modulo>FilterPills.service.ts` com `formatDay` injetado, remoção por campo
  via `clearFilterField` do hook (faixa zera as duas pontas; seleção múltipla com default não-vazio
  volta ao default, nunca `[]`), badge por `pills.length` no modo simples, "limpar tudo" da toolbar só
  quando `pills.length === 0`, paridade pt/en das chaves e separadores centralizados em
  `src/modules/shared/filterPill.service.ts`.
- `CLAUDE.md` ganhou o parágrafo correspondente na seção do `frontend-transportada`, apontando para a
  § 8 e para `test/design-system/filter-pills.contract.ts`.

O contrato `design system filter pills contract > states the rule for every future table` — vermelho
desde a T011 — fecha aqui, sem mudar nenhuma asserção.

```
$ bun run --cwd apps/frontend-transportada test  → 527 pass · 0 fail (2919 expect, 14 arquivos)
$ bun run lint                                   → sem erro (4 apps)
$ bun run typecheck                              → sem erro (4 apps)
$ bun run --cwd apps/frontend-transportada build → ok (PWA, 11 entradas de precache)
$ bun run format:check                           → 14 arquivos fora do padrão, nenhum desta feature
```

O `format:check` roda sobre o repositório inteiro e revelou que a própria 024 tinha deixado oito
arquivos fora do padrão do Prettier — as fases anteriores só conferiram os arquivos que estavam
editando na hora. Corrigidos aqui com `prettier --write`, sem alterar conteúdo:
`src/billing/infrastructure/eligible-cte.query.ts` e `drizzle-billing.repository.ts`,
`test/billing-schema/eligible-query-tenant-safety.contract.ts`, `docs/frontend/checkboxes.md` e os
quatro documentos da própria spec (`spec.md`, `plan.md`, `tasks.md`, `evidence.md`). As suítes
seguiram verdes depois da reformatação: API `1393 pass · 1 skip · 0 fail`, frontend `527 pass · 0 fail`.

Os 14 que restam são débito anterior e ficam registrados: `company-logo`/`company-settings` (nove
arquivos), dois `snapshot.json` de migration, `test/integration/cte-item-list-repository/billing-status.integration.ts`
e os dois documentos da 023.

### Fechamento da feature 024

| Fase                                   | Tasks     | Estado |
| -------------------------------------- | --------- | ------ |
| A — checkbox do design system          | T001–T003 | verde  |
| B — lista e faixa de número de CT-e    | T004–T007 | verde  |
| C — filtro e coluna por número da nota | T008–T010 | verde  |
| D — pílulas de filtro                  | T011–T015 | verde  |

Débito registrado, fora do escopo desta feature: `format:check` ainda acusa 14 arquivos de features
anteriores (logo/configurações da empresa, dois `snapshot.json` de migration e a 023); a tabela "Faturas geradas" segue sem modo avançado E/OU, sem filtros multi-valor e
sem o date picker do design system; faltam acentos em chaves antigas dos locales de `billing` e
`operations`.

## Pós-fechamento — débito registrado da 024

Duas pendências que a feature deixou anotadas foram fechadas depois da T015, fora da numeração de
tasks porque não mudam comportamento de produto.

### Gate de formatação verde no repositório

O `format:check` roda `prettier --check .` — repositório inteiro — e estava vermelho em 14 arquivos.
Nenhum era da 024 depois da T015: `company-logo`/`company-settings` (nove), dois `snapshot.json` de
migration, `test/integration/cte-item-list-repository/billing-status.integration.ts` e dois documentos
da 023. Os `snapshot.json` são gerados pelo Drizzle Kit, mas 36 dos 38 já estavam formatados — a
convenção do repositório é formatá-los, então segui a convenção em vez de criar exceção no
`.prettierignore`.

```
$ bun run format                                 → 14 arquivos reescritos
$ bun run format:check                           → All matched files use Prettier code style
$ bun run --cwd apps/api-transportada test       → 1393 pass · 1 skip · 0 fail
$ bun run --cwd apps/worker-transportada test    → 228 pass · 0 fail
$ bun run --cwd apps/cron-transportada test      → 24 pass · 0 fail
$ bun run --cwd apps/frontend-transportada test  → 527 pass · 0 fail
$ bun run lint                                   → sem erro
$ bun run typecheck                              → sem erro
```

### Acentos nos locales pt-BR

Varredura nos 10 `*.locale.json` pt do frontend: 78 ocorrências sem acento, concentradas em
`billing` (74) e `operations` (4). Os outros oito módulos já estavam corretos.

Contrato antes da correção: `test/shared/locale-accents.contract.ts`, registrado em
`test/shared.contract.test.ts`. Dois testes — um garante que a varredura cobre por glob todo
`src/modules/*/locales/*.locale.json` que não termine em `.en.locale.json` (módulo novo entra sozinho),
o outro falha listando arquivo, caminho da chave e a palavra encontrada. A blocklist só tem formas que
em pt-BR **nunca** existem sem acento; `esta`, `meses` e `ano` ficaram de fora justamente por serem
válidas sem acento.

```
$ bun test test/shared.contract.test.ts (antes)  → 18 pass · 1 fail (78 violações listadas)
$ bun test test/shared.contract.test.ts (depois) → 19 pass · 0 fail
$ bun run --cwd apps/frontend-transportada test  → 529 pass · 0 fail
$ bun run --cwd apps/frontend-transportada build → ok (PWA, 11 entradas de precache)
$ bun run lint / typecheck / format:check        → sem erro
```

Nenhum contrato assertava o texto pt — os de paridade pt/en comparam **caminhos de chave** — então a
correção não exigiu ajuste de teste. O conjunto de chaves e os placeholders `{{...}}` ficaram
idênticos. A regra foi escrita no `CLAUDE.md`, ao lado das de checkbox, select e pílulas.

Continua aberto e **fora** do escopo desta feature: a tabela "Faturas geradas" sem modo avançado E/OU,
sem filtros multi-valor e sem o date picker do design system — trabalho de produto, pede spec própria.
