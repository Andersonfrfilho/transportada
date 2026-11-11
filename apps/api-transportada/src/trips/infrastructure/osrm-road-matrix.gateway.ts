/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 323 T3: o `/table` do OSRM com a matriz completa (todos os pontos como origem e destino), para o ordenador das
 * paradas do rascunho. O `osrm-route-distance-table.gateway.ts` (spec 300) pede só a linha da origem; aqui são todas.
 *
 * A resposta é entrada não confiável e passa por schema, inclusive o tamanho: N linhas de N células. ⚠️ Falha é
 * ausência: serviço fora, tempo esgotado, HTTP de erro ou resposta que não casa devolvem `null`. Coordenada não vai a
 * log (RNF2): este gateway não loga nada; quem chama loga só ids e contagens.
 */
import { z } from 'zod'

import type { RoadMatrix, RoadMatrixPort } from '../application/road-matrix.port.js'
import { ROAD_MATRIX_TIMEOUT_MILLISECONDS } from '../domain/draft-stop-order.constant.js'

const cellSchema = z.number().finite().nonnegative().nullable()

const tableResponseSchema = z.object({
  code: z.literal('Ok'),
  distances: z.array(z.array(cellSchema)),
  durations: z.array(z.array(cellSchema)),
})

function isSquare(matrix: readonly (readonly unknown[])[], size: number): boolean {
  return matrix.length === size && matrix.every((row) => row.length === size)
}

export function createOsrmRoadMatrixGateway(input: {
  readonly baseUrl: string
  readonly fetchImplementation?: typeof fetch
  readonly timeoutMilliseconds?: number
}): RoadMatrixPort {
  const fetchImplementation = input.fetchImplementation ?? fetch
  const timeout = input.timeoutMilliseconds ?? ROAD_MATRIX_TIMEOUT_MILLISECONDS

  return {
    async readMatrix(points): Promise<RoadMatrix | null> {
      if (points.length === 0) return { distancesMetres: [], durationsSeconds: [] }
      if (points.length === 1) return { distancesMetres: [[0]], durationsSeconds: [[0]] }
      const path = points.map((point) => `${point.longitude},${point.latitude}`).join(';')
      const url = `${input.baseUrl.replace(/\/$/u, '')}/table/v1/driving/${path}?annotations=duration,distance`
      try {
        const response = await fetchImplementation(url, { signal: AbortSignal.timeout(timeout) })
        if (!response.ok) return null
        const parsed = tableResponseSchema.safeParse(await response.json())
        if (!parsed.success) return null
        const { distances, durations } = parsed.data
        if (!isSquare(distances, points.length) || !isSquare(durations, points.length)) return null
        return { distancesMetres: distances, durationsSeconds: durations }
      } catch {
        return null
      }
    },
  }
}
