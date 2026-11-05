/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF21: as leituras do atendente — as viagens na rua (com as notas, inclusive as liberadas, que
 * a regra de encerrar conta à parte) e as notas de uma viagem para a contagem de "ainda abertas".
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray } from 'drizzle-orm'

import { fleetVehicles } from '../../database/fleet.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import { tripDocuments, trips } from '../../database/trip.schema.js'
import type { TripCloseDocumentState } from '../../trips/domain/trip-close.policy.js'
import type {
  AttendantRoadDocument,
  AttendantRoadTrip,
} from '../application/register-attendant-field-flow-actions.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** As viagens que já saíram do galpão e ainda não terminaram. */
const ROAD_TRIP_STATUSES = ['dispatched', 'in_transit', 'on_delivery_route'] as const

const toIso = (value: Date | null) => (value === null ? null : value.toISOString())

export async function listAttendantRoadTrips(
  database: Database,
  input: { readonly companyId: string },
): Promise<readonly AttendantRoadTrip[]> {
  const tripRows = await database
    .select({ id: trips.id, plate: fleetVehicles.plate })
    .from(trips)
    .innerJoin(
      fleetVehicles,
      and(eq(fleetVehicles.companyId, trips.companyId), eq(fleetVehicles.id, trips.vehicleId)),
    )
    .where(
      and(eq(trips.companyId, input.companyId), inArray(trips.status, [...ROAD_TRIP_STATUSES])),
    )
    .orderBy(asc(trips.createdAt))
  if (tripRows.length === 0) return []

  const documentRows = await database
    .select({
      id: tripDocuments.id,
      number: nfeDocuments.number,
      releasedAt: tripDocuments.releasedAt,
      separationStatus: tripDocuments.separationStatus,
      tripId: tripDocuments.tripId,
    })
    .from(tripDocuments)
    .leftJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, tripDocuments.companyId),
        eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
      ),
    )
    .where(
      and(
        eq(tripDocuments.companyId, input.companyId),
        inArray(
          tripDocuments.tripId,
          tripRows.map((row) => row.id),
        ),
      ),
    )
    .orderBy(asc(tripDocuments.createdAt), asc(tripDocuments.id))

  return tripRows.map((trip) => ({
    documents: documentRows
      .filter((row) => row.tripId === trip.id)
      .map(
        (row): AttendantRoadDocument => ({
          id: row.id,
          number: row.number ?? '',
          releasedAt: toIso(row.releasedAt),
          separationStatus: row.separationStatus,
        }),
      ),
    id: trip.id,
    vehiclePlate: trip.plate,
  }))
}

/** O estado que a regra de encerrar lê de cada nota da viagem (`trip-close.policy.ts`). */
export async function listTripCloseDocuments(
  database: Database,
  input: { readonly companyId: string; readonly tripId: string },
): Promise<readonly TripCloseDocumentState[]> {
  const rows = await database
    .select({
      releasedAt: tripDocuments.releasedAt,
      separationStatus: tripDocuments.separationStatus,
    })
    .from(tripDocuments)
    .where(
      and(eq(tripDocuments.companyId, input.companyId), eq(tripDocuments.tripId, input.tripId)),
    )
  return rows.map((row) => ({
    releasedAt: toIso(row.releasedAt),
    separationStatus: row.separationStatus,
  }))
}
