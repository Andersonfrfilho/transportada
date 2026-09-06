# Evidência — 089

## Fase 0 — a medição que decidiu o escopo (2026-09-06)

Alvo: `https://map-tiles-staging.up.railway.app/map-tiles/area.pmtiles` (o mesmo que
`VITE_MAP_TILES_URL` aponta em desenvolvimento). Verdade de referência: OSM por Overpass,
`timestamp_osm_base` 2026-09-06T15:51:06Z.

Ferramenta: `pmtiles` (já é dependência do frontend) mais `@mapbox/vector-tile` e `pbf` instalados
avulsos num diretório de rascunho — **não foram acrescentados ao repositório**. Tornar isto um script
versionado é parte da T106, que precisa da mesma medição para fechar.

⚠️ Um decodificador de MVT escrito à mão na primeira tentativa devolveu `class` com valores de
`surface` e `oneway` (`paved`, `bridge`, `1`). O número saía plausível e errado. A troca pelo
decodificador de referência é o que sustenta os números abaixo — parser próprio de protobuf aqui não
paga.

### T001 — o que já vem nas telhas

Metadados do PMTiles, camada `transportation`:

```
fields: access, bicycle, brunnel, class, foot, horse, indoor, layer, level,
        mtb_scale, official, oneway, ramp, service, subclass, surface, toll
```

Telha `z14/6016/9178` (bbox `-21.18697,-47.81250,-21.16648,-47.79053`), telha contra OSM do mesmo
retângulo:

| classe                                                  | telha: feições / com `oneway` | OSM: ways / `oneway=yes` |
| ------------------------------------------------------- | ----------------------------- | ------------------------ |
| `minor` ↔ `residential`+`living_street`+`unclassified` | 342 / 340                     | 395 / 326                |
| `primary` ↔ `primary`+`primary_link`                   | 127 / 125                     | 133 / 121                |
| `secondary` ↔ `secondary`+`secondary_link`             | 62 / 61                       | 58 / 57                  |
| `tertiary`                                              | 22 / 21                       | 22 / 20                  |
| `service`                                               | 25 / 19                       | 119 / 19                 |
| total                                                   | 586 / 568                     | 808 / 545                |

Região (bbox `-21.60,-48.30` a `-20.80,-47.30`), OSM: **81** ways `toll=yes`, **16** nós
`barrier=toll_booth`, **70** nós `highway=speed_camera`, zero `highway=toll_gantry`.

Nas 23 telhas z14 que contêm cada um desses 70 radares e 16 cabines, o `poi` traz `gate:329`,
`lift_gate:36`, `toll_booth:16` — **e nenhuma feição de radar**. `transportation` com o atributo
`toll` presente: **64** feições.

Conclusão: `oneway`, `toll` e `toll_booth` já estão no arquivo servido; `speed_camera` não existe no
esquema OpenMapTiles e não sai de ajuste de estilo.

⚠️ **A primeira rodada afirmou "zero pedágio" e estava errada.** Ela amostrou cinco pontos do centro
e arredores, nenhum sobre praça de pedágio. Ausência num tileset só se afirma escolhendo a telha
**pela coordenada do dado**.

### T002 — arquivo separado, não perfil customizado

`planetiler generate-custom --schema=` lê um esquema YAML próprio e **não estende** o perfil
OpenMapTiles. Acrescentar o radar ao basemap exigiria manter um fork do perfil e reassar o dataset a
cada build, com o mapa que hoje funciona como risco. Decisão: segundo arquivo (`overlay.pmtiles`),
gerado do mesmo `.osm.pbf`, falhando em separado.

## Fase 1 — pendente

## Fase 2 — pendente

## Fase 1

### T100 — contrato vermelho antes da implementação

`apps/frontend-transportada/test/trip/vector-basemap.contract.ts`: cinco expectativas novas sobre
três camadas que ainda não existem (`sentido-da-via`, `via-com-pedagio`, `cabine-de-pedagio`), mais
um teste de invariante de ordem.

```
$ bun test test/trip.contract.test.ts
(fail) sentido, pedágio e cabine — o que já vem nas telhas > marca o sentido só onde o atributo existe, sem supor o valor
(fail) sentido, pedágio e cabine — o que já vem nas telhas > inverte a seta quando oneway = -1
(fail) sentido, pedágio e cabine — o que já vem nas telhas > só desenha a seta a partir do zoom de conferência de endereço
(fail) sentido, pedágio e cabine — o que já vem nas telhas > distingue o trecho com pedágio
(fail) sentido, pedágio e cabine — o que já vem nas telhas > marca a cabine de pedágio

 372 pass
 5 fail
Ran 377 tests across 1 file.
```

As cinco falhas são exatamente as camadas que a T102–T104 introduzem — nenhuma falha por engano em
teste já existente.

O teste de invariante de ordem (`nenhum addLayer do componente usa beforeId`) já passa hoje, contra
o componente como está: 3 chamadas de `map.addLayer` no `AssemblyVectorMap.component.tsx`, nenhuma
com `beforeId`. Ele trava a premissa da T105 antes de qualquer código novo — se algum `addLayer`
futuro ganhar `beforeId`, este teste denuncia antes de a ordem virar bug visual.

### T101 — o glifo da seta cabe na fonte embarcada

Fetch direto de `https://map-tiles-staging.up.railway.app/map-tiles/fonts/Noto%20Sans%20Regular/8448-8703.pbf`
(bloco de 256 codepoints que cobre U+2190–U+2193, as setas de direção), decodificado com `pbf`
(`PbfReader`) contra o schema real do glyphs.pbf.

⚠️ **A primeira tentativa de decodificar usou os números de campo errados** (supus
`name=1, glyphs=2, range=3`) e devolveu zero glifos sem erro — silencioso, não vermelho. A conferência
byte a byte contra o hexdump revelou o schema real: `name=1, range=2, glyphs=3` dentro de
`fontstack`, e `id=1, bitmap=2, …` dentro de `glyph`. Fica registrado pela mesma razão do "zero
pedágio" da Fase 0: decodificador que erra e não avisa produz número plausível e errado.

```
range: 8448-8703 · total de glifos: 76
faixa de ids: 8448 - 8693
tem 8594 (→)? true
tem 8592 (←)? true
tem 8593 (↑)? true
tem 8595 (↓)? true
```

Decisão: a seta é `text-field: '→'` com `text-rotate` — **não** precisa de `map.addImage`. O caminho
de imagem gerada em runtime, cogitado no `plan.md` como risco, não é necessário.
