/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readRouteGeometry } from '../../src/trips/application/read-route-geometry.use-case.js'
import type { RouteGeometryPoint } from '../../src/trips/domain/route-geometry.policy.js'

const PARADAS: readonly RouteGeometryPoint[] = [
  { latitude: -22.0175, longitude: -47.8908 },
  { latitude: -22.009, longitude: -47.8825 },
]

const ESTRADA: readonly RouteGeometryPoint[] = [
  { latitude: -22.0175, longitude: -47.8908 },
  { latitude: -22.0161, longitude: -47.8871 },
  { latitude: -22.009, longitude: -47.8825 },
]

function porta(road: readonly RouteGeometryPoint[] | null) {
  const calls: (readonly RouteGeometryPoint[])[] = []
  return {
    calls,
    port: {
      readRouteGeometry: async (points: readonly RouteGeometryPoint[]) => {
        calls.push(points)
        return road
      },
    },
  }
}

describe('read route geometry (spec 079, geometria do OSRM)', () => {
  test('devolve a linha da estrada, com a origem dita', async () => {
    const { port } = porta(ESTRADA)

    const view = await readRouteGeometry({ geometry: port, stops: PARADAS })

    expect(view.source).toBe('road')
    expect(view.points.length).toBeGreaterThanOrEqual(2)
    expect(view.points[0]).toEqual({ latitude: '-22.01750', longitude: '-47.89080' })
  })

  /**
   * ⚠️ O ponto central desta rota: provedor mudo **não** vira reta anunciada como estrada. A tela
   * volta a ligar as paradas em reta dizendo que são retas, e para isso ela precisa da lista vazia
   * — devolver as paradas aqui apagaria a diferença entre "esta é a estrada" e "eu não sei".
   */
  test('serviço fora do ar é ausência, nunca uma reta disfarçada de rodovia', async () => {
    const { port } = porta(null)

    const view = await readRouteGeometry({ geometry: port, stops: PARADAS })

    expect(view).toEqual({ points: [], source: 'unavailable' })
  })

  /** Uma parada só não tem trajeto, e pedi-lo ao OSRM gastaria uma chamada por nada. */
  test('não chama o provedor quando não há trajeto', async () => {
    const { calls, port } = porta(ESTRADA)

    const view = await readRouteGeometry({ geometry: port, stops: [PARADAS[0]!] })

    expect(calls).toHaveLength(0)
    expect(view.source).toBe('unavailable')
  })

  /**
   * Medido em staging: 1285 pontos e 28 KB numa viagem de 64 km. O que a tela não mostra não
   * atravessa a rede — e a simplificação é o que faz a linha real caber num payload de mapa.
   */
  test('simplifica antes de publicar, em vez de repassar o que o OSRM amostrou', async () => {
    const denso = Array.from({ length: 400 }, (_unused, index) => ({
      latitude: -22.0175 + index * 0.00002,
      longitude: -47.8908 + index * 0.00002,
    }))
    const { port } = porta(denso)

    const view = await readRouteGeometry({ geometry: port, stops: PARADAS })

    expect(view.points.length).toBeLessThan(denso.length / 10)
  })
})
