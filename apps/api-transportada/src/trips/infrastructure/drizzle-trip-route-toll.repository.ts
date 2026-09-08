/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 090 T11: lê o veículo da viagem para saber o eixo e se ela paga com tag, e grava o pedágio
 * congelado no momento do planejamento.
 */
import { and, eq, sql } from 'drizzle-orm'

import { fleetVehicles } from '../../database/fleet.schema.js'
import { trips } from '../../database/trip.schema.js'
import { resolveDeclaredTollMultiplier } from '../../toll-booths/domain/toll-category.policy.js'
import { resolveDeclaredVehicleAxles } from '../../toll-booths/domain/vehicle-axles.policy.js'
import type { TollRouteCost } from '../../toll-booths/domain/toll-route-cost.policy.js'
import type {
  FreezeTripRouteTollPort,
  FreezeTripRouteTollVehicleContext,
} from '../application/freeze-trip-route-toll.use-case.js'
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'
import { listTripStopCoordinates } from './trip-stop-coordinates.support.js'
import type { TripDatabase } from './trip-queryable.type.js'

export class DrizzleTripRouteTollRepository implements FreezeTripRouteTollPort {
  public constructor(private readonly database: TripDatabase) {}

  public async readTollContext(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<FreezeTripRouteTollVehicleContext | null> {
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

  public async writePlannedToll(input: {
    readonly companyId: string
    readonly toll: null | TollRouteCost
    readonly tripId: string
  }): Promise<void> {
    await this.database
      .update(trips)
      .set({
        plannedToll: input.toll,
        plannedTollFrozenAt: input.toll === null ? null : sql`now()`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
  }
}
