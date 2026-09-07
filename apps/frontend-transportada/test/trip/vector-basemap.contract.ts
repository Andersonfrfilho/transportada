/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec'
import { describe, expect, it } from 'bun:test'

import {
  BASEMAP_THEMES,
  BASEMAP_URL,
  OVERLAY_URL,
  RADAR_SOURCE,
  buildBasemapStyle,
  resolveBasemapOutline,
} from '@/modules/trip/shared/vectorBasemap.service'

/** A validação é da **forma** do estilo; a paleta real é resolvida no documento, que aqui não há. */
const resolveToken = (token: string): string => `#${token.length.toString(16).padStart(6, '0')}`

function cityLayer(theme: (typeof BASEMAP_THEMES)[number]) {
  const layer = buildBasemapStyle(resolveToken, theme).layers.find((entry) => entry.id === 'cidade')
  if (layer === undefined || layer.type !== 'symbol') throw new Error('camada cidade ausente')
  return layer
}

function symbolLayerById(theme: (typeof BASEMAP_THEMES)[number], id: string) {
  const layer = buildBasemapStyle(resolveToken, theme).layers.find((entry) => entry.id === id)
  if (layer === undefined || layer.type !== 'symbol') throw new Error(`camada ${id} ausente`)
  return layer
}

function lineLayerById(theme: (typeof BASEMAP_THEMES)[number], id: string) {
  const layer = buildBasemapStyle(resolveToken, theme).layers.find((entry) => entry.id === id)
  if (layer === undefined || layer.type !== 'line') throw new Error(`camada ${id} ausente`)
  return layer
}

/**
 * Toda sub-expressão `['interpolate', …, ['get','rank'], …]` dentro do valor, em qualquer
 * profundidade — a rampa de rank vive aninhada como saída da rampa de zoom.
 */
function rankRamps(value: unknown): readonly unknown[][] {
  if (!Array.isArray(value)) return []
  const found = value.flatMap((entry) => rankRamps(entry))
  const isRankRamp =
    value[0] === 'interpolate' &&
    Array.isArray(value[2]) &&
    value[2][0] === 'get' &&
    value[2][1] === 'rank'
  return isRankRamp ? [value, ...found] : found
}

/** Os degraus vêm em pares entrada/saída a partir do índice 3; a última entrada é o teto da rampa. */
function lastStop(ramp: readonly unknown[]): number {
  return Number(ramp[ramp.length - 2])
}

describe('o estilo do mapa vetorial', () => {
  /**
   * ⚠️ O contrato que paga por si: expressão malformada faz o MapLibre emitir `error`, e o tratador
   * de erro do componente **derruba o mapa inteiro** — a tela cai para a lista sem nada explicando.
   * Já aconteceu com um `glyphs` apontando para lugar nenhum. Aqui isso vira teste, não incidente.
   */
  it.each([...BASEMAP_THEMES])('é válido contra o spec do MapLibre — tema %s', (theme) => {
    expect(validateStyleMin(buildBasemapStyle(resolveToken, theme))).toEqual([])
  })

  /**
   * ⚠️ Sem `symbol-sort-key` o MapLibre resolve colisão pela **posição na tela**. Medido nas telhas
   * de Ribeirão: 155 feições `city|town|village` numa telha do z9 — com essa densidade, quem
   * sobrevive vira sorteio, e um povoado de rank 14 apaga a capital por estar mais acima no quadro.
   * Chave menor é colocada primeiro, e `rank` menor é lugar mais importante.
   */
  it('resolve colisão de rótulo por importância, não por posição na tela', () => {
    expect(cityLayer('claro').layout?.['symbol-sort-key']).toEqual(['get', 'rank'])
  })

  /**
   * ⚠️ Medido em produção nas telhas do sudeste: o `rank` da camada `place` vai até **18**, e no z9
   * são 148 de 155 feições com rank ≥ 11. A rampa antiga ia de 1 a 10, então o `interpolate`
   * grampeava 95% dos rótulos no piso e o corpo era constante na prática. Este teste falha se
   * alguém voltar a fechar a rampa antes do rank que o planetiler realmente emite.
   */
  it('dimensiona o rótulo pela faixa de rank que as telhas trazem de verdade', () => {
    const rampas = rankRamps(cityLayer('claro').layout?.['text-size'])

    expect(rampas.length).toBeGreaterThan(0)
    /** Toda rampa de rank tem de alcançar o rank máximo medido, não só a primeira. */
    for (const rampa of rampas) expect(lastStop(rampa)).toBeGreaterThanOrEqual(18)
  })

  /** Rótulo que não cabe onde queria tenta outro lado antes de ser descartado — é o que adensa. */
  it('deixa o rótulo procurar lugar antes de desistir', () => {
    expect(cityLayer('claro').layout?.['text-variable-anchor']).toBeDefined()
  })

  /**
   * ⚠️ O anel do pino era `--color-plate-surface` fixo — quase branco — e sumia nos dois temas de
   * papel claro. Ele acompanha o tema desde então, e este teste falha se voltar a ser constante.
   */
  it('dá ao pino um anel diferente por tema de mapa', () => {
    const anéis = BASEMAP_THEMES.map((theme) => resolveBasemapOutline(resolveToken, theme))
    expect(new Set(anéis).size).toBeGreaterThan(1)
  })
})

/**
 * Feature 089 — medido nas telhas de Ribeirão (specs/089-…/evidence.md): `oneway`, `toll` e o
 * `subclass` `toll_booth` da camada `poi` já vêm no arquivo que já servimos. Não faltava dado,
 * faltava desenho.
 */
describe('sentido, pedágio e cabine — o que já vem nas telhas', () => {
  /**
   * ⚠️ `oneway` só assume o valor `1` nesta base — nunca `0`, nunca `-1` (medido: 5165 feições em
   * `1`, zero em qualquer outro valor). O filtro é `['has', 'oneway']`, não uma comparação de
   * valor: comparar contra `1` funcionaria hoje e pararia de desenhar a seta no dia em que a
   * telha trouxer `-1` de verdade, sem ninguém perceber — é o próprio caso que a T102 cobre a
   * seguir.
   */
  it('marca o sentido só onde o atributo existe, sem supor o valor', () => {
    const layer = symbolLayerById('claro', 'sentido-da-via')
    expect(layer.filter).toEqual(['has', 'oneway'])
    expect(layer['source-layer']).toBe('transportation')
  })

  /**
   * ⚠️ Este é o caso que não ocorre na base medida (0 de 5165) e entra assim mesmo: se ocorrer, uma
   * seta apontando para o lado errado é o tipo de defeito que ninguém confere olhando o mapa.
   */
  it('inverte a seta quando oneway = -1', () => {
    const layer = symbolLayerById('claro', 'sentido-da-via')
    const rotação = layer.layout?.['icon-rotate'] ?? layer.layout?.['text-rotate']
    expect(rotação).toBeDefined()
    const texto = JSON.stringify(rotação)
    expect(texto).toContain('"oneway"')
    expect(texto).toContain('-1')
  })

  /**
   * ⚠️ A seta só faz sentido a partir do zoom em que se confere endereço — no zoom de região ela
   * competiria com o traço da rota, que é o assunto da tela. O nome da rua entra em 13 e o número
   * da porta em 16; a seta fica entre os dois.
   */
  it('só desenha a seta a partir do zoom de conferência de endereço', () => {
    const layer = symbolLayerById('claro', 'sentido-da-via')
    expect(layer.minzoom ?? 0).toBeGreaterThanOrEqual(14)
  })

  /**
   * ⚠️ `toll` não tem valor único nesta base (64 feições com o atributo presente, nas 23 telhas
   * medidas) — o filtro é presença, como em `oneway`.
   */
  it('distingue o trecho com pedágio', () => {
    const layer = lineLayerById('claro', 'via-com-pedagio')
    expect(layer.filter).toEqual(['has', 'toll'])
    expect(layer['source-layer']).toBe('transportation')
    /** Tracejado, não cor nova: no tema `contraste` a classe de via não colore (ver PALETTE). */
    expect(layer.paint?.['line-dasharray']).toBeDefined()
  })

  /** As 16 cabines medidas na região vêm como `poi`/`toll_booth` — nunca uma camada própria. */
  it('marca a cabine de pedágio', () => {
    const layer = symbolLayerById('claro', 'cabine-de-pedagio')
    expect(layer['source-layer']).toBe('poi')
    expect(layer.filter).toEqual(['==', ['get', 'subclass'], 'toll_booth'])
  })
})

/**
 * Feature 089 (fase 2) — o esquema OpenMapTiles não tem `speed_camera` (medido: 70 no OSM da
 * região, zero nas telhas do basemap). O radar vem de um **segundo** arquivo PMTiles
 * (`overlay.pmtiles`, gerado por `generate-custom` — `deploy/map-tiles/overlay.yml`), nunca de um
 * fork do perfil OpenMapTiles: reassar o perfil inteiro a cada radar novo arriscaria o basemap que
 * hoje funciona.
 */
describe('o overlay do radar — segundo arquivo, mesma origem', () => {
  it('deriva a URL do overlay a partir da URL do basemap, no mesmo serviço', () => {
    expect(OVERLAY_URL).not.toBe(BASEMAP_URL)
    expect(OVERLAY_URL.endsWith('overlay.pmtiles')).toBe(true)
    /** Mesma origem: só o nome do arquivo muda, nunca o servidor. */
    const origemBasemap = BASEMAP_URL.replace(/area\.pmtiles$/u, '')
    const origemOverlay = OVERLAY_URL.replace(/overlay\.pmtiles$/u, '')
    expect(origemOverlay).toBe(origemBasemap)
  })

  it('declara o overlay como uma fonte separada, nunca dentro da fonte do basemap', () => {
    const style = buildBasemapStyle(resolveToken, 'claro')
    expect(Object.keys(style.sources)).toContain(RADAR_SOURCE)
    const source = style.sources[RADAR_SOURCE]
    expect(source?.type).toBe('vector')
    expect((source as { url?: string })?.url).toBe(`pmtiles://${OVERLAY_URL}`)
  })

  it('marca o radar a partir do zoom em que a camada poi já existe no basemap', () => {
    const layer = symbolLayerById('claro', 'radar')
    expect(layer.source).toBe(RADAR_SOURCE)
    expect(layer['source-layer']).toBe('radar')
    expect(layer.minzoom ?? 0).toBeGreaterThanOrEqual(11)
  })

  /**
   * Feature 093 T5 — a velocidade permitida ao lado do triângulo.
   *
   * ⚠️ **`maxspeed:hgv` vence `maxspeed`.** Em rodovia brasileira o limite do caminhão é menor que o
   * do carro, e quem lê este mapa opera frota: imprimir o limite do carro seria o número errado para
   * o único leitor que existe. Medido no extract: 12 radares declaram limite próprio de caminhão.
   */
  it('prefere o limite do caminhão ao do carro quando o mapa declara os dois', () => {
    const field = JSON.stringify(symbolLayerById('claro', 'radar').layout?.['text-field'])
    const posicaoHgv = field.indexOf('maxspeed_hgv')
    const posicaoCarro = field.indexOf('"maxspeed"')

    expect(posicaoHgv).toBeGreaterThanOrEqual(0)
    expect(posicaoCarro).toBeGreaterThanOrEqual(0)
    expect(posicaoHgv).toBeLessThan(posicaoCarro)
  })

  /**
   * ⚠️ Medido: **89 dos 527 radares não têm `maxspeed`**. Eles continuam desenhados, e **sem
   * número** — imprimir "60" porque é o valor mais comum seria inventar o número que o motorista
   * obedece, e o radar existe mesmo quando ninguém mapeou o limite dele.
   */
  it('desenha o radar sem número quando o mapa não sabe a velocidade', () => {
    const field = symbolLayerById('claro', 'radar').layout?.['text-field']

    expect(Array.isArray(field)).toBe(true)
    expect((field as unknown[])[0]).toBe('case')
    /** O último ramo do `case` é o padrão: o glifo sozinho, sem `concat` de velocidade nenhuma. */
    expect((field as unknown[]).at(-1)).toBe('▲')
  })

  /** Radar e cabine de pedágio precisam ser distinguíveis — nunca o mesmo glifo. */
  it('usa um glifo diferente do da cabine de pedágio', () => {
    const radar = symbolLayerById('claro', 'radar')
    const cabine = symbolLayerById('claro', 'cabine-de-pedagio')
    expect(radar.layout?.['text-field']).not.toEqual(cabine.layout?.['text-field'])
  })
})

/**
 * ⚠️ **O overlay ausente não pode acionar `onBasemapMissing`.** O PMTiles do radar 404 é o estado
 * normal em qualquer instalação de build anterior a esta feature — e antes da T204 qualquer erro de
 * origem do mapa, seja qual for a fonte, cai para a lista inteira (o comportamento que a ADR-0044
 * §6 desenhou pensando só no basemap). Sem esta distinção, publicar esta feature quebraria o mapa
 * de quem ainda não gerou o overlay.
 */
describe('o overlay ausente não derruba o mapa inteiro', () => {
  const componente = readFileSync(
    new URL('../../src/modules/trip/components/AssemblyVectorMap.component.tsx', import.meta.url),
    'utf8',
  )

  it('o tratador de erro do mapa distingue a fonte do radar antes de cair para a lista', () => {
    expect(componente).toContain('RADAR_SOURCE')
    /**
     * `lastIndexOf` no fim: a primeira ocorrência de "onBasemapMissing()" no arquivo é dentro de um
     * comentário explicando o próprio tratador (com crases), não a chamada de verdade.
     */
    const handler = componente.slice(
      componente.indexOf("map.on('error'"),
      componente.lastIndexOf('onBasemapMissing()') + 'onBasemapMissing()'.length,
    )
    expect(handler).toContain('RADAR_SOURCE')
  })
})

/**
 * ⚠️ **A ordem "abaixo dos pinos" não é escolha de índice, é ausência de `beforeId`.** O MapLibre
 * empilha toda camada de `addLayer` sem `beforeId` no topo do que já existe no estilo — então
 * qualquer camada nova aqui fica sempre abaixo do pino e da rota que o componente desenha por
 * cima, contanto que ele continue sem passar `beforeId`. Este teste tranca a premissa por texto de
 * fonte: se algum `addLayer` ganhar `beforeId`, a ordem passa a depender de qual id foi escolhido,
 * e as três camadas novas podem passar a competir com o pino sem que nenhum teste do estilo em si
 * denuncie isso.
 */
describe('a ordem entre o basemap e o que o componente desenha por cima', () => {
  const componente = readFileSync(
    new URL('../../src/modules/trip/components/AssemblyVectorMap.component.tsx', import.meta.url),
    'utf8',
  )

  it('nenhum addLayer do componente usa beforeId', () => {
    const chamadas = componente.match(/map\.addLayer\(\{[\s\S]*?\n\s{4}\}\)/gu) ?? []
    expect(chamadas.length).toBeGreaterThan(0)
    for (const chamada of chamadas) expect(chamada).not.toContain('beforeId')
  })
})

/**
 * ⚠️ **O defeito mais caro desta spec, e o mais silencioso.** O MapLibre acrescenta a classe
 * `maplibregl-map` ao nosso elemento e declara `.maplibregl-map { position: relative; overflow:
 * hidden }` — mesma especificidade que a nossa regra, e injetada depois. Sem `width`/`height`
 * explícitos, `position: relative` vence, o `inset: 0` fica inerte, a caixa colapsa para altura 0 e
 * o `overflow: hidden` dele recorta o canvas a nada.
 *
 * O mapa **carrega, pinta e não aparece**: `isStyleLoaded`, `isSourceLoaded` e `loaded()` todos
 * verdadeiros, WebGL vivo, 17 camadas, canvas com 629×300 — e a tela vazia. O único número que
 * denuncia é a altura do elemento raiz. Este teste é o que impede a regressão de voltar a custar
 * um dia de investigação.
 */
describe('a caixa do mapa vetorial', () => {
  const css = readFileSync(
    new URL('../../src/modules/trip/styles/trip.module.css', import.meta.url),
    'utf8',
  )
  const regra = css
    .slice(css.indexOf('.vectorMapCanvas {'))
    .slice(0, css.slice(css.indexOf('.vectorMapCanvas {')).indexOf('}'))

  it('declara largura e altura explícitas, e não confia só no inset', () => {
    expect(regra).toContain('width: 100%')
    expect(regra).toContain('height: 100%')
  })
})
