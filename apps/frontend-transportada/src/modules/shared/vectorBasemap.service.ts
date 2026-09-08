/* Copyright (c) 2026 Ada Technology. MIT License. */
import { addProtocol, setWorkerUrl, type StyleSpecification } from 'maplibre-gl'
import { Protocol } from 'pmtiles'

/**
 * ⚠️ **O CSS do MapLibre vem daqui, não do componente.** Sem ele o contêiner do canvas não recebe
 * posicionamento, e todo marcador empilha **abaixo** do mapa em vez de flutuar sobre ele — medido, o
 * pino da casa caía 294px para baixo, a altura exata do canvas. Enquanto só existia um mapa no
 * produto, o import morava no componente dele e ninguém notava; o segundo mapa herdou a falta.
 */
import 'maplibre-gl/dist/maplibre-gl.css'

// eslint-disable-next-line import/no-unresolved -- `?url` é resolvido pelo Vite, não pelo TypeScript
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

/**
 * Prepara o MapLibre uma vez por página: o worker e o protocolo `pmtiles`.
 *
 * ⚠️ **Sem `addProtocol`, o navegador trata `pmtiles://…` como esquema próprio e a CSP bloqueia** —
 * mesmo com a origem declarada em `connect-src`. O mapa sobe, o canvas fica preto, e o console
 * acusa violação de CSP numa URL que ninguém escreveu assim. Foi o que aconteceu ao desenhar o
 * segundo mapa do produto sem passar por aqui.
 *
 * ⚠️ `maplibreWorkerUrl` é `import` **estático** de propósito: como `import()` dinâmico o `?url` é
 * ignorado pelo `vite dev` e o que volta é o módulo, não o caminho — a mesma armadilha do worker do
 * pdf.js, e ela só aparece em desenvolvimento.
 */
/**
 * ⚠️ **Registrado no escopo do módulo, não dentro de uma função.** Com o registro preguiçoso, o
 * protocolo só existe quando o primeiro mapa monta — e o estilo, que carrega a URL `pmtiles://`, já
 * foi montado antes disso. O sintoma é cruel: `addProtocol` responde que registrou, e a requisição
 * mesmo assim sai como esquema desconhecido e morre na CSP, com o canvas preto e nenhum erro na
 * tela. Quem importa este módulo já ganha o protocolo pronto.
 */
setWorkerUrl(maplibreWorkerUrl)
addProtocol('pmtiles', new Protocol().tile)

/** Mantida para quem quiser ser explícito no ponto de montagem; o registro já aconteceu no import. */
export function configureVectorBasemap(): void {
  /* o import deste módulo é o que prepara o MapLibre */
}

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
/**
 * Feature 089 (fase 2) — o overlay do radar mora **ao lado** do basemap: mesmo serviço, mesma
 * origem, só o nome do arquivo muda. Derivar de `BASEMAP_URL` em vez de uma segunda variável de
 * ambiente evita que as duas apontem para servidores diferentes por engano — o mesmo raciocínio de
 * `resolveGlyphsUrl` para os glifos.
 */
export const OVERLAY_URL = BASEMAP_URL.replace(/area\.pmtiles$/u, 'overlay.pmtiles')
export const RADAR_SOURCE = 'radar-overlay'
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
 * ⚠️ **A paleta é `--color-basemap-*`, e ela não segue o tema do painel.** As versões anteriores
 * pediam `--color-fog`, `--color-asphalt` e `--color-graphite`, que **trocam de significado** entre
 * o tema claro e o escuro do documento: névoa é quase branca num e quase preta no outro. O tema
 * "claro" do mapa pintava terra com névoa — certo com o painel escuro, invertido com o painel
 * claro, e aí não se enxergava nada. O tema do mapa é estado **do mapa**, e o painel por baixo pode
 * estar em qualquer um dos dois.
 *
 * ⚠️ `contorno` é o **papel** do tema, e é o anel do pino da parada. Ele existe porque o pino caiu
 * no mesmo defeito descrito acima e ninguém percebeu: o anel era `--color-plate-surface` fixo, que
 * é quase branco. No tema escuro isso separava bem; no `claro` e no `contraste`, cujo papel também
 * é quase branco, o anel sumia — e o pino perdia a separação justamente onde o mapa é mais cheio.
 * Anel do mapa acompanha o mapa, como todo o resto desta paleta.
 */
const PALETTE: Readonly<Record<BasemapTheme, Readonly<Record<string, string>>>> = {
  claro: {
    agua: '--color-basemap-water',
    /** O papel deste tema — ver `contorno` no fim de cada bloco. */
    contorno: '--color-basemap-paper',
    relevo: '--color-basemap-white',
    rotulo: '--color-basemap-ink',
    terra: '--color-basemap-paper',
    verde: '--color-basemap-green',
    via: '--color-basemap-ink',
    /** Convenção do OpenStreetMap: rodovia vermelha, troncal laranja, secundária amarela. */
    rodovia: '--color-basemap-road-major',
    troncal: '--color-basemap-road-trunk',
    secundaria: '--color-basemap-road-minor',
  },
  escuro: {
    agua: '--color-basemap-water-dark',
    contorno: '--color-basemap-land-dark',
    relevo: '--color-basemap-relief-dark',
    rotulo: '--color-basemap-paper',
    terra: '--color-basemap-land-dark',
    verde: '--color-basemap-green',
    via: '--color-basemap-street-dark',
    rodovia: '--color-basemap-road-major',
    troncal: '--color-basemap-road-trunk',
    secundaria: '--color-basemap-road-minor',
  },
  /**
   * Papel branco, traço preto, sem vegetação nem mancha urbana competindo. É o que se lê num galpão
   * com o sol batendo na tela do celular — e o que imprime, se alguém levar o roteiro no papel.
   */
  contraste: {
    agua: '--color-basemap-ink',
    contorno: '--color-basemap-white',
    relevo: '--color-basemap-paper',
    rotulo: '--color-basemap-ink',
    terra: '--color-basemap-white',
    verde: '--color-basemap-paper',
    via: '--color-basemap-ink',
    /** No alto contraste a classe não colore: o que separa via é a espessura, não o matiz. */
    rodovia: '--color-basemap-ink',
    troncal: '--color-basemap-ink',
    secundaria: '--color-basemap-ink',
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
/**
 * O tema do mapa que **acompanha o do painel**: escuro embaixo de escuro, papel embaixo de papel.
 *
 * ⚠️ Isto é o padrão, não uma amarra. `contraste` não tem contraparte no painel — ele existe para o
 * galpão com sol na tela, e para o roteiro impresso —, então a escolha explícita do operador
 * continua vencendo. O que o padrão conserta é o mapa nascer discordando da tela em volta.
 */
export function basemapThemeForApp(appTheme: 'dark' | 'light'): BasemapTheme {
  return appTheme === 'light' ? 'claro' : 'escuro'
}

export function resolveBasemapOutline(
  resolveToken: (token: string) => string,
  theme: BasemapTheme,
): string {
  return resolveToken(PALETTE[theme]?.contorno ?? '--color-basemap-paper')
}

/**
 * A cor da linguagem visual de pedágio (`cabine-de-pedagio`, `via-com-pedagio`), para a praça
 * desenhada em tempo de execução (spec 096 T4) usar o mesmo tom do resto do mapa, e não uma cor
 * própria que competiria com o vocabulário que já existe.
 */
export function resolveBasemapTollColor(
  resolveToken: (token: string) => string,
  theme: BasemapTheme,
): string {
  return resolveToken(PALETTE[theme]?.rodovia ?? '--color-basemap-road-major')
}

/**
 * O fundo do mapa (`terra`), para o halo de texto acrescentado em tempo de execução legível em
 * qualquer um dos três temas — ele muda de tom entre `claro`, `escuro` e `contraste` como o resto
 * da paleta.
 */
export function resolveBasemapBackground(
  resolveToken: (token: string) => string,
  theme: BasemapTheme,
): string {
  return resolveToken(PALETTE[theme]?.terra ?? '--color-basemap-paper')
}

export function buildBasemapStyle(
  resolveToken: (token: string) => string,
  theme: BasemapTheme = 'claro',
): StyleSpecification {
  const tom = (nome: string): string =>
    resolveToken(PALETTE[theme][nome] ?? '--color-basemap-paper')
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
      /**
       * ⚠️ Sempre declarada, mesmo em instalação sem o arquivo ainda gerado: a degradação é do
       * tratador de erro do componente (`RADAR_SOURCE`), não da ausência da fonte no estilo. Uma
       * fonte condicional exigiria saber de antemão se o arquivo existe, e é exatamente essa
       * pergunta que o `Range` do serviço responde em runtime, não aqui.
       */
      [RADAR_SOURCE]: { type: 'vector', url: `pmtiles://${OVERLAY_URL}` },
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
       * ⚠️ Feature 089 — medido nas telhas de Ribeirão: `toll` está presente em 64 de 586 feições
       * de `transportation` da amostra, sempre sem valor único (o filtro é presença, não
       * comparação). Tracejado, e não cor nova: no tema `contraste` a classe de via não colore
       * (ver PALETTE), e ali a distinção do pedágio precisa sobreviver mesmo assim.
       */
      {
        id: 'via-com-pedagio',
        type: 'line',
        source: SOURCE,
        'source-layer': 'transportation',
        filter: ['has', 'toll'],
        paint: {
          'line-color': rodovia,
          'line-dasharray': [2, 1.5],
          'line-opacity': 0.9,
          'line-width': ['interpolate', ['linear'], ['zoom'], 7, 1.2, 11, 2.8, 16, 7],
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
       * ⚠️ Feature 089 — `oneway` só assume o valor `1` nesta base (medido: 5165 de 5256 feições
       * amostradas, zero em `0` ou `-1`), então o filtro é **presença**, não comparação: comparar
       * contra `1` desenharia a seta hoje e pararia de desenhar no dia em que a telha trouxer `-1`
       * de verdade, sem ninguém perceber.
       *
       * `symbol-placement: 'line'` já alinha o glifo ao sentido do traço; `text-rotate` só entra
       * para o caso `-1` (não ocorre na base medida, e entra assim mesmo — sem ele, uma via
       * digitada no sentido contrário desenharia a seta apontando para o lado errado, defeito que
       * ninguém confere olhando o mapa). Zoom 15: entre o nome da rua (13) e o número da porta
       * (16), para não competir com o nome.
       */
      {
        id: 'sentido-da-via',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'transportation',
        filter: ['has', 'oneway'],
        minzoom: 15,
        layout: {
          'symbol-placement': 'line',
          'text-field': '→',
          'text-font': [FONT_STACK],
          'text-rotate': ['case', ['==', ['get', 'oneway'], -1], 180, 0],
          'symbol-spacing': 120,
          'text-size': 12,
          'text-keep-upright': false,
        },
        paint: {
          'text-color': via,
          'text-halo-color': terra,
          'text-halo-width': 1,
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
       * ⚠️ Feature 089 — as 16 cabines de pedágio medidas na região de Ribeirão vêm todas como
       * `poi`/`subclass: toll_booth`, nunca uma camada própria do esquema. Zoom 11 é o mesmo em que
       * a camada `poi` começa a existir nas telhas (metadados do PMTiles) — abaixo disso não há o
       * que desenhar.
       */
      {
        id: 'cabine-de-pedagio',
        type: 'symbol',
        source: SOURCE,
        'source-layer': 'poi',
        filter: ['==', ['get', 'subclass'], 'toll_booth'],
        minzoom: 11,
        layout: {
          /**
           * Glifo, não emoji: `web.md` §9 proíbe emoji na UI de produto — aqui o desenho é o
           * MapLibre em WebGL, sem `currentColor`, sem componente de ícone, e o próprio pino da
           * parada e o resto deste estilo já resolvem por glifo de texto.
           */
          'text-field': '●',
          'text-font': [FONT_STACK],
          'text-size': 10,
          'text-allow-overlap': true,
        },
        paint: {
          /** Mesma cor da via com pedágio (`rodovia`) — pedágio é uma linguagem visual só. */
          'text-color': rodovia,
          'text-halo-color': terra,
          'text-halo-width': 1.4,
        },
      },
      /**
       * ⚠️ Feature 089 (fase 2) — vem do arquivo separado (`RADAR_SOURCE`), nunca do basemap: o
       * esquema OpenMapTiles não tem `speed_camera`. Zoom 11, o mesmo patamar em que `poi` existe
       * no basemap. Glifo **diferente** da cabine de pedágio (▲, não ●) — as duas linguagens
       * visuais de pedágio e radar não podem se confundir na mesma tela.
       */
      {
        id: 'radar',
        type: 'symbol',
        source: RADAR_SOURCE,
        'source-layer': 'radar',
        minzoom: 11,
        layout: {
          /**
           * Feature 096 T5 — a velocidade permitida ao lado do triângulo.
           *
           * ⚠️ **`maxspeed:hgv` vence quando existir.** Em rodovia brasileira o limite do caminhão é
           * menor que o do carro, e quem lê este mapa opera frota: mostrar o limite do carro seria
           * mostrar o número errado para o único leitor que existe. Medido: 12 radares o declaram.
           *
           * ⚠️ **Radar sem `maxspeed` fica só com o triângulo.** Medido: 89 dos 527 não têm a tag.
           * Imprimir "60" porque é o valor mais comum seria inventar o número que o motorista
           * obedece — e o radar existe mesmo quando ninguém mapeou o limite dele.
           */
          'text-field': [
            'case',
            ['has', 'maxspeed_hgv'],
            ['concat', '▲ ', ['get', 'maxspeed_hgv']],
            ['has', 'maxspeed'],
            ['concat', '▲ ', ['get', 'maxspeed']],
            '▲',
          ],
          'text-font': [FONT_STACK],
          'text-size': 9,
          'text-allow-overlap': true,
        },
        paint: {
          'text-color': troncal,
          'text-halo-color': terra,
          'text-halo-width': 1.4,
        },
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
