/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O `/table` do OSRM (spec 300 D1): uma chamada com a origem e todas as paradas da lista. A resposta é entrada não
 * confiável e passa por schema. ⚠️ Falha é ausência: serviço fora, tempo esgotado ou resposta que não casa devolvem
 * `null`; célula sem estrada vira `null` só naquela parada.
 */
import { z } from 'zod'

import type {
  RouteDistance,
  RouteDistanceTablePort,
} from '../application/route-distance-table.port.js'

const DEFAULT_TIMEOUT_MILLISECONDS = 2_000
const ORIGIN_SOURCE_INDEX = 0

const tableResponseSchema = z.object({
  code: z.literal('Ok'),
  distances: z.tuple([z.array(z.number().nullable())]),
  durations: z.tuple([z.array(z.number().nullable())]),
})

export function createOsrmRouteDistanceTableGateway(input: {
  readonly baseUrl: string
  readonly fetchImplementation?: typeof fetch
  readonly timeoutMilliseconds?: number
}): RouteDistanceTablePort {
  const fetchImplementation = input.fetchImplementation ?? fetch
  const timeout = input.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS

  return {
    async readDistancesFrom(origin, destinations) {
      if (destinations.length === 0) return []
      const path = [origin, ...destinations]
        .map((point) => `${point.longitude},${point.latitude}`)
        .join(';')
      const url = `${input.baseUrl.replace(/\/$/u, '')}/table/v1/driving/${path}?sources=${String(ORIGIN_SOURCE_INDEX)}&annotations=duration,distance`
      try {
        const response = await fetchImplementation(url, { signal: AbortSignal.timeout(timeout) })
        if (!response.ok) return null
        const parsed = tableResponseSchema.safeParse(await response.json())
        if (!parsed.success) return null
        const [distances] = parsed.data.distances
        const [durations] = parsed.data.durations
        if (distances.length !== destinations.length + 1) return null
        if (durations.length !== destinations.length + 1) return null
        return destinations.map((_, index): RouteDistance | null => {
          const distanceMetres = distances[index + 1]
          const durationSeconds = durations[index + 1]
          if (distanceMetres === null || distanceMetres === undefined) return null
          if (durationSeconds === null || durationSeconds === undefined) return null
          return { distanceMetres, durationSeconds }
        })
      } catch {
        return null
      }
    },
  }
}
