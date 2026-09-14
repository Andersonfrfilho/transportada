# Spec 118 — Evidência

Entrada real: as quatro viagens de 2026-09-10 (`layout-inputs.json`, as mesmas das specs 115–117).
Medições por script, nunca pelo desenho. Tempo é o pior de sete rodadas.

## Etapa 1 — a descarga sobre `f126792f`

| viagem            | arranjo      | sem apoio na descarga | já sem apoio na carga cheia | pior passo   | travadas                                            |
| ----------------- | ------------ | --------------------: | --------------------------: | ------------ | --------------------------------------------------- |
| RTC-4H67 Daily    | profundidade |                     0 |                           0 | —            | 65 / 11 entregas, fora de alcance                   |
| RTE-6K89 Sprinter | grade        |      116 (22 paradas) |                         116 | passo 13: 22 | 35 / 13, corredores de 0,2–0,3 m                    |
| RTA-2F45 Atego    | profundidade |                     0 |                           0 | —            | 490 / 60, quase todas fora de alcance               |
| RTD-5J78 Accelo   | grade        |      127 (12 paradas) |                          38 | passo 15: 19 | 102 / 16, corredores de 0,1–0,3 m e fora de alcance |

Faces que perdem apoio na grade: laterais (Sprinter 77 +y e 39 −y; Accelo 124 −y e 33 +y). No Atego, 893
das 1137 caixas das entregas travadas estão em cima de entrega posterior; a entrega 1 da Daily fica a 0,91 m
da porta e 1,26 m do chão.

Conferências da própria simulação: com trecho de face sem contato tolerado até 5 cm (a célula do
empacotador) a profundidade dá 0 sem apoio — sem a tolerância davam 3 e 32, faixas de 1–2 cm de ponta. A
folga de 5 cm no vão não muda nada. Um erro de uma célula no alcance (laço exclusivo) foi achado e
corrigido antes dos números acima.

## Antes (`f126792f`) × depois

| viagem   | arranjo              | caixas           | paradas fora         | motivos          | ocupação  | sem apoio | travadas | tempo   |
| -------- | -------------------- | ---------------- | -------------------- | ---------------- | --------- | --------: | -------: | ------- |
| RTC-4H67 | profundidade         | 481 → 441/481    | nenhuma → 1, 2, 3    | — → bedFull 40   | 62% → 57% |     0 → 0 |   65 → 0 | 11,2 ms |
| RTE-6K89 | grade → profundidade | 252 → 252/252    | nenhuma              | —                | 44% → 44% |   116 → 0 |   35 → 0 | 4,1 ms  |
| RTA-2F45 | profundidade         | 1347 → 1190/1417 | 1,3,4,5 → 1,3–5,7–16 | bedFull 70 → 227 | 65% → 58% |     0 → 0 |  490 → 0 | 31,6 ms |
| RTD-5J78 | grade → profundidade | 500 → 500/500    | nenhuma              | —                | 42% → 42% |   127 → 0 |  102 → 0 | 13,8 ms |

Nas quatro, antes e depois: zero fora do baú, zero pares se cruzando (AABB, folga 1e-6), zero no ar, zero
entregas mais tardias em cima ou entre uma mais cedo e a porta; `weightBalanced` em todas as caixas.

A grade corrigida (bordas abertas, faixa ≥ 0,6 m) passa a simulação e coloca menos: Sprinter 164 (2 ou 3
faixas) contra 252; Accelo 395 (2) e 333 (3) contra 500.

## Por que o Atego perde 157 caixas

Perfil ao longo do comprimento (0,5 m), `new1` (alcance sem rendimento em células): a metade do fundo
enchia 34–45% com topo em 1,26–1,47 m, contra 70–73% e 2,10 m antes. A pilha só sobe em degrau a partir
da face exposta (0,78 m por degrau com base de 0,261 m), e o alto do degrau lá atrás era enchido pelas
entregas mais cedo — as que ficavam fora da mão. Com a fileira de 0,30 m o terceiro degrau fica ao
alcance e sobra só a décima camada, a 0,90 m.

## Experimentos

| variante                                     | Daily | Sprinter | Atego | Accelo | sem apoio / travadas                           |
| -------------------------------------------- | ----: | -------: | ----: | -----: | ---------------------------------------------- |
| alcance 0,6 (sem células)                    |   441 |      252 |  1008 |    459 | 0 / 0                                          |
| alcance 0,75                                 |   441 |      252 |  1089 |    459 | recusado                                       |
| alcance 0,9                                  |   481 |      252 |  1096 |    500 | recusado (sobreajuste)                         |
| sem alcance, só a grade corrigida            |   481 |      252 |  1347 |    500 | 9 / 65+51+490+101                              |
| **células + janela (escolhida)**             |   441 |      252 |  1190 |    500 | 0 / 0                                          |
| + degrau inteiro ao alcance na orientação    |   454 |      252 |  1190 |    500 | 23+30 sem apoio — recusado                     |
| + cubo sem espaço morto adiado               |   442 |      252 |  1198 |    500 | 0 / 0, mas cubo a cada 10: 109 > 80 — recusado |
| carga amarrada (`securesCargo`), alcance 0,6 |   481 |      252 |  1412 |    500 | 0 travadas                                     |

Teto fixo de 64 tentativas (spec 116) com o código novo: Atego 1210, Accelo **477** — o contrato do
Accelo inteiro guarda a spec 116; a carga sintética da escada deixou de separar (150 contra 149).

Cubos (spec 117) no Atego presumido: custo 185 / 79 / 217 contra 170 / 80 / 280 (a cada 5 / 10 / 3); o
contrato passou a somar as três densidades (481 ≤ 530).

## Contratos

- `unloading.contract.ts` contra `f126792f`: 5 pass, 6 fail (estabilidade da Sprinter e do Accelo; acesso
  nas quatro). Depois: 12 pass.
- Reescritos com a razão: `slices` (chão primeiro — caixa de 0,50 m), `real-mixed-cargo` (piso do
  Atego 1185 e 14 paradas), `dead-space` (escada + camada fora do alcance; cubo somado).
- Suíte `cargo-volume`: 235 pass, 0 fail. Typecheck limpo.

## Não medido

- A tela: a API local roda do checkout principal; o desenho não foi conferido no navegador.
- O alcance de 0,6 m e o corredor de 0,6 m são declarados, não medidos com gente carregando.
- Carga com `isStackable`/`isFragile` informados e baú aberto não entram nas quatro viagens.
