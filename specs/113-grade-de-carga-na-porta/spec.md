# Spec 113 — Grade de carga: várias entregas na porta, e nenhuma parada fora do desenho

## O que o operador viu (2026-09-10, proposta real, ACCELO 1016, 24 entregas)

1. **As paradas saíram uma atrás da outra.** "Se a 1 ou a 2 derem problema, temos que tirar duas
   cargas para acessar a terceira." A tela explicou: _"Faixas caberiam nesta carga, mas o peso passou
   de metade do teto do veículo"_ (58% do peso).
2. **15 das 24 paradas ficaram fora do desenho**, com o baú em **50%** do volume.

## O que foi medido no código

- **Nada quebrou nesta sessão**: nenhum commit de 2026-09-10 tocou em `trips/domain/`. A regra de
  faixas nasceu em `861f92da`/`9cd85193` (2026-09-08).
- **Faixa é uma parada por faixa, e é tudo ou nada** (`docs/domain/cargo-placement.md`, Passo 1). Foi
  medida numa Fiorino com 3 paradas. Com 24 paradas num baú de ~2,2 m sobram ~9 cm por faixa contra
  caixas de 30 cm: a viagem é **sempre** profundidade, com ou sem a regra do peso. O "faixas caberiam"
  da tela é calculado só com as caixas **medidas**, que são poucas — e por isso engana.
- **`BALANCE_PAYLOAD_RATIO = 0.5` não foi medido**: o próprio código diz que não é limite por eixo e
  que a ficha não tem entre-eixos. É uma escolha conservadora de posição longitudinal.
- **`MAX_PLACED_BOXES = 600`** (`cargo-placement.policy.ts:12`): as paradas são empacotadas em ordem de
  entrega e o laço para em 600 caixas; o resto vira `tooMany` ("fora do desenho por limite de
  detalhe"), com espaço sobrando. Há também paradas perdidas pela fatia proporcional (`capM`) — em
  medição.

## Decisões propostas

- **D1 — Grade.** Faixas lado a lado, quantas couberem na largura pela caixa mais larga de cada
  parada; as paradas entram nas faixas **em rodízio pela ordem de entrega**, e em cada faixa ficam em
  fila (a entrega mais cedo na porta). As primeiras entregas — uma por faixa — ficam **todas na
  porta**. Não é "metade faixa, metade profundidade", que o Passo 1 proíbe: toda faixa segue a mesma
  regra.
- **D2 — Grade e equilíbrio convivem.** O bloco ocupa o comprimento como a profundidade; acima de
  metade do teto ele é centralizado como hoje. A regra do peso deixa de escolher entre acesso e
  estabilidade.
- **D3 — Nenhuma parada some com o baú tendo espaço.** O teto de caixas desenhadas não pode derrubar
  uma parada inteira; a forma (teto maior medido, blocos representativos para caixa presumida, ou
  garantia de representação por parada) sai da medição em andamento.
- **D4 — A tela diz o motivo verdadeiro** de cada parada fora do desenho — nunca "não coube" quando
  o motivo é o teto.

## Antes de implementar

- Ler `docs/domain/cargo-placement.md` inteiro: cada regra lá custou uma rodada.
- Medir com a viagem real (24 paradas) antes e depois; contrato sintético confirma a implementação,
  só a medição confere a premissa (Lição de método).
- ⚠️ Atualizar `docs/domain/cargo-placement.md` (Passo 1 e 5) e o `CLAUDE.md`.
