# Spec 130 — Evidência

Base: `a8bc4dc6` (staging). Medido em 2026-09-11, scripts no scratchpad da sessão (`m130.ts`,
`run130.ts`, `inv130.ts`, `measure120.ts`), nunca em `src/`.

## Por que o cubo não achava espaço morto

Atego de 85 entregas, todas presumidas (0,371 × 0,261 × 0,21 m), um cubo de 10 cm a cada cinco entregas,
mapa recomendado (`complement: false`):

- Presumidas sozinhas 1252; com os 17 cubos 1067 — custo **185** (limite de uma coluna: 170).
- 11 dos 17 cubos chegaram a procurar espaço morto (os outros 6 antes de a carga subir perto do teto):
  **4100** assentos da faixa, recusados **todos** pela mão (`isOutOfReach`), 0 pela sombra, 0 pela
  esbeltez, 0 aceitos.
- O cubo sentava no primeiro lugar nivelado da fileira: 7 dos 17 no piso, os demais entre 0,21 e 1,68 m.
- A perda não ficava perto do cubo: saía em `bedFull` das entregas 12–23 (a carga chega à porta mais
  cedo), e as camadas de 0,63 a 1,68 m perdiam de 11 a 58 caixas cada.

## Variantes (custo a cada 3 / 5 / 10 entregas, mapa recomendado)

| variante                                       | custo             | cubos no complemento |
| ---------------------------------------------- | ----------------- | -------------------- |
| antes                                          | 217 / 185 / 79    | 0                    |
| adiar a pequena                                | 267 / 165 / 109   | 0                    |
| espaço morto fora da mão → complemento na hora | 194 / 20 / 14     | 13 / 14 / 7          |
| assento ao alcance mais alto                   | 114 / 114 / 61    | 0                    |
| mais alto, empate pela porta                   | 217 / 185 / 79    | 0                    |
| mais alto, empate pela parede                  | 217 / 185 / 79    | 0                    |
| **adiar + mais alto (adotado)**                | **100 / 53 / 46** | 0                    |

Limites de uma coluna por cubo: 280 / 170 / 80 — as três passam.

## Descarga do caso sintético (simulação da 118)

| densidade | antes       | adotado sem a testeira                                     | adotado |
| --------- | ----------- | ---------------------------------------------------------- | ------- |
| 3         | 0 sem apoio | 1 sem apoio (cubo da entrega 84, z 1,05)                   | 0       |
| 5         | 0           | 1 (cubo da entrega 85, z 0,63, vão de 0,119 m na testeira) | 0       |
| 10        | 0           | 0                                                          | 0       |

Travadas no recomendado: 0 em todas. Fora do baú, cruzamento, no ar, ordem do recomendado: 0 em todas.

## Viagens reais (`measure120.ts`, mediana de 9)

| viagem            | recomendado     | complemento | `bedFull`                          | fora/cruza/ar/ordem rec./sem apoio/travadas rec. | ms          |
| ----------------- | --------------- | ----------- | ---------------------------------- | ------------------------------------------------ | ----------- |
| RTC-4H67 Daily    | 443 → **445**   | 38 → 36     | 0 → 0 (481/481)                    | 0                                                | 9,7 → 9,2   |
| RTE-6K89 Sprinter | 252 → 252       | 0           | 0                                  | 0                                                | 3,0 → 3,1   |
| RTA-2F45 Atego    | 1190 → **1239** | 79 → 93     | 148 → **85** (1269 → 1332 de 1417) | 0                                                | 28,7 → 32,5 |
| RTD-5J78 Accelo   | 500 → 500       | 0           | 0                                  | 0                                                | 9,4 → 9,3   |

Paradas sem nenhuma caixa no Atego: 1,3,4,5,7,8,9,10 → 1,3,4,5. `weightBalanced` segue o degrau de peso
(o caso sintético é `payloadRatio` 0,9897, todo equilibrado).

## Gates

- Vermelho antes do código: `um cubo de 10 cm a cada 5 paradas` — Expected ≤ 170, Received 185.
- `bun test ./test/cargo-volume.contract.test.ts` — 267 pass, 0 fail.
- `bun run typecheck` — verde.
- `make check` — verde (API 3296, frontend 5000, demais suítes 0 fail). Uma primeira rodada falhou em
  `uma viagem de 300 notas cabe em 50 ms` (69 ms) com as suítes em paralelo; a carga não tem caixa
  pequena, e medido isolado, cinco vezes, base e novo dão o mesmo — 31 ms frio, 16 ms quente.
