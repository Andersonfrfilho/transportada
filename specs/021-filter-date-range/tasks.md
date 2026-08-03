# Tasks

Feature 021 — Range de data nos filtros.

Regras do repo, valendo em toda task: **uma task por vez**; teste de contrato **antes** da
implementação; arquivo de teste novo registrado na cadeia explícita (entrypoint no `test` do
`package.json` da app, suíte no `import` do entrypoint); teste de isolamento de tenant sempre que a
task mexer em query — **nenhuma task desta feature mexe em query**; task só fecha com evidência em
`evidence.md` (comando, saída, o que prova). Nenhum CNPJ, IE, chave de acesso, razão social real,
número de nota real, nome de lote de tenant real ou XML fiscal em teste, fixture, log ou evidência.

## Fase A — Seletor de período no design system

> 🤖 Modelo: `sonnet`

- [x] T001 Teste de contrato **falhando** do primitivo: `src/components/ui/date-range-picker.tsx`
      exporta `DateRangePicker`; o componente lê estilo de `./date-range-picker.module.css` e não de
      um `*.module.css` de módulo; a skin usa só tokens de `:root`; nenhum arquivo em
      `src/modules/**` declara calendário de intervalo próprio; e nenhum `*Filters.component.tsx` em
      `src/modules/**` contém `type="date"` — `test/design-system/date-range-picker.contract.ts`
      (novo) + `import` em `test/design-system.contract.test.ts` — evidência: saída do teste falhando
      por módulo inexistente.

- [x] T002 Mover o componente: criar `src/components/ui/date-range-picker.tsx` e
      `date-range-picker.module.css` a partir de
      `src/modules/nfe-workspace/components/DateRangePicker.component.tsx`, preservando a API
      (`from`, `to`, `onChange(from, to)`, rótulos por prop) e o comportamento; apontar os dois usos
      do nfe-workspace para o novo caminho; remover o arquivo antigo e as regras de calendário que só
      ele usava de `nfeWorkspace.module.css`. Evidência: contrato T001 com só a proibição de
      `type="date"` vermelha (é a dívida que B e C fecham) + `test` + `lint` + `typecheck` + `build`.

## Fase B — Filtros de CT-e

> 🤖 Modelo: `sonnet`

- [x] T003 Teste de contrato **falhando** dos filtros de CT-e: `CteBatchFilters.component.tsx` e
      `CteItemFilters.component.tsx` importam `DateRangePicker` de `@/components/ui/date-range-picker`,
      não contêm `type="date"`, e o `onChange` grava os dois campos do par
      (`createdFrom`/`createdTo` e `issuedFrom`/`issuedTo`); os locales `cteBatch` pt e en expõem
      `dateRange.placeholder`, `dateRange.clear`, `dateRange.previousMonth` e `dateRange.nextMonth`
      — `test/cte-batch/filter-date-range.contract.ts` (novo) + `import` em
      `test/cte-batch.contract.test.ts` — evidência: saída do teste falhando.

- [x] T004 Ligar os dois filtros de CT-e no `DateRangePicker` e acrescentar o grupo `dateRange` aos
      dois locales de `cteBatch`. `DATE_FIELDS` sai de `CteItemFilters`; os campos numéricos de
      intervalo continuam como estão. Evidência: contrato T003 verde + `test` + `lint` + `typecheck` + `build`.

## Fase C — Filtro de MDF-e

A proibição de T001 alcança todo painel de filtro, não só o de CT-e. `MdfeManifestFilters` tem o mesmo
par `Criado de` / `Criado até` e entra aqui porque o contrato não passa enquanto ele existir — não é
escopo novo inventado.

> 🤖 Modelo: `sonnet`

- [x] T005 Teste de contrato **falhando** do filtro de MDF-e: `MdfeManifestFilters.component.tsx`
      importa `DateRangePicker` do design system, não contém `type="date"` e grava
      `createdFrom`/`createdTo` no mesmo `onChange`; os locales `mdfeManifest` pt e en expõem o grupo
      `dateRange` — `test/mdfe-manifest/filter-date-range.contract.ts` (novo) + `import` em
      `test/mdfe-manifest.contract.test.ts` — evidência: saída do teste falhando.

- [x] T006 Ligar `MdfeManifestFilters` no `DateRangePicker` e acrescentar o grupo `dateRange` aos dois
      locales de `mdfeManifest`. Evidência: contrato T005 verde, contrato T001 inteiro verde
      (inclusive a proibição de `type="date"`), `test` + `lint` + `typecheck` + `build` +
      `format:check`, e verificação no navegador real das três telas.
