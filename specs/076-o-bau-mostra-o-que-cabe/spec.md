# Feature 076 — O baú mostra o que cabe

## Problema e resultado

Quem monta a viagem decide de cabeça se a carga cabe, e em que ordem carregar para não descarregar
duas vezes. Hoje a tela não ajuda em nada: mostra uma lista de notas e uma lista de paradas, e o
volume ocupado do baú só existe na experiência de quem separa.

Ao fim desta feature o operador vê **o baú do veículo desenhado em escala**, preenchido na
proporção da carga, com **uma cor por parada** e a ordem de carregamento sendo o **inverso** da
ordem de entrega — o que sai primeiro fica na porta.

## ⚠️ O que esta feature é, e o que ela não é

**Ela é uma representação proporcional. Não é um plano de estiva.**

A NF-e **não traz dimensão de volume** — nem comprimento, nem largura, nem altura, nem sequer o m³
(spec 075, medido: 1808 volumes, zero com medida). A cubagem que temos é **estimada**, por fator de
espécie, e é um **total por nota** — não a caixa.

Isso tem uma consequência que precisa estar escrita antes da primeira linha de código: **não é
possível calcular onde cada caixa vai.** _Bin packing_ tridimensional precisa das dimensões de
cada peça, e nós não temos nenhuma. Um desenho que sugira "esta caixa vai aqui" estaria inventando
posição — e alguém carregaria o caminhão acreditando nele.

O que **é** possível, e é o que esta feature entrega:

- o baú desenhado **em escala real**, com as dimensões do veículo (spec 075 D2);
- preenchido na **proporção** do volume estimado de cada parada;
- fatiado **por parada**, com cor própria, na ordem inversa da entrega;
- com a marca de estimativa visível, sempre.

A diferença entre "esta fatia do baú é da parada 3" e "esta caixa vai neste canto" é a diferença
entre ajudar e enganar.

## Fora do escopo

- **Posição de peça individual, empilhamento, restrição de peso sobre peça frágil, eixo e
  distribuição de carga.** Nada disso é calculável sem dimensão por volume, e o eixo ainda exigiria
  massa por peça — que a spec 067 mostrou não existir nem agregada de forma confiável.
- **Otimizar a ordem de carregamento.** A ordem é derivada da ordem de entrega, que já é decidida
  pela sugestão de roteiro (spec 058). Esta feature **desenha** a consequência, não a recalcula.
- **Editar a carga pelo desenho.** Arrastar caixa é interface de plano de estiva, e plano de estiva
  é o que esta feature não é.

## Histórias priorizadas

### P1 — O baú aparece em escala

**Given** uma viagem com veículo que tem dimensões de carga
**When** o operador abre o detalhe
**Then** ele vê o baú desenhado na proporção real (comprimento × largura × altura), com as medidas
escritas ao lado.

### P2 — Cada parada tem sua fatia e sua cor

**Given** uma viagem com paradas e cubagem estimada por nota
**When** o baú é desenhado
**Then** cada parada ocupa uma fatia proporcional ao volume dela, com cor própria, e a legenda liga
cor a endereço.

### P3 — A ordem de carregamento é o inverso da entrega

**Given** um roteiro planejado
**When** o baú é desenhado
**Then** a parada **entregue por último** aparece no **fundo**, e a primeira na porta — e a tela diz
isso por escrito, não só pela posição.

### P4 — O que não cabe é dito

**Given** uma carga cuja cubagem estimada passa da capacidade
**When** o baú é desenhado
**Then** o excedente é mostrado **fora** do baú, com o quanto passou — nunca comprimido para caber.

## Requisitos funcionais

- **RF1** — O desenho sai das dimensões do veículo (spec 075). Sem dimensões e sem `capacity_m3`,
  o baú não é desenhado, e a tela diz por quê.
- **RF2** — A fatia de cada parada é proporcional ao volume estimado das notas dela.
- **RF3** — A ordem de empilhamento é o inverso da ordem de parada do roteiro.
- **RF4** — A marca de estimativa acompanha o desenho, com a mesma força do número (spec 075 CA6).
- **RF5** — Excedente é representado fora do baú, com o valor em m³.
- **RF6** — Cor por parada vem dos tokens (`web.md` §8); **nunca** cor literal. A paleta é ordenada
  e estável: a mesma parada tem a mesma cor na lista, no mapa e no baú.
- **RF7** — Nota sem cubagem estimada aparece na legenda como **sem volume**, nunca com fatia zero
  — fatia zero é invisível e some da conferência.

## Requisitos não funcionais

- **RNF1** — O desenho é SVG do design system (`@/components/ui/icon` e primitivos), sem `<svg>`
  cru em módulo (`test/design-system/icon.contract.ts`). Sem biblioteca 3D nova sem ADR.
- **RNF2** — Acessível: o baú tem descrição textual equivalente — a mesma informação em lista, para
  leitor de tela e para quem imprime.
- **RNF3** — Responsivo pelos quatro pontos de quebra; em 375px o baú vira vista lateral única, sem
  scroll horizontal (`docs/frontend/responsive.md`).
- **RNF4** — Animação respeita `prefers-reduced-motion`.

## Casos extremos e falhas

- **Veículo sem dimensões** — não desenha, e explica (RF1).
- **Viagem sem roteiro planejado** — desenha por ordem de vínculo, dizendo que a ordem ainda não é
  a de entrega.
- **Uma parada só** — o baú inteiro de uma cor; a legenda continua.
- **Muitas paradas** — acima de N cores distinguíveis, agrupa o excedente numa faixa "demais
  paradas" em vez de gerar cores que ninguém diferencia.
- **Todas as notas sem cubagem** — o baú aparece vazio com o aviso, nunca cheio por engano.
- **Excedente enorme** (o dobro da capacidade) — a representação fora do baú tem teto visual, com o
  número dito por extenso.

## Critérios de aceite

- **CA1** — A proporção do desenho corresponde às dimensões do veículo. (P1)
- **CA2** — A soma das fatias corresponde à soma dos volumes por parada. (P2)
- **CA3** — A última parada da rota está no fundo. (P3)
- **CA4** — Excedente aparece fora, com o valor. (P4/RF5)
- **CA5** — A marca de estimativa está no desenho. (RF4)
- **CA6** — Nota sem volume aparece na legenda como tal. (RF7)
- **CA7** — Descrição textual equivalente existe. (RNF2)
- **CA8** — Nenhuma cor literal; nenhum `<svg>` cru em módulo. (RF6/RNF1)
- **CA9** — Sem scroll horizontal em 375px. (RNF3)

## Decisões

- **D1 — 2D em perspectiva antes de 3D de verdade.**
  O ganho operacional está em "esta fatia é da parada 3, e ela sai por último". Uma vista lateral
  com profundidade sugerida entrega isso, é SVG puro, escala em qualquer tela, imprime, e é
  acessível. WebGL entra quando houver **dimensão por peça** para justificar — antes disso, o 3D
  seria giratório e igualmente sem informação. ⚠️ Adotar biblioteca 3D exige ADR (`code-standart.md`
  §13), e ela custaria bundle num app que é PWA.

- **D2 — A fatia é por parada, nunca por nota.**
  A parada é a unidade de descarga: o motorista abre a porta uma vez por endereço. Fatiar por nota
  produziria dezenas de faixas que ninguém lê, e sugeriria uma separação física que não existe.

- **D3 — A escala é honesta ou não é desenhada.**
  Baú sem dimensão não vira retângulo genérico "só para ilustrar": o desenho é uma afirmação sobre
  espaço, e um genérico seria afirmação falsa. Sem dimensão, texto.

- **D4 — Esta feature depende inteiramente da 075.**
  Sem cubagem estimada não há fatia, e sem dimensão não há baú. Começar por aqui produziria uma
  tela bonita alimentada por zeros.

## Dúvidas

- **[NEEDS CLARIFICATION: o operador precisa disto antes ou depois de despachar?]** Antes, é
  ferramenta de conferência de separação — e aí ela vive na viagem em `separating`. Depois, é
  registro do que foi carregado, e teria de congelar junto com o roteiro em
  `trip_dispatch_snapshots`. As duas são defensáveis e levam a lugares diferentes na tela.
