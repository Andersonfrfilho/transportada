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

### T102–T105 — as três camadas e a ordem

`vectorBasemap.service.ts`: `via-com-pedagio` (após `via-principal`), `sentido-da-via` (após
`nome-da-via`, glifo `→` com `text-rotate` para o caso `-1`) e `cabine-de-pedagio` (glifo `●`, não
emoji — `web.md` §9 — logo antes de `numero-da-porta`).

```
$ bun test test/trip.contract.test.ts
377 pass
0 fail
```

`bun run typecheck` e `bun run lint` limpos.

### T106 — conferência repetida contra staging, com dado real

Harness descartável (fora do commit): instância direta de `MapLibreMap` usando o **mesmo**
`buildBasemapStyle` exportado, contra `https://map-tiles-staging.up.railway.app/map-tiles/area.pmtiles`
— o mesmo arquivo da Fase 0. Servido por `bunx vite` numa porta avulsa (53010), fora do
`launch.json` do worktree principal.

**Rua conhecida (centro de Ribeirão Preto):** `Rua Duque de Caxias` — bounding box da geometria
tirada da camada `nome-da-via`, cruzada contra `sentido-da-via` no mesmo retângulo:

```
encontrados: 2 feições
onewayValues: [1, 1]
```

Screenshot em zoom 17,5 confirma a seta desenhada e rotacionada ao longo do traço em
`Rua Amador Bueno`, `Rua Álvares Cabral` e na própria `Rua Duque de Caxias` — a mesma rua da
consulta programática.

**Cabine de pedágio real (Rodovia Atílio Balbo):** `map.jumpTo` para
`(-47.9144759, -21.1668441)`, a coordenada exata de uma das 16 cabines medidas na Fase 0:

```
via-com-pedagio: 8 feições
cabine-de-pedagio: 2 feições
```

As duas batem com os dois nós `barrier=toll_booth` do OSM medidos naquele ponto
(`-21.1668441,-47.9144759` e `-21.1671772,-47.914466`). No centro urbano, na mesma sessão, as duas
camadas deram **zero** — correto: não há pedágio dentro da cidade.

Harness removido antes do commit (`verify-089.html`/`.tsx`, não versionados); `.claude/launch.json`
restaurado ao estado original.

## Fase 2

### T200 — contrato vermelho para o serviço de dois arquivos

`api-transportada/test/deploy/map-tiles-server.contract.ts`, no mesmo molde de
`test/shared/security-headers.contract.ts` do frontend: lê o **texto** de `server.ts`, nunca importa
(importar sobe `Bun.serve` de verdade e exige o dataset no disco).

```
$ bun test test/deploy.contract.test.ts
(fail) declara o caminho do basemap e do overlay do radar
(fail) o overlay ausente responde 404, não 500 nem corpo vazio silencioso
(fail) a resposta por faixa de bytes é uma função só, parametrizada pelo arquivo

139 pass
3 fail
Ran 142 tests across 1 file.
```

As três falhas são exatamente o que a T202 introduz; as demais 139 (inclusive "basemap ausente
derruba o boot" e "caminho desconhecido é 404", que já valiam) continuam verdes.
