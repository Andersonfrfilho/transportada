# Spec 114 — Evidência

`resolveCargoPlacement`, baú 5,320 × 2,080 × 2,200 m, caixas de 400 × 300 × 250 mm, `payloadRatio`
0,9. "Fatia por parada" é o código de `2e7189dd`, depois da reversão do piso.

| paradas | ocupação | fatia por parada: caixas / paradas fora / pilha | bloco: caixas / paradas fora / pilha |
| ------- | -------- | ----------------------------------------------- | ------------------------------------ |
| 24      | 30%      | 224 de 245 / 2 / 1,50 m                         | **245 de 245 / 0 / 2,00 m**          |
| 24      | 60%      | 155 de 490 / 5 / 1,50 m                         | 405 de 490 / 5 / 1,75 m              |
| 85      | 30%      | 144 de 237 / **38** / 0,75 m                    | **237 de 237 / 0 / 2,00 m**          |
| 85      | 60%      | 154 de 505 / **38** / 0,75 m                    | **504 de 505 / 0 / 2,00 m**          |

Em todos os casos a carga termina dentro do baú (≤ 5,26 m de 5,32) e nenhuma caixa se sobrepõe. Com
24 paradas a 60% as cinco paradas que ficam de fora são as últimas a entrar no bloco — as primeiras
entregas —, com o bloco já na porta: o baú encheu.

Fixture de peça comprida (duas de 3 m atrás de uma chapa de 2,3 m e 60 caixas): antes da borda de
fileira, 61 de 63 com as duas peças `bedFull`; depois, 63 de 63.

Tempo no caminho da tela (`resolveCargoLayout`, 24 paradas presumidas): 9,5 ms com 249 caixas, 12,5 ms
com 407 e 8,3 ms com 568 — contra o orçamento de 50 ms.

## Carga real — RTD-5J78, 24 paradas (2026-09-10)

Reprodução com as contagens por parada lidas da tela, caixas presumidas de 0,371 × 0,261 × 0,21 m e
uma caixa medida por parada, baú de referência 5,32 × 2,08 × 2,20 m, `payloadRatio` 0,61.

| código                        | caixas     | paradas fora | pilha  | caixas se cruzando | tempo |
| ----------------------------- | ---------- | ------------ | ------ | ------------------ | ----- |
| fatia por parada (`2e7189dd`) | 231 de 463 | 0            | 0,67 m | 132 pares          | 14 ms |
| bloco, grade de 5 cm antiga   | 372 de 463 | 2 (1 e 3)    | 1,47 m | 383 pares          | 26 ms |
| bloco, células inteiras       | 451 de 463 | **0**        | 2,14 m | **0**              | 15 ms |

Na tela, antes desta rodada, as paradas 3, 2 e 1 — as primeiras entregas — saíam fora do desenho.

Gates:

- `bun test ./test/cargo-volume.contract.test.ts` — 212 pass, 0 fail (inclui o contrato de 50 ms)
- `bun run typecheck` (API) — limpo
