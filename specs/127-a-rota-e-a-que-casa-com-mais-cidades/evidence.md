# Evidência — 127

## T1 — contrato antes do código

`api-transportada/test/trip-valuation/driver-route-vote.contract.ts`, registrado em
`test/trip-valuation.contract.test.ts`. Antes da implementação: **13 falhas** (as 13 afirmações da
127 — `isCoveredByDriver`, `tiedZones` e `DRIVER_ROUTE_AMBIGUOUS` não existiam; o `Map` de uma
linha por cidade ainda estava no fonte).

Depois, com os contratos da 086/123/124 reescritos:

```
bun test ./test/trip-valuation.contract.test.ts ./test/suggestion-valuation.contract.test.ts ./test/trip-financial.contract.test.ts
 165 pass · 0 fail
frontend: bun test ./test/trip-financials.contract.test.ts → 39 pass · 0 fail
```

## T6 — medição nas viagens reais

Base local desta instalação, 2026-09-10, mesma leitura só-leitura antes e depois:
`readContext` + `buildTripDriverCost` nas 20 viagens com tripulação, e `resolveTripDriverZone` (sem
cobertura) nas 32.

**A planilha:** 83 linhas, 72 cidades (pela dobra de `foldRegionCity`), **10 cidades em mais de uma
rota** — ARARAQUARA, BARRINHA, BATATAIS, FRANCA, JARDINÓPOLIS, MOCOCA, PORTO FERREIRA, RIBEIRÃO PRETO
(0.001 e 1.001), SÃO CARLOS, SÃO JOAQUIM DA BARRA — e SERTÃOZINHO em duas faixas da mesma rota
(1.000 e 1.001). O SQL cru acha só 6: as outras 4 diferem só no acento entre as linhas.

| medida                                                              | antes        | depois                      |
| ------------------------------------------------------------------- | ------------ | --------------------------- |
| Viagens (32) cuja zona mudou                                        | —            | **16**                      |
| Viagens (32) em empate (`DRIVER_ROUTE_AMBIGUOUS`)                   | —            | **6** (5 com tripulação)    |
| Com tripulação (20): zona igual                                     | —            | 8                           |
| Parcela `driver` `estimated` por falta de cobertura                 | 13           | **0**                       |
| Parcela `driver` `measured` com valor                               | 2            | 10 (7 com lembrete)         |
| Parcela ausente (empate + `NO_DRIVER_RATE` + `CITY_WITHOUT_REGION`) | 5            | 10 (5 + 4 + 1)              |
| Custo do motorista somado nas 20                                    | R$ 10.717,24 | **R$ 6.874,24** (−3.843,00) |

Da variação, −3.231,89 são os cinco empates que deixaram de ter número; −611,11 são as sete viagens
que trocaram de zona.

| viagem     | antes (última parada)        | depois (rota com mais cidades)          | custo             |
| ---------- | ---------------------------- | --------------------------------------- | ----------------- |
| `0985737b` | 1.000 (SERTÃOZINHO) est.     | 1.003 (FRANCA) — rota 1: 6 × rota 5: 3  | 621,00 → 480,00   |
| `42b1377f` | 6.002 (ITUVERAVA) est.       | 1.003 (FRANCA) — rota 1: 6, coberta     | 888,72 → 570,00   |
| `5715dd82` | 0.001 (RIBEIRÃO PRETO) est.  | 1.003 (FRANCA) — rota 1: 9 × rota 2: 6  | 549,98 → 680,00   |
| `909fdd89` | 6.003 (MIGUELÓPOLIS) est.    | 1.003 (SÃO JOAQUIM DA BARRA) — 11 × 6   | 1.178,52 → 680,00 |
| `aa6152f0` | 4.002 (VARGEM GRANDE DO SUL) | 1.003 (SÃO JOAQUIM DA BARRA) — 5 × 3    | 707,25 → 480,00   |
| `c0a476b2` | 5.000 (DUMONT) est.          | 6.003 (GUAÍRA) — rota 6: 4 × rota 1: 3  | 618,24 → 966,00   |
| `eb746fb2` | 4.001 (PORTO FERREIRA) est.  | 4.002 (PIRASSUNUNGA) — rota 4: 2 × 1: 1 | 695,52 → 792,12   |

**FRANCA/SP** (1.003 e 7.001) vota nas duas rotas em toda viagem em que aparece. Em `3b2858a1` e
`5394ed72` (FRANCA + SÃO JOAQUIM DA BARRA) a rota 1 tem 2 cidades contra 1 da 7 e 1 da 6 → 1.003,
R$ 570,00 medido, **inalterado**. Em `0985737b`, `42b1377f` e `5715dd82` a rota 1 vence por 6, 6 e 9
cidades. Em `1511a0a2` o voto de FRANCA na rota 1 a leva a 4 — empatada com a rota 2 (RINCÃO,
ARARAQUARA, IBATÉ, SÃO CARLOS) → `1.003 (FRANCA) | 2.001 (SÃO CARLOS)`.

**BARRINHA/SP** (1.000 e 5.000) nunca decidiu sozinha: em `0985737b`, `5715dd82` e `909fdd89` a
rota 1 vence com folga; em `c0a476b2` BARRINHA vota na 1 e na 5, e a rota 6 vence mesmo assim
(ITUVERAVA, GUARÁ, GUAÍRA, SALES OLIVEIRA: 4 × 3); em `20c48ffd` (sem tripulação) a rota 2 vence por
10 × 9 × 9.

**Empates (6):** `0102749a` e `803f6008` (rotas 1, 3 e 6 com 3 cidades cada — a rota 1 tem quatro
linhas, mas SERTÃOZINHO conta uma vez embora esteja na 1.000 e na 1.001:
`1.001 (SERTAOZINHO) | 3.000 (CAJURU) | 6.003 (IGARAPAVA)`), `1511a0a2` (rotas 1 e 2, 4 cada),
`157f1822` (só RIBEIRÃO PRETO, que está na 0.001 e na 1.001), `e7ee7b75` (rotas 1 e 4, 2 cada), e
`d47b3427`, sem tripulação (rotas 1 e 3, 2 cada).

⚠️ `157f1822` expõe que a matriz (`0.001`, RIBEIRÃO PRETO) e a 1.001 dividem a mesma cidade: uma
viagem só para Ribeirão Preto empata por construção. Pela regra decidida é empate real; se a matriz
não deve disputar voto, é decisão nova do usuário.

## T7 — gate

`make check` na raiz do worktree, em primeiro plano: **exit 0** — API 4977 pass · 0 fail (5000 testes, 162 arquivos), worker 974 pass, frontend 3296 pass, cron 94, frontend-client 107; format, lint, typecheck e build verdes.
