# Spec 121 — Evidências

Medições de 2026-09-10, no worktree `spec-121`, contra as quatro viagens reais
(`layout-inputs-121.json`, redespejado do banco **com as notas reais** — o despejo usado na 119 era
anterior ao carimbo de `documentId` e trazia zero notas, por isso aquela spec mediu com notas
injetadas).

## T1 — Quantas notas existem de verdade

| viagem             | paradas | caixas | notas distintas | notas/parada (máx) |
| ------------------ | ------: | -----: | --------------: | -----------------: |
| Daily `RTC4H67`    |      19 |    200 |          **22** |                  2 |
| Sprinter `RTE6K89` |      24 |    151 |          **27** |                  2 |
| Atego `RTA2F45`    |      85 |    693 |          **94** |                  2 |
| Accelo `RTD5J78`   |      24 |    330 |          **30** |                  2 |

`documentId` está preenchido em **693 de 693** caixas do Atego — nenhuma caixa real cai na reserva da
cor da parada.

## T1 — A paleta, três variantes medidas (128 cores)

| variante                                            | ΔE mín. entre notas | ΔE mín. à cor de parada |
| --------------------------------------------------- | ------------------: | ----------------------: |
| sem semear cor de parada (grade 4°, 3 saturações)   |            **9,28** |      **0** (identidade) |
| semeando 96 paradas, grade antiga                   |            **6,61** |                    6,79 |
| semeando 96 paradas, grade densa (2°, 5 saturações) |            **8,09** |                **8,21** |

A terceira é a escolhida. `6,2` é o número que a 119 mediu como "perceptualmente a mesma cor" — a
segunda variante fica **abaixo** dele.

Prefixo da paleta escolhida (ΔE mínimo, monotônico):
`4 → 18,33` · `8 → 12,87` · `16 → 12,87` · `24 → 10,59` · `32 → 10,59` · `48 → 10,25` · `64 → 9,40` ·
`85 → 8,79` · `94 → 8,51` · `128 → 8,09`.

Contraste mínimo: **3,09** contra `#10222c` (escuro) e **2,84** contra `#fbf9f5` (claro), os dois
acima do piso de 2,4. Luminância relativa de 0,149 a 0,302, dentro da janela ~0,11–0,33. ΔE mínimo ao
`MAP_SURFACE`: **8,15**. 128 cores, 128 únicas.

## Antes × depois, por viagem

Cor desenhada de cada nota; "própria" é a nota cuja cor não é usada por nenhuma outra nota do desenho.

| viagem            | notas | ANTES própria / repetem / ΔE mín. | DEPOIS própria / repetem / ΔE mín. |
| ----------------- | ----: | --------------------------------: | ---------------------------------: |
| Daily real        |    22 |                     18 / 2 / 9,91 |                 **22 / 0 / 10,59** |
| Sprinter real     |    27 |                    27 / 0 / 12,16 |                 **27 / 0 / 10,59** |
| Atego real        |    94 |                    82 / 6 / 10,42 |                  **94 / 0 / 8,51** |
| Accelo real       |    30 |                    26 / 2 / 11,25 |                 **30 / 0 / 10,59** |
| Daily 2/parada    |    38 |                     30 / 4 / 5,92 |                 **38 / 0 / 10,25** |
| Daily 3/parada    |    57 |                     45 / 8 / 5,92 |                  **57 / 0 / 9,44** |
| Daily 5/parada    |    95 |                    43 / 32 / 5,92 |                  **95 / 0 / 8,51** |
| Sprinter 2/parada |    48 |                     32 / 8 / 5,92 |                 **48 / 0 / 10,25** |
| Sprinter 3/parada |    72 |                    48 / 16 / 5,92 |                  **72 / 0 / 9,09** |
| Sprinter 5/parada |   120 |                    40 / 52 / 5,92 |                 **120 / 0 / 8,09** |
| Accelo 2/parada   |    48 |                     32 / 8 / 5,92 |                 **48 / 0 / 10,25** |
| Accelo 3/parada   |    72 |                    48 / 16 / 5,92 |                  **72 / 0 / 9,09** |
| Accelo 5/parada   |   120 |                    40 / 52 / 5,92 |                 **120 / 0 / 8,09** |
| Atego 2/parada    |   170 |                    36 / 67 / 7,18 |                     86 / 42 / 8,09 |
| Atego 3/parada    |   255 |                   42 / 140 / 6,97 |                     1 / 127 / 8,09 |
| Atego 5/parada    |   425 |                   32 / 300 / 6,97 |                     0 / 297 / 8,09 |

Três leituras:

- **Em toda viagem real, e em toda sintética até 128 notas, a repetição foi a zero.** O ΔE mínimo
  entre duas notas desenhadas nunca cai abaixo de 8,09, contra os **5,92** recorrentes do tom — que
  é abaixo do limiar de "a mesma cor".
- Os três casos do Atego sintético passam das 128 cores (170, 255 e 425 notas). Ali a repetição
  existe e é **anunciada**: `countNotesSharingColor` devolve 42, 127 e 297, e a legenda imprime a
  contagem. A cor repetida é sempre a mais distante possível na ordem (`rank % 128`).
- O tom da 119 já repetia **antes** disso, com 38 notas — e em silêncio.

## D8 — Nenhuma coordenada de caixa mudou

`git diff --stat origin/staging -- apps/api-transportada` é **vazio**: o empacotador não foi tocado.
O despejo da planta nas quatro viagens confere com os números registrados na spec 120:

| viagem   | caixas desenhadas | fora | sha256 das coordenadas |
| -------- | ----------------: | ---: | ---------------------- |
| Atego    |              1269 |  148 | `8c71e58a97dc8338`     |
| Daily    |               481 |    0 | `d5f2d5d2a6546b86`     |
| Accelo   |               500 |    0 | `78e2eab037930118`     |
| Sprinter |               252 |    0 | `f983636b0efbcf37`     |

## Testes

- `bun run --cwd apps/frontend-transportada test` — **3270 pass, 0 fail**, 33 495 asserções, 29
  arquivos (o contrato novo tem 697 asserções no entrypoint de viagem).
- `bun run --cwd apps/frontend-transportada typecheck` — limpo.
- `make check` na raiz do worktree — **verde**, código de saída 0 (format:check, lint,
  typecheck, test e build das quatro apps, mais os contratos de migration).

## O que não foi medido

Nada foi visto no navegador: a app local roda do checkout principal, que esta sessão não pode tocar,
e o desenho é conferido por serviço puro e por texto de fonte (a app não tem DOM no teste). A
conferência visual da planta com as 128 cores continua aberta.
