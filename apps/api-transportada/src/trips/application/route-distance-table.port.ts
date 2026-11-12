/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'

export type RouteDistance = Readonly<{
  distanceMetres: number
  durationSeconds: number
}>

/**
 * Spec 300 RF4: a distância e o tempo pela estrada da mesma origem a **várias** paradas, numa chamada só.
 * Devolve um item por destino, na ordem pedida (`null` é a parada sem estrada), ou `null` inteiro quando o serviço
 * falhou. Nunca lança.
 */
export type RouteDistanceTablePort = {
  readDistancesFrom(
    origin: RouteGeometryPoint,
    destinations: readonly RouteGeometryPoint[],
  ): Promise<readonly (RouteDistance | null)[] | null>
}
