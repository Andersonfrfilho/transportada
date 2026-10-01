/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { RouteGeometry } from './routeGeometry.service'
import { resolveRoadPoints } from './routeGeometry.service'
import {
  TIMELINE_ROUTE_MAX_POINTS,
  TIMELINE_ROUTE_MIN_POINTS,
  type TimelineRouteTrace,
} from './tripTimelineMap.constant'
import type { TimelineMapPoint } from './tripTimelineMap.service'

/** A mesma janela do roteiro (spec 079): a rota entre eventos não muda enquanto a página vive. */
const TIMELINE_ROUTE_STALE_TIME_MS = 5 * 60 * 1000

const TIMELINE_ROUTE_QUERY_KEY = 'trip-timeline-route'

type RouteGeometryReader = Readonly<{
  readPointsRouteGeometry: (
    input: Readonly<{
      points: readonly Readonly<{ latitude: number; longitude: number }>[]
      vehicleId: null | string
    }>,
  ) => Promise<RouteGeometry>
}>

function hasAskableRange(count: number): boolean {
  return count >= TIMELINE_ROUTE_MIN_POINTS && count <= TIMELINE_ROUTE_MAX_POINTS
}

/**
 * O que o mapa vai desenhar entre os pontos — e, por tabela, o que a legenda pode prometer.
 *
 * ⚠️ Lê a estrada pelo mesmo `resolveRoadPoints` que o traço usa: a legenda nunca é conferida
 * contra si mesma.
 */
export function resolveTimelineRouteTrace(
  input: Readonly<{
    geometry: null | RouteGeometry
    points: readonly TimelineMapPoint[]
  }>,
): TimelineRouteTrace {
  if (input.points.length < TIMELINE_ROUTE_MIN_POINTS) return 'none'
  return resolveRoadPoints(input.geometry).length >= 2 ? 'road' : 'straight'
}

/**
 * A estrada entre os lugares dos eventos, na ordem em que aconteceram.
 *
 * ⚠️ As coordenadas só saem no corpo do POST para a nossa própria API — nunca em URL, query string
 * ou serviço de terceiro (ADR-0044 §6). `vehicleId: null` porque aqui não há pedágio a calcular.
 */
export function createTimelineRouteGeometryQueryOptions(
  params: Readonly<{
    client: RouteGeometryReader
    points: readonly TimelineMapPoint[]
  }>,
): Readonly<{
  enabled: boolean
  queryFn: () => Promise<RouteGeometry>
  queryKey: readonly unknown[]
  staleTime: number
}> {
  const coordinates = params.points.map((point) => ({
    latitude: point.latitude,
    longitude: point.longitude,
  }))
  const routeKey = coordinates.map((point) => `${point.latitude},${point.longitude}`).join(';')

  return {
    enabled: hasAskableRange(coordinates.length),
    queryFn: () => params.client.readPointsRouteGeometry({ points: coordinates, vehicleId: null }),
    queryKey: [TIMELINE_ROUTE_QUERY_KEY, routeKey] as const,
    staleTime: TIMELINE_ROUTE_STALE_TIME_MS,
  }
}
