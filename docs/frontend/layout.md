# Largura das telas no frontend

Regra local: **todo container de tela usa `width: var(--layout-width)`**. Nenhum módulo declara a
própria largura — o contrato `test/design-system/layout-width.contract.ts` varre os `.css` e falha se
algum `min(100% - …)` reaparecer fora do token.

## Por quê

O cabeçalho da aplicação (`.application-header`, com o título do workspace e o chip do usuário) e o
conteúdo da página são containers centrados irmãos, cada um com a própria largura. Quando essas
larguras divergem — goteira de `--space-8` num e `--space-12` no outro, ou teto de `74rem` contra
`78rem` — as bordas esquerda e direita do cabeçalho deixam de coincidir com as dos painéis abaixo, e
a tela inteira parece torta. Era o caso de `cte-profiles`, `fleet`, `company-settings` (mais
estreitos que o cabeçalho) e de `cte-batches`, `mdfe-manifests` (mais largos).

## Tokens

```css
:root {
  --layout-gutter: var(--space-8);
  --layout-max-width: 78rem;
  --layout-width: min(100% - var(--layout-gutter), var(--layout-max-width));
}

@media (min-width: 40rem) {
  :root {
    --layout-gutter: var(--space-12);
  }
}
```

`--layout-width` é resolvido no ponto de uso, então basta redefinir `--layout-gutter` (ou
`--layout-max-width`) no `:root` para mover cabeçalho e conteúdo juntos. A goteira aumenta uma única
vez, em `40rem`, para todas as telas ao mesmo tempo.

## Uso

```css
.cteProfilesShell {
  width: var(--layout-width);
  margin: 0 auto;
  padding: var(--space-5) 0 var(--space-16);
}
```

Os containers que já seguem a regra: `.application-header`, `.workspace-shell`,
`.foundation-shell`, `.page-transition-skeleton` (globais, em `src/styles/index.css`) e os shells de
`company-settings`, `cte-batch`, `cte-profiles`, `fleet`, `mdfe-manifest`, `nfe-workspace` e
`operations`.

## Tabelas largas

Tela com tabela larga **não** ganha um teto maior que o das outras: o scroller horizontal da própria
tabela (`docs/frontend/data-tables.md`) resolve o excesso de colunas sem desalinhar a página. Se um
caso novo exigir de fato mais largura, mude `--layout-max-width` — vale para o cabeçalho também.
