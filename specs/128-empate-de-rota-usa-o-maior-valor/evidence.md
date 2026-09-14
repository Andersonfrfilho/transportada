# Evidência — 128

## T1 — contrato antes do código

`api-transportada/test/trip-valuation/driver-route-tie.contract.ts`. Antes da implementação a suíte
não carregava (`trip-driver-tie.policy.js` não existia): 0 pass · 1 fail · 1 error. Depois da
implementação os cinco vermelhos restantes eram as afirmações antigas do empate sem valor e da lista
de avisos com um item só — reescritas com a razão em cada teste.

```
bun test ./test/trip-valuation.contract.test.ts ./test/suggestion-valuation.contract.test.ts ./test/trip-financial.contract.test.ts
 183 pass · 0 fail
frontend: bun test ./test/trip-financials.contract.test.ts → 39 pass · 0 fail
```

## T6 — medição nas viagens reais

Base local, 2026-09-11, a mesma leitura só-leitura antes (código em `1ecd4779`) e depois:
`readTripValuation` nas 32 viagens (parcela `driver` das 20 com motorista) e
`resolveTripDriverZone` sem cobertura nas 32.

| medida                                              | antes (127) | depois (128)                     |
| --------------------------------------------------- | ----------- | -------------------------------- |
| Viagens (32) cuja zona mudou                        | —           | **6**                            |
| Empates nas 32                                      | 6           | **5** (4 com motorista)          |
| Empates com motorista sem valor                     | 5           | **0**                            |
| Viagens com motorista cuja parcela mudou            | —           | **5**                            |
| Viagens com motorista sem empate cuja parcela mudou | —           | **0** (15 idênticas byte a byte) |
| Custo de motorista somado nas 20                    | R$ 6.874,24 | **R$ 10.573,13** (+3.698,89)     |

| viagem     | rotas empatadas (cidades)     | faixas que couberam, com o preço da classe                                    | escolhido                             |
| ---------- | ----------------------------- | ----------------------------------------------------------------------------- | ------------------------------------- |
| `0102749a` | 1, 3, 6 (3 cada) · vuc        | 1.001 (SERTÃOZINHO) 260,00 · 3.000 (CAJURU) 621,00 · 6.003 (IGARAPAVA) 862,50 | 6.003 — R$ 862,50                     |
| `803f6008` | 1, 3, 6 (3 cada) · vuc        | idem                                                                          | 6.003 — R$ 862,50                     |
| `1511a0a2` | 1, 2 (4 cada) · vuc           | 1.003 (FRANCA) 480,00 · 2.001 (SÃO CARLOS) 747,50                             | 2.001 — R$ 747,50                     |
| `e7ee7b75` | 1, 4 (2 cada) · toco          | 1.002 (PORTO FERREIRA) 540,00 · 4.002 (PIRASSUNUNGA) 966,39                   | 4.002 — R$ 966,39                     |
| `d47b3427` | 1, 3 (2 cada) · sem motorista | 1.002 (ARARAQUARA) · 3.002 (SÃO JOSÉ DO RIO PARDO)                            | sem parcela (sem classe a precificar) |
| `157f1822` | — (matriz fora do voto)       | 1.001 (RIBEIRÃO PRETO) 260,00, vuc                                            | 1.001 — R$ 260,00                     |

Da variação: +3.438,89 são os quatro empates com motorista que passaram a ter valor; +260,00 é
`157f1822`, que deixou de empatar pela regra da matriz.

Texto que a tela imprime no empate de `1511a0a2` (rótulo pt + detalhe):

> rotas empatadas no número de cidades da viagem — usado o maior valor entre as faixas que couberam
> — 4 cidades · 1.003 (FRANCA) R$ 480,00 | 2.001 (SÃO CARLOS) R$ 747,50 · vuc

**A matriz.** `157f1822` só tem RIBEIRÃO PRETO, que está na `0.001` (matriz) e na `1.001`. Na 127
empatava por construção. Com a matriz fora do voto quando outra rota casa, a viagem sai `1.001
(RIBEIRAO PRETO)`, vuc, R$ 260,00 medido, com o lembrete de ficha (`DRIVER_ZONE_PRICED_FROM_TABLE`),
porque o motorista não tem a 1.001. Nenhuma viagem da base tem só cidades da matriz, então o ramo
"a matriz vence sozinha" está provado só por contrato.

`hasGaps` não mudou em nenhuma viagem: as cinco que ganharam valor ainda carregam outras lacunas
(pedágio, federal) — o aviso novo não as marca, e não as desmarca.

## T7 — gate

`make check` na raiz do worktree, em primeiro plano: **exit 0** — API 4995 pass · 0 fail (5018 testes,
162 arquivos), worker 974, cron 94, frontend 3296, frontend-client 107, landing 18; format, lint,
typecheck e build verdes.
