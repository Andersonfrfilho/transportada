# Feature 177 — A conta da viagem usa o custo que a rota já calculou

## Problema e resultado

Na mesma tela, o mapa diz que a rota custa **R$ 482,97 de combustível** e traz o pedágio calculado
sobre o catálogo de praças. Logo abaixo, a conta da viagem diz:

- **Combustível** — "roteiro ainda não calculado"
- **Outros por km** — "roteiro ainda não calculado"
- **Pedágio** — "ninguém lançou"

O roteiro **está** calculado: são 190,5 km logo acima. A conta não mente por descuido de texto — ela
ignora o cálculo da rota e só conhece lançamento manual, e o texto foi escrito para o caso em que
não há rota nenhuma.

É o mesmo defeito de fundo que a ADR-0071 corrigiu no documento fiscal, agora no dinheiro: duas
partes da tela sabem coisas diferentes sobre o mesmo fato, e a que o operador usa para decidir é a
que sabe menos.

Resultado: a conta consome o custo da rota como **previsto**, marcado como tal, e o lançamento
manual — quando existir — substitui o previsto e vira **realizado**.

## Fora do escopo

- Como a rota é calculada (distância, consumo, tarifa de praça): é do módulo de roteirização.
- A receita da viagem e as espécies de lançamento (spec 169), que continuam como estão.
- Congelar a conta no fechamento da viagem, que já existe.

## Histórias priorizadas

### P1 — Ver o custo que já se conhece

**Given** uma viagem com roteiro calculado
**When** o operador abre a conta da viagem
**Then** combustível e pedágio aparecem com o valor que a rota calculou.

### P2 — Saber que é previsão

**Given** um custo vindo da rota, sem lançamento manual
**When** ele aparece na conta
**Then** a tela marca que é previsto — não um gasto já realizado.

### P3 — O lançado manda

**Given** um gasto lançado à mão para a mesma natureza
**When** a conta é montada
**Then** o lançado substitui o previsto, e a tela deixa claro qual é qual.

### P4 — Não afirmar o que é falso

**Given** uma viagem sem roteiro calculado
**When** a conta é montada
**Then** ela diz que falta calcular o roteiro — que é verdade só nesse caso.

## Requisitos funcionais

- **RF1** A conta da viagem passa a ler o custo da rota (combustível, outros por km, pedágio) e a
  exibi-lo como previsto quando não houver lançamento manual da mesma natureza.
- **RF2** A origem de cada linha é dita na tela, no vocabulário que a viagem já usa
  (`TripAmounts.revenueSource`: `measured` / `estimated`) — não se inventa um terceiro.
- **RF3** Lançamento manual da mesma natureza **substitui** o previsto e é marcado como realizado.
  Os dois nunca somam: somar previsão com realizado conta o mesmo custo duas vezes.
- **RF4** "Roteiro ainda não calculado" só aparece quando o roteiro **não** foi calculado. Com rota
  calculada e sem custo disponível, o texto diz essa outra coisa — são situações diferentes.
- **RF5** Pedágio sem catálogo carregado continua dizendo isso, e **não** vira "ninguém lançou":
  a spec 165 já distinguiu "sem pedágio no trajeto" de "não foi possível calcular".
- **RF6** O total da viagem usa o previsto quando é o que existe, e diz que o total é previsto —
  um total que mistura previsto e realizado sem marca é pior que nenhum total.
- **RF7** Dinheiro é `Decimal`/string, nunca float binário.
- **RF8** Campo ausente na resposta (API anterior) não vira zero nem "ninguém lançou".
- **RF9** Textos em pt-BR e en.

## Requisitos não funcionais

- Sem consulta nova por linha: o custo da rota já é lido pela tela do mapa na mesma página.
- A conta não pode disparar recálculo de rota — ela lê o que existe.

## Casos extremos e falhas

- **Rota calculada depois do lançamento manual**: o lançado continua mandando; a previsão não
  reaparece por cima do que alguém já registrou.
- **Pedágio com catálogo ausente**: linha diz que não foi possível calcular, e o total marca que
  está incompleto — não finge pedágio zero.
- **Viagem fechada**: a conta congelada não é reescrita por previsão nova.
- **Rota recalculada com custo diferente**: a previsão acompanha; o realizado, não.

## Critérios de aceite

- **CA01** Com roteiro calculado, combustível e pedágio aparecem com o valor da rota.
- **CA02** O previsto aparece marcado como previsto.
- **CA03** Lançamento manual substitui o previsto e é marcado como realizado; nunca somam.
- **CA04** "Roteiro ainda não calculado" só aparece sem roteiro calculado.
- **CA05** Pedágio sem catálogo diz isso, e não "ninguém lançou".
- **CA06** O total diz quando é previsto.
- **CA07** Revisão de design com print, em 375px e no desktop (web.md §15).

## Dúvidas

Nenhuma — decisão do usuário em 23/09: consumir como previsto, com o lançamento manual
substituindo e virando realizado.
