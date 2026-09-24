# Feature 165 — Rótulo da rota que evita pedágio

## Problema e resultado

A montagem oferece, entre as rotas alternativas, a rota pedida ao roteirizador com `exclude=toll`
(spec 153 RF2). Ela chega à tela **sem nenhuma marca que a distinga**: a lista só tem os selos
"mais rápida", "mais barata" e "mais rápida e mais barata". A opção que evita as praças aparece
como uma linha igual às outras, e o bloco de pedágio abaixo dela diz `Pedágio: R$ 0,00 — 0 praças`
e `Sem pedágio no trajeto.`

Medido em staging, na viagem de Ribeirão Preto com dez entregas:

| Opção               | Distância | Praças | Pedágio  |
| ------------------- | --------- | ------ | -------- |
| rota normal         | 376,5 km  | 3      | R$ 32,70 |
| rota `exclude=toll` | 372,6 km  | 0      | R$ 0,00  |

O zero é verdade e ainda assim lê como defeito: o operador que abriu essa tela concluiu que o
cálculo de pedágio estava quebrado no ambiente, e a investigação até o banco levou uma sessão
inteira para terminar em "está tudo certo". O mesmo cuidado já existe no componente para o pedágio
**desconhecido** — há comentário dizendo que zero ali seria uma afirmação —, mas ele não cobre o
caso em que a rota evita as praças de propósito.

Resultado: a opção que evita pedágio se anuncia na lista, e o bloco de pedágio diz que a rota
desviou das praças em vez de deixar o zero se explicar sozinho.

## Fora do escopo

- Como a rota sem pedágio é calculada, escolhida ou congelada (spec 153) — nada muda no cálculo.
- O critério `no_toll` de reencontro da rota escolhida (spec 153 D2/D3).
- Qualquer coisa na API. A marca `isNoToll` já chega ao frontend por opção.
- Comparar o quanto se economiza evitando o pedágio. Seria outra conta, e ela precisa das duas
  rotas ao mesmo tempo.

## Histórias priorizadas

### P1 — O operador reconhece a rota que evita pedágio

**Given** a montagem ofereceu rotas alternativas e uma delas veio de `exclude=toll`
**When** o operador lê a caixa "Rotas alternativas"
**Then** essa opção carrega o selo `sem pedágio`, ao lado dos selos de mais rápida e mais barata
que ela também tenha.

### P2 — O zero do bloco de pedágio diz por que é zero

**Given** a rota selecionada é a que evita pedágio e o trajeto não tem praça
**When** o operador lê o bloco de pedágio
**Then** a linha diz que a rota evita as praças, e não apenas que não há pedágio no trajeto.

### P3 — Rota sem praça continua dizendo o que sempre disse

**Given** a rota selecionada **não** é a de `exclude=toll` e mesmo assim não passa por praça
**When** o operador lê o bloco de pedágio
**Then** a linha continua sendo `Sem pedágio no trajeto.`, sem sugerir desvio que não houve.

## Requisitos funcionais

- **RF1** `RouteOptionSummary` carrega `isNoToll`, copiado da opção correspondente.
- **RF2** A lista de opções da montagem imprime o selo `sem pedágio` quando `isNoToll`.
- **RF3** O selo de `sem pedágio` **acumula** com os de mais rápida e mais barata: são coisas
  diferentes, e a rota que evita pedágio pode ser também a mais barata — que é justamente o caso
  em que o operador mais quer ver as duas marcas.
- **RF4** `RouteTollSummary` recebe se a rota exibida é a que evita pedágio e, quando o trajeto não
  tem praça, imprime a frase do desvio no lugar de `assemblyMap.toll.none`.
- **RF5** Catálogo vazio continua vencendo a frase do desvio: sem catálogo, não se sabe se a rota
  desviou de alguma coisa (`assemblyMap.toll.catalogEmpty`).
- **RF6** O texto do bloco de pedágio existe em pt-BR e en. ⚠️ O selo fica só em pt-BR: o
  dicionário en **não tem** a seção `assemblyMap.routeOptions` inteira, e traduzir uma chave solta
  sob um pai ausente seria a única linha em inglês de uma caixa em português.

## Requisitos não funcionais

- Sem nova chamada à API e sem novo campo em resposta.
- `shadcn/ui` e o design system de sempre; o selo reusa o `routeOptionBadge` que já existe.

## Casos extremos e falhas

- **Opção sem pedágio calculado** (`boothCount === null`) que também é `isNoToll`: o selo aparece,
  porque ele descreve de onde a rota veio, não o que se sabe dela. A linha de fatos continua
  dizendo `pedágio não calculado`.
- **Rota única**: não há lista de opções, então não há selo. O bloco de pedágio segue a RF4.
- **Detalhe da viagem** (`TripRouteMap`): a rota congelada não guarda se veio de `exclude=toll`.
  Sem esse dado, a tela passa `false` e mantém a frase de hoje — nada inventado.

## Critérios de aceite

- **CA01** `resolveRouteOptionSummaries` devolve `isNoToll` fiel à opção de entrada.
- **CA02** A lista imprime `sem pedágio` na opção que veio de `exclude=toll`, e não nas demais.
- **CA03** Opção que é, ao mesmo tempo, `no_toll` e mais barata mostra os dois selos.
- **CA04** Trajeto sem praça numa rota `no_toll` imprime a frase do desvio.
- **CA05** Trajeto sem praça numa rota comum continua imprimindo `Sem pedágio no trajeto.`
- **CA06** Catálogo vazio imprime `catalogEmpty`, mesmo em rota `no_toll`.

## Dúvidas

Nenhuma.
