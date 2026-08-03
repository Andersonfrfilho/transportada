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

`SelectOption` é exportado junto e deve ser o tipo usado para listas de opções, em vez de tipos
locais por módulo.

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
`floatingLayer.service.ts` em `--floating-layer-top`, `--floating-layer-left`,
`--floating-layer-min-width` e `--floating-layer-max-height`.

Sem isso, qualquer ancestral com `overflow` recorta a lista — foi o que aconteceu no modal "Gerar
fatura", cujo `overflow-y: auto` cortava as opções na borda inferior. O mesmo hook governa o
`date-picker` e o `date-range-picker`, que abrem o painel de calendário pela mesma regra.

O que o hook garante:

- vira para cima quando o espaço abaixo do gatilho não cabe o painel e o de cima é maior;
- limita a altura ao espaço visível, mantendo o painel rolável em vez de estourar a janela;
- prende as bordas dentro da viewport, inclusive com `align="end"`;
- reposiciona em `scroll` (com captura, para painéis internos) e em `resize`;
- fecha ao clicar fora, entendendo que o portal também é "dentro".

Componente flutuante novo usa esse hook — não reinvente `position: absolute` dentro do container.

## Estilo

Todo o visual mora em `src/components/ui/select.module.css` e usa exclusivamente tokens
(`--color-*`, `--space-*`) — sem hexadecimal nem `rgb()`, `border-radius: 0` como no resto do
design system. Módulos **não** devem redefinir o select em `*.module.css`; se um caso novo exigir
variação visual, acrescente uma prop ao componente.
