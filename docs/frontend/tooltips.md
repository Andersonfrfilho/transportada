# Tooltip

Toda dica que aparece ao apontar vem de `@/components/ui/tooltip`. O contrato é
`test/design-system/tooltip.contract.ts`.

## Por que não o `title` nativo

O atributo `title` funciona, e mesmo assim **não serve** como dica de interface: o navegador espera
cerca de um segundo com o ponteiro parado antes de mostrá-lo, desenha com a fonte do sistema fora do
tema do produto, e não existe no toque. Medido na prática: três dicas foram acrescentadas por `title`
e as três foram reportadas como "passei o mouse e não apareceu" — quem passa o mouse desiste antes do
segundo.

O `title` continua legítimo onde a dica é acessório de leitura e não de ação — por exemplo o texto
completo de uma célula truncada, onde ele é gratuito e não precisa ser rápido.

## Props

| Prop       | Tipo        | O que faz                                                                                     |
| ---------- | ----------- | --------------------------------------------------------------------------------------------- |
| `label`    | `string`    | O texto da dica. **Vazio desliga o tooltip** e o gatilho renderiza como se ele não existisse. |
| `children` | `ReactNode` | O que hospeda a dica — botão, ícone, célula.                                                  |

```tsx
<Tooltip label={t('actions.viewTrip', { vehicle: plate })}>
  <Button aria-label={t('actions.viewTrip', { vehicle: plate })} onClick={open}>
    <Icon name="eye" />
    {t('actions.view')}
  </Button>
</Tooltip>
```

## O que o componente decide, e por quê

- **Abre em 150 ms no ponteiro, e na hora no teclado.** O atraso existe só para não piscar em quem
  atravessa a fileira a caminho de outra coisa; quem chegou por Tab escolheu parar ali, e não espera.
- **É `aria-describedby`, nunca o nome acessível.** Botão só de ícone continua precisando do próprio
  `aria-label`: leitor de tela não aponta o mouse para lugar nenhum, e uma camada que só existe sob o
  ponteiro não pode ser o único lugar onde a ação tem nome.
- **Renderiza em portal, posicionado por `useFloatingLayer`** — a mesma camada dos selects e dos
  calendários. Dentro de um modal ou de uma tabela rolável, `position: absolute` seria recortado pelo
  `overflow` do ancestral.
- **A camada não recebe o ponteiro** (`pointer-events: none`): sob o cursor ela dispararia o
  `mouseleave` do próprio gatilho, e a dica piscaria sem parar.
- **O invólucro é `inline-flex`, não `display: contents`.** ⚠️ Elemento com `contents` não gera
  caixa, então `getBoundingClientRect()` devolve zeros e a dica nasce no canto superior esquerdo da
  tela. O `inline-flex` se encolhe até o conteúdo, vira o item de `flex` no lugar do botão e herda o
  espaçamento da fileira, sem alterar o `display` do botão — que é o que a regra global
  `button:has(svg)` precisa continuar governando (ver `buttons.md`).

## Aparência

A dica veste a **mesma** cara do tooltip do menu lateral recolhido (`[data-tooltip]::after` em
`src/styles/index.css`): borda de cobre, fundo grafite, corpo curto, sem canto arredondado. Dois
tooltips com aparências diferentes no mesmo produto é a inconsistência que o `web.md` §9 reprova.

⚠️ O do menu lateral continua sendo CSS puro, e é a exceção declarada: ali o gatilho é um link de
navegação dentro de uma barra fixa, sem `overflow` que o recorte, e o `::after` não custa nem
portal nem estado.

## O que a dica deve dizer

O texto **acrescenta**, nunca repete o rótulo ao lado. `Ver` com dica "Ver" é ruído; `Ver` com dica
"Abrir a viagem de ABC1D23" responde a pergunta que o rótulo curto deixa aberta — ver o quê, e de
quem. Em tabela, prefira nomear a linha pelo dado que a distingue (a placa, o número da nota), não
pelo identificador interno.
