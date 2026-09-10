# Spec 113 — Evidência

Medição sintética com o caminho da tela (`resolveCargoLayout`): baú 5,320 × 2,080 × 2,200 m, 24
paradas, caixas presumidas de 400 × 300 × 250 mm, `payloadRatio` 0,58 (acima de metade do teto).

| ocupação | antes (caixas / paradas fora do desenho) | depois (caixas / paradas fora do desenho) | tempo |
| -------- | ---------------------------------------- | ----------------------------------------- | ----- |
| 30%      | 196 de 249 / **2**                       | **249 de 249 / 0**                        | 10 ms |
| 50%      | 225 de 407 / **4**                       | 327 de 407 / 0                            | 13 ms |
| 70%      | 120 de 568 / **16**                      | 348 de 568 / 0                            | 8 ms  |

A 50% e 70% o que sobra **não cabe de verdade** sob a trava de esbeltez da carga não amarrada: a
pilha livre para em 0,75 m num baú de 2,20 m. Nenhuma parada some mais inteira do desenho.

Faixa isolada da grade (0,347 m, caixa de 0,30 m): antes do aparamento a pilha parava em 0,75 m e 23
de 56 caixas saíam `bedFull` com a faixa a 41% do volume.

## Reversão do piso da fatia (2026-09-10)

O piso publicado em `3bcb9e8b` fazia as fatias somarem mais que o baú. Medido com `resolveCargoPlacement`
(caixas de 400 × 300 × 250 mm, `payloadRatio` 0,9):

| paradas | ocupação | fim da carga com piso | fim da carga sem piso | paradas fora do desenho sem piso |
| ------- | -------- | --------------------- | --------------------- | -------------------------------- |
| 24      | 30%      | 9,53 m                | 5,27 m                | 2                                |
| 24      | 60%      | 9,55 m                | 5,11 m                | 5                                |
| 85      | 30%      | 33,90 m               | 5,20 m                | 38                               |
| 85      | 60%      | 33,90 m               | 5,26 m                | 38                               |

Baú de 5,32 m. Sem piso nenhuma caixa se sobrepõe e nenhuma sai do baú; as paradas fora do desenho
são `bedFull`, não mais `tooMany`. Na tela, antes da reversão, o Atego com 85 paradas tinha 44 inteiras
fora por "limite de detalhe".

Gates:

- `bun test ./test/cargo-volume.contract.test.ts` — 206 pass, 0 fail
- `bun run typecheck` (API) — limpo
- `prettier --check` nos arquivos alterados — limpo
