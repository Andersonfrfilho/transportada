/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T001/T103: `exclude=toll` é o parâmetro que faz o OSRM devolver a rota sem pedágio
 * (confirmado contra a imagem real em T001). A chamada de sempre continua sem ele.
 */
import { describe, expect, it } from 'bun:test'

import { createOsrmRouteGeometryGateway } from '../../src/trips/infrastructure/osrm-route-geometry.gateway.js'

const POINTS = [
  { latitude: -21.1, longitude: -47.8 },
  { latitude: -21.2, longitude: -47.9 },
] as const

function routeBody(): unknown {
  return {
    code: 'Ok',
    routes: [
      {
        geometry: {
          coordinates: [
            [-47.8, -21.1],
            [-47.9, -21.2],
          ],
        },
        legs: [{ annotation: { nodes: [1, 2] }, distance: 10, duration: 20 }],
      },
    ],
  }
}

function gatewayRecordingUrl(onRequest: (url: string) => void) {
  return createOsrmRouteGeometryGateway({
    baseUrl: 'http://osrm.test',
    fetchImplementation: (async (url: string) => {
      onRequest(url)
      return new Response(JSON.stringify(routeBody()), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      })
    }) as unknown as typeof fetch,
  })
}

describe('route geometry exclude=toll (spec 153 T103)', () => {
  it('does not ask for exclude=toll by default', async () => {
    let requested = ''
    const gateway = gatewayRecordingUrl((url) => (requested = url))

    await gateway.readRouteGeometry(POINTS)

    expect(requested).not.toContain('exclude=toll')
  })

  it('does not ask for exclude=toll when the caller says it explicitly does not want it', async () => {
    let requested = ''
    const gateway = gatewayRecordingUrl((url) => (requested = url))

    await gateway.readRouteGeometry(POINTS, { excludeToll: false })

    expect(requested).not.toContain('exclude=toll')
  })

  it('asks OSRM for the toll-free route when the caller requests it', async () => {
    let requested = ''
    const gateway = gatewayRecordingUrl((url) => (requested = url))

    await gateway.readRouteGeometry(POINTS, { excludeToll: true })

    expect(requested).toContain('exclude=toll')
  })

  it('keeps the existing query parameters untouched when excluding toll', async () => {
    let requested = ''
    const gateway = gatewayRecordingUrl((url) => (requested = url))

    await gateway.readRouteGeometry(POINTS, { excludeToll: true })

    expect(requested).toContain('overview=full')
    expect(requested).toContain('geometries=geojson')
    expect(requested).toContain('annotations=nodes')
    expect(requested).toContain('alternatives=true')
  })
})
