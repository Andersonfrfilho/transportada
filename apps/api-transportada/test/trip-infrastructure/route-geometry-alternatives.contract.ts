/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 093 T1: o OSRM passa a ser pedido com `alternatives=true`, e a rota principal continua
 * sendo a primeira — a alternativa é oferta, nunca troca automática.
 */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { createOsrmRouteGeometryGateway } from '../../src/trips/infrastructure/osrm-route-geometry.gateway.js'

const GATEWAY_SOURCE = 'src/trips/infrastructure/osrm-route-geometry.gateway.ts'

const POINTS = [
  { latitude: -21.1, longitude: -47.8 },
  { latitude: -21.2, longitude: -47.9 },
] as const

function respondWith(body: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })) as unknown as typeof fetch
}

function route(nodes: readonly number[], distance: number, duration: number) {
  return {
    geometry: {
      coordinates: [
        [-47.8, -21.1],
        [-47.9, -21.2],
      ],
    },
    legs: [{ annotation: { nodes }, distance, duration }],
  }
}

describe('route geometry alternatives (spec 093 T1)', () => {
  it('asks OSRM for alternative routes', () => {
    const source = readFileSync(new URL(`../../${GATEWAY_SOURCE}`, import.meta.url), 'utf8')
    expect(source).toContain('alternatives=true')
  })

  it('sends the alternatives parameter on the wire', async () => {
    let requested = ''
    const gateway = createOsrmRouteGeometryGateway({
      baseUrl: 'http://osrm.test',
      fetchImplementation: (async (url: string) => {
        requested = url
        return new Response(JSON.stringify({ code: 'Ok', routes: [route([1, 2], 10, 20)] }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        })
      }) as unknown as typeof fetch,
    })

    await gateway.readRouteGeometry(POINTS)

    expect(requested).toContain('alternatives=true')
  })

  /** Ribeirão Preto → Campinas medido: a principal é sempre a primeira do array do OSRM. */
  it('keeps the first OSRM route as the primary, and packs the rest as alternatives', async () => {
    const gateway = createOsrmRouteGeometryGateway({
      baseUrl: 'http://osrm.test',
      fetchImplementation: respondWith({
        code: 'Ok',
        routes: [route([10, 20], 221_500, 179 * 60), route([30, 40], 239_600, 198 * 60)],
      }),
    })

    const road = await gateway.readRouteGeometry(POINTS)

    expect(road?.nodeIds).toEqual([10, 20])
    expect(road?.legs).toEqual([{ distanceMetres: 221_500, durationSeconds: 179 * 60 }])
    expect(road?.alternatives).toHaveLength(1)
    expect(road?.alternatives?.[0]?.nodeIds).toEqual([30, 40])
    expect(road?.alternatives?.[0]?.legs).toEqual([
      { distanceMetres: 239_600, durationSeconds: 198 * 60 },
    ])
  })

  /** Três de quatro rotas medidas têm caminho único — resposta sem `routes[1]` não inventa uma. */
  it('reports no alternatives when OSRM offers a single path', async () => {
    const gateway = createOsrmRouteGeometryGateway({
      baseUrl: 'http://osrm.test',
      fetchImplementation: respondWith({ code: 'Ok', routes: [route([10, 20], 106_600, 5_160)] }),
    })

    const road = await gateway.readRouteGeometry(POINTS)

    expect(road?.alternatives ?? []).toHaveLength(0)
  })

  /**
   * ⚠️ Uma alternativa malformada não derruba a rota principal — ela só não entra na lista. A
   * rota principal continua o mesmo contrato estrito de sempre.
   */
  it('drops a malformed alternative instead of failing the whole call', async () => {
    const gateway = createOsrmRouteGeometryGateway({
      baseUrl: 'http://osrm.test',
      fetchImplementation: respondWith({
        code: 'Ok',
        routes: [route([10, 20], 100_000, 3_600), { geometry: { coordinates: [] }, legs: [] }],
      }),
    })

    const road = await gateway.readRouteGeometry(POINTS)

    expect(road?.nodeIds).toEqual([10, 20])
    expect(road?.alternatives ?? []).toHaveLength(0)
  })
})
