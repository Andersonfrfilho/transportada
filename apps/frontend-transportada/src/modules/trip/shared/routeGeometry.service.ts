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

/**
 * O que o trecho entre duas paradas **custou na estrada**, na unidade que o roteirizador publica.
 * Ele vem junto da geometria, na mesma resposta — ver `assemblyLeg.service.ts`.
 */
export type RouteGeometryLeg = Readonly<{
  distanceMetres: number
  durationSeconds: number
}>

export type RouteGeometry = Readonly<{
  /** Um por par de paradas consecutivas. Vazio quando a estrada não veio — nunca estimado. */
  legs: readonly RouteGeometryLeg[]
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

/**
 * Um pedaço do traço, com a **parada de destino** dele — é ela que dá a cor.
 *
 * ⚠️ O traço era uma linha só, em `--color-copper`, e o laranja já é usado por outros traços do mapa:
 * o roteiro se confundia com o fundo. Pintar cada trecho com a cor da parada a que ele leva casa o
 * mapa com a listagem, e é a listagem que a pessoa está lendo ao lado.
 */
export type RouteTraceSegment = RouteTrace & Readonly<{ toSequence: number }>

/** O mesmo trecho antes de virar `path`: o MapLibre quer coordenada, não `d` de SVG. */
export type RouteLeg = Readonly<{
  dashed: boolean
  kind: RouteTraceKind
  points: readonly ProjectedPoint[]
  toSequence: number
}>

/**
 * Corta o traço em um trecho por par de paradas consecutivas.
 *
 * ⚠️ **Os `legs` não dizem onde cada trecho começa na polilinha** — eles trazem só distância e
 * duração. O corte é feito achando, para cada parada, o ponto da polilinha mais próximo dela. Isso
 * **não é palpite**: a polilinha foi gerada roteirizando por essas paradas, então o roteirizador
 * encostou a geometria em cada uma. O que se recupera é informação que já está lá.
 *
 * Os índices saem **monotônicos por construção** — cada busca começa onde a anterior parou —, senão
 * uma rota que passa duas vezes perto da mesma parada produziria trecho de comprimento negativo.
 *
 * Sem estrada, cada trecho é a reta entre duas paradas: aí o corte é exato, e o tracejado continua
 * dizendo que aquilo não é caminho.
 */
export function resolveRouteLegs(input: {
  readonly geometry: RouteGeometry | null
  readonly project: (point: Readonly<{ latitude: number; longitude: number }>) => ProjectedPoint
  readonly stops: readonly ProjectedPoint[]
}): readonly RouteLeg[] {
  if (input.stops.length < 2) return []

  const road = input.geometry?.source === 'road' ? input.geometry.points : []
  if (road.length < 2) {
    return input.stops.slice(1).flatMap((stop, index) => {
      const from = input.stops[index]
      if (from === undefined) return []

      return [
        { dashed: true, kind: 'straight' as const, points: [from, stop], toSequence: index + 2 },
      ]
    })
  }

  const projected = road.map((point) =>
    input.project({ latitude: Number(point.latitude), longitude: Number(point.longitude) }),
  )
  const cuts = cutIndexes({ projected, stops: input.stops })

  return cuts.slice(1).flatMap((end, index) => {
    const start = cuts[index] ?? 0
    const slice = projected.slice(start, end + 1)
    if (slice.length < 2) return []

    return [{ dashed: false, kind: 'road' as const, points: slice, toSequence: index + 2 }]
  })
}

export function resolveRouteTraceSegments(input: {
  readonly geometry: RouteGeometry | null
  readonly project: (point: Readonly<{ latitude: number; longitude: number }>) => ProjectedPoint
  readonly stops: readonly ProjectedPoint[]
}): readonly RouteTraceSegment[] {
  return resolveRouteLegs(input).map((leg) => ({
    dashed: leg.dashed,
    kind: leg.kind,
    path: toPath(leg.points),
    toSequence: leg.toSequence,
  }))
}

function cutIndexes(input: {
  readonly projected: readonly ProjectedPoint[]
  readonly stops: readonly ProjectedPoint[]
}): readonly number[] {
  const cuts: number[] = [0]
  let from = 0

  for (const stop of input.stops.slice(1)) {
    let best = from
    let bestDistance = Number.POSITIVE_INFINITY
    for (let index = from; index < input.projected.length; index += 1) {
      const point = input.projected[index]
      if (point === undefined) continue
      const distance = (point.x - stop.x) ** 2 + (point.y - stop.y) ** 2
      if (distance >= bestDistance) continue
      bestDistance = distance
      best = index
    }
    cuts.push(best)
    from = best
  }

  /** A última parada fecha no fim da polilinha: o roteirizador não devolve ponto depois dela. */
  cuts[cuts.length - 1] = input.projected.length - 1

  return cuts
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
