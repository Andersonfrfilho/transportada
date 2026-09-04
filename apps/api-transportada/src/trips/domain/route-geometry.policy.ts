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
 * ⚠️ **A tolerância é em metro, e não em fração da extensão da rota.** A versão anterior dividia a
 * extensão do traçado pela largura de desenho (`extent / 600`), o que fazia sentido enquanto o mapa
 * era um SVG de 600px onde a rota inteira cabia sempre. No mapa vetorial isso é o defeito: o
 * critério **piora quanto mais longa a viagem** — medido nesta rota de três paradas, extensão de
 * 0,68° dava tolerância de **126 metros**, e a linha cortava quarteirão e saía da rua ao aproximar.
 *
 * Metro é o critério certo porque o mapa tem zoom: o desvio que importa é o do chão, não o da tela.
 */

export type RouteGeometryPoint = {
  readonly latitude: number
  readonly longitude: number
}

export type SimplifyRouteGeometryOptions = {
  /** Desvio máximo aceito entre a linha desenhada e a estrada, no chão. */
  readonly toleranceMetres: number
}

/**
 * Um grau de latitude são ~111,32 km em qualquer lugar do planeta. Longitude encolhe com o cosseno
 * da latitude, e ignorar isso torna a tolerância **mais apertada** no eixo leste-oeste — erra para
 * o lado de guardar ponto a mais, que é o lado certo de errar aqui.
 */
const METRES_PER_LATITUDE_DEGREE = 111_320

export function simplifyRouteGeometry(
  points: readonly RouteGeometryPoint[],
  options: SimplifyRouteGeometryOptions,
): readonly RouteGeometryPoint[] {
  if (points.length < 3) return points

  return douglasPeucker(points, options.toleranceMetres / METRES_PER_LATITUDE_DEGREE)
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
