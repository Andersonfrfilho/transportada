# Evidência — 124

## T1 — contrato antes do código

`api-transportada/test/trip-valuation/driver-zone-table-price.contract.ts`, 9 testes, registrado em
`test/trip-valuation.contract.test.ts`. Antes da implementação:

```
SyntaxError: Export named 'ADVISORY_GAPS' not found in module '.../trip-valuation.policy.ts'
 0 pass · 1 fail · 1 error
```

Os dois testes da 086/123 que afirmavam o ramo "não cobre" sem id passaram a afirmar `regionId` —
acréscimo, não afrouxamento: zona, código e cidade continuam os mesmos.

Depois:

```
bun test ./test/trip-valuation.contract.test.ts ./test/suggestion-valuation.contract.test.ts ./test/trip-financial.contract.test.ts
 139 pass · 0 fail
```

## T4 — tela

`frontend-transportada/test/trip-financials/valuation-ledger-advisory.contract.ts` (5 testes): a
lista de avisos é cópia por valor da API (lida do fonte); a linha de aviso mantém o valor; lacuna de
verdade continua no lugar do número; a soma do razão conta o aviso; o componente imprime a marca de
estimado e o aviso.

```
bun test ./test/trip-financials.contract.test.ts → 36 pass · 0 fail
```

## T6 — medição nas viagens reais

Base local desta instalação, 2026-09-10, `readTripValuation` rodado nas 32 viagens (20 com
tripulação), antes e depois, pelo mesmo script (só leitura).

| medida                                                      | antes | depois           |
| ----------------------------------------------------------- | ----- | ---------------- |
| Parcela `driver` com `DRIVER_ZONE_NOT_COVERED` (ausente)    | 13    | **0**            |
| Parcela `driver` estimada pelo preço da tabela              | 0     | **13**           |
| Continua ausente: `NO_DRIVER_RATE` (nenhuma parada decidiu) | 4     | 4                |
| Continua ausente: `CITY_WITHOUT_REGION` (`BARRETOS/SP`)     | 1     | 1                |
| Medida (zona na ficha), inalterada                          | 2     | 2 (R$ 570,00)    |
| Custo do motorista somado nas 20 viagens                    | —     | **+R$ 9.577,24** |
| Viagens sem tripulação com qualquer número alterado         | —     | 0                |

Os 13 casos têm preço na tabela: nenhum caiu na regra 2 (zona sem preço para a classe). As cinco
maiores:

| viagem     | zona · classe                     | custo total antes → depois |
| ---------- | --------------------------------- | -------------------------- |
| `909fdd89` | 6.003 (MIGUELÓPOLIS) · toco       | 0,00 → 1.178,52            |
| `b9bd8927` | 1.000 (PITANGUEIRAS) · truck      | 0,00 → 1.086,12            |
| `e7ee7b75` | 4.002 (PIRASSUNUNGA) · toco       | 0,00 → 966,39              |
| `42b1377f` | 6.002 (ITUVERAVA) · three_quarter | 0,00 → 888,72              |
| `5715dd82` | 0.001 (RIBEIRÃO PRETO) · toco     | 321,60 → 871,58            |

`hasGaps` continua `true` nas 20 — por outras parcelas (PIS/COFINS sem regime, ICMS sem CT-e,
distância), não pelo aviso.

## T7 — gate

```
api-transportada: bun run test → 4941 pass · 0 fail ; bunx tsc --noEmit → exit 0
frontend-transportada: bun run test → 3282 pass · 0 fail ; tsc --noEmit → exit 0
```

`make check` rodou no fim das três entregas — ver `specs/126-*/evidence.md`.
