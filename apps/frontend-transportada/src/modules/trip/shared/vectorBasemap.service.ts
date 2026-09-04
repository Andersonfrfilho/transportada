/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { StyleSpecification } from 'maplibre-gl'

/**
 * O mapa de rua deste produto (ADR-0044 §6): **um arquivo PMTiles servido do nosso domínio**, lido
 * por faixa de bytes. Nada de terceiro renderiza aqui, e nenhuma coordenada de entrega viaja para
 * servidor alheio — que é a razão da ADR-0047, mantida de pé.
 */
/**
 * O caminho é **relativo por padrão** — o mapa vem do nosso domínio, e é isso que a ADR-0044 §6
 * exige em produção.
 *
 * ⚠️ `VITE_MAP_TILES_URL` existe para o **desenvolvimento**: gerar o arquivo pede vários GB de
 * disco e memória que a máquina de quem desenvolve raramente tem sobrando — o build de staging
 * tem. Apontar o local para lá evita que cada pessoa precise assar o próprio mapa, e não muda nada
 * em produção, onde a variável não é declarada.
 */
export const BASEMAP_URL = import.meta.env.VITE_MAP_TILES_URL?.trim() || '/map-tiles/area.pmtiles'
const SOURCE = 'basemap'
/** A pilha embarcada no serviço de mapa. Trocar o nome aqui sem trocar a imagem apaga todo rótulo. */
const FONT_STACK = 'Noto Sans Regular'

/**
 * Os glifos moram ao lado do arquivo de telha — mesmo serviço, mesma origem. Quando o mapa vem de
 * staging (desenvolvimento), o caminho precisa ser **absoluto**: relativo apontaria para o servidor
 * do painel, que não tem fonte nenhuma.
 */
function resolveGlyphsUrl(): string {
  const glyphs = '/map-tiles/fonts/{fontstack}/{range}.pbf'
  if (!BASEMAP_URL.startsWith('http')) return glyphs
  return `${new URL(BASEMAP_URL).origin}${glyphs}`
}

/**
 * O estilo é **nosso e mínimo**, e isso é decisão, não preguiça: o painel existe para conferir um
 * roteiro, então o fundo precisa de água, mancha urbana, via e nome de cidade — e de nada mais. Um
 * estilo completo de OpenMapTiles traz centenas de camadas que competem com os pinos justamente
 * onde eles importam.
 *
 * As cores saem dos tokens do produto, resolvidos em tempo de execução: o MapLibre pinta em WebGL e
 * não enxerga `var(--color-…)`.
 */
export const BASEMAP_THEMES = ['claro', 'escuro', 'contraste'] as const
export type BasemapTheme = (typeof BASEMAP_THEMES)[number]

/**
 * As duas leituras do mesmo mapa. **Claro** é o formato que todo mundo já sabe ler e o que separa
 * rodovia de rua no zoom de região; **escuro** casa com o painel e cansa menos em turno longo.
 *
 * ⚠️ Os tokens são escolhidos pelo **valor**, nunca pelo nome: a primeira versão usou
 * `--color-plate-*`, que é a paleta da **placa do veículo** (#eef0f2), e pintou via quase branca
 * sobre fundo quase branco — o mapa carregava e só os rios apareciam.
 *
 * ⚠️ `contorno` é o **papel** do tema, e é o anel do pino da parada. Ele existe porque o pino caiu
 * no mesmo defeito descrito acima e ninguém percebeu: o anel era `--color-plate-surface` fixo, que
 * é quase branco. No tema escuro isso separava bem; no `claro` e no `contraste`, cujo papel também
 * é quase branco, o anel sumia — e o pino perdia a separação justamente onde o mapa é mais cheio.
 * Anel do mapa acompanha o mapa, como todo o resto desta paleta.
 */
const PALETTE: Readonly<Record<BasemapTheme, Readonly<Record<string, string>>>> = {
  claro: {
    agua: '--color-plate-flag-blue',
    /** O papel deste tema — ver `contorno` no fim de cada bloco. */
    contorno: '--color-fog',
    relevo: '--color-plate-surface',
    rotulo: '--color-asphalt',
    terra: '--color-fog',
    verde: '--color-ready',
    via: '--color-graphite',
    /** Convenção do OpenStreetMap: rodovia vermelha, troncal laranja, secundária amarela. */
    rodovia: '--color-alert',
    troncal: '--color-copper',
    secundaria: '--color-plate-flag-yellow',
  },
  escuro: {
    agua: '--color-plate-flag-blue',
    contorno: '--color-asphalt',
    relevo: '--color-graphite',
    rotulo: '--color-fog',
    terra: '--color-asphalt',
    verde: '--color-ready',
    via: '--color-slate',
    rodovia: '--color-alert',
    troncal: '--color-copper',
    secundaria: '--color-plate-flag-yellow',
  },
  /**
   * Papel branco, traço preto, sem vegetação nem mancha urbana competindo. É o que se lê num galpão
   * com o sol batendo na tela do celular — e o que imprime, se alguém levar o roteiro no papel.
   */
  contraste: {
    agua: '--color-graphite',
    /**
     * ⚠️ Aqui `--color-plate-*` é escolhido **pelo valor** e está certo: este tema é papel branco, e
     * #eef0f2 é o branco de papel que ele quer. Não confundir com o defeito descrito acima, que era
     * usar essa paleta onde o fundo já era claro.
     */
    contorno: '--color-plate-surface',
    relevo: '--color-fog',
    rotulo: '--color-asphalt',
    terra: '--color-plate-surface',
    verde: '--color-fog',
    via: '--color-asphalt',
    /** No alto contraste a classe não colore: o que separa via é a espessura, não o matiz. */
    rodovia: '--color-asphalt',
    troncal: '--color-asphalt',
    secundaria: '--color-asphalt',
  },
}

/**
 * O anel do pino da parada, na cor do papel do tema.
 *
 * ⚠️ Ele sai **daqui** e não do CSS do módulo porque o tema do mapa é estado do mapa, não do
 * documento: o painel é escuro sempre, e o basemap alterna entre três leituras por baixo dele. Uma
 * cor fixa na folha de estilo não tem como acompanhar isso — foi exatamente assim que o anel ficou
 * quase branco nos dois temas de papel claro.
 */
export function resolveBasemapOutline(
  resolveToken: (token: string) => string,
  theme: BasemapTheme,
): string {
  return resolveToken(PALETTE[theme]?.contorno ?? '--color-fog')
}

export function buildBasemapStyle(
  resolveToken: (token: string) => string,
  theme: BasemapTheme = 'claro',
): StyleSpecification {
  const tom = (nome: string): string => resolveToken(PALETTE[theme][nome] ?? '--color-fog')
  /**
   * ⚠️ Os tokens são escolhidos pelo **valor**, nunca pelo nome: a primeira versão usou
   * `--color-plate-*`, que é a paleta da **placa do veículo** (#eef0f2), e pintou via quase branca
   * sobre fundo quase branco — o mapa carregava e só os rios apareciam.
   *
   * A paleta é **clara** por escolha de leitura: mapa de rua é o formato que todo mundo já sabe ler,
   * e o escuro fazia rodovia e rua fina desaparecerem no zoom de região. O painel continua escuro à
   * volta, e é o contraste com ele que recorta o mapa da tela. Para voltar ao escuro, basta trocar
   * `terra` por `--color-asphalt` e `via` por `--color-slate`.
   */
  const terra = tom('terra')
  const relevo = tom('relevo')
  const via = tom('via')
  const agua = tom('agua')
  const verde = tom('verde')

  /** O rótulo precisa vencer a via, não competir com ela — daí o extremo oposto da paleta. */
  const rotulo = tom('rotulo')
  const rodovia = tom('rodovia')
  const troncal = tom('troncal')
  const secundaria = tom('secundaria')

  return {
    version: 8,
    /**
     * ⚠️ O `glyphs` voltou, e agora ele **existe**: a fonte é embarcada na imagem do serviço de
     * mapa. Antes eu o declarei apontando para lugar nenhum, o MapLibre emitiu erro, e o tratador
     * derrubou o mapa inteiro — por um rótulo que naquela versão nem havia.
     */
    glyphs: resolveGlyphsUrl(),
    /**
     * ⚠️ Sem `glyphs`, e sem camada de texto: o estilo não tem rótulo nenhum, então nenhuma fonte é
     * pedida. Declarar um caminho de glifo que não existe faz o MapLibre emitir erro — e o tratador
     * de erro derruba o mapa inteiro, por um rótulo que este desenho nem usa.
     */
    sources: {
      [SOURCE]: { type: 'vector', url: `pmtiles://${BASEMAP_URL}` },
    },
    layers: [
      { id: 'terra', type: 'background', paint: { 'background-color': terra } },
      /** Mata e plantio dão relevo ao fundo; sem eles o mapa é uma chapa lisa com linhas por cima. */
      {
        id: 'vegetacao',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'landcover',
        paint: { 'fill-color': verde, 'fill-opacity': 0.22 },
      },
      {
        id: 'area-construida',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'landuse',
        paint: { 'fill-color': relevo, 'fill-opacity': 0.9 },
      },
      {
        id: 'parque',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'park',
        paint: { 'fill-color': verde, 'fill-opacity': 0.14 },
      },
      {
        id: 'agua',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'water',
        paint: { 'fill-color': agua, 'fill-opacity': 0.3 },
      },
      /** O rio é linha, não área — é ele que aparecia sozinho quando o resto estava invisível. */
      {
        id: 'curso-dagua',
        type: 'line',
        source: SOURCE,
        'source-layer': 'waterway',
        paint: {
          'line-color': agua,
          'line-opacity': 0.7,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.5, 14, 2],
        },
      },
      /**
       * ⚠️ **Três faixas, não duas.** A primeira versão jogava tudo que não é rodovia num balde só
       * com `minzoom: 11` — e no zoom de região, que é onde a viagem inteira cabe na tela, sobravam
       * quatro rodovias e nenhuma rua. Secundária e terciária são o que desenha a malha entre 9 e
       * 11; sem elas o mapa parece vazio exatamente na escala em que ele é usado.
       */
      {
        id: 'via-menor',
        type: 'line',
        source: SOURCE,
        'source-layer': 'transportation',
        filter: [
          '!',
          [
            'in',
            ['get', 'class'],
            ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary']],
          ],
        ],
        minzoom: 12,
        paint: {
          'line-color': via,
          'line-opacity': 0.4,
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.4, 16, 2.5],
        },
      },
      {
        id: 'via-media',
        type: 'line',
        source: SOURCE,
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['secondary', 'tertiary']]],
        minzoom: 8,
        paint: {
          'line-color': ['match', ['get', 'class'], 'secondary', secundaria, via],
          'line-opacity': 0.85,
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 12, 1.2, 16, 3.5],
        },
      },
      {
        id: 'via-principal',
        type: 'line',
        source: SOURCE,
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['motorway', 'trunk', 'primary']]],
        paint: {
          /**
           * A cor **diz a classe**, como no mapa que todo mundo já sabe ler: vermelho é rodovia,
           * laranja é troncal e primária. Uma cor só para tudo obrigava a adivinhar a hierarquia
           * pela espessura, que é justamente o que some no zoom de região.
           */
          'line-color': ['match', ['get', 'class'], 'motorway', rodovia, troncal],
          'line-opacity': 1,
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 0.9, 11, 2.2, 16, 6],
        },
      },
      /**
       * O nome da via, escrito **ao longo dela** (`symbol-placement: 'line'`). Ele só entra a partir
       * do zoom 13: acima disso o operador está conferindo um endereço, e é aí que o nome da rua
       * responde alguma coisa. Mostrá-lo no zoom de região encheria a tela de texto sobre a rota,
       * que é o assunto.
       */
      {
        id: 'nome-da-via',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'transportation_name',
        minzoom: 13,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name']],
          'text-font': [FONT_STACK],
          /** Repetir o nome ao longo da via é o que evita a rua longa ficar anônima na tela. */
          'symbol-spacing': 250,
          'text-size': 10,
        },
        paint: {
          'text-color': rotulo,
          'text-halo-color': terra,
          'text-halo-width': 1.4,
        },
      },
      /**
       * O nome da cidade, que é como quem confere reconhece a região sem contar rio.
       *
       * ⚠️ **Quem decide o que sobrevive é `symbol-sort-key`, não o filtro.** O dado é denso — medido
       * nas telhas de Ribeirão: 144 feições `city|town|village` numa só telha no z8, 155 no z9. Os
       * nomes sempre estiveram lá; o que faltava era ordem de colisão. Sem `symbol-sort-key` o
       * MapLibre resolve empate pela **posição na tela**, então um povoado ganhava da capital por
       * estar mais acima no quadro, e o resultado parecia aleatório e vazio ao mesmo tempo. Chave
       * menor é colocada primeiro, e `rank` menor é lugar mais importante — a ordem certa sai de
       * graça.
       *
       * ⚠️ **A rampa antiga cobria uma faixa que quase não existe.** Ela ia de `rank` 1 a 10, e
       * medido no z9 o rank real vai até 18, com 148 das 155 feições em rank ≥ 11: o `interpolate`
       * grampeava 95% dos rótulos no piso e o tamanho era constante na prática. A rampa agora cobre
       * 1..18, que é o que o planetiler emite aqui.
       *
       * ⚠️ `text-variable-anchor` é o que **aumenta a densidade de verdade**: o rótulo que não cabe
       * ao lado tenta acima, abaixo e dos lados antes de ser descartado. Sem ele, uma única colisão
       * apaga o nome em vez de deslocá-lo.
       */
      {
        id: 'cidade',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town', 'village']]],
        layout: {
          'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name']],
          'text-font': [FONT_STACK],
          /** Importância manda na colisão: rank menor é colocado primeiro e vence. */
          'symbol-sort-key': ['get', 'rank'],
          /**
           * Corpo pela importância, crescendo com o zoom — antes ele não crescia ao aproximar.
           *
           * ⚠️ O `zoom` **precisa** ser a entrada do `interpolate` de topo: o spec só o aceita ali,
           * e a primeira versão disto multiplicava duas rampas (`['*', rank, zoom]`), o que é
           * inválido. Estilo inválido faz o MapLibre emitir `error`, e o tratador do componente
           * derruba o mapa inteiro — o contrato de validação existe por causa disso.
           */
          'text-size': [
            'interpolate',
            ['linear'],
            ['zoom'],
            6,
            ['interpolate', ['linear'], ['get', 'rank'], 1, 13, 8, 10, 18, 8.5],
            10,
            ['interpolate', ['linear'], ['get', 'rank'], 1, 15, 8, 12, 18, 10],
            14,
            ['interpolate', ['linear'], ['get', 'rank'], 1, 19, 8, 15, 18, 12.5],
          ],
          'text-variable-anchor': ['center', 'top', 'bottom', 'left', 'right'],
          'text-radial-offset': 0.4,
          'text-justify': 'auto',
          /** O padrão é 2px, e cada pixel aqui é um nome a menos que cabe no zoom de região. */
          'text-padding': 1,
          'text-max-width': 8,
        },
        paint: {
          'text-color': rotulo,
          /** O halo é o que mantém o nome legível quando ele cai sobre rodovia ou mancha urbana. */
          'text-halo-color': terra,
          'text-halo-width': 1.4,
        },
      },
      {
        id: 'divisa',
        type: 'line',
        source: SOURCE,
        'source-layer': 'boundary',
        filter: ['<=', ['get', 'admin_level'], 8],
        paint: {
          'line-color': via,
          'line-dasharray': [3, 2],
          'line-opacity': 0.35,
          'line-width': 0.8,
        },
      },
      /**
       * O quarteirão, a partir do zoom em que o operador procura **a porta**. Sem ele o endereço
       * cai numa rua vazia e não há como bater o olho e ver que é ali.
       */
      {
        id: 'edificacao',
        type: 'fill',
        source: SOURCE,
        'source-layer': 'building',
        minzoom: 14,
        paint: { 'fill-color': via, 'fill-opacity': 0.16 },
      },
      {
        id: 'nome-da-agua',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'water_name',
        minzoom: 10,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name']],
          'text-font': [FONT_STACK],
          'text-size': 10,
        },
        paint: { 'text-color': agua, 'text-halo-color': terra, 'text-halo-width': 1.2 },
      },
      /**
       * ⚠️ O **número da porta** é o que fecha a conferência: a nota traz "Avenida Recife, 289", e é
       * aqui que se vê que o 289 fica daquele lado da via. Zoom 16 porque abaixo disso os números se
       * atropelam e viram ruído sobre o quarteirão.
       */
      {
        id: 'numero-da-porta',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'housenumber',
        minzoom: 16,
        layout: {
          'text-field': ['get', 'housenumber'],
          'text-font': [FONT_STACK],
          'text-size': 9,
        },
        paint: { 'text-color': via, 'text-halo-color': terra, 'text-halo-width': 1 },
      },
    ],
  }
}
