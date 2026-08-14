# Botões

## O botão do design system é o padrão

Ação nova usa `@/components/ui/button`. Ele já traz altura, variante, foco e o alinhamento
entre ícone e rótulo pelos tokens — nenhum módulo precisa reconstruir isso.

```tsx
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
;<Button onClick={handleSave} size="sm" variant="secondary">
  <Icon name="check" />
  {t('actions.save')}
</Button>
```

`<button>` cru continua permitido — há dezenas deles, estilizados por `*.module.css`, e migrar
todos de uma vez não paga. O que não é permitido é cada um resolver o próprio layout.

## Altura vem do token de controle

Numa fileira de controles — campo de busca, botão de ícone, botão de ação — tudo tem uma altura só.
Ela sai de dois tokens em `:root`, derivados da medida do campo:

```css
--control-height: var(--field-height); /* 3rem */
--control-height-compact: var(--field-height-compact); /* 2.4rem */
```

`.ui-button-size-default` usa `min-height: var(--control-height)` e `.ui-button-size-sm`,
`var(--control-height-compact)`. Botão só de ícone é quadrado nesse mesmo valor:
`width: var(--control-height-compact); height: var(--control-height-compact)`.

O sintoma que isso apaga é o degrau: o cabeçalho de "Veículos" tinha "Novo veículo" em 2,5rem ao
lado do botão de colunas em 2,25rem e da barra de filtro em 2,4rem — três alturas na mesma linha.
A borda não era a causa (`box-sizing: border-box` é global); eram três fontes de medida.

`test/design-system/control-height.contract.ts` guarda os dois tokens, as duas classes de tamanho do
botão e proíbe qualquer `*.module.css` de declarar um controle quadrado com medida literal em `rem`.
Tamanho de glifo continua vindo de `--icon-size-*`, não daqui.

## Ícone e rótulo saem de uma regra só

Um `<button>` que hospeda ícone é `inline-flex`, com os dois centrados no eixo e separados por
`var(--space-2)`. A regra vive uma vez em `src/styles/index.css`:

```css
button:has(svg) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
}
```

O seletor casa pelo `<svg>` que `@/components/ui/icon` renderiza. Isso só é seguro porque `<svg>`
cru é proibido fora de `src/components/ui/` (ver `icons.md`): todo ícone da aplicação passa pelo
mesmo componente, então todo botão com ícone é alcançado.

O sintoma que essa regra apaga é o ícone colado no rótulo — foi assim que "Salvar ajustes",
"Gerar PDF" e "Cancelar fatura" chegaram em produção.

## O que o módulo não faz

- **Não declara `display`** na classe de um botão com ícone. `.acao { display: block }` tem
  especificidade maior que `button:has(svg)` e devolve o ícone colado, em silêncio.
- **Não declara `gap` fora da escala.** Se o espaçamento precisa mudar naquele botão, é
  `var(--space-1)` ou `var(--space-3)` — nunca `6px`. Quatro módulos com gap literal viram quatro
  espaçamentos diferentes na mesma tela.
- **Não veste um botão com rótulo com a classe do botão de ícone.** A caixa do botão só-ícone tem
  `width` fixa (`var(--control-height-compact)`) e `padding: 0`; com texto dentro, o rótulo quebra em três linhas por cima
  do ícone. Botão com rótulo ganha a sua própria classe, com `padding` na escala e `width` livre —
  foi assim que a barra de seleção das notas chegou em produção.
- Espaçamento, altura e cor vêm dos tokens (`--space-*`, `--field-height*`, `--color-*`).

As três proibições são verificadas por `test/design-system/button.contract.ts`, que varre todo
`src/**/*.tsx` atrás de botões com ícone e resolve a classe no `*.module.css` vizinho. A varredura
enxerga a classe escrita no próprio `<button>`; classe passada por prop para um componente de outro
arquivo escapa dela, e nesse caso a regra vale por revisão.

## Ícone sem rótulo

Botão só de ícone exige `aria-label` descritivo — o leitor de tela não tem o que anunciar sem ele.
Quando o ícone acompanha um rótulo, ele é decorativo e o componente `Icon` já marca
`aria-hidden`.
