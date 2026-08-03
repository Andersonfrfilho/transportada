# Checkbox

Todo checkbox da aplicação vem de `@/components/ui/checkbox`. `<input type="checkbox">` cru é
proibido em `src/**/*.tsx` — o contrato `test/design-system/checkbox.contract.ts` falha se algum
reaparecer.

O motivo é visual, não estético: sem `appearance: none` o Chrome desenha o widget nativo em modo
claro, e o resultado sobre o tema escuro é o quadrado branco que aparecia no cabeçalho das tabelas.
`:root` também declara `color-scheme: dark` em `src/styles/index.css`, para os widgets nativos que
sobram (data, hora, barra de rolagem) nascerem escuros.

## Props

| Prop            | Tipo                         | Papel                                                                      |
| --------------- | ---------------------------- | -------------------------------------------------------------------------- |
| `checked`       | `boolean`                    | Estado controlado.                                                         |
| `onChange`      | `(checked: boolean) => void` | Recebe o novo estado, não o evento.                                        |
| `ariaLabel`     | `string`                     | Obrigatório quando não há `label` — seleção de linha e "selecionar todos". |
| `disabled`      | `boolean`                    | Bloqueia o controle e apaga a caixa.                                       |
| `indeterminate` | `boolean`                    | Traço em vez de check: página parcialmente selecionada.                    |
| `label`         | `ReactNode`                  | Texto ao lado da caixa.                                                    |

## Quando passar `label`

Com `label`, a raiz é um `<label>` e o texto faz parte do alvo de clique — é o caso dos menus de
colunas. Sem `label`, a raiz é um `<span>`, porque o chamador já envolve tudo no `<label>` dele
(chips de status, por exemplo) e `<label>` aninhado é HTML inválido.

## Desenho

Caixa quadrada (`border-radius: 0`) de `var(--space-5)`, borda `--color-slate`, preenchimento
`--color-copper` quando marcada, check em `--color-asphalt`. Foco com o mesmo anel de cobre do
select. Em ponteiro grosso a área clicável sobe para 44px sem mudar o tamanho da caixa. Só tokens —
nenhum hexadecimal ou `rgb()` no CSS do componente.
