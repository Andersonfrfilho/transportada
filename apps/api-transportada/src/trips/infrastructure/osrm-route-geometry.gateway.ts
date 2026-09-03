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
import type { RouteGeometryPort } from '../application/route-geometry.port.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'

const OK_CODE = 'Ok'
const DEFAULT_TIMEOUT_MILLISECONDS = 5_000

type OsrmRouteResponse = {
  readonly code?: string
  readonly routes?: readonly { readonly geometry?: { readonly coordinates?: unknown } }[]
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

        return toPoints(payload.routes?.[0]?.geometry?.coordinates)
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
