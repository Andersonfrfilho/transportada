# Spec 116 — Evidência

Entrada real: a mesma da spec 115 (proposta de 2026-09-10, 345 notas → 4 viagens), remontada de
`layout-inputs.json`. Medições por script, nunca pelo desenho. Tempo é o pior de sete rodadas.

## De onde vinham as recusas (antes, `6af8669d`, Atego)

| desfecho da busca                                    | caixas |
| ---------------------------------------------------- | -----: |
| teto de 64 tentativas esgotado                       |      4 |
| gêmea recusada pela memória de formato, sem procurar |    431 |
| baú realmente sem lugar                              |      0 |

Recusas de assento dentro das buscas: 9892 por esbeltez, zero por sombra de ordem, zero por fim do
baú. Por fileira, camadas de baixo para cima: **8, 8, 8, 7, 7, 7, 6, 6, 6, 5** — a pirâmide do vão de
7 cm até a parede lateral.

## Antes (`6af8669d`) × depois

| viagem             | baú (m)            | paradas | arranjo      | caixas              | paradas fora                                    | motivos               | ocupação  | tempo   |
| ------------------ | ------------------ | ------: | ------------ | ------------------- | ----------------------------------------------- | --------------------- | --------- | ------- |
| RTC-4H67 Daily     | 4,20 × 2,10 × 1,80 |      19 | profundidade | 481 → 481/481       | nenhuma                                         | —                     | 62% → 62% | 6,1 ms  |
| RTE-6K89 Sprinter  | 3,40 × 1,78 × 1,90 |      24 | profundidade | 252 → 252/252       | nenhuma                                         | —                     | 44% → 44% | 4,8 ms  |
| **RTA-2F45 Atego** | 7,40 × 2,47 × 2,30 |      85 | profundidade | 982 → **1282**/1417 | 24 (13–16, 21–40) → **7** (1, 3, 4, 5, 7, 8, 9) | bedFull 435 → **135** | 48% → 62% | 10,9 ms |
| RTD-5J78 Accelo    | 5,32 × 2,08 × 2,20 |      24 | grade        | 500 → 500/500       | nenhuma                                         | —                     | 42% → 42% | 13,9 ms |

Nas quatro, antes e depois: **zero** caixas fora do baú, **zero** pares se cruzando (AABB, folga 1e-6),
**zero** caixas no ar, **zero** entregas mais tardias em cima de uma mais cedo, **zero** entre uma mais
cedo e a porta, e `weightBalanced` em todas as caixas das quatro (teto de massa acima de 50%).

## Por etapa (Atego)

| etapa                                         | caixas | paradas fora |
| --------------------------------------------- | -----: | -----------: |
| `6af8669d`                                    |    982 |           24 |
| + teto de tentativas proporcional às fileiras |   1089 |           19 |
| + vão estreito é apoio                        |   1282 |            7 |

O que ainda sai: a fileira da porta sobe só três camadas (0,63 m ≤ 3 × 0,261 m contados do piso — a
porta não é parede), e no meio do bloco caixas medidas de outro tamanho criam fileiras deslocadas
meia caixa, e o topo delas deixa de ser plano para a caixa presumida. As paradas fora são as primeiras
entregas, porque o bloco é carregado da última para a primeira.

## Experimentos recusados

- **Célula ajustada à caixa dominante, e varredura de célula.** Com as duas correções, a célula muda o
  resultado do Atego de forma caótica: 2,5 cm → 1417 (48 ms, no limite do orçamento), 2,8 → 1043,
  2,9 → 1343, 3,0 → 1417, 3,1 → 1076, 3,2 → 1055, 3,3 → 1417, 3,5 → 1200, 3,75 → 1383, 4,0 → 1100,
  5,3 → 1375 — e o RTC cai para 438 em 2,8, 3,0 e 3,3 cm. Escolher a célula por carga seria sobreajuste:
  a célula fica em 5 cm.
- **Vão medido pela célula arredondada** (a primeira versão de R2): aceitava 27 cm de vão para uma
  base de 26,1 cm. Trocado pela face real da caixa e pelo limite `3b/√10`.

## Contratos

- Reprovam `6af8669d`: `o Atego de 85 paradas desenha quase tudo, e só as primeiras entregas ficam
fora` e `com 7 cm até a parede, a coluna da borda sobe além de três vezes a base` (219 pass, 2 fail).
- Depois: 221 pass, 0 fail.

## Não medido

- A tela: a API local roda o código de `staging`, então o desenho com 1282 caixas não foi conferido no
  navegador. O redesenho medido na 115 (~0,064 ms por caixa) dá ~82 ms para girar a vista.

## Gates

- `bun test ./test/cargo-volume.contract.test.ts` — 221 pass, 0 fail
- `bun run typecheck` — limpo
- `make check` — verde (API 4878 pass, worker 974, frontend 3225, zero falhas)
