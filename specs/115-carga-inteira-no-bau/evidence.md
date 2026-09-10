# Spec 115 — Evidência

Entrada real: a proposta de 2026-09-10 (345 notas, 6 motoristas, 6 veículos → 4 viagens). O corpo de
cada `POST /trips/cargo-preview` foi lido da rede do navegador, e a mesma entrada foi remontada com
`readCargoPreviewContext` contra o banco local: a reprodução bate com a tela caixa a caixa (429/52,
230/22, 600/128+689, 451/49). Medições por script, nunca pelo desenho.

## Antes (`84cce6a2`) × depois

| viagem              | baú (m)            | paradas | arranjo      | caixas desenhadas  | paradas fora          | motivos                                | ocupação  | tempo   |
| ------------------- | ------------------ | ------: | ------------ | ------------------ | --------------------- | -------------------------------------- | --------- | ------- |
| RTC-4H67 Daily      | 4,20 × 2,10 × 1,80 |      19 | profundidade | 429 → **481/481**  | 1,2,3,4 → **nenhuma** | bedFull 52 → **0**                     | 55% → 62% | 5,8 ms  |
| RTE-6K89 Sprinter   | 3,40 × 1,78 × 1,90 |      24 | grade → prof | 230 → **252/252**  | 4 → **nenhuma**       | bedFull 22 → **0**                     | 40% → 44% | 4,0 ms  |
| **RTA-2F45 Atego**  | 7,40 × 2,47 × 2,30 |      85 | profundidade | 600 → **982**/1417 | 46 → 24               | tooMany 689 → **0**; bedFull 128 → 435 | 29% → 48% | 6,5 ms  |
| **RTD-5J78 Accelo** | 5,32 × 2,08 × 2,20 |      24 | grade        | 451 → **500/500**  | 4 → **nenhuma**       | bedFull 49 → **0**                     | 38% → 42% | 11,3 ms |

Nas quatro, antes e depois: **zero** caixas fora do baú, **zero** pares se cruzando (AABB, folga
1e-6), **zero** caixas no ar (`z` = topo mais alto sob a pegada, ao milímetro), **zero** entregas
mais tardias em cima de uma mais cedo. Entrega mais tardia entre uma mais cedo e a porta: **1 par em
RTC e 1 em RTD antes, zero depois**. Tempo é o pior de sete rodadas.

Em RTA as paradas que ainda saem (13–16 e 21–40) saem por `bedFull`, não pelo teto: ver "Aberto".

## Por etapa (mesma entrada)

| etapa                          | RTC | RTE | RTA | RTD |
| ------------------------------ | --: | --: | --: | --: |
| `84cce6a2`                     | 429 | 230 | 600 | 451 |
| + assento que desliza + sombra | 419 | 252 | 600 | 451 |
| + esbeltez acima da contenção  | 481 | 252 | 600 | 494 |
| + grade que coloca tudo        | 481 | 252 | 600 | 500 |
| + teto só de desenho           | 481 | 252 | 982 | 500 |

Grade em RTD por quantidade de faixas, forçada: 6 → 494, 5 → 473, 4 → 456, **3 → 500**, 2 → 500.

## Experimentos recusados

- **Célula de 2,5 cm, 2 cm e 1 cm** (em vez de 5 cm): pior nas duas regras. Com a esbeltez acima da
  contenção e sem teto, RTD cai de 500 para 362 e 361, e RTA de 982 para 969 e 765; a 1 cm o tempo vai
  a 61 ms. A célula fica em 5 cm.

## Teto de desenho

- Empacotar sem teto: 1600 caixas de 0,2 m em 6,8 ms; 4000 em 16 ms; 6000 de 0,15 m em 85 paradas em
  40 ms — dentro do orçamento de 50 ms.
- Redesenho medido na tela ao girar a vista: 451 caixas em ~29 ms (~0,064 ms por caixa). O teto de
  1500 fica perto de 100 ms. ⚠️ Não medido com 982 caixas na tela: a API local roda o código de
  `staging`.

## Destaque por parada no 3D

Conferido por DOM na viagem RTD-5J78 da tela (451 caixas desenhadas): clicar a ficha de cada uma das
24 paradas acende exatamente as caixas dela (`g[data-box-id]` sem `boxGhost`, comparadas pela
`stopSequence` da resposta) — 23 de 23 paradas desenhadas corretas; a parada 4, fora do desenho,
apaga todas. Soltar a ficha devolve as 451.

## Aberto

- **RTA a 48%: 435 caixas `bedFull`.** A célula de 5 cm arredonda a caixa presumida de 0,371 × 0,261
  m para 0,40 × 0,30 m (78% da área de piso), e dez caixas de 0,21 m deixam 0,20 m do teto sem uso.
  Célula menor foi medida e piorou. É o próximo alvo, e não é o teto.

## Gates

- `bun test ./test/cargo-volume.contract.test.ts` — 218 pass, 0 fail
- `bun run typecheck` — limpo
- `make check` — ver o commit
