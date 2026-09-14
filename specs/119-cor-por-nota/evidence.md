# Spec 119 — Evidência

Entrada real: as quatro viagens de 2026-09-10 (`layout-inputs.json`, as mesmas das specs 115–118),
sobre `175ea06e`. Medições por script, nunca pelo desenho.

## T1/T2 — contratos vermelhos antes do código

- API (`bun test ./test/cargo-volume.contract.test.ts`): o contrato novo reprovou — o repositório
  não carimbava a nota e `PlacedBox` não tinha os campos.
- Frontend (`bun test ./test/trip.contract.test.ts ./test/design-system.contract.test.ts`): 288 pass,
  2 fail, 1 erro — `noteTone.service.ts` inexistente e `faceWash` ainda no desenho.

## T6 — nenhuma posição mudou

Coordenadas completas de cada caixa (`xM`, `yM`, `zM`, medidas, camada, motivos, origem, parada) e a
lista do que ficou de fora, em três rodadas: o código anterior, o novo sem nota e o novo com três
notas sintéticas por parada.

| viagem   | caixas | fora | antes = depois sem nota = depois com nota | toda caixa na parada da própria nota | sem nota → `null` |
| -------- | -----: | ---: | ----------------------------------------- | ------------------------------------ | ----------------- |
| RTC-4H67 |    441 |   40 | idênticas                                 | sim (47 notas)                       | sim               |
| RTE-6K89 |    252 |    0 | idênticas                                 | sim (70 notas)                       | sim               |
| RTA-2F45 |   1190 |  227 | idênticas                                 | sim (190 notas)                      | sim               |
| RTD-5J78 |    500 |    0 | idênticas                                 | sim (71 notas)                       | sim               |

O contrato `note-identity.contract.ts` confere o mesmo nas duas cargas reais do fixture (Accelo de
24 paradas e Atego de 85).

## T3 — a trava dos tons, medida

Mistura fixa contra a paleta das paradas (CIELab, os dois temas), antes de decidir a trava por
desenho:

| mistura (resto da cor) | a partir de quantas paradas um tom fica mais perto de outra parada | ΔE mínimo entre tons |
| ---------------------- | -----------------------------------------------------------------: | -------------------: |
| 92% / 90%              |                                                                 30 |                  1,6 |
| 86%                    |                                                                 21 |                  3,3 |
| 82% / 78% / 74%        |                                                                  8 |              5 a 9,3 |
| 80% e 62% (cinco tons) |                                                                  4 |                  5,9 |

Nenhuma mistura fixa distingue as notas **e** fica longe de todas as paradas. Com a trava (cinco
tons: a cor, 80% e 64% de mistura com `--color-fog` e `--color-asphalt`, só os que ficam mais perto
da própria parada que de qualquer outra desenhada), cinco notas por parada nas viagens reais:

| viagem   | paradas | paradas com 5 tons | com 3 | com 2 | com 1 (só a cor da parada) |
| -------- | ------: | -----------------: | ----: | ----: | -------------------------: |
| RTC-4H67 |      19 |                  7 |     8 |     0 |                          4 |
| RTE-6K89 |      24 |                  6 |    10 |     0 |                          8 |
| RTD-5J78 |      24 |                  6 |    10 |     0 |                          8 |
| RTA-2F45 |      85 |                  5 |     7 |     6 |                         67 |

⚠️ Na viagem grande a maioria das paradas fica com um tom só — é o preço de nunca pintar uma nota
com a cor de outra parada. Ali o caminho para separar as notas é acender a nota na ficha da entrega.

## T7 — gates

- API `bun test ./test/cargo-volume.contract.test.ts`: 241 pass, 0 fail (sozinho; rodando junto do
  typecheck o orçamento de 50 ms do Atego estourou por carga da máquina, e voltou a passar isolado).
- Frontend `bun test ./test/trip.contract.test.ts ./test/design-system.contract.test.ts`: 950 pass.
- `bun run typecheck`: verde nas seis apps.
- `make check`: verde (log em scratchpad `make-check-119.log`).
