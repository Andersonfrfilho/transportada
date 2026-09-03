/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * O traço que liga as paradas — e a distinção que ele **precisa** carregar.
 *
 * ⚠️ **Uma reta entre duas paradas atravessa rio, serra e ferrovia sem pedir licença.** Desenhá-la
 * com o mesmo traço da estrada faz o operador ler caminho onde não há. Quando a geometria do OSRM
 * chega, a linha é sólida e segue a estrada; quando não chega — serviço ausente, fora do ar ou rota
 * impossível —, ela é tracejada, e a legenda ao lado diz que é linha reta.
 *
 * Medido em staging: a linha real de uma viagem de 64 km cabe em 162 pontos e 3,5 KB, com erro
 * menor que um pixel. O que a tela não mostra não atravessa a rede.
 */

export const ROUTE_GEOMETRY_SOURCES = ['road', 'unavailable'] as const
export type RouteGeometrySource = (typeof ROUTE_GEOMETRY_SOURCES)[number]

export type RouteGeometry = Readonly<{
  points: readonly Readonly<{ latitude: string; longitude: string }>[]
  source: RouteGeometrySource
}>

export type ProjectedPoint = Readonly<{ x: number; y: number }>

export type RouteTraceKind = 'road' | 'straight'

export type RouteTrace = Readonly<{
  dashed: boolean
  kind: RouteTraceKind
  path: string
}>

export function resolveRouteTrace(input: {
  readonly geometry: RouteGeometry | null
  readonly project: (point: Readonly<{ latitude: number; longitude: number }>) => ProjectedPoint
  readonly stops: readonly ProjectedPoint[]
}): RouteTrace {
  const road = input.geometry?.source === 'road' ? input.geometry.points : []

  if (road.length >= 2) {
    const projected = road.map((point) =>
      input.project({ latitude: Number(point.latitude), longitude: Number(point.longitude) }),
    )
    return { dashed: false, kind: 'road', path: toPath(projected) }
  }

  return { dashed: true, kind: 'straight', path: toPath(input.stops) }
}

function toPath(points: readonly ProjectedPoint[]): string {
  if (points.length < 2) return ''
  return points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`)
    .join(' ')
}

/** Três casas no `viewBox` de 100: abaixo do que qualquer tela distingue, e encurta o `d`. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000
}
