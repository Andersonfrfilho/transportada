# Tasks

Feature 020 — Workspace de CT-e em abas, com a tabela de CT-es como principal.

Regras do repo, valendo em toda task: **uma task por vez**; teste de contrato **antes** da
implementação; arquivo de teste novo registrado na cadeia explícita (entrypoint no `test` do
`package.json` da app, suíte no `import` do entrypoint); teste de isolamento de tenant sempre que a
task mexer em query — **nenhuma task desta feature mexe em query**; task só fecha com evidência em
`evidence.md` (comando, saída, o que prova). Nenhum CNPJ, IE, chave de acesso, razão social real,
número de nota real, nome de lote de tenant real ou XML fiscal em teste, fixture, log ou evidência.

## Fase A — Primitivo de abas no design system

> 🤖 Modelo: `sonnet`

- [x] T001 Teste de contrato **falhando** do primitivo: `src/components/ui/tabs.tsx` exporta
      `Tabs` e o tipo `TabsItem`; o markup traz `role="tablist"`, `role="tab"`, `role="tabpanel"`,
      `aria-selected`, `aria-controls`, `aria-labelledby` e `tabIndex`; o teclado cobre `ArrowLeft`,
      `ArrowRight`, `Home` e `End`; só o painel ativo é renderizado; e nenhum `.tsx` fora de
      `src/components/ui/tabs.tsx` declara `role="tablist"` — `test/design-system/tabs.contract.ts`
      (novo) + `import` em `test/design-system.contract.test.ts` — evidência: saída do teste
      falhando por módulo inexistente.

- [x] T002 Implementar `src/components/ui/tabs.tsx` + `tabs.module.css`: `Tabs` recebe
      `items: readonly TabsItem[]`, `value`, `onChange` e `ariaLabel`; renderiza a `tablist` com
      roving tabindex (só a aba ativa com `tabIndex={0}`) e um único `tabpanel` — o da aba ativa.
      CSS só com tokens de `:root`, sem valor mágico. Evidência: contrato T001 verde.

## Fase B — Tela em abas

> 🤖 Modelo: `sonnet`

- [x] T003 Teste de contrato **falhando** da montagem da tela: `CteBatchWorkspace.page.tsx` importa
      `Tabs` do design system; declara as abas na ordem `documents` → `batches`; a aba padrão é
      `documents`; `CteBatchTable` e `CteBatchItemsPanel` ficam no painel de `batches` e `CteItemTable`
      no de `documents`; os locales pt e en têm `tabs.documents` e `tabs.batches`; e a página não
      renderiza mais as duas tabelas empilhadas fora das abas —
      `test/cte-batch/workspace-tabs.contract.ts` (novo) + `import` em `test/cte-batch.contract.test.ts`
      — evidência: saída do teste falhando.

- [x] T004 Ligar a página: `CteBatchWorkspace.page.tsx` monta as duas abas com `Tabs`, aba inicial
      `documents` (caindo para `batches` quando `canReadItems` é falso), painel de itens do lote
      dentro da aba `batches`; chaves `tabs.documents` / `tabs.batches` nos dois locales. Evidência:
      contrato T003 verde + `bun run --cwd apps/frontend-transportada test` + `lint` + `typecheck` + `build`.

## Fase C — Dívida encontrada pelo contrato do design system

O contrato de T001 proíbe `role="tablist"` fora do design system e encontrou duas ocorrências
anteriores em `NfeWorkspace.page.tsx`. Elas entram aqui porque o contrato não passa enquanto
existirem — não são escopo novo inventado.

> 🤖 Modelo: `sonnet`

- [x] T005 Migrar a barra de abas `Notas` / `Importações` de `NfeWorkspace.page.tsx` para o `Tabs`
      do design system, preservando o contador ao lado do rótulo (`badge`). Ganha `tabpanel`,
      `aria-controls`, roving tabindex e navegação por seta, que a versão manual não tinha.
      Evidência: contrato de design system verde + verificação no navegador real.

- [x] T006 Corrigir o seletor de mecanismo de importação: ele se anunciava como `tablist`/`tab` sem
      nenhum `tabpanel` e sem teclado. Vira `role="group"` com `aria-pressed`, que é o que ele de
      fato é — um grupo de botões de modo, não um conjunto de abas. Evidência: mesma do T005.
