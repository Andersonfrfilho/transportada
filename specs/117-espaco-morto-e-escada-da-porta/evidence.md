# Spec 117 — Evidência

Entrada real: a mesma das specs 115 e 116 (proposta de 2026-09-10, 345 notas → 4 viagens), remontada
de `layout-inputs.json`. Medições por script, nunca pelo desenho. Tempo é o pior de sete rodadas.

## De onde vinham as 135 recusas do Atego (`e0dec156`)

Sobre a planta final, enchendo o que ainda cabe com a caixa presumida:

| regras desligadas | caixas a mais | onde                                       |
| ----------------- | ------------: | ------------------------------------------ |
| nenhuma           |             0 | —                                          |
| sombra (spec 115) |             0 | —                                          |
| esbeltez          |            56 | 48 a menos de 0,45 m da porta, 8 até 1,3 m |
| todas             |            76 | + 16 no meio do bloco, 4 na testeira       |

Faltavam 135 e só 76 cabiam mesmo sem regra nenhuma: o resto era **topo não nivelado**. Fileiras do
meio em pirâmide (8, 8, 8, 8, 7, 7, 7, 6, 6, 2 caixas por camada) e 27 caixas atravessadas entre duas
fileiras. Origem: a caixa medida de 10 × 10 × 10 cm (e a de 0,40 × 0,30 m) entra antes das presumidas
da mesma parada e empurra a fileira 10 cm para o lado.

Tetos sintéticos no mesmo baú: as 1417 presumidas numa parada só → **1344**; distribuídas pelas 85
paradas reais → **1344**; com um cubo de 10 cm a cada cinco paradas → **1093**.

## Antes (`e0dec156`) × depois

| viagem             | baú (m)            | paradas | arranjo                  | caixas               | paradas fora                         | motivos              | ocupação  | tempo   |
| ------------------ | ------------------ | ------: | ------------------------ | -------------------- | ------------------------------------ | -------------------- | --------- | ------- |
| RTC-4H67 Daily     | 4,20 × 2,10 × 1,80 |      19 | profundidade             | 481 → 481/481        | nenhuma                              | —                    | 62% → 62% | 7,8 ms  |
| RTE-6K89 Sprinter  | 3,40 × 1,78 × 1,90 |      24 | profundidade → **grade** | 252 → 252/252        | nenhuma                              | —                    | 44% → 44% | 6,6 ms  |
| **RTA-2F45 Atego** | 7,40 × 2,47 × 2,30 |      85 | profundidade             | 1282 → **1347**/1417 | 1, 3, 4, 5, 7, 8, 9 → **1, 3, 4, 5** | bedFull 135 → **70** | 62% → 65% | 9,6 ms  |
| RTD-5J78 Accelo    | 5,32 × 2,08 × 2,20 |      24 | grade                    | 500 → 500/500        | nenhuma                              | —                    | 42% → 42% | 12,4 ms |

Nas quatro, antes e depois: **zero** caixas fora do baú, **zero** pares se cruzando (AABB, folga
1e-6), **zero** no ar, **zero** entregas mais tardias em cima de uma mais cedo, **zero** entre uma mais
cedo e a porta, e `weightBalanced` em todas as caixas. A Sprinter trocou de arranjo porque a grade
passou a colocar as 252 caixas, e pela spec 113 a grade vence quando coloca o que a profundidade coloca.

## O que sobra no Atego é a porta

Depois da correção, sobre a planta final: sem regra nenhuma desligada, 0 caixas a mais; sem a sombra,
0; sem a esbeltez, **73** — 56 a menos de 0,45 m da porta e 17 entre 0,45 e 1,3 m. 1347 + 73 = 1420 ≥ 1417. A escada da porta custa 7 + 4 + 1 camadas de 8 presumidas = 96 lugares, e a porta não é parede.

## Cubos medidos entre as presumidas (85 paradas reais, todas presumidas)

| cenário              | `e0dec156` | depois |
| -------------------- | ---------: | -----: |
| cubo 10 cm a cada 5  |       1093 |   1300 |
| cubo 10 cm a cada 10 |       1243 |   1302 |
| cubo 10 cm a cada 3  |       1057 |   1264 |
| cubo 15 cm a cada 5  |       1063 |   1205 |

## Experimentos recusados

| variante                                           |  Atego | cubos a cada 3 |
| -------------------------------------------------- | -----: | -------------: |
| medida menor que a presumida depois das presumidas |   1289 |    980 (piora) |
| face apoiada por qualquer contato                  |   1265 |              — |
| salto de borda só como segunda passada             |   1263 |            986 |
| as duas primeiras juntas                           |   1320 |            980 |
| qualquer uma delas somada ao espaço morto          | ≤ 1289 |          ≤ 986 |

## Teto de tentativas (contrato próprio)

85 paradas × 16 presumidas e 3 caixas de 0,40 × 0,30 × 0,25 m a cada sete, Atego, 1396 caixas: teto
fixo de 64 → 111 fora (1285); teto de `e0dec156` → 28 fora (1368). No Atego real, sem esta spec, 4
buscas precisavam de 65 a 107 passos.

## Contratos

- Reprovam `e0dec156`: `um cubo de 10 cm não custa mais que a coluna em que entra` e o piso do Atego
  (221 pass, 2 fail).
- `o que fica fora cabe na escada da porta` passa em `e0dec156` e reprova o teto fixo de 64 (111 > 96).
- Depois: 223 pass, 0 fail.

## A tela

- **Não medida no navegador.** A API local (53001) roda do checkout principal em `84cce6a2`, anterior a
  `e0dec156`, e não foi reiniciada; o painel de navegador recusa `localhost` e o Chrome real pede login
  no Keycloak, que não é digitado por agente. O destaque por parada também não foi conferido na tela.
- **Medido fora dele** (`scratchpad/render-bench.ts`, `renderToString` do `CargoIsometric` com a planta
  real): 1347 caixas, 12 ângulos → mediana 21,5 ms, 7986 polígonos; com o destaque de uma parada, 14,0
  ms; 1500 caixas → mediana 21,8 ms, pior 24,6 ms. Inclui ordenação do pintor, projeção e marcação;
  não inclui aplicar no DOM nem pintar.

## Gates

- `bun test ./test/cargo-volume.contract.test.ts` — 223 pass, 0 fail
- `bun run typecheck` — limpo
- `make check` — verde (exit 0; frontend 3225 pass, 0 fail em todas as apps)
