/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { resolveRouteLegs } from '../../src/modules/trip/shared/routeGeometry.service'
import type { RouteGeometry } from '../../src/modules/trip/shared/routeGeometry.service'
import { stopColorOf, stopColorTokenOf } from '../../src/modules/trip/shared/stopColor.service'

const VECTOR_MAP = new URL('../../src/components/ui/vector-map.tsx', import.meta.url)
const ASSEMBLY = new URL(
  '../../src/modules/trip/components/AssemblyVectorMap.component.tsx',
  import.meta.url,
)

/** Projeção de mentira: o teste mede o corte, não a cartografia. */
const project = (point: { readonly latitude: number; readonly longitude: number }) => ({
  x: point.longitude,
  y: point.latitude,
})

function road(points: readonly (readonly [number, number])[]): RouteGeometry {
  return {
    legs: [],
    points: points.map(([longitude, latitude]) => ({
      latitude: String(latitude),
      longitude: String(longitude),
    })),
    source: 'road',
  }
}

describe('o traço do roteiro usa a paleta da listagem, um trecho por parada', () => {
  /**
   * ⚠️ **O laranja do tema já é usado por outros traços do mapa.** O roteiro inteiro saía em
   * `--color-copper` e se perdia no meio deles; agora cada trecho leva a cor da parada a que ele
   * chega, que é a mesma da listagem ao lado.
   */
  it('não pinta mais o roteiro com a cor única do tema', () => {
    const source = readFileSync(ASSEMBLY, 'utf8')
    const inicio = source.indexOf('id: ROUTE_LAYER')
    const layer = source.slice(inicio, source.indexOf("type: 'line',", inicio))

    expect(layer).not.toContain('--color-copper')
    expect(layer).toContain("'line-color': ['get', 'color']")
  })

  it('numera a paleta a partir da parada 1 e dá a volta depois da sexta', () => {
    expect(stopColorTokenOf(1)).toBe('--color-cargo-stop-1')
    expect(stopColorTokenOf(6)).toBe('--color-cargo-stop-6')
    expect(stopColorTokenOf(7)).toBe('--color-cargo-stop-1')
    expect(stopColorOf(2)).toBe('var(--color-cargo-stop-2)')
  })

  /**
   * ⚠️ **Os `legs` da API não dizem onde cada trecho começa na polilinha** — trazem só distância e
   * duração. O corte acha, para cada parada, o ponto mais próximo dela; e isso não é palpite,
   * porque a polilinha foi gerada roteirizando por essas paradas.
   */
  it('corta a polilinha da estrada em um trecho por par de paradas', () => {
    const legs = resolveRouteLegs({
      geometry: road([
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
        [4, 0],
      ]),
      project,
      stops: [
        { x: 0, y: 0 },
        { x: 2, y: 0 },
        { x: 4, y: 0 },
      ],
    })

    expect(legs).toHaveLength(2)
    expect(legs[0]?.toSequence).toBe(2)
    expect(legs[1]?.toSequence).toBe(3)
    /** O ponto do corte pertence aos dois trechos: sem isso a linha abriria um vão na parada. */
    expect(legs[0]?.points.at(-1)).toEqual({ x: 2, y: 0 })
    expect(legs[1]?.points[0]).toEqual({ x: 2, y: 0 })
  })

  /**
   * ⚠️ Rota que passa duas vezes perto da mesma parada produziria trecho de comprimento negativo se
   * cada busca varresse a polilinha inteira. Os índices são monotônicos por construção.
   */
  it('nunca volta atrás no corte quando a rota passa duas vezes pelo mesmo lugar', () => {
    const legs = resolveRouteLegs({
      geometry: road([
        [0, 0],
        [5, 0],
        [0, 0],
        [9, 0],
      ]),
      project,
      stops: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 0, y: 0 },
      ],
    })

    for (const leg of legs) expect(leg.points.length).toBeGreaterThanOrEqual(2)
    expect(legs.at(-1)?.points.at(-1)).toEqual({ x: 9, y: 0 })
  })

  /** Sem estrada o trecho é a reta entre duas paradas — e continua tracejado dizendo que não é caminho. */
  it('sem geometria de estrada, liga parada a parada e mantém o tracejado', () => {
    const legs = resolveRouteLegs({
      geometry: null,
      project,
      stops: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
      ],
    })

    expect(legs.map((leg) => leg.kind)).toEqual(['straight', 'straight'])
    expect(legs.every((leg) => leg.dashed)).toBe(true)
    expect(legs.map((leg) => leg.toSequence)).toEqual([2, 3])
  })

  it('uma parada só não tem trecho nenhum', () => {
    expect(resolveRouteLegs({ geometry: null, project, stops: [{ x: 0, y: 0 }] })).toEqual([])
  })

  /**
   * ⚠️ `.line` declara `stroke` em CSS, e **classe vence atributo de apresentação**: o traço sairia
   * na cor do tema com o atributo ignorado, e o defeito seria invisível — a linha aparece, só que
   * na cor errada.
   */
  it('a cor do traço entra inline, porque a classe venceria o atributo', () => {
    const source = readFileSync(VECTOR_MAP, 'utf8')

    expect(source).toContain('{ stroke: shape.color }')
    expect(source).not.toContain('stroke={shape.color}')
  })

  /**
   * ⚠️ **`line-dasharray` não é data-driven no MapLibre**, e este teste existe porque eu quebrei o
   * mapa com isso: uma expressão nessa chave faz o `addLayer` recusar a camada **inteira**, e o
   * sintoma não é erro na tela — é o roteiro sumir com as cores e os pinos continuando no lugar.
   *
   * Nenhum contrato pegou. Os testes provavam a segmentação (função pura) e a fiação (texto de
   * fonte), e a regra violada era do renderizador. Este cobre a diferença: `line-color` **pode** ser
   * expressão, `line-dasharray` **não**.
   */
  it('não pinta o tracejado com expressão, que o MapLibre recusaria', () => {
    const source = readFileSync(ASSEMBLY, 'utf8')
    const inicio = source.indexOf('id: ROUTE_LAYER')
    const layer = source.slice(inicio, source.indexOf("type: 'line',", inicio))
    const dash = layer.slice(layer.indexOf("'line-dasharray'"))
    const value = dash.slice(0, dash.indexOf('\n'))

    expect(value).not.toContain("['case'")
    expect(value).not.toContain("['get'")
    /** Constante é legítima porque os trechos são homogêneos: ou todos estrada, ou todos reta. */
    expect(value).toContain('route.dashArray')
  })

  /** Trocar os dados sem reajustar o tracejado deixaria reta desenhada como estrada. */
  it('reajusta o tracejado quando a fonte é atualizada', () => {
    const source = readFileSync(ASSEMBLY, 'utf8')

    expect(source).toContain(
      "setPaintProperty(ROUTE_LAYER, 'line-dasharray', [...route.dashArray])",
    )
  })
})

const ROUTE_MAP = new URL(
  '../../src/modules/trip/components/TripRouteMap.component.tsx',
  import.meta.url,
)

describe('o contorno do município é fundo, não traço', () => {
  /**
   * ⚠️ **A linha branca da viagem 2.** `.line` declara `stroke: var(--color-fog)` — quase branco no
   * tema claro do painel —, e o contorno do município ia como `line: true` sem cor própria. Ele
   * saía por cima do mapa mais forte que o roteiro, e num tom que nenhuma parada usa.
   *
   * Sem `line`, ele fica com `.shape`: grafite a 70%, que inverte junto com o documento.
   */
  it('a malha do IBGE não pede a classe de linha', () => {
    const source = readFileSync(ROUTE_MAP, 'utf8')
    const basemap = source.slice(source.indexOf('const basemap ='), source.indexOf('const pins'))

    expect(basemap).toContain('city-')
    expect(basemap).not.toMatch(/^\s*line: true,$/mu)
  })

  /** O traço do roteiro continua sendo linha — e continua levando cor de parada. */
  it('o trecho do roteiro segue com linha e cor própria', () => {
    const source = readFileSync(ROUTE_MAP, 'utf8')
    const trace = source.slice(
      source.indexOf('const trace = segments.map'),
      source.indexOf('const traceKind'),
    )

    expect(trace).toContain('line: true')
    expect(trace).toContain('stopColorOf(segment.toSequence)')
  })
})
