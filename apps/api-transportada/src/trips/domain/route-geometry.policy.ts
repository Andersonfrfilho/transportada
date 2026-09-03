/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A linha da estrada, reduzida ao que a tela consegue mostrar.
 *
 * O `/route` do OSRM devolve a geometria amostrada de metro em metro: medido em staging, uma
 * viagem de 64 km por doze paradas veio com **1285 pontos e 28 KB**. A maior parte disso é trecho
 * reto amostrado à exaustão, e nenhum pixel muda por causa dela — 162 pontos e 3,5 KB desenham a
 * mesma linha com erro de 11 m, que é menos de um pixel na largura em que o mapa é exibido.
 *
 * ⚠️ **A tolerância é da escala, nunca uma constante.** Uma viagem intermunicipal e um roteiro
 * dentro de um bairro cabem no mesmo `viewBox`: os 11 m invisíveis na primeira são três pixels de
 * desvio na segunda. Ela sai da extensão do próprio traçado dividida pela largura de desenho — um
 * pixel —, e é por isso que o parâmetro se chama `targetPixels`.
 */

export type RouteGeometryPoint = {
  readonly latitude: number
  readonly longitude: number
}

export type SimplifyRouteGeometryOptions = {
  /** Largura de desenho em pixels: o que couber abaixo de um pixel não muda o traço. */
  readonly targetPixels: number
}

export function simplifyRouteGeometry(
  points: readonly RouteGeometryPoint[],
  options: SimplifyRouteGeometryOptions,
): readonly RouteGeometryPoint[] {
  if (points.length < 3) return points

  const latitudes = points.map((point) => point.latitude)
  const longitudes = points.map((point) => point.longitude)
  const extent = Math.max(
    Math.max(...latitudes) - Math.min(...latitudes),
    Math.max(...longitudes) - Math.min(...longitudes),
  )
  // Rota inteira num ponto só: tolerância zero mantém todos, e nada divide por zero.
  if (extent === 0) return points

  return douglasPeucker(points, extent / options.targetPixels)
}

/**
 * Douglas–Peucker: guarda o ponto mais distante da corda enquanto ele estiver acima da tolerância,
 * e descarta o resto. As duas pontas nunca saem — elas são o começo e o fim da rota, e comê-las
 * moveria a linha para outro lugar.
 */
function douglasPeucker(
  points: readonly RouteGeometryPoint[],
  tolerance: number,
): readonly RouteGeometryPoint[] {
  const first = points.at(0)
  const last = points.at(-1)
  if (points.length < 3 || first === undefined || last === undefined) return points

  let farthestIndex = 0
  let farthestDistance = 0
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = distanceToSegment(points[index]!, first, last)
    if (distance > farthestDistance) {
      farthestDistance = distance
      farthestIndex = index
    }
  }

  if (farthestDistance <= tolerance) return [first, last]

  const head = douglasPeucker(points.slice(0, farthestIndex + 1), tolerance)
  const tail = douglasPeucker(points.slice(farthestIndex), tolerance)
  return [...head.slice(0, -1), ...tail]
}

/**
 * Distância em graus, plana. A projeção do mapa também é plana, então medir aqui na mesma métrica
 * em que se desenha é o que faz a tolerância significar um pixel de verdade.
 */
function distanceToSegment(
  point: RouteGeometryPoint,
  start: RouteGeometryPoint,
  end: RouteGeometryPoint,
): number {
  const deltaX = end.longitude - start.longitude
  const deltaY = end.latitude - start.latitude
  if (deltaX === 0 && deltaY === 0) {
    return Math.hypot(point.longitude - start.longitude, point.latitude - start.latitude)
  }

  const projection =
    ((point.longitude - start.longitude) * deltaX + (point.latitude - start.latitude) * deltaY) /
    (deltaX * deltaX + deltaY * deltaY)
  const clamped = Math.max(0, Math.min(1, projection))

  return Math.hypot(
    point.longitude - (start.longitude + clamped * deltaX),
    point.latitude - (start.latitude + clamped * deltaY),
  )
}
