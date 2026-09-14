# Spec 131 — Evidência

## Toda caixa empacotada é desenhada — as quatro viagens reais

`resolveCargoLayout` sobre as entradas reais anonimizadas (`layout-inputs-121.json`), antes (staging
`dc1b6128`) e depois:

| placa   | pedidas | desenhadas antes | desenhadas depois | fora (motivo físico) |
| ------- | ------: | ---------------: | ----------------: | -------------------- |
| RTC4H67 |     481 |              481 |               481 | —                    |
| RTE6K89 |     252 |              252 |               252 | —                    |
| RTA2F45 |    1417 |             1332 |              1332 | 85 `bedFull`         |
| RTD5J78 |     500 |              500 |               500 | —                    |

Nenhuma viagem real chegava a 1500, então nelas o número não muda; o que muda é que nenhuma carga
maior será aparada. Em todas, desenhadas = empacotadas, e nenhuma sai `tooMany`. Carga sintética de
6000 caixas: 6000 empacotadas, 6000 desenhadas (empacotar: 158 ms).

## Custo do 3D — navegador, componente real

Harness com o `CargoIsometric` real e o build de produção do React. Mede do `setState` até dois
quadros pintados (`paintSeen: true` em todas). "Girar" é a mediana e o pico de 12 giros. "Destacar"
é a mediana de 8 trocas de foco de parada, que refazem a lista inteira de caixas.

| carga           | girar antes (med / pico) | girar depois (med / pico) | destacar antes → depois |
| --------------- | -----------------------: | ------------------------: | ----------------------: |
| Atego real 1332 |               25 / 62 ms |              17 / 25,6 ms |          17,6 → 17,1 ms |
| 1500            |               25 / 44 ms |              23,6 / 27 ms |          16,8 → 20,2 ms |
| 3000            |           41,7 / 51,9 ms |            39,7 / 49,7 ms |          33,3 → 41,4 ms |
| 6000            |         **100 / 131 ms** |        **69,5 / 91,7 ms** |          66,5 → 66,7 ms |

Orçamento declarado: **redesenho ao girar ≤ 100 ms com 6000 caixas**. Antes: estourava (pico de 131
ms). Depois: cumprido (pico de 91,7 ms). A projeção pura de 6000 caixas é cobrada abaixo de 100 ms em
`cargo-isometric-full-drawing.contract.ts`.

## Gates

- API: `bun test test/cargo-volume.contract.test.ts` — 269 pass.
- Frontend: `bun test test/design-system.contract.test.ts test/trip.contract.test.ts` — 991 pass;
  `tsc --noEmit` limpo.
- `make check` — ver o commit.

## O que não foi medido

- O painel do navegador estava oculto no começo, e a espera por quadro pintado caía no layout
  forçado; na medição final o `paintSeen` foi `true` em todas as cargas.
- A tela real da montagem (com consulta à API) não foi aberta: a app local roda do checkout principal,
  com o código anterior. O harness monta o componente real com as plantas reais e sintéticas.
- Celular não foi medido.
