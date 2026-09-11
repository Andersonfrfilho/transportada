# Evidência — 123

## T1 — contrato antes do código

`api-transportada/test/trip-valuation/driver-rate-gap.contract.ts`, 13 testes, registrado em
`test/trip-valuation.contract.test.ts`. Sem a implementação ele não compila (`driverName` e as duas
lacunas não existiam); depois dela:

```
bun test ./test/trip-valuation.contract.test.ts
 76 pass · 0 fail · 135 expect() calls
```

Os dois testes da spec 086 que afirmavam `{ gap: 'NO_DRIVER_RATE' }` para o motorista que não cobre
a zona passaram a afirmar `{ gap: 'DRIVER_ZONE_NOT_COVERED', regionCode, regionCity }` — mudança de
vocabulário deliberada, não afrouxamento: a zona escolhida e o preço continuam os mesmos.

## T6 — rótulos

`frontend-transportada/test/trip-financials/valuation-gap-labels.contract.ts` lê `VALUATION_GAPS` do
fonte da API e cobra rótulo nas duas telas e nos dois idiomas: 24 pass, 0 fail.

## T7 — nenhum número mudou

Teste diferencial: a versão anterior de `buildTripDriverCost` (`git show HEAD:`) e a atual,
alimentadas com as tripulações das **20 viagens reais** desta base (2026-09-10), comparando `amount`
e `source`.

```
viagens: 20 · valores alterados: 0
```

O que o razão passou a dizer nessas viagens:

| viagem     | valor  | lacuna                    | detalhe                             |
| ---------- | ------ | ------------------------- | ----------------------------------- |
| `803f6008` | 0,00   | `DRIVER_ZONE_NOT_COVERED` | `3.000 (CAJURU) · vuc`              |
| `0985737b` | 0,00   | `DRIVER_ZONE_NOT_COVERED` | `1.001 (SERTAOZINHO) · vuc`         |
| `42b1377f` | 0,00   | `DRIVER_ZONE_NOT_COVERED` | `6.002 (ITUVERAVA) · three_quarter` |
| `c0a476b2` | 0,00   | `DRIVER_ZONE_NOT_COVERED` | `5.000 (DUMONT) · three_quarter`    |
| `e7ee7b75` | 0,00   | `DRIVER_ZONE_NOT_COVERED` | `4.002 (PIRASSUNUNGA) · toco`       |
| `909fdd89` | 0,00   | `CITY_WITHOUT_REGION`     | `OLIMPIA/SP` (inalterado)           |
| `07dd9ccc` | 0,00   | `NO_DRIVER_RATE`          | — (nenhuma parada com cidade)       |
| `5715dd82` | 380,00 | —                         | — (medido, inalterado)              |
| `3b2858a1` | 570,00 | —                         | — (medido, inalterado)              |
| `eb746fb2` | 450,00 | —                         | — (medido, inalterado)              |

`adalberto rocha` não tem cobertura nenhuma cadastrada, e responde por cinco das oito lacunas que
passaram a nomear zona — antes, todas saíam como a mesma frase seca.

`DRIVER_RATE_MISSING_FOR_CLASS` **não ocorre** em nenhuma das 20 viagens: nenhuma combina motorista
que cobre a zona com célula vazia. O caso existe na planilha — a coluna `utility` está vazia nas 25
zonas que têm algum preço — e as viagens `utility` desta base não têm tripulação.

## T8 — gate

```
make check → EXIT=0
API 3259 pass · frontend 974 pass · worker 4932 pass · demais suítes 0 fail
format:check: All matched files use Prettier code style!
```
