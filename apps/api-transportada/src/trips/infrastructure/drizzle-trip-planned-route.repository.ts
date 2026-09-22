/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T201 (substitui a spec 090 T11): lê o veículo da viagem para saber o eixo, se ela paga
 * com tag e quanto o combustível custa, e grava a rota planejada inteira — traçado, métricas e
 * pedágio — numa única escrita.
 */
import { and, eq, sql } from 'drizzle-orm'

import { trips } from '../../database/trip.schema.js'
import { fleetVehicles } from '../../database/fleet.schema.js'
import { parseTollRouteCost } from '../../toll-booths/domain/toll-route-cost-snapshot.policy.js'
import { resolveDeclaredTollMultiplier } from '../../toll-booths/domain/toll-category.policy.js'
import { resolveDeclaredVehicleAxles } from '../../toll-booths/domain/vehicle-axles.policy.js'
import type {
  ReadTripRouteGeometryRoutePort,
  StoredTripRoute,
} from '../application/read-trip-route-geometry.use-case.js'
import type { RouteGeometryView } from '../application/read-route-geometry.use-case.js'
import type {
  FreezeTripPlannedRoutePort,
  FreezeTripPlannedRouteVehicleContext,
  WritePlannedRouteInput,
} from '../application/freeze-trip-planned-route.use-case.js'
import { parsePlannedRoute } from '../domain/parse-planned-route.policy.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'
import { resolveVehicleFuelBaseline } from './effective-fuel-price.query.js'
import { listTripStopCoordinates } from './trip-stop-coordinates.support.js'
import type { TripDatabase } from './trip-queryable.type.js'

export class DrizzleTripPlannedRouteRepository
  implements FreezeTripPlannedRoutePort, ReadTripRouteGeometryRoutePort
{
  public constructor(private readonly database: TripDatabase) {}

  public async readVehicleContext(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<FreezeTripPlannedRouteVehicleContext | null> {
    const [row] = await this.database
      .select({
        axleCount: fleetVehicles.axleCount,
        fuelType: fleetVehicles.fuelType,
        hasAutomaticTollPayment: fleetVehicles.hasAutomaticTollPayment,
        kilometersPerLiter: fleetVehicles.averageConsumption,
        vehicleType: fleetVehicles.vehicleType,
      })
      .from(trips)
      .innerJoin(
        fleetVehicles,
        and(eq(fleetVehicles.companyId, trips.companyId), eq(fleetVehicles.id, trips.vehicleId)),
      )
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)
    if (row === undefined) return null

    /** O mesmo seam da leitura ao vivo (`route-geometry-vehicle-axles.query.ts`). */
    const fuelBaseline = await resolveVehicleFuelBaseline({
      companyId: input.companyId,
      database: this.database,
      fuelType: row.fuelType,
      kilometersPerLiter: row.kilometersPerLiter,
    })

    return {
      axles: resolveDeclaredVehicleAxles(row),
      fuelBaseline,
      /** A categoria sai do mesmo `row` que os eixos: as duas descrevem o mesmo veículo. */
      multiplier: resolveDeclaredTollMultiplier(row),
      hasAutomaticTollPayment: row.hasAutomaticTollPayment,
    }
  }

  public async readStopCoordinates(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly RouteGeometryPoint[]> {
    return listTripStopCoordinates(this.database, input)
  }

  /**
   * Rota, métricas e pedágio na mesma chamada (D4) — nunca duas escritas que poderiam deixar a
   * viagem com um traçado novo e um pedágio velho, ou vice-versa.
   */
  public async writePlannedRoute(input: WritePlannedRouteInput): Promise<void> {
    const { route, toll } = input

    await this.database
      .update(trips)
      .set({
        plannedDistanceMeters: route === null ? null : route.distanceMeters,
        plannedDurationSeconds: route === null ? null : route.durationSeconds,
        plannedReturnDistanceMeters: route === null ? null : route.returnDistanceMeters,
        plannedRoute:
          route === null
            ? null
            : {
                choiceReproduced: route.choiceReproduced,
                criterion: route.criterion,
                depot: route.depot,
                legs: route.legs,
                points: route.points,
                signature: route.signature,
              },
        plannedRouteFrozenAt: route === null ? null : sql`now()`,
        plannedToll: toll,
        plannedTollFrozenAt: toll === null ? null : sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
  }

  /**
   * Spec 153 T203: `depot` sai só do que a própria escrita de T201 gravou (nunca payload externo),
   * então basta a checagem estrutural leve — a validação funda mora no domínio, para `legs`/`points`.
   */
  public async readFrozenRoute(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<StoredTripRoute | null> {
    const [row] = await this.database
      .select({
        plannedDistanceMeters: trips.plannedDistanceMeters,
        plannedDurationSeconds: trips.plannedDurationSeconds,
        plannedReturnDistanceMeters: trips.plannedReturnDistanceMeters,
        plannedRoute: trips.plannedRoute,
        plannedRouteFrozenAt: trips.plannedRouteFrozenAt,
        plannedToll: trips.plannedToll,
        plannedTollFrozenAt: trips.plannedTollFrozenAt,
      })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)
    if (row === undefined || row.plannedRouteFrozenAt === null) return null
    if (
      row.plannedDistanceMeters === null ||
      row.plannedDurationSeconds === null ||
      row.plannedReturnDistanceMeters === null
    )
      return null

    const parsedRoute = parsePlannedRoute(row.plannedRoute)
    if (parsedRoute === null) return null

    return {
      choiceReproduced: parsedRoute.choiceReproduced,
      criterion: parsedRoute.criterion,
      depot: readPlannedRouteDepot(row.plannedRoute),
      distanceMeters: row.plannedDistanceMeters,
      durationSeconds: row.plannedDurationSeconds,
      legs: parsedRoute.legs,
      points: parsedRoute.points,
      returnDistanceMeters: row.plannedReturnDistanceMeters,
      signature: parsedRoute.signature,
      toll: row.plannedTollFrozenAt === null ? null : parseTollRouteCost(row.plannedToll),
    }
  }
}

function readPlannedRouteDepot(value: unknown): RouteGeometryView['depot'] {
  if (typeof value !== 'object' || value === null) return null
  const depot = (value as Record<string, unknown>).depot
  if (typeof depot !== 'object' || depot === null) return null
  return depot as RouteGeometryView['depot']
}
