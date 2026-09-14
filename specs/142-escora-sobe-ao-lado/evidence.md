# Spec 142 — Evidência

Medição no scratchpad da sessão (`j142/`): `m139.ts` (entrada da tela, com juiz e invariantes),
`regress.ts` (fixture antiga, 32 variações, sintético), `ledge.ts`/`ledge-synth.ts` (cópia
instrumentada que reproduz a base e conta escoras de prateleira na hora de carregar), `timing.ts`
(base × correção intercalados). Base: `b50a3952` (`origin/staging`), no worktree `base-142`. Carga da
máquina entre 10 e 14 durante toda a medição.

## 1. O contrato vermelho antes do código

`test/cargo-placement/brace-rises-alongside.contract.ts` (Daily e Atego a 50% do volume, 6 tamanhos,
semente 1, juiz da descarga):

| linha      | Daily               | Atego               |
| ---------- | ------------------- | ------------------- |
| `b50a3952` | ❌ caixas sem apoio | ❌ caixas sem apoio |
| spec 142   | ✅ 0                | ✅ 0                |

## 2. Três versões da regra

| versão                                   | Atego real (total · rec) | Atego fixture (total · rec)  | sintético 85 fora |
| ---------------------------------------- | ------------------------ | ---------------------------- | ----------------- |
| `b50a3952` (topo da célula)              | 1056 · 971               | 1417 · 1320                  | 163               |
| altura maciça desde o piso (`7a3c6c42`)  | 967 · 909                | 1357 · 1184 (3 paradas fora) | 325               |
| exata, varrendo as caixas da célula      | 1056 · 971               | 1417 · 1320                  | 280               |
| **pilha persistente por célula (final)** | **1056 · 971**           | **1417 · 1320**              | **280**           |

A altura maciça recusa a caixa que sobe ao lado mas pousa em balanço — estrita demais, sem ganho de
física. A versão final dá a mesma resposta da exata, sem varrer.

## 3. As quatro viagens (presumida 368 × 259 × 214) — idênticas à base

| viagem   | total · rec · comp | fora                              | invariantes e juiz |
| -------- | ------------------ | --------------------------------- | ------------------ |
| Accelo   | 500 · 500 · 0      | —                                 | 0                  |
| Daily    | 481 · 469 · 12     | —                                 | 0                  |
| Sprinter | 252 · 252 · 0      | —                                 | 0                  |
| Atego    | 1056 · 971 · 85    | 361 `bedFull`, 18 paradas (igual) | 0                  |

Fixture antiga (presumida 371 × 261 × 210) e as 32 variações de `regress.ts`: idênticas à base, zero
defeito.

## 4. O custo que fica: o sintético de 85 paradas

163 → **280** fora. Instrumentado na base (`ledge-synth.ts`): **14** caixas daquela planta se
escoravam, **na hora de carregar**, só no balanço de uma caixa que começava acima delas. O juiz da
descarga não as acusava porque confere a planta pronta, e a carga posta depois ao lado as confinava.
Nas quatro viagens reais a mesma instrumentação conta **0**. O teto do contrato
(`dead-space.contract.ts`) foi reescrito para o número medido, com a razão.

## 5. Proposta real toda medida (banco local, 663 caixas medidas)

`scratchpad/layout-inputs-139m.json`, pelo caminho da tela (`resolveCargoLayout`), juiz da descarga:

| viagem   | `b50a3952` total · rec · sem apoio | spec 142 total · rec · sem apoio | paradas fora |
| -------- | ---------------------------------- | -------------------------------- | ------------ |
| Accelo   | 500 · 480 · **1**                  | 500 · 480 · **0**                | 0 → 0        |
| Daily    | 474 · 455 · 0                      | 474 · 455 · 0                    | 0 → 0        |
| Sprinter | 229 · 207 · 0                      | 229 · 207 · 0                    | 0 → 0        |
| Atego    | 1039 · 769 · **5**                 | 1074 · 756 · **0**               | 7 → 6        |

Cruzamento, fora do baú, no ar, ordem de descarga e apoio abaixo de 80%: zero nas duas linhas. Tempo
mínimo do Atego nesta carga de máquina: 35,1 s na base, 28,1 s na correção — o decodificador é o
assunto da spec 143.

## 6. Tempo

Atego da fixture, 15 rodadas intercaladas: base mínimo 40,8 · mediana 49,7 ms; correção 41,4 · 51,9 ms
(+4% na mediana). O teste de 50 ms reprova nas duas linhas com esta carga de máquina (base 73,5 ms na
mesma sessão).

## 7. Gate

- `bun test ./test/cargo-volume.contract.test.ts`: 302 pass, 1 fail — o de 50 ms (54,7 ms; a base, na
  mesma rodada, reprova o mesmo teste com 73,5 ms).
- `bun run typecheck` limpo; `eslint` limpo nos arquivos tocados.
- `make check` em primeiro plano: **verde** (exit 0; 5066 testes da API, os builds das três apps). Na
  primeira tentativa, com a medição da proposta rodando ao lado, só o teste de 50 ms reprovou (98 ms);
  isolado logo antes da segunda, base 70,9 ms e correção 64,4 ms com carga 13,8 — as duas acima do teto.
