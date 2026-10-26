/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * As viagens do motorista na rua agora (`TRIP_ON_ROAD_STATUSES`), da mais antiga para a mais nova — a
 * ordem de `readCurrent`, que decide qual viagem os toques do app alcançam.
 */
import { and, asc, eq, inArray } from 'drizzle-orm'

import { tripDrivers, trips } from '../../database/trip.schema.js'
import { TRIP_ON_ROAD_STATUSES } from '../domain/trip-state.policy.js'
import type { TripQueryable } from './trip-queryable.type.js'

export async function listDriverOnRoadTripIds(
  queryable: TripQueryable,
  input: { readonly companyId: string; readonly driverId: string },
): Promise<readonly string[]> {
  const rows = await queryable
    .select({ tripId: trips.id })
    .from(tripDrivers)
    .innerJoin(
      trips,
      and(eq(trips.companyId, tripDrivers.companyId), eq(trips.id, tripDrivers.tripId)),
    )
    .where(
      and(
        eq(tripDrivers.companyId, input.companyId),
        eq(tripDrivers.driverId, input.driverId),
        inArray(trips.status, [...TRIP_ON_ROAD_STATUSES]),
      ),
    )
    .orderBy(asc(trips.createdAt), asc(trips.id))
  return rows.map((row) => row.tripId)
}
