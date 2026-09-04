/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'

/**
 * O trecho entre duas paradas consecutivas, **medido na estrada**. Um por par de pontos enviados, na
 * mesma ordem — é o que permite pendurar o número ao pé da parada de origem sem recontar nada.
 */
export type RouteGeometryLeg = Readonly<{
  distanceMetres: number
  durationSeconds: number
}>

/**
 * A estrada e o que ela custa. Os dois vêm da **mesma resposta** do OSRM: pedir a linha e depois
 * estimar o tempo por conta própria seria descartar o número certo que já chegou junto.
 */
export type RouteGeometryRoad = Readonly<{
  legs: readonly RouteGeometryLeg[]
  points: readonly RouteGeometryPoint[]
}>

export type RouteGeometryPort = {
  /**
   * A linha da estrada que liga os pontos, na ordem em que eles vêm. `null` quando o serviço não
   * está configurado ou não respondeu — nunca uma reta inventada no lugar dela.
   */
  readRouteGeometry(points: readonly RouteGeometryPoint[]): Promise<RouteGeometryRoad | null>
}
