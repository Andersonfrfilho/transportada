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
  /**
   * Os **ids de nó OSM percorridos**, na ordem em que o caminhão passa por eles — 845 numa rota de
   * 126 km medida. É por identidade de nó que a praça de pedágio se encontra (spec 090 D1): a praça
   * **é** um nó, então a interseção é exata e o sentido está resolvido por construção. Casar por
   * raio cobraria a praça da pista contrária, a poucos metros dali.
   *
   * ⚠️ `null` é **desconhecimento**, e lista vazia é "passou por nó nenhum". A distinção existe
   * porque, sem ela, uma resposta do OSRM sem anotação viraria pedágio zero com cara de medido —
   * o modo de falha silencioso desta feature.
   */
  nodeIds: readonly number[] | null
  points: readonly RouteGeometryPoint[]
}>

export type RouteGeometryPort = {
  /**
   * A linha da estrada que liga os pontos, na ordem em que eles vêm. `null` quando o serviço não
   * está configurado ou não respondeu — nunca uma reta inventada no lugar dela.
   */
  readRouteGeometry(points: readonly RouteGeometryPoint[]): Promise<RouteGeometryRoad | null>
}
