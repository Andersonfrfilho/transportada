# Spec 134 — Evidência

Juiz: o corrigido da spec 133 (`eacd5225`). Script de medição completo no scratchpad (`m132.ts`,
invariantes de todas as caixas), mais a carga sintética (`j133/synth.ts`) e as 32 variações
(`j133/cmpw.ts`).

## O contrato, antes

`headboard-brace.contract.ts` — 12 entregas × 6 presumidas (371 × 261 × 210 mm) numa Sprinter de
3,40 × 1,78 × 1,90 m. Em `eacd5225`: **6 caixas sem apoio** nos três tetos de massa (nulo, 0,3, 0,8),
com o bloco começando a 1,939 m da testeira (nulo e 0,3) e a 0,970 m (0,8, equilibrado); o giro da pilha
é 0,248 m. Depois: 0 sem apoio, o bloco começa a 0,237 m nos três — 0,248 − 0,010 de margem, arredondado
para baixo no milímetro.

## As quatro viagens reais, todas as invariantes

| carga             | total | desenhadas | recomendado | complemento | fora (`bedFull`) | paradas fora | sem apoio (antes → depois) | travadas no recomendado | cruzam · no ar · fora do baú · ordem | ms (mediana) |
| ----------------- | ----: | ---------: | ----------: | ----------: | ---------------: | ------------ | -------------------------: | ----------------------: | ------------------------------------ | -----------: |
| RTC-4H67 Daily    |   481 |        481 |         445 |          36 |                0 | —            |                      0 → 0 |                       0 | 0 · 0 · 0 · 0                        |  16,5 → 16,1 |
| RTE-6K89 Sprinter |   252 |        252 |         252 |           0 |                0 | —            |                 **15 → 0** |                       0 | 0 · 0 · 0 · 0                        |    8,9 → 8,0 |
| RTD-5J78 Accelo   |   500 |        500 |         500 |           0 |                0 | —            |                 **15 → 0** |                       0 | 0 · 0 · 0 · 0                        |  16,1 → 15,9 |
| RTA-2F45 Atego    |  1417 |       1335 |        1239 |          96 |               82 | 1, 3, 4, 5   |                      0 → 0 |                       0 | 0 · 0 · 0 · 0                        |  37,9 → 36,0 |

Total, recomendado, complemento, `bedFull` e paradas fora **idênticos** à linha de `85cbb5fc`; as
travadas do complemento (36 e 96) são as mesmas caixas `outOfReach`/`needsRehandling` de sempre. Coluna
exposta na porta: 0 nas quatro. `weightBalanced`: toda caixa das quatro (todas acima de metade do teto).

## As 32 variações

Fração da carga 1 · 0,75 · 0,5 · 0,3 × teto de massa real · 0,3: antes, **24 de 32** com 6 a 36 caixas
sem apoio (Daily 21, 21, 14, 14; Sprinter 15, 15, 15, 15, 14, 14, 12, 12; Accelo 15, 15, 15, 15, 6, 6,
13, 13; Atego 36, 36, 9, 9). Depois: **0 em todas**, com o mesmo número de caixas desenhadas em cada
uma.

## Os cubos da spec 130 (Atego presumido, um cubo medido de 10 cm a cada N paradas)

| densidade | custo antes | custo depois | limite | cubos | sem apoio |
| --------- | ----------: | -----------: | -----: | ----- | --------: |
| 3         |         100 |          100 |    280 | 28/28 |         0 |
| 5         |          53 |           53 |    170 | 17/17 |         0 |
| 10        |          46 |           46 |     80 | 8/8   |         0 |

## Contratos reescritos, com a razão no teste

- `delivery-block.contract.ts`: "carga leve termina na porta" → "carga leve que se escora na testeira
  fica encostada na cabeceira" (medido: o bloco de 85 entregas terminava em 5,32 m; hoje fica a 2,674 m).
- `slices.contract.ts`: "carga pesada centraliza, com folga nas duas pontas" → "carga pesada não vai
  para a porta, e fica dentro da escora da testeira" (antes centrada, com o mesmo vão nas duas pontas;
  hoje começa a 0,369 m — giro de 0,379 m menos 1 cm — e o vão do lado da porta é 6,231 m).
- Seguem valendo sem mudança: "carga leve encosta na porta" e "sem teto de massa a carga segue
  encostada na porta" (`slices`), "posiciona a caixa no piso, encostada na porta" (`placement`) e
  "sem acesso declarado a carga encosta na porta" (099) — nessas cargas nenhuma pilha precisa da
  testeira, e a 099 D2 vale como sempre.
- `known-unsupported.ts` apagado; `unloading.contract.ts` e `complement.contract.ts` voltam a cobrar `[]`.

## Gates

- `bun test ./test/cargo-volume.contract.test.ts` — 279 pass, 0 fail.
- `bun run typecheck` — limpo.
- `make check` — ver o commit.
