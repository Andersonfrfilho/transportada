/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'

import { fleetVehicles } from '../../database/fleet.schema.js'
import { nfeDocuments, nfeParticipants } from '../../database/nfe.schema.js'
import { tripDocuments, trips } from '../../database/trip.schema.js'
import type {
  WarehouseTrip,
  WarehouseTripDocument,
  WarehouseTripPort,
} from '../application/list-warehouse-trips.use-case.js'
import type { TripDatabase } from './trip-queryable.type.js'

/**
 * Os três estados em que a viagem ainda está no barracão (ADR-0043 §1). Nenhum deles se alcança
 * sem `route_planned` primeiro — `hasRoute` é sempre `true` para quem aparece aqui.
 */
const WAREHOUSE_TRIP_STATUSES = ['route_planned', 'separating', 'loading'] as const

const RECIPIENT_ROLE = 'recipient'

export class DrizzleWarehouseTripRepository implements WarehouseTripPort {
  public constructor(private readonly database: TripDatabase) {}

  public async listWarehouseTrips(input: {
    readonly companyId: string
  }): Promise<readonly WarehouseTrip[]> {
    const tripRows = await this.database
      .select({ id: trips.id, plate: fleetVehicles.plate, status: trips.status })
      .from(trips)
      .innerJoin(
        fleetVehicles,
        and(eq(fleetVehicles.companyId, trips.companyId), eq(fleetVehicles.id, trips.vehicleId)),
      )
      .where(
        and(
          eq(trips.companyId, input.companyId),
          inArray(trips.status, [...WAREHOUSE_TRIP_STATUSES]),
        ),
      )
      .orderBy(asc(trips.createdAt))

    if (tripRows.length === 0) return []

    const tripIds = tripRows.map((row) => row.id)
    const documentsByTrip = groupBy(
      await this.listDocuments({ companyId: input.companyId, tripIds }),
      (row) => row.tripId,
    )

    return tripRows.map((trip) => ({
      documents: (documentsByTrip.get(trip.id) ?? []).map(toWarehouseDocument),
      hasRoute: true,
      id: trip.id,
      status: trip.status,
      vehiclePlate: trip.plate,
    }))
  }

  /** Nota liberada saiu da viagem — o mesmo recorte de `DrizzleCurrentDriverTripRepository`. */
  private async listDocuments(input: { readonly companyId: string; readonly tripIds: string[] }) {
    return this.database
      .select({
        id: tripDocuments.id,
        number: nfeDocuments.number,
        recipientName: nfeParticipants.legalName,
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
      .leftJoin(
        nfeParticipants,
        and(
          eq(nfeParticipants.companyId, tripDocuments.companyId),
          eq(nfeParticipants.documentId, tripDocuments.nfeDocumentId),
          eq(nfeParticipants.role, RECIPIENT_ROLE),
        ),
      )
      .where(
        and(
          eq(tripDocuments.companyId, input.companyId),
          inArray(tripDocuments.tripId, input.tripIds),
          isNull(tripDocuments.releasedAt),
        ),
      )
      .orderBy(asc(tripDocuments.createdAt), asc(tripDocuments.id))
  }
}

type DocumentRow = {
  readonly id: string
  readonly number: string | null
  readonly recipientName: string | null
  readonly separationStatus: WarehouseTripDocument['separationStatus']
  readonly tripId: string
}

function toWarehouseDocument(row: DocumentRow): WarehouseTripDocument {
  return {
    id: row.id,
    number: row.number ?? '',
    recipientName: row.recipientName ?? '',
    separationStatus: row.separationStatus,
  }
}

function groupBy<TRow, TKey>(rows: readonly TRow[], key: (row: TRow) => TKey): Map<TKey, TRow[]> {
  const grouped = new Map<TKey, TRow[]>()
  for (const row of rows) {
    const bucket = grouped.get(key(row)) ?? []
    bucket.push(row)
    grouped.set(key(row), bucket)
  }
  return grouped
}
