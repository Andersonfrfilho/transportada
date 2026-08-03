# Evidências — Feature 020

Nenhum CNPJ, IE, chave de acesso, razão social real, número de nota real ou XML fiscal aparece aqui.
Onde a stack local devolveu dado de tenant, ele está resumido em contagem.

## T001 — Contrato falhando do primitivo de abas (2026-07-30)

Arquivo novo `test/design-system/tabs.contract.ts`, importado por `test/design-system.contract.test.ts`
(entrypoint já listado no `test` do `package.json`). Seis testes: exportação de `Tabs`/`TabsItem`,
ARIA da tablist, teclado, só o painel ativo renderizado, skin só com tokens, e a proibição de tablist
paralela.

```
$ bun test test/design-system.contract.test.ts

 22 pass
 6 fail
Ran 28 tests across 1 file.
```

As seis falhas são as seis asserções da suíte nova — `src/components/ui/tabs.tsx` ainda não existia.

## T002 — Primitivo implementado (2026-07-30)

`src/components/ui/tabs.tsx` + `tabs.module.css`. Roving tabindex (`tabIndex={index === activeIndex ? 0 : -1}`),
ativação automática por seta, um único `tabpanel` — o da aba ativa.

A execução seguinte deixou 2 falhas: a asserção de teclado (o contrato pedia `'ArrowLeft'` entre aspas,
o código expressa a mesma coisa como chave de objeto `ArrowLeft:` — o contrato foi ajustado ao idioma
real do código, igual ao que `select.tsx` faz com `moves`) e a proibição de tablist paralela, que
apontou dívida anterior em `NfeWorkspace.page.tsx`. Essa segunda virou a Fase C.

```
$ bun test test/design-system.contract.test.ts

 28 pass
 0 fail
 91 expect() calls
```

## T003 — Contrato falhando da tela (2026-07-30)

Arquivo novo `test/cte-batch/workspace-tabs.contract.ts`, importado por `test/cte-batch.contract.test.ts`.
Cinco testes: a tela monta sobre `Tabs`; abre em `documents`; `CteItemTable` fica no painel de
`documents` e `CteBatchTable`/`CteBatchItemsPanel` no de `batches`; existe o recuo para `batches`
quando `canReadItems` é falso; e os dois locales expõem exatamente `tabs.documents` e `tabs.batches`.

```
$ bun test test/cte-batch.contract.test.ts

 32 pass
 5 fail
Ran 37 tests across 1 file.
```

## T004 — Tela ligada nas abas (2026-07-30)

`CteBatchWorkspace.page.tsx` reescrita sobre `Tabs`; chaves `tabs.documents` / `tabs.batches` nos dois
locales (`CT-es` / `Lotes` em pt, `CT-es` / `Batches` em en).

```
$ bun test test/cte-batch.contract.test.ts
 37 pass · 0 fail · 353 expect() calls

$ bun run --cwd apps/frontend-transportada test
 302 pass · 0 fail · 1661 expect() calls · 14 files

$ bun run --cwd apps/frontend-transportada typecheck   # tsc --noEmit, sem saída
$ bun run --cwd apps/frontend-transportada lint        # eslint ., sem saída
$ bun run --cwd apps/frontend-transportada build       # ✓ built in 866ms
$ bun run format:check                                 # All matched files use Prettier code style!
```

## T005 e T006 — Dívida do nfe-workspace (2026-07-30)

A barra `Notas` / `Importações` passou a usar `Tabs` (contador vira `badge`), e o seletor de mecanismo
de importação deixou de mentir que era `tablist` — virou `role="group"` com `aria-pressed`.

## Verificação no navegador real (2026-07-30)

Spec Playwright temporária contra a stack local em execução (frontend :53000, API :53001, Keycloak
:58080), login headless com o usuário local de desenvolvimento. O arquivo e o config foram apagados
depois da execução — nenhum dos dois ficou no repositório.

```
[abas] rotulos=["CT-es","Lotes\n5"]
[abas] aba inicial selecionada=true
[abas] tabela transversal visivel=true
[abas] tabela de lotes no DOM=0
[abas] apos clicar em Lotes: lotes visiveis=2 | transversal fora do DOM=true
[abas] teclado ArrowLeft voltou para=true
[nfe] abas=["Notas\n200","Importações\n4"]
[nfe] aba de importacoes abriu, erros=[]
```

O que isso prova, na ordem dos critérios de aceite: a tablist tem duas abas na ordem `CT-es` → `Lotes`;
a tela abre com `CT-es` selecionada e a tabela transversal montada, com a tabela de lotes **fora** do
DOM; ao ativar `Lotes` a tabela de lotes aparece (os dois lotes em rascunho expõem `Submeter`) e a
transversal sai do DOM; `ArrowLeft` volta para a primeira aba pelo teclado; e o nfe-workspace continua
íntegro nas duas abas, sem erro de console.

## Fora de escopo confirmado no código — número do CT-e

A coluna `Número do CT-e` é `coalesce(cte_fiscal_documents.fiscal_number, <última tentativa>.fiscal_number)`
(`apps/api-transportada/src/cte-batches/infrastructure/drizzle-cte-batch-item.repository.ts:252`).
As duas origens só existem depois que a emissão reserva a numeração em `reserveFiscalNumber`
(`cte-issuance/infrastructure/drizzle-cte-issuance.repository.ts:231`), com o registro da tentativa
gravado em `cte_issuance_attempts` no mesmo fluxo. Item ainda pendente exibir `—` é o comportamento
correto, não um defeito.
