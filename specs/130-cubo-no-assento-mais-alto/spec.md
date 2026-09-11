# Spec 130 — A caixa pequena sobe ao assento mais alto ao alcance

> 🤖 Modelo: `opus` (empacotador — decisão estrutural medida)

## Problema

O contrato `dead-space` da spec 117 cobra que um cubo medido de 10 cm custe no máximo **uma coluna** de
presumidas (17 cubos × 10 = 170, um cubo a cada cinco das 85 entregas do Atego). A spec 118 (mão de
0,6 m) fez o custo subir a 185; a 118 escondeu somando densidades, e a 120 afrouxou o limite para 187.

Medido nesta spec: dos 17 cubos, 11 procuraram espaço morto, e os 4100 assentos da faixa foram recusados
**todos** pela mão (`isOutOfReach`), nenhum pela sombra nem pela esbeltez. O cubo caía no primeiro lugar
nivelado da fileira, no meio de onde a carga ainda ia crescer.

## Decisões

- **D1** A caixa pequena (pegada em células menor que a da forma dominante) entra **depois** das grandes
  da própria entrega (`rankSmallLast`).
- **D2** Sem espaço morto ao alcance, a caixa pequena vai ao **assento ao alcance mais alto**, aceito pela
  mesma `accept` da varredura (alcance, sombra, esbeltez, fim do baú). Empate: o primeiro achado.
- **D3** Nessa busca, em profundidade, a testeira **não é parede** para a caixa pequena que precisa de
  escora: o bloco é deslocado para a porta depois de empacotado.
- **D4** Nenhuma regra física nem da 118 afrouxa; o cubo continua no mapa recomendado — mandá-lo ao
  complemento (`outOfReach`) foi medido e recusado.
- **D5** O contrato volta a uma coluna por cubo (170) e cobra as densidades 3, 5 e 10 em separado, mais a
  descarga sem caixa sem apoio nem entrega travada.

## Critérios de aceite

- Custo do cubo ≤ uma coluna por cubo nas três densidades, no mapa recomendado.
- Simulação da descarga sem `unsupported` nem `stuck` nas três densidades.
- Quatro viagens reais sem regressão: dentro do baú, sem cruzamento, nada no ar, ordem de descarga,
  descarga de pé, acesso, ≤ 50 ms.
