/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq } from 'drizzle-orm'

import { tripDrivers, trips } from '../../database/trip.schema.js'
import type {
  FieldTripCrew,
  FieldTripCrewDriver,
  FieldTripTargetPort,
} from '../application/field-trip-target.port.js'
import type { TripQueryable } from './trip-queryable.type.js'

export class DrizzleFieldTripTargetRepository implements FieldTripTargetPort {
  public constructor(private readonly database: TripQueryable) {}

  /**
   * ADR-0067 §2: a viagem **desta empresa** com a tripulação em ordem de posição. Sem status no
   * `where`: quem decide se a viagem aceita a ação é a política de estados, igual nos dois canais.
   */
  public async findTripCrew(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<FieldTripCrew | null> {
    const rows = await this.database
      .select({
        driverId: tripDrivers.driverId,
        position: tripDrivers.position,
        tripId: trips.id,
        tripStatus: trips.status,
      })
      .from(trips)
      .leftJoin(
        tripDrivers,
        and(eq(tripDrivers.companyId, trips.companyId), eq(tripDrivers.tripId, trips.id)),
      )
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .orderBy(asc(tripDrivers.position))

    const [first] = rows
    if (first === undefined) return null

    const drivers: FieldTripCrewDriver[] = []
    for (const row of rows) {
      if (row.driverId === null || row.position === null) continue
      // O CHECK da tabela limita a posição à tripulação máxima: a conversão não perde nada.
      drivers.push({ driverId: row.driverId, position: Number(row.position) })
    }

    return { drivers, tripId: first.tripId, tripStatus: first.tripStatus }
  }
}
