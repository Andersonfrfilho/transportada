/**
 * Copyright (c) 2026 Ada Technology. MIT License.
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

function routeBody(legs: readonly unknown[]): unknown {
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
        legs,
      },
    ],
  }
}

describe('route geometry annotations (spec 090 T4)', () => {
  /**
   * ⚠️ Contrato **por texto de fonte**, e é de propósito. A ausência de `annotations=nodes` não
   * quebra nada visível: a rota continua desenhada, o tempo continua certo, e o pedágio sai **zero
   * sem erro nenhum** — indistinguível de "esta rota não passa por praça". É o modo de falha
   * silencioso da 090 (D1), e nenhum teste de comportamento o pega, porque o comportamento sem os
   * nós é um sucesso plausível.
   */
  it('asks OSRM for the traversed nodes', () => {
    const source = readFileSync(new URL(`../../${GATEWAY_SOURCE}`, import.meta.url), 'utf8')
    expect(source).toContain('annotations=nodes')
  })

  it('sends the annotation parameter on the wire', async () => {
    let requested = ''
    const gateway = createOsrmRouteGeometryGateway({
      baseUrl: 'http://osrm.test',
      fetchImplementation: (async (url: string) => {
        requested = url
        return new Response(
          JSON.stringify(
            routeBody([{ annotation: { nodes: [1, 2] }, distance: 10, duration: 20 }]),
          ),
          { headers: { 'content-type': 'application/json' }, status: 200 },
        )
      }) as unknown as typeof fetch,
    })

    await gateway.readRouteGeometry(POINTS)

    expect(requested).toContain('annotations=nodes')
  })

  it('keeps the nodes in the order the truck passes them', async () => {
    const gateway = createOsrmRouteGeometryGateway({
      baseUrl: 'http://osrm.test',
      fetchImplementation: respondWith(
        routeBody([{ annotation: { nodes: [10, 20, 30] }, distance: 10, duration: 20 }]),
      ),
    })

    const road = await gateway.readRouteGeometry(POINTS)

    expect(road?.nodeIds).toEqual([10, 20, 30])
  })

  /**
   * ⚠️ O OSRM repete o nó da parada no fim de um trecho e no começo do seguinte. Concatenar cru
   * faria a praça que cai exatamente ali ser **cobrada duas vezes** — número plausível, e maior que
   * o real, na tela de quem decide aceitar a carga.
   */
  it('collapses the node the two legs share at the stop', async () => {
    const gateway = createOsrmRouteGeometryGateway({
      baseUrl: 'http://osrm.test',
      fetchImplementation: respondWith(
        routeBody([
          { annotation: { nodes: [10, 20] }, distance: 10, duration: 20 },
          { annotation: { nodes: [20, 30] }, distance: 10, duration: 20 },
        ]),
      ),
    })

    const road = await gateway.readRouteGeometry([...POINTS, { latitude: -21.3, longitude: -48 }])

    expect(road?.nodeIds).toEqual([10, 20, 30])
  })

  /**
   * ⚠️ Anotação ausente é **desconhecimento**, nunca lista vazia. Vazia diria "esta rota não passa
   * por praça nenhuma", e a conta sairia zero com cara de medida — exatamente o que a D1 proíbe.
   * `null` deixa a parcela de pedágio declarar a lacuna, e o mapa continua desenhado.
   */
  it('reports absent annotation as unknown, never as an empty route', async () => {
    const gateway = createOsrmRouteGeometryGateway({
      baseUrl: 'http://osrm.test',
      fetchImplementation: respondWith(routeBody([{ distance: 10, duration: 20 }])),
    })

    const road = await gateway.readRouteGeometry(POINTS)

    expect(road).not.toBeNull()
    expect(road?.nodeIds).toBeNull()
    expect(road?.legs).toHaveLength(1)
  })
})
