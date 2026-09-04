/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O `/route` do OSRM — o mesmo serviço que o worker já consulta pelo `/table` da ADR-0044, e a
 * mesma instância: nada novo sobe, nada novo se contrata.
 *
 * ⚠️ **Falha é ausência, nunca reta.** Serviço fora do ar, tempo esgotado ou rota impossível
 * devolvem `null`, e a tela volta a ligar as paradas em linha reta **dizendo que são retas**. Uma
 * reta desenhada como se fosse estrada atravessa rio e ferrovia sem avisar.
 */
import type { RouteGeometryLeg, RouteGeometryPort } from '../application/route-geometry.port.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'

const OK_CODE = 'Ok'
const DEFAULT_TIMEOUT_MILLISECONDS = 5_000

type OsrmRouteResponse = {
  readonly code?: string
  readonly routes?: readonly {
    readonly geometry?: { readonly coordinates?: unknown }
    readonly legs?: unknown
  }[]
}

export function createOsrmRouteGeometryGateway(input: {
  readonly baseUrl: string
  readonly fetchImplementation?: typeof fetch
  readonly timeoutMilliseconds?: number
}): RouteGeometryPort {
  const fetchImplementation = input.fetchImplementation ?? fetch
  const timeout = input.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS

  return {
    async readRouteGeometry(points) {
      if (points.length < 2) return null

      const path = points.map((point) => `${point.longitude},${point.latitude}`).join(';')
      const url = `${input.baseUrl.replace(/\/$/u, '')}/route/v1/driving/${path}?overview=full&geometries=geojson`

      try {
        const response = await fetchImplementation(url, {
          signal: AbortSignal.timeout(timeout),
        })
        if (!response.ok) return null

        const payload = (await response.json()) as OsrmRouteResponse
        if (payload.code !== OK_CODE) return null

        const route = payload.routes?.[0]
        const roadPoints = toPoints(route?.geometry?.coordinates)
        if (roadPoints === null) return null

        /**
         * ⚠️ Um trecho por **par** de pontos enviados. Contagem diferente é resposta que não casa
         * com o pedido, e casar leg com parada errada põe o tempo do trecho seguinte ao pé da
         * parada anterior — número plausível e errado, que é pior que número nenhum.
         */
        const legs = toLegs(route?.legs)
        if (legs === null || legs.length !== points.length - 1) return null

        return { legs, points: roadPoints }
      } catch {
        // O mapa é enfeite operacional: ele degrada para reta, e nenhuma tela cai por causa disso.
        return null
      }
    },
  }
}

/** O GeoJSON vem `[longitude, latitude]` — trocar a ordem põe a viagem no oceano. */
function toPoints(coordinates: unknown): readonly RouteGeometryPoint[] | null {
  if (!Array.isArray(coordinates)) return null

  const points: RouteGeometryPoint[] = []
  for (const entry of coordinates) {
    if (!Array.isArray(entry)) return null
    const [longitude, latitude] = entry
    if (typeof longitude !== 'number' || typeof latitude !== 'number') return null
    points.push({ latitude, longitude })
  }

  return points.length < 2 ? null : points
}

/**
 * `distance` em metros e `duration` em segundos, que é o que o OSRM publica. A conversão para
 * quilômetro e minuto é da tela — aqui se guarda a unidade da fonte, para arredondar uma vez só.
 *
 * ⚠️ Valor não finito é recusa, não zero: `NaN` somado ao total daria um roteiro inteiro sem tempo,
 * e zero anunciaria trecho instantâneo.
 */
function toLegs(value: unknown): readonly RouteGeometryLeg[] | null {
  if (!Array.isArray(value)) return null

  const legs: RouteGeometryLeg[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null
    const { distance, duration } = entry as Record<string, unknown>
    if (typeof distance !== 'number' || !Number.isFinite(distance)) return null
    if (typeof duration !== 'number' || !Number.isFinite(duration)) return null
    legs.push({ distanceMetres: distance, durationSeconds: duration })
  }

  return legs
}
