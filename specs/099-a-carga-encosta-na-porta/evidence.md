# Evidência — Feature 099

> ⚠️ Registrada **depois** da implementação. O processo desta base manda o contrato de aceite vir
> antes; aqui o defeito foi relatado e corrigido no mesmo turno, e os contratos foram escritos junto
> da correção, não antes dela. Fica dito.

## Medição do defeito e da correção

Carga da tela relatada — 30 caixas de 300 × 200 × 210 mm, três paradas (15/9/6), baú de
7,400 × 2,470 × 2,300 m:

```
antes:  uma camada, x 0,00..7,40   (fileira rasteira atravessando o baú)
depois: parada 3  x 6,50..6,80
        parada 2  x 6,80..7,10
        parada 1  x 7,10..7,40  (2 camadas)
```

Comprimento ocupado: **7,40 m → 0,90 m**. Ordem de entrega preservada, nenhuma caixa fora do desenho.

## Medição do equilíbrio (D3)

Mesma carga, variando `payloadRatio`:

| `payloadRatio` | extensão ocupada | leitura                           |
| -------------- | ---------------- | --------------------------------- |
| `0.3000`       | x 6,50..7,40     | encosta na porta                  |
| `0.8000`       | x 3,25..4,15     | centralizada, vão nas duas pontas |
| `null`         | x 6,50..7,40     | sem teto não equilibra            |

## Medição do acesso de carga (D5)

Mesma carga com `payloadRatio` leve (`0.1000`):

| `loadingAccess` | extensão              | leitura                          |
| --------------- | --------------------- | -------------------------------- |
| ausente         | termina em 7,40       | encosta na porta (padrão `rear`) |
| `rear_and_side` | termina em 7,40       | a ordem ainda vale               |
| `open`          | termina antes de 7,40 | equilibra sem olhar o peso       |

## Medição da gravidade (D6)

Doze caixas de alturas misturadas (seis de 800 mm, seis de 200 mm), baú de 7,4 m:

```
antes:  12 caixas, 2 flutuando (0,6 m de ar)
depois: 12 caixas, 0 flutuando
```

Durante a correção, com o índice de célula ainda sem folga: **quatro** caixas em escada numa fileira
de piso, subindo 0,8 → 1,6 → 1,8 → 2,0 m. A regra de gravidade sem a folga binária produz defeito
pior que o original.

## Medição do balanço e do desempenho (D7, D8)

Com a regra de nível, dimensionar a fatia com pacotes **descartados** e empacotar de novo custava
64 ms — o teto da spec 094 é 50 ms, e a base antes da compactação rodava em 5 a 16 ms. Três causas,
medidas com contador:

| causa                                              | medida                                             | correção                                                   |
| -------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| dois pacotes por parada, nove no pior caso         | 48 pacotes por execução                            | medir e empacotar viraram a mesma passagem                 |
| cursor subindo de camada sem fim ao encher a fatia | **58 buscas por caixa**, 10,8 M leituras de perfil | camada varrida sem lugar encerra a busca                   |
| perfil da faixa montado inteiro antes de procurar  | 148 colunas × 50 linhas por caixa                  | perfil sob demanda, e corrida de colunas em passagem única |

Resultado: **9,7 ms** com 3600 caixas — abaixo do teto e da base anterior.

Duas tentativas descartadas, registradas porque custaram tempo: um `MIN_SUPPORT_RATIO` de meia base
(derrubou 13 contratos — a posição recusada não avançava o cursor) e um alcance de busca de 2 m
(não melhorou o tempo e quebrou a rotação da caixa).

## Contratos

`apps/api-transportada/test/cargo-placement/slices.contract.ts` — cinco casos novos no describe
"o equilíbrio longitudinal", mais a reescrita de "cada parada ocupa uma faixa própria".
`apps/api-transportada/test/cargo-placement/placement.contract.ts` — "posiciona a caixa no piso,
encostada na porta" (antes: "encostada no fundo") e a lista de motivos com `weightBalanced`.

```
bun test ./test/cargo-volume.contract.test.ts
 165 pass
 0 fail
```

`bun run typecheck` e `bun run lint` limpos.

## Arquivos

| arquivo                                                | o quê                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `src/trips/domain/cargo-placement.policy.ts`           | `sizeSlice`, o deslocamento do bloco, `shouldBalanceLoad`, motivo `weightBalanced` |
| `src/trips/domain/cargo-layout.policy.ts`              | repasse de `payloadRatio`                                                          |
| `src/trips/application/preview-trip-cargo.use-case.ts` | prévia passa o peso já lido                                                        |
| `src/trips/infrastructure/drizzle-trip.repository.ts`  | detalhe passa o teto já resolvido                                                  |
| `test/cargo-placement/slices.contract.ts`              | contratos da fatia e do equilíbrio                                                 |
| `test/cargo-placement/placement.contract.ts`           | contratos da posição e dos motivos                                                 |

## Dívida deixada

- Duas contas de posição existem no mesmo arquivo (a fatia e o equilíbrio) e **nenhuma confere
  eixo** — spec 098.
- O crescimento da fatia é 1,35× por até 8 tentativas. O passo é grosso de propósito, mas não foi
  medido contra alternativas: é candidato a ajuste se a divisão de carga aparecer demais na tela.
