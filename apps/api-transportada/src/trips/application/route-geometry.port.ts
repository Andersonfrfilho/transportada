/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'

export type RouteGeometryPort = {
  /**
   * A linha da estrada que liga os pontos, na ordem em que eles vêm. `null` quando o serviço não
   * está configurado ou não respondeu — nunca uma reta inventada no lugar dela.
   */
  readRouteGeometry(
    points: readonly RouteGeometryPoint[],
  ): Promise<readonly RouteGeometryPoint[] | null>
}
