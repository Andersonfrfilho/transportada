/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 153 T201 (substitui a spec 090 T11): lê o veículo da viagem para saber o eixo e se ela paga
 * com tag, e grava a rota planejada inteira — traçado, métricas e pedágio — numa única escrita.
 */
import { and, eq, sql } from 'drizzle-orm'

import { fleetVehicles } from '../../database/fleet.schema.js'
import { trips } from '../../database/trip.schema.js'
import { resolveDeclaredTollMultiplier } from '../../toll-booths/domain/toll-category.policy.js'
import { resolveDeclaredVehicleAxles } from '../../toll-booths/domain/vehicle-axles.policy.js'
import type {
  FreezeTripPlannedRoutePort,
  FreezeTripPlannedRouteVehicleContext,
  WritePlannedRouteInput,
} from '../application/freeze-trip-planned-route.use-case.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'
import { listTripStopCoordinates } from './trip-stop-coordinates.support.js'
import type { TripDatabase } from './trip-queryable.type.js'

export class DrizzleTripPlannedRouteRepository implements FreezeTripPlannedRoutePort {
  public constructor(private readonly database: TripDatabase) {}

  public async readVehicleContext(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<FreezeTripPlannedRouteVehicleContext | null> {
    const [row] = await this.database
      .select({
        axleCount: fleetVehicles.axleCount,
        hasAutomaticTollPayment: fleetVehicles.hasAutomaticTollPayment,
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

    return {
      axles: resolveDeclaredVehicleAxles(row),
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
}
