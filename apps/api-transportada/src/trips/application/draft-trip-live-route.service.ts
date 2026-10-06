/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Rascunho com motorista e veículo ainda não tem rota congelada (`planned_*` nulos), e o custo
 * saía com combustível e pedágio em lacuna. Aqui a rota é calculada na hora — a mesma que a prévia
 * da montagem usa (`readRouteGeometry`, escolha padrão) —, só para exibir: nada é gravado, e o
 * congelamento do resultado financeiro continua lendo apenas o que foi congelado.
 */
import {
  readRouteGeometry,
  type ReadRouteGeometryDepotPort,
} from './read-route-geometry.use-case.js'
import type { ReadRouteGeometryTollBoothsPort } from './read-route-geometry.use-case.js'
import type { FreezeTripPlannedRoutePort } from './freeze-trip-planned-route.use-case.js'
import type { RouteGeometryPort } from './route-geometry.port.js'
import type { TripValuationContext } from './read-trip-valuation.use-case.js'
import { summarizeRoadDistance } from '../domain/planned-road-distance.policy.js'

export type DraftTripLiveRoute = {
  readonly depot?: null | ReadRouteGeometryDepotPort
  readonly geometry: RouteGeometryPort
  readonly repository: Pick<
    FreezeTripPlannedRoutePort,
    'readStopCoordinates' | 'readVehicleContext'
  >
  readonly tollBooths: ReadRouteGeometryTollBoothsPort
}

export async function applyDraftTripLiveRoute(input: {
  readonly companyId: string
  readonly context: TripValuationContext
  readonly liveRoute: DraftTripLiveRoute
  readonly tripId: string
}): Promise<TripValuationContext> {
  const { context, liveRoute } = input
  if (context.distanceMeters !== null && context.distanceMeters !== undefined) return context
  if (context.vehicle === null) return context

  const scope = { companyId: input.companyId, tripId: input.tripId }
  const [vehicle, stops] = await Promise.all([
    liveRoute.repository.readVehicleContext(scope),
    liveRoute.repository.readStopCoordinates(scope),
  ])
  if (vehicle === null || stops === null) return context

  const road = await readRouteGeometry({
    axles: vehicle.axles,
    depot: liveRoute.depot ?? null,
    fuelBaseline: vehicle.fuelBaseline,
    geometry: liveRoute.geometry,
    hasAutomaticTollPayment: vehicle.hasAutomaticTollPayment,
    multiplier: vehicle.multiplier,
    stops,
    tollBooths: liveRoute.tollBooths,
  })
  const distance = summarizeRoadDistance({
    legs: road.legs,
    trailingLegs: road.depot?.trailingLegs ?? 0,
  })

  return {
    ...context,
    distanceMeters: distance.distanceMeters,
    estimatedDurationSeconds: distance.durationSeconds,
    toll: road.toll,
  }
}
