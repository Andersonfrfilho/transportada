# Selects no frontend

Regra local: **todo campo de seleção usa `@/components/ui/select`**. O elemento nativo `<select`
está proibido em `src/**/*.tsx` — o contrato `test/design-system/select.contract.ts` varre a árvore e
falha se algum voltar.

## Por quê

O `<select>` nativo não aceita estilo na lista de opções nem no indicador: em todos os navegadores a
seta fica colada na borda direita e a lista abre com o tema do sistema operacional, fora dos tokens
do produto (asfalto/cobre/névoa, cantos retos). O componente próprio resolve isso e ainda padroniza
o placeholder, o estado desabilitado e o teclado.

## Uso

```tsx
import { Select } from '@/components/ui/select'

export function StatusFilter({ status, setStatus }: StatusFilterProps) {
  const { t } = useTranslation('nfeWorkspace')
  return (
    <Select
      ariaLabel={t('filters.status')}
      options={STATUS_ORDER.map((status) => ({ label: t(`status.${status}`), value: status }))}
      value={status}
      onChange={(value) => setStatus(value as Status)}
    />
  )
}
```

Para exibir texto o componente **não** traduz nada: monte `options` já com o label pronto.

## Propriedades

| Prop          | Obrigatória | Efeito                                                                                                             |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------------------------ |
| `options`     | sim         | `readonly SelectOption[]`, cada item `{ label, value }`                                                            |
| `value`       | sim         | valor atual; `''` quando nada selecionado                                                                          |
| `onChange`    | sim         | recebe o `value` escolhido (string)                                                                                |
| `ariaLabel`   | não         | rótulo acessível do gatilho e da lista; use quando o `<label>` visual não envolve o campo                          |
| `clearable`   | não         | acrescenta uma primeira opção com `value: ''` usando o `placeholder` como label — é o "Todos"/"Nenhum" dos filtros |
| `placeholder` | não         | texto quando `value` não casa com nenhuma opção                                                                    |
| `compact`     | não         | altura e fonte reduzidas, para barras de filtro e paginação                                                        |
| `disabled`    | não         | desabilita o gatilho; um `fieldset[disabled]` ao redor já desabilita sozinho                                       |
| `align`       | não         | `'end'` alinha a lista pela direita, para gatilhos no fim da linha                                                 |
| `triggerRef`  | não         | recebe o `<button>` do gatilho, para quem precisa dar foco nele de fora                                            |

`SelectOption` é exportado junto e deve ser o tipo usado para listas de opções, em vez de tipos
locais por módulo.

`triggerRef` existe para uma coisa só: **um aviso de outra tela levar o olho até este campo**. É por
ele que o erro de proprietário do veículo abre a ficha do motorista já com a UF em foco. A referência
interna continua sendo a nossa — o `close()` devolve o foco ao gatilho —, e o callback do chamador é
composto por cima dela; passe um callback estável (`useRef`/`useCallback`), senão o React solta e
religa a referência a cada render. O gatilho é um `<button>`, então quem o recebe deve tipar
`HTMLButtonElement | null`, nunca `HTMLSelectElement`.

## Quadrado de cor

Cada opção pode carregar `swatch`, um valor de `background` que a lista pinta num quadrado antes do
rótulo — e que o gatilho repete quando a opção está escolhida. Serve para lista em que a cor é o
próprio dado (a cor do veículo no CRLV), não para decorar categoria.

| Campo    | Efeito                                                                              |
| -------- | ----------------------------------------------------------------------------------- |
| `swatch` | qualquer `background` válido: `var(--vehicle-color-branca)` ou um `linear-gradient` |

A cor **vem de token**, nunca literal no call site: os tons reais ficam em `:root` de
`src/styles/index.css` (`--vehicle-color-*`) e o módulo só monta `var(--…)`. O quadrado é
`aria-hidden` — o rótulo já diz a cor, e o leitor de tela não deve anunciá-la duas vezes.

## Busca

A busca **não se pede por prop: ela aparece sozinha** quando a lista passa de
`SELECT_SEARCH_THRESHOLD` opções (`src/components/ui/select.service.ts`). Decidir por contagem é o
que faz um select novo já nascer buscável — nenhum call site precisa lembrar, e uma lista que hoje
tem três itens e amanhã tem quarenta ganha o campo no dia em que passa a precisar dele.

Abaixo do limiar nada muda: um filtro de três status continua sendo uma lista limpa, sem um campo
de busca roubando espaço.

O casamento ignora acento e caixa (`sao` acha `São Paulo`), pelo mesmo `filterSearchableOptions` que
o `searchable-select` usa — um matcher só para o produto inteiro. A busca é fixa no topo do painel;
rolar é papel só da lista.

| Prop                | Efeito                                                                                |
| ------------------- | ------------------------------------------------------------------------------------- |
| `searchPlaceholder` | texto do campo de busca e seu rótulo acessível; sem ele, cai no `ariaLabel`           |
| `emptyLabel`        | mensagem quando nada casa com o texto digitado; sem ele, o painel fica só com a busca |

As duas são opcionais **de propósito**: o design system não inventa texto em português, porque o
produto é bilíngue e todo texto vem de `*.locale.json`. Passe as duas em qualquer select cuja lista
possa crescer.

Teclado dentro da busca: `ArrowDown`/`ArrowUp` movem a opção ativa, `Enter` confirma, `Escape` e
`Tab` fecham. **Todo o resto é texto** — inclusive `Space`, `Home` e `End`, que na raiz do select
são atalhos de lista. Quem decide é `resolveSelectSearchKey` (`select.service.ts`), uma tabela só
para as duas peles.

O painel vai para `document.body`, mas **portal do React propaga pela árvore de componentes, não
pela do DOM**: a tecla digitada na busca chega ao `onKeyDown` da raiz assim mesmo. Por isso o
manipulador do campo começa com `event.stopPropagation()` — sem ele, o espaço no meio de
"santo andre" selecionava a opção ativa e fechava o painel. Contrato em
`test/design-system/select.contract.ts`.

`SearchableSelect` continua existindo para o caso que este não cobre: aceitar um valor **fora do
catálogo** (`resolveCustomOption`), como o banco digitado à mão nas configurações de cobrança.

## Acessibilidade e teclado

O gatilho é um `<button type="button">` com `aria-haspopup="listbox"`, `aria-expanded` e
`aria-activedescendant`; a lista é um `role="listbox"` de `role="option"` com `aria-selected`.

| Tecla                   | Fechado | Aberto                            |
| ----------------------- | ------- | --------------------------------- |
| `ArrowDown` / `ArrowUp` | abre    | move a opção ativa                |
| `Home` / `End`          | —       | primeira / última opção           |
| `Enter` / `Space`       | abre    | confirma a opção ativa            |
| `Escape` / `Tab`        | —       | fecha e devolve o foco ao gatilho |

Clique fora fecha. Ao fechar, o foco volta para o gatilho.

## Camada flutuante

A lista de opções não é filha do gatilho no DOM: ela vai para `document.body` por portal e é
posicionada em coordenadas de viewport pelo hook `useFloatingLayer`
(`src/components/ui/useFloatingLayer.hook.ts`), que aplica o cálculo puro de
`floatingLayer.service.ts` em `--floating-layer-top`, `--floating-layer-bottom`,
`--floating-layer-left`, `--floating-layer-min-width` e `--floating-layer-max-height`.

Sem isso, qualquer ancestral com `overflow` recorta a lista — foi o que aconteceu no modal "Gerar
fatura", cujo `overflow-y: auto` cortava as opções na borda inferior. O mesmo hook governa o
`date-picker` e o `date-range-picker`, que abrem o painel de calendário pela mesma regra.

O que o hook garante:

- vira para cima quando o espaço abaixo do gatilho não cabe o painel e o de cima é maior;
- acima do gatilho, ancora o painel pela **borda de baixo** (`--floating-layer-bottom`, com
  `--floating-layer-top: auto`), e não por um topo calculado a partir da altura medida: o teto de
  altura é do CSS de cada pele (`min(16rem, …)` no select), então a altura do conteúdo não descreve
  o que será desenhado — era o que jogava a lista de UFs na borda de cima da janela;
- limita a altura ao espaço visível, mantendo o painel rolável em vez de estourar a janela;
- prende as bordas dentro da viewport, inclusive com `align="end"`;
- reposiciona em `scroll` (com captura, para painéis internos) e em `resize`;
- fecha ao clicar fora, entendendo que o portal também é "dentro".

Componente flutuante novo usa esse hook — não reinvente `position: absolute` dentro do container.

## Rolagem do painel

O painel é uma **coluna flexível** (`display: flex; flex-direction: column`) com teto de altura em
`max-height`. A busca é `flex: 0 0 auto` — fica fixa no topo — e a lista é `flex: 1 1 auto` com
`min-height: 0`, que é o que permite ela encolher dentro do teto e virar a área rolável.

Sem o `min-height: 0` a lista mantém a altura natural do conteúdo, o `overflow: hidden` do painel
recorta o excedente e **não aparece barra de rolagem**: era o defeito do select de UF, em que as
unidades depois de "CE" não tinham como ser alcançadas pelo mouse. Vale igual para as duas peles —
`select.module.css` e `searchable-select.module.css` — e o contrato
`test/design-system/select.contract.ts` falha se uma delas perder a regra.

## Estilo

Todo o visual mora em `src/components/ui/select.module.css` e usa exclusivamente tokens
(`--color-*`, `--space-*`) — sem hexadecimal nem `rgb()`, `border-radius: 0` como no resto do
design system. Módulos **não** devem redefinir o select em `*.module.css`; se um caso novo exigir
variação visual, acrescente uma prop ao componente.
