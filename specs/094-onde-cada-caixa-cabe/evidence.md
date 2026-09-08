# Evidência — 096

## O estado do dado, que é o que decide o alcance

Medido em 2026-09-07, na base local:

```
nfe_package_boxes:  663 linhas · 6 medidas · 0 com empilhabilidade · 0 com fragilidade
fleet_vehicle_axles:  0 linhas
notas:              345 · 15 com todas as caixas medidas · 87 parciais · 243 sem nenhuma
```

⚠️ **A planta funciona mesmo assim, e é isso que a spec entregou.** Com 6 caixas medidas de 663, a
versão sem fallback desenharia 4% das viagens; com a caixa presumida, desenha todas — e diz quais
peças são derivadas.

Medido na viagem do `RTA-2F45` (169 notas, baú 7,40 × 2,47 × 2,30 m):

```
4 camadas · 294 caixas na primeira · 141 hachuradas (presumidas)
```

## O que a tela promete, e o que declara

A linha fixa aparece sempre, e é literal:

> Este arranjo cabe no baú e respeita a ordem de entrega. Ele não é plano de estiva: a tela ainda não
> conhece a empilhabilidade de toda caixa, o peso de cada uma nem o limite por eixo.

Ela não é condicional, e o contrato `test/trip/cargo-layers.contract.ts` reprova o componente se
alguém a puser atrás de um ternário.

## Decisões que o código registra

| decisão                                        | por quê                                                                                                                            |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 2D em duas projeções, não 3D                   | oclusão esconde a carga do fundo (a da última parada); isométrico não promete metro; celular do separador; `three.js` contra a CSP |
| varredura em fileiras, não empacotamento ótimo | NP-difícil, e a diferença não paga o tempo numa tela de montagem                                                                   |
| última parada no fundo                         | carga da primeira atrás da terceira obriga a descarregar tudo                                                                      |
| nulo ≠ "pode"                                  | `is_stackable` nulo empilha **e marca presumido**; `false` não empilha e não marca                                                 |
| girar no plano sim, deitar não                 | `keep_upright` proíbe usar a altura como base; girar é o mesmo lado no chão                                                        |
| proporção, não cubo                            | um cubo de 0,021 m³ empilha diferente de 38 × 26 × 21, e a planta é sobre arrumação                                                |
| mediana, não média                             | uma caixa de geladeira entre mil de refrigerante move a média, não a mediana                                                       |
| o que não cabe é nomeado                       | encolher para caber esconderia o estouro, que é a informação                                                                       |

## Defeitos que só apareceram na tela

1. **O limite de pilha era conferido antes de a camada fechar** — a caixa que provocava o fechamento
   escapava para a camada de cima, e uma caixa declarada não empilhável acabava empilhada.
2. **O fallback existia e não estava ligado** — `resolveFallbackBox` foi escrito no G002 e as caixas
   sem medida continuavam caindo fora do desenho. Só apareceu ao olhar a planta na tela: zero
   hachuras num baú que deveria ter 141.

## Suítes

| suíte                                                 | resultado           |
| ----------------------------------------------------- | ------------------- |
| `bun test ./test/cargo-volume.contract.test.ts` (API) | 136 pass            |
| `bun run test` (API, 157 arquivos)                    | 4540 pass · 23 skip |
| `bun run test` (frontend, 24 arquivos)                | 2929 pass           |
| `make migration-test`                                 | 91 pass             |

Desempenho medido em teste: **900 caixas empacotadas em menos de 50 ms**, com teto de 600 caixas
desenhadas e o excedente nomeado.

## O que falta, e é trabalho de campo

Nenhuma linha de `fleet_vehicle_axles` e nenhuma propriedade de empilhamento preenchida. Enquanto
isso, a planta posiciona e declara — que é exatamente o comportamento pedido. O passo seguinte não é
código: é medir caixa e cadastrar eixo.
