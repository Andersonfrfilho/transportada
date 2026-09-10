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

Gates:

- `bun test ./test/cargo-volume.contract.test.ts` — 206 pass, 0 fail
- `bun run typecheck` (API) — limpo
- `prettier --check` nos arquivos alterados — limpo
