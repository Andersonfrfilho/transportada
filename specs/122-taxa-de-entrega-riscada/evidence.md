# Spec 122 — Evidência

## T1/T2 — contrato novo, escrito antes de `isGapStruckThrough` existir

`test/trip-financials/valuation-ledger-strikethrough.contract.ts` foi escrito contra o serviço e o
componente ainda sem o campo/classe novos; rodar o arquivo naquele estado reprovava nas asserções que
leem `line.isGapStruckThrough` (undefined ≠ true/false) e nas que buscam `styles.ledgerGapAbsent` no
texto do componente (ainda não existia). Depois de `T2`–`T4` implementados, a suíte passou.

## T5/T6 — suíte completa e `make check`

```
bun test test/trip-financials.contract.test.ts test/trip.contract.test.ts \
  test/design-system.contract.test.ts
```

```
1006 pass
0 fail
103436 expect() calls
Ran 1006 tests across 3 files. [868.00ms]
```

`bun run typecheck` (apps/frontend-transportada): limpo, `tsc --noEmit` sem saída.

`make check` na raiz do worktree (`work/spec-122`), foreground, sem timeout curto:

```
 4919 pass / 0 fail   (api-transportada)
  974 pass / 0 fail   (worker-transportada)
   94 pass / 0 fail   (cron-transportada)
 3266 pass / 0 fail   (frontend-transportada)
   18 pass / 0 fail
  107 pass / 0 fail
build: dist/ gerado, sem erro (avisos do pdf.js "standardFontDataUrl" são conhecidos e não afetam o
build nem os testes)
[exited with code 0]
```

`git status --short` limpo depois do commit.

## Prova de que as contas não mudaram (requisito 4 do pedido)

Teste `os totais do razão não mudam com a parcela riscada`
(`valuation-ledger-strikethrough.contract.ts`): compara um razão sem a parcela `delivery_charges`
contra um razão com ela presente e riscada (`FEATURE_ABSENT`), e afirma que `totalCost`,
`totalMargin`, `totalRevenue`, `marginPercentage` e `sum` são idênticos nos dois — a lacuna sem valor
continua fora da soma, exatamente como as demais lacunas antes desta spec.

## Prova de que nenhuma outra lacuna mudou de aparência (requisito 1)

Teste `nenhuma outra lacuna sai marcada para risco`: monta um razão com `NO_FUEL_CONSUMPTION`,
`NO_DRIVER_RATE` e uma linha sem lacuna, e afirma `isGapStruckThrough === false` em todas.

Teste `a marca acompanha o gap, não o kind`: uma parcela `other_per_kilometer` (não
`delivery_charges`) com `gap: 'FEATURE_ABSENT'` também sai marcada — prova de que a decisão (D1 do
`spec.md`) está implementada pelo motivo da lacuna, e não por um `if (kind === 'delivery_charges')`
escondido no componente.

## Prova de que o texto continua presente (requisito 3, acessibilidade)

Teste por texto de fonte: `t('gap.${line.gap}', { defaultValue: line.gap })` continua fora de
qualquer condicional de risco — o `<dd>` sempre recebe o texto da lacuna; a classe de risco só é
somada à classe já existente (`styles.ledgerGap`). Não há mudança na árvore de acessibilidade: o
texto "módulo ainda não usado" segue sendo o conteúdo do elemento, lido por qualquer leitor de tela
independentemente do CSS aplicado.

## Prova de que o risco é design system (requisito 2)

Teste `o risco é estilo do design system, nunca inline nem hexadecimal`: confere que
`tripFinancials.module.css` declara `.ledgerGapAbsent` com `text-decoration: line-through` e
`var(--color-copper)` (token já definido em `:root`, já usado por `.ledgerGap` — nenhum token novo
na folha), e que o componente não usa `style={{` nem hexadecimal literal. O contrato existente
`test/design-system/css-tokens.contract.ts` (que varre `var(--x)` sem definição em toda folha nova)
também passou, confirmando que `--color-copper` está definido.

## O que não foi medido no navegador

Não abri o app no Browser pane para tirar screenshot da linha riscada — a verificação ficou inteira
no seam puro (`buildValuationLedger`) e por texto de fonte, no padrão que o pedido definiu
("teste do frontend não tem DOM"). Não há prova visual direta de como o risco aparece renderizado;
a garantia é de que a classe CSS certa é aplicada à `<dd>` certa, e que a folha declara a propriedade
CSS correta com o token correto.
