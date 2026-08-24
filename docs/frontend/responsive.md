# Responsividade

Regra do design system para **largura de tela**: quais pontos de quebra existem, em que direção eles
somam, e o que a tela precisa entregar no polegar antes de entregar no mouse.

Contrato: `apps/frontend-transportada/test/design-system/responsive.contract.ts`.

## Quatro pontos, e uma grafia só para cada um

`web.md` §10 nomeia quatro larguras, e este produto não tem uma quinta:

| Nome    | Largura | Na folha de estilo          |
| ------- | ------- | --------------------------- |
| base    | 0px     | **ausência de consulta**    |
| tablet  | 640px   | `@media (min-width: 40rem)` |
| desktop | 1024px  | `@media (min-width: 64rem)` |
| wide    | 1280px  | `@media (min-width: 80rem)` |

A base não é um ponto de quebra: é o que a regra faz **fora** de qualquer `@media`. Toda tela nasce
no celular, e cada consulta acrescenta o que a largura maior permitiu.

**Uma grafia só.** `640px` e `40rem` são a mesma largura, e foi por aceitar as duas que este
repositório chegou a nove pontos de quebra — 40rem, 47.99rem, 48rem, 60rem, 64rem, 72rem, 80rem,
640px e 900px — sem ninguém ter decidido nenhum deles. O contrato exige `rem`: o ponto de quebra
acompanha a tipografia do usuário, e quem aumenta a fonte do sistema recebe o layout de tela menor,
que é o certo.

## `max-width` é proibido

Consulta com `max-width` **remove** em tela pequena: a regra nasce completa no desktop e vai sendo
desfeita para baixo. Duas consequências, e a segunda é a que custa caro:

1. Quem escreve a próxima tela herda o desktop como padrão, e o celular vira ajuste.
2. As duas direções se acumulam no mesmo arquivo. Uma regra em `min-width: 48rem` e outra em
   `max-width: 47.99rem` descrevem a mesma fronteira duas vezes, e a fronteira anda quando só uma
   das duas é corrigida. O `.99` existe justamente para tapar o buraco de um pixel entre elas —
   ele é o sintoma, não a solução.

**`@media (width <= 40rem)` é a mesma proibição em outra grafia**, e o contrato recusa as duas. A
sintaxe de intervalo é bem-vinda no sentido que soma: `@media (width >= 40rem)` é sinônimo aceito de
`min-width`.

Inverter uma consulta inverte a regra: o que estava dentro do `max-width` passa a ser o padrão da
folha, e o `min-width` recebe o que sobrou. Não é achar e substituir.

## O que a tela entrega no polegar

- **Nenhuma rolagem horizontal do corpo em 375px.** Conteúdo largo — tabela, diagrama, bloco de
  código — rola dentro do **próprio** contêiner, com `overflow-x: auto`, nunca empurrando a página.
- **Alvo de toque de 44px** (`2.75rem`, ou `--control-height`) em todo botão, item de menu e linha
  clicável. `@media (pointer: coarse)` é o lugar de aumentar o alvo sem inchar o mouse — ele
  pergunta pelo dedo, não pela largura, e por isso não é ponto de quebra.
- **Diálogo em tela cheia abaixo de 640px**, com cantos e margem só a partir de `40rem`.
- **Imagem** com `max-width: 100%` e altura automática; nunca largura fixa em px.
- **O layout quebra sozinho** (`flex-wrap`, uma coluna que vira duas em `40rem` e três em `64rem`),
  em vez de esconder conteúdo que não coube.

## Conferência antes do merge

Três larguras, sempre as mesmas: **375px** (celular), **768px** (tablet em pé) e **1280px**
(desktop). 768px é o teste que pega o erro mais comum — é a largura que cai **entre** `40rem` e
`64rem`, e é onde uma grade pensada só para as pontas mostra duas colunas espremidas ou uma coluna
sozinha no meio da tela.

## O contrato não tem lista de exceções

Contrato com allowlist nasce sendo a documentação do que não se cumpre: cada linha de exceção é uma
tela que ninguém vai consertar, com o nome dela escrito no teste que deveria cobrá-la. Se uma tela
precisa de um quinto ponto de quebra, a discussão é o ponto de quebra — não a exceção.
