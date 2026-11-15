/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 342 T6: reconstrói os pontos da rota congelada de uma viagem. Puro, para o teste provar o formato real.
 *
 * `planned_route.points` é o TRAÇADO (centenas de pontos), nunca os waypoints. Os waypoints são o barracão
 * (`depot.origin`, quando `leadingLegs`/`trailingLegs` > 0) e as paradas de `trip_stops` na ordem da `sequence`, e
 * `legs` tem um trecho por par consecutivo: `leadingLegs + (paradas - 1) + trailingLegs`.
 */
import { parsePlannedRoute } from '../src/trips/domain/parse-planned-route.policy.js'

export type RoutePoint = Readonly<{ latitude: string; longitude: string }>

export type ReconstructedRoute = Readonly<{
  criterion: string
  frozenLegMeters: readonly number[]
  isNoToll: boolean
  waypoints: readonly RoutePoint[]
}>

export function reconstructFrozenRoute(input: {
  readonly plannedRoute: unknown
  /** Já na ordem da `sequence`, todas com coordenada. */
  readonly stops: readonly RoutePoint[]
}): { readonly reason: string } | ReconstructedRoute {
  const route = parsePlannedRoute(input.plannedRoute)
  if (route === null) return { reason: 'rota_ilegivel' }
  const depot = (input.plannedRoute as { depot?: unknown }).depot
  const record =
    typeof depot === 'object' && depot !== null ? (depot as Record<string, unknown>) : {}
  const leading = count(record.leadingLegs)
  const trailing = count(record.trailingLegs)
  const origin = readPoint(record.origin)
  if ((leading > 0 || trailing > 0) && origin === null) return { reason: 'barracao_sem_origem' }

  const waypoints = [
    ...(leading > 0 && origin !== null ? [origin] : []),
    ...input.stops,
    ...(trailing > 0 && origin !== null ? [origin] : []),
  ]
  if (waypoints.length - 1 !== route.legs.length) {
    return { reason: `trechos_nao_fecham pontos=${waypoints.length} trechos=${route.legs.length}` }
  }
  return {
    criterion: route.criterion,
    frozenLegMeters: route.legs.map((leg) => leg.distanceMetres),
    isNoToll: route.isNoToll,
    waypoints,
  }
}

function count(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0
}

function readPoint(value: unknown): null | RoutePoint {
  if (typeof value !== 'object' || value === null) return null
  const { latitude, longitude } = value as Record<string, unknown>
  return typeof latitude === 'string' && typeof longitude === 'string'
    ? { latitude, longitude }
    : null
}
