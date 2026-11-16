/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 323 T3: a matriz N×N pela estrada, numa chamada só ao `/table` do OSRM.
 *
 * A resposta é entrada não confiável e passa por schema. Falha é ausência: serviço fora, tempo esgotado (5 s), HTTP de
 * erro ou resposta que não casa com o tamanho pedido devolvem `null`, e quem chamou deixa a ordem de chegada com
 * `ROUTING_MATRIX_UNAVAILABLE`. Célula sem estrada é `null` só naquela célula.
 */
import { describe, expect, it } from 'bun:test'

import { ROAD_MATRIX_TIMEOUT_MILLISECONDS } from '../../src/trips/domain/draft-stop-order.constant.js'
import { createOsrmRoadMatrixGateway } from '../../src/trips/infrastructure/osrm-road-matrix.gateway.js'

const BARRACAO = { latitude: -21.1767, longitude: -47.8208 }
const JABOTICABAL = { latitude: -21.2546, longitude: -48.3225 }
const MATAO = { latitude: -21.6033, longitude: -48.3658 }

function gatewayAnswering(body: unknown, status = 200) {
  const calls: { url: string; signal: AbortSignal | null | undefined }[] = []
  const gateway = createOsrmRoadMatrixGateway({
    baseUrl: 'http://osrm.test/',
    fetchImplementation: ((url: string, init?: RequestInit) => {
      calls.push({ signal: init?.signal, url })
      return Promise.resolve(new Response(JSON.stringify(body), { status }))
    }) as unknown as typeof fetch,
  })
  return { calls, gateway }
}

describe('spec 323 — o gateway da matriz N×N do OSRM', () => {
  it('pede a matriz completa numa chamada e devolve duração e distância por célula', async () => {
    const { calls, gateway } = gatewayAnswering({
      code: 'Ok',
      distances: [
        [0, 52_000, 80_000],
        [51_000, 0, 41_000],
        [79_500, 40_800, null],
      ],
      durations: [
        [0, 2_700, 4_200],
        [2_650, 0, 2_100],
        [4_150, 2_050, null],
      ],
    })

    const matrix = await gateway.readMatrix([BARRACAO, JABOTICABAL, MATAO])

    expect(calls.map((call) => call.url)).toEqual([
      'http://osrm.test/table/v1/driving/-47.8208,-21.1767;-48.3225,-21.2546;-48.3658,-21.6033?annotations=duration,distance',
    ])
    expect(calls[0]?.signal).toBeInstanceOf(AbortSignal)
    expect(matrix).toEqual({
      distancesMetres: [
        [0, 52_000, 80_000],
        [51_000, 0, 41_000],
        [79_500, 40_800, null],
      ],
      durationsSeconds: [
        [0, 2_700, 4_200],
        [2_650, 0, 2_100],
        [4_150, 2_050, null],
      ],
    })
  })

  it('espera 5 s por padrão (RNF1)', () => {
    expect(ROAD_MATRIX_TIMEOUT_MILLISECONDS).toBe(5_000)
  })

  it('menos de dois pontos não chama o OSRM', async () => {
    const { calls, gateway } = gatewayAnswering({})

    expect(await gateway.readMatrix([])).toEqual({ distancesMetres: [], durationsSeconds: [] })
    expect(await gateway.readMatrix([BARRACAO])).toEqual({
      distancesMetres: [[0]],
      durationsSeconds: [[0]],
    })
    expect(calls).toEqual([])
  })

  it('resposta que não casa, tamanho errado, código de erro, HTTP de erro e rede caída viram null', async () => {
    const points = [BARRACAO, JABOTICABAL]
    const square = [
      [0, 1],
      [1, 0],
    ]
    const answers = [
      gatewayAnswering({ code: 'Ok', distances: 'x', durations: square }),
      gatewayAnswering({ code: 'Ok', distances: [[0, 1]], durations: [[0, 1]] }),
      gatewayAnswering({ code: 'Ok', distances: [[0, 1], [1]], durations: square }),
      gatewayAnswering({
        code: 'Ok',
        distances: square,
        durations: [
          [0, 1, 2],
          [1, 0, 2],
        ],
      }),
      gatewayAnswering({
        code: 'Ok',
        distances: [
          [0, -1],
          [1, 0],
        ],
        durations: square,
      }),
      gatewayAnswering({ code: 'NoTable', distances: square, durations: square }),
      gatewayAnswering({ code: 'Ok', distances: square, durations: square }, 502),
    ]
    const results = await Promise.all(answers.map((answer) => answer.gateway.readMatrix(points)))
    const offline = await createOsrmRoadMatrixGateway({
      baseUrl: 'http://osrm.test',
      fetchImplementation: (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch,
    }).readMatrix(points)

    expect(results).toEqual(answers.map(() => null))
    expect(offline).toBeNull()
  })

  it('tempo esgotado vira null, sem esperar o OSRM responder', async () => {
    const gateway = createOsrmRoadMatrixGateway({
      baseUrl: 'http://osrm.test',
      fetchImplementation: ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(init.signal?.reason as Error)
          })
        })) as unknown as typeof fetch,
      timeoutMilliseconds: 10,
    })

    expect(await gateway.readMatrix([BARRACAO, MATAO])).toBeNull()
  })
})
