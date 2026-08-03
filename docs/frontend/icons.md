# Ícones

Todo ícone da aplicação vem de `@/components/ui/icon`. Nenhum módulo desenha o seu.

## A regra

`<svg` é **proibido** em `src/**/*.tsx` fora de `src/components/ui/`. O contrato
`test/design-system/icon.contract.ts` falha se algum reaparecer.

A única exceção é `src/components/ui/checkbox.tsx`: o "check" não é ícone de ação, é o glifo do
próprio controle, com peso de traço maior (2.2 contra 1.8) para ler bem dentro de uma caixa de 1rem.

## Como usar

Importe de `@/components/ui/icon` e ponha o ícone antes do texto:

```tsx
<Button onClick={handleSave}>
  <Icon name="save" />
  {t('actions.save')}
</Button>
```

| Prop        | Valor                              | Padrão      |
| ----------- | ---------------------------------- | ----------- |
| `name`      | um dos nomes de `IconName`         | obrigatório |
| `size`      | `'md'` (1.1rem) ou `'sm'` (0.9rem) | `'md'`      |
| `className` | posicionamento/estado extra        | —           |

O `<svg>` já sai com `aria-hidden="true"`, `fill: none`, `stroke: currentColor` e `stroke-width: 1.8`.
**Nunca** passe `width`/`height`: o tamanho vem dos tokens `--icon-size-sm` e `--icon-size-md`,
declarados uma vez no `:root` de `src/styles/index.css`.

Como a cor é `currentColor`, o ícone acompanha a variante do botão sem nenhuma regra a mais.

## Ícone dentro de botão

- O ícone é o **primeiro filho**, antes do texto. `.ui-button` já traz `gap: var(--space-2)`.
- `<button>` nativo com classe de módulo precisa de `display: inline-flex; align-items: center;
gap: var(--space-2)` na própria classe.
- Botão só de ícone **precisa** de `aria-label` — o `<svg>` é `aria-hidden`, então sem o rótulo o
  botão fica mudo para leitor de tela. O contrato varre isso e falha.
- `title` com o mesmo texto do `aria-label` dá a dica visual no hover; use nos botões só de ícone.

## Nomes disponíveis

Ação: `add`, `alert`, `arrow-down`, `arrow-up`, `calendar`, `check`, `chevron-down`, `chevron-left`,
`chevron-right`, `chevron-up`, `close`, `columns`, `copy`, `document`, `download`, `edit`, `export`,
`eye`, `eye-off`, `filter`, `filter-clear`, `image`, `invoice`, `logout`, `menu`, `page-first`,
`page-last`, `page-next`, `page-previous`, `power`, `refresh`, `remove`, `save`, `search`, `send`,
`shield`, `sort`, `spinner`, `trash`, `upload`.

Navegação (barra lateral): `workspace-billing`, `workspace-company-settings`, `workspace-cte-batch`,
`workspace-cte-profiles`, `workspace-fleet`, `workspace-freight`, `workspace-mdfe-manifest`,
`workspace-nfe`, `workspace-operations`.

`spinner` gira sozinho e o `icon.module.css` desliga a animação em
`@media (prefers-reduced-motion: reduce)`.

## Ícone novo

Acrescente o traçado a `ICON_PATHS` em `src/components/ui/icon.tsx` e o nome ao union `IconName`.
Requisitos do traçado: `viewBox` 24×24, só contorno (o preenchimento é `none`), sem `fill` nem
`stroke` no path — a geometria é do path, a pintura é da folha de estilo.

## Por que a regra existe

Antes disso o mesmo ícone de filtro estava desenhado em quatro lugares e a classe `.actionIcon`
existia cinco vezes com geometrias diferentes (1.1rem com traço 1.8 em três módulos, 1.125rem com
traço 2 em outro). Dois módulos redesenhavam localmente um ícone que o vizinho já tinha. As setas de
reordenar coluna desenhavam chevrons de esquerda e direita para uma ação vertical.
