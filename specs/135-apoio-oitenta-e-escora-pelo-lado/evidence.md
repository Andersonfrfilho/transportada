# Spec 135 — Evidência

Juiz: `unloading-simulation.ts` desta spec (escora pelo lado). Medição completa no scratchpad
(`j137/m137.ts` com `MINF=0.8`: invariantes de todas as caixas; `j137/syn85.ts`: o sintético de 85
paradas; `j137/hash.ts`: assinatura das 99 cargas; `j137/t137.ts` e `j137/tcontract.ts`: tempo).

## As quatro viagens reais, contra a linha publicada

| carga             | total `ce0a2d08` → 135 | recomendado | paradas fora   | sem apoio (juiz novo) | cruzam · no ar · fora do baú · ordem · < 80% |
| ----------------- | ---------------------: | ----------: | -------------- | --------------------: | -------------------------------------------- |
| RTC-4H67 Daily    |              481 → 481 |   445 → 465 | — → —          |            **10 → 0** | 0 · 0 · 0 · 0 · 0                            |
| RTE-6K89 Sprinter |              252 → 252 |   252 → 252 | — → —          |            **58 → 0** | 0 · 0 · 0 · 0 · 0                            |
| RTD-5J78 Accelo   |              500 → 500 |   500 → 500 | — → —          |            **99 → 0** | 0 · 0 · 0 · 0 · 0                            |
| RTA-2F45 Atego    |        **1335 → 1417** | 1239 → 1320 | 1, 3, 4, 5 → — |            **26 → 0** | 0 · 0 · 0 · 0 · 0                            |

Travadas no recomendado: 0 nas quatro. `weightBalanced`: toda caixa das quatro.

⚠️ O wip anterior (`62601509`, sem D3) tinha o recomendado mais alto — Daily 481, Atego 1383 — e **não
fechava o sintético** (236 fora). D3 custa 16 caixas do recomendado na Daily e 63 no Atego, que vão para
o complemento; as duas seguem acima da linha publicada.

## O sintético de 85 paradas (`dead-space.contract.ts`, teto 216)

| linha                               |    fora |
| ----------------------------------- | ------: |
| `ce0a2d08` (grade de 5 cm)          |      26 |
| `f283a83d` (bordas reais, nivelado) |     195 |
| `62601509` (bordas reais, 80%)      |     236 |
| **135** (pegada fora do padrão, D3) | **163** |

A causa, medida por variação da caixa medida (presumidas iguais): 400 × 300 × 250 → 236 fora;
400 × 300 × 210 → 292; 371 × 261 × 250 → **0**; 371 × 261 × 210 → **0**. É a **pegada**, não a altura.
Recusados, com número (sintético · Atego recomendado): medida depois das presumidas (226 · 1355);
pegada fora do padrão só nivelada (231 · 1280); preferir a parede (318 · 1292); preferir a face da
porta alinhada (238 · 1386); pilha própria das medidas (236 · 1385); nenhum balanço sobre vão onde cabe
caixa (334 · 908); nenhum balanço sobre o piso para toda caixa (295 · 949). As duas metades de D3
sozinhas: espaço morto 213 · 1297; só sobre carga 213 · 1291.

## Os cubos da spec 130

| densidade | custo `ce0a2d08` → 135 | limite | cubos | sem apoio |
| --------- | ---------------------: | -----: | ----- | --------: |
| 3         |                100 → 0 |    280 | 28/28 |         0 |
| 5         |                 53 → 0 |    170 | 17/17 |         0 |
| 10        |                 46 → 0 |     80 | 8/8   |         0 |

## As 32 variações

Fração 1 · 0,75 · 0,5 · 0,3 × teto de massa real · 0,3, nas quatro cargas: **0 com defeito** (sem
apoio, abaixo de 80%, cruzando, no ar, fora do baú).

## Tempo (Atego de 1417 caixas)

D4 não muda resultado: assinatura das 99 cargas `0a58e75ba4e883d6` antes e depois de cada otimização.

| forma                                                                | carga (1 min) | `ce0a2d08`               | 135                      |
| -------------------------------------------------------------------- | ------------: | ------------------------ | ------------------------ |
| 25 medidas após 3 aquecimentos (mín · mediana)                       |       6,3–6,6 | 35,8–36,0 · 36,5–40,3 ms | 34,7–36,7 · 37,2–40,0 ms |
| como o contrato: processo novo, 1 aquecimento                        |           6,2 | 54,1–64,9 ms             | 59,1–67,1 ms             |
| primeira linha, no começo da rodada (a 3ª coluna é o wip `62601509`) |           7,4 | 45,0 · 54,4 ms           | 64,5 · 74,6 ms           |

Na mesma rodada, o wip de partida era **1,43×** a linha publicada; a 135 é **0,97×**. Os números absolutos
de linhas diferentes não se comparam: a máquina ficou mais rápida entre elas (a própria `ce0a2d08` foi de
45,0 para 35,8 ms).

⚠️ **O contrato de 50 ms está no fio nesta máquina, e já estava na linha publicada.** Na forma do
contrato a própria `ce0a2d08` passa de 50 ms com a carga do sistema acima de 6; dentro da suíte, com o
JIT aquecido pelos testes anteriores, ele passou numa rodada (301/0) e reprovou por 1,2 ms em outra.

## Referência do apoio mínimo

Junqueira, Morabito & Yamashita (2012), _Computers & Operations Research_ 39(1):74–85, e Bortfeldt &
Wäscher (2013), _European Journal of Operational Research_ 229(1):1–20, tratam estabilidade vertical
como apoio de fração da base. **O valor de 80% não foi conferido no texto de nenhum dos dois** — é
decisão do usuário, e fica marcado como não conferido.

## Gates

- `bun test ./test/cargo-volume.contract.test.ts` — 301 pass, 0 fail (o de 50 ms incluído; numa rodada
  anterior, com a mesma árvore, ele reprovou com 51,2 ms).
- `bun run typecheck` — limpo.
- `make check` — código 0, carga da máquina 6,7.
