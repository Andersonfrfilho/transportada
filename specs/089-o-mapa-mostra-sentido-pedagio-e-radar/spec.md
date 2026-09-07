# Feature 089 — O mapa mostra sentido, pedágio e radar

> Registrada em 2026-09-06. Estado: **pendente**.

## Problema e resultado

O mapa de montagem da viagem (`AssemblyVectorMap`) desenha água, mancha urbana, via por classe, nome
de cidade, nome de rua e número de porta. Quem monta a viagem e quem confere o roteiro **não vê**
três coisas que decidem o trajeto: o sentido da via, onde o caminhão vai pagar pedágio, e onde estão
os radares.

O estilo é mínimo por decisão (`vectorBasemap.service.ts`), e isso continua certo — o fundo não pode
competir com o pino da parada. Mas as três primeiras informações **já viajam dentro do arquivo que já
servimos** e simplesmente não são desenhadas. Medir isso é o que separa esta spec em duas metades de
custo muito diferente.

O resultado é o mapa dizendo o sentido da via, marcando o trecho com pedágio e a cabine, e — na
segunda fase — mostrando o radar.

## O que foi medido (2026-09-06)

Telhas de `map-tiles-staging` (PMTiles do planetiler, perfil OpenMapTiles), conferidas contra o OSM
cru da mesma área por Overpass.

| dado                                             | nas telhas hoje | conferência                           |
| ------------------------------------------------ | --------------- | ------------------------------------- |
| sentido de via (`transportation.oneway`)         | ✅              | por classe, bate com o OSM            |
| trecho com pedágio (`transportation.toll`)       | ✅              | 64 feições nas 23 telhas conferidas   |
| cabine de pedágio (`poi`, subclass `toll_booth`) | ✅              | 16 nas telhas, 16 no OSM da região    |
| radar (`highway=speed_camera`)                   | ❌              | 70 no OSM da região, **0** nas telhas |

⚠️ **A ausência do radar foi conferida onde ele existe**, não por amostragem: peguei a coordenada dos
70 radares do OSM, calculei a telha z14 de cada um, e conferi as 23 telhas distintas resultantes.
Nelas o `poi` traz `gate:329`, `lift_gate:36` e `toll_booth:16` — e nenhuma feição de radar. O
esquema OpenMapTiles não tem `speed_camera`, e nenhum ajuste de estilo o faz aparecer.

⚠️ **A primeira medição que fiz disse "zero pedágio" e estava errada** — eu havia amostrado telhas do
centro, longe de praça de pedágio. Fica registrado porque o erro é barato de repetir: para afirmar
ausência num tileset, a telha tem de ser escolhida pela coordenada do dado, nunca por conveniência.

Telha `z14/6016/9178` (centro de Ribeirão), contra o OSM do mesmo retângulo:

|                                                         | telha (feições / com `oneway`) | OSM (ways / `oneway=yes`) |
| ------------------------------------------------------- | ------------------------------ | ------------------------- |
| `minor` ↔ `residential`+`living_street`+`unclassified` | 342 / 340                      | 395 / 326                 |
| `primary` ↔ `primary`+`primary_link`                   | 127 / 125                      | 133 / 121                 |
| `secondary` ↔ `secondary`+`secondary_link`             | 62 / 61                        | 58 / 57                   |
| `tertiary`                                              | 22 / 21                        | 22 / 20                   |
| `service`                                               | 25 / 19                        | 119 / 19                  |

Região de Ribeirão Preto (bbox ~90×90 km, `-21.60,-48.30` a `-20.80,-47.30`): 81 trechos `toll=yes`,
16 cabines `barrier=toll_booth`, 70 radares `highway=speed_camera`.

### Duas armadilhas que a medição revelou, e que o desenho tem de respeitar

- **`oneway` só assume o valor `1` nesta base** — nunca `0`, nunca `-1`. Então a seta se desenha onde
  o atributo existe, e **a ausência dele não afirma mão dupla**. Nenhum texto de interface pode dizer
  "via de mão dupla" a partir da ausência.
- **A telha sub-representa a via de mão dupla como feição.** 342 feições `minor` contra 395 ways no
  OSM, e a diferença é quase toda de mão dupla (mesclagem de segmentos contíguos com atributos
  iguais). Serve para desenhar a seta onde ela existe; **não serve para contar proporção** — "X% do
  trajeto é mão única" sairia perto de 97% e seria falso. A conta certa mediria comprimento, não
  feição, e mesmo assim não é o assunto desta spec.

## Fora do escopo

- **Rota que evita pedágio.** Isso é o roteirizador (OSRM), não o mapa. Mostrar onde está é
  diferente de decidir por onde ir.
- **Pedágio na conta do frete.** O pedágio já é componente da composição de cobrança do CT-e
  (`cte-profiles-domain/charge-composition.contract.ts`); o custo da viagem é assunto da `061`.
- **O mapa do portal do contratante** (`frontend-client`): desenho SVG próprio, sem basemap vetorial,
  e por decisão registrada ele não fala com terceiro nenhum.
- **Trocar o dataset do basemap.** A fase 2 acrescenta um arquivo ao lado; ela não reassa o
  `area.pmtiles`.

## Requisitos funcionais

### Fase 1 — o que já está no arquivo

- Seta de sentido ao longo da via com `oneway` presente, apontando no sentido do traço, a partir do
  zoom em que se confere endereço (não no zoom de região, onde viraria ruído sobre a rota).
- O caso `oneway = -1` inverte a seta. Ele não ocorre nesta base, e entra assim mesmo: é uma
  expressão de uma linha, e o dia em que ocorrer o erro seria uma seta apontando para o lado errado —
  defeito que ninguém confere olhando.
- Trecho com `toll` distinguível no traçado da via.
- Cabine de pedágio (`poi`, subclass `toll_booth`) marcada no mapa.
- Nenhuma camada nova pode competir com o pino da parada, que é o assunto da tela: elas entram abaixo
  dos pinos na ordem do estilo, e com peso visual menor que o do traçado da rota.

### Fase 2 — o que não está

- Camada de radar, gerada por `planetiler generate-custom --schema=` a partir do **mesmo** `.osm.pbf`
  que já alimenta o basemap e o OSRM, num **segundo** arquivo (`overlay.pmtiles`).
- O serviço de mapa passa a servir os dois arquivos, com a mesma trava de `Range` e a mesma barreira
  contra travessia de caminho que os glifos já têm.
- O estilo soma o overlay como **segunda fonte**. Overlay ausente degrada com o mapa inteiro de pé —
  é o comportamento que o `area.pmtiles` já tem quando falta, e a razão de o radar não entrar no
  arquivo principal.

## Decisões de desenho, com o porquê

- **Arquivo separado, não perfil customizado do OpenMapTiles.** O `generate-custom` do planetiler lê
  um esquema YAML próprio; ele **não estende** o perfil OpenMapTiles pronto. Acrescentar uma camada
  ao basemap significaria manter um fork do perfil e reassar o dataset inteiro a cada build — e o
  risco é o mapa que hoje funciona. Dois arquivos custam um `RUN` a mais no build e uma fonte a mais
  no estilo, e falham em separado.
- **A seta é glifo de texto antes de ser sprite.** A fonte `Noto Sans Regular` já está embarcada na
  imagem; um `symbol` com `text-field` e `symbol-placement: 'line'` desenha a seta sem introduzir
  sprite nenhum. Se o glifo escolhido não existir na faixa embarcada, o caminho é `map.addImage` com
  imagem gerada em tempo de execução — decidido na fase de plano, contra o arquivo de fonte real.
- **O ícone da cabine e do radar não passa por `@/components/ui/icon`.** Aquela regra vale para
  `src/**/*.tsx`; aqui quem desenha é o MapLibre em WebGL, que não renderiza nosso componente. A cor
  sai dos mesmos tokens `--color-basemap-*` resolvidos em tempo de execução, como todo o resto do
  estilo.

## Requisitos não funcionais

- Nenhuma coordenada em log, no serviço de mapa como no cliente.
- O estilo continua válido contra o spec do MapLibre nos três temas — expressão malformada faz o
  MapLibre emitir `error`, e o tratador do componente derruba o mapa inteiro.
- O overlay é dado público de mercado: sem tenant, sem PII, sem `companyId` — como
  `fuel_price_references` e `vehicle_volume_references`.

## Critérios de aceite

- Via de mão única com seta no sentido do traço, conferida em staging sobre uma rua conhecida.
- Trecho com pedágio distinguível, e cabine marcada, no trecho de rodovia da região.
- Radar visível vindo do overlay; **sem** o overlay, o mapa carrega igual ao de hoje.
- `validateStyleMin` verde nos três temas, com as camadas novas.
- Nenhuma proporção calculada a partir de contagem de feição em nenhuma superfície.
