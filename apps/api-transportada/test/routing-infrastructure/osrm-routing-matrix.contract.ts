/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { buildMatrixCacheKey } from '../../src/routing/application/routing-matrix.port.js'
import { RoutingMatrixUnavailableError } from '../../src/routing/domain/routing.error.js'
import { createOsrmRoutingMatrixGateway } from '../../src/routing/infrastructure/osrm-routing-matrix.gateway.js'

const SAO_PAULO = { latitude: '-23.5613090', longitude: '-46.6564870' }
const CENTRO = { latitude: '-23.5505200', longitude: '-46.6333090' }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

function buildGateway(fetchImplementation: typeof fetch) {
  return createOsrmRoutingMatrixGateway({ baseUrl: 'http://osrm:5000', fetchImplementation })
}

describe('OSRM routing matrix gateway (ADR-0044 §2)', () => {
  /**
   * O OSRM fala `lon,lat`, ao contrário de quase todo o resto. Trocar a ordem não dá erro: dá uma
   * rota plausível no lugar errado do mundo, que é a falha mais cara de achar depois.
   */
  test('sends the coordinates as lon,lat, which is the order OSRM speaks', async () => {
    let requestedUrl = ''
    const gateway = buildGateway(((url: string) => {
      requestedUrl = url
      return Promise.resolve(jsonResponse({ code: 'Ok', distances: [[0]], durations: [[0]] }))
    }) as unknown as typeof fetch)

    await gateway.table([SAO_PAULO])

    expect(requestedUrl).toContain('-46.6564870,-23.5613090')
    expect(requestedUrl).toContain('annotations=duration,distance')
  })

  test('returns both matrices, because half a matrix cannot cost a route', async () => {
    const gateway = buildGateway((() =>
      Promise.resolve(
        jsonResponse({
          code: 'Ok',
          distances: [
            [0, 2400],
            [2500, 0],
          ],
          durations: [
            [0, 420],
            [430, 0],
          ],
        }),
      )) as unknown as typeof fetch)

    const matrix = await gateway.table([SAO_PAULO, CENTRO])

    expect(matrix.durationsSeconds[0]?.[1]).toBe(420)
    expect(matrix.distancesMeters[1]?.[0]).toBe(2500)
  })

  /** Mão única existe: a matriz é assimétrica, e uma simétrica esconderia o erro que o motorista vê. */
  test('keeps the matrix asymmetric, because a one-way street is not a rounding error', async () => {
    const gateway = buildGateway((() =>
      Promise.resolve(
        jsonResponse({
          code: 'Ok',
          distances: [
            [0, 800],
            [6000, 0],
          ],
          durations: [
            [0, 120],
            [900, 0],
          ],
        }),
      )) as unknown as typeof fetch)

    const matrix = await gateway.table([SAO_PAULO, CENTRO])

    expect(matrix.distancesMeters[0]?.[1]).not.toBe(matrix.distancesMeters[1]?.[0])
  })

  /**
   * Aceite da spec 058: a queda do OSRM **não produz sugestão**. Nunca cai em haversine — resultado
   * ruim disfarçado de bom é pior que ausência (ADR-0044 §1).
   */
  test('fails loudly when the service is down, and never falls back to a straight line', async () => {
    const gateway = buildGateway((() =>
      Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch)

    const error = await gateway.table([SAO_PAULO, CENTRO]).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(RoutingMatrixUnavailableError)
    expect((error as RoutingMatrixUnavailableError).code).toBe('ROUTING_MATRIX_UNAVAILABLE')
  })

  test('fails on a non-Ok OSRM code instead of returning an empty matrix', async () => {
    const gateway = buildGateway((() =>
      Promise.resolve(jsonResponse({ code: 'NoTable' }))) as unknown as typeof fetch)

    const error = await gateway.table([SAO_PAULO, CENTRO]).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(RoutingMatrixUnavailableError)
  })

  test('fails when only one of the two matrices came back', async () => {
    const gateway = buildGateway((() =>
      Promise.resolve(jsonResponse({ code: 'Ok', durations: [[0]] }))) as unknown as typeof fetch)

    const error = await gateway.table([SAO_PAULO]).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(RoutingMatrixUnavailableError)
  })

  test('asks nothing of the service for an empty stop list', async () => {
    let called = false
    const gateway = buildGateway(((): Promise<Response> => {
      called = true
      return Promise.resolve(jsonResponse({ code: 'Ok' }))
    }) as unknown as typeof fetch)

    const matrix = await gateway.table([])

    expect(called).toBe(false)
    expect(matrix.durationsSeconds).toEqual([])
  })
})

describe('matrix cache key (spec 058 RNF)', () => {
  /** Duas sugestões seguidas da mesma viagem não pedem matriz duas vezes. */
  test('is stable for the same coordinates in the same order', () => {
    expect(buildMatrixCacheKey([SAO_PAULO, CENTRO])).toBe(buildMatrixCacheKey([SAO_PAULO, CENTRO]))
  })

  /**
   * A matriz é indexada por posição: reordenar as paradas produz outra matriz, ainda que o conjunto
   * de pontos seja o mesmo. Uma chave que ignorasse a ordem devolveria a matriz trocada.
   */
  test('changes when the order changes, because the matrix is indexed by position', () => {
    expect(buildMatrixCacheKey([SAO_PAULO, CENTRO])).not.toBe(
      buildMatrixCacheKey([CENTRO, SAO_PAULO]),
    )
  })
})
