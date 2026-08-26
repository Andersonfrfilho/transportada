/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'

import { fleetDrivers, fleetVehicles } from '../../database/fleet.schema.js'
import { nfeParticipants } from '../../database/nfe.schema.js'
import { tripDocuments, tripDrivers, tripStops, trips } from '../../database/trip.schema.js'
import type {
  CurrentDriverTripPort,
  DriverTrip,
  DriverTripDocument,
  DriverTripStop,
} from '../application/find-current-driver-trip.use-case.js'
import type { TripDatabase } from './trip-queryable.type.js'

/** As duas fases em que a viagem está na rua. Fora delas o motorista não tem o que reportar. */
const ACTIVE_TRIP_STATUSES = ['dispatched', 'in_transit'] as const

/** A nota do destinatário é o que o motorista entrega; a do emitente não lhe diz nada. */
const RECIPIENT_ROLE = 'recipient'

export class DrizzleCurrentDriverTripRepository implements CurrentDriverTripPort {
  public constructor(private readonly database: TripDatabase) {}

  public async findDriverIdByMembership(input: {
    readonly companyId: string
    readonly membershipId: string
  }): Promise<string | null> {
    const [record] = await this.database
      .select({ id: fleetDrivers.id })
      .from(fleetDrivers)
      .where(
        and(
          eq(fleetDrivers.companyId, input.companyId),
          eq(fleetDrivers.membershipId, input.membershipId),
        ),
      )
      .limit(1)

    return record?.id ?? null
  }

  public async listActiveTrips(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<readonly DriverTrip[]> {
    const tripRows = await this.database
      .select({ id: trips.id, plate: fleetVehicles.plate, status: trips.status })
      .from(tripDrivers)
      .innerJoin(
        trips,
        and(eq(trips.companyId, tripDrivers.companyId), eq(trips.id, tripDrivers.tripId)),
      )
      .innerJoin(
        fleetVehicles,
        and(
          eq(fleetVehicles.companyId, trips.companyId),
          eq(fleetVehicles.id, trips.vehicleId),
        ),
      )
      .where(
        and(
          eq(tripDrivers.companyId, input.companyId),
          eq(tripDrivers.driverId, input.driverId),
          inArray(trips.status, [...ACTIVE_TRIP_STATUSES]),
        ),
      )
      .orderBy(asc(trips.createdAt))

    if (tripRows.length === 0) return []

    const tripIds = tripRows.map((row) => row.id)
    const [stopRows, documentRows] = await Promise.all([
      this.listStops({ companyId: input.companyId, tripIds }),
      this.listDocuments({ companyId: input.companyId, tripIds }),
    ])

    const documentsByStop = groupBy(documentRows, (row) => row.stopId)
    const stopsByTrip = groupBy(stopRows, (row) => row.tripId)

    return tripRows.map((trip) => ({
      id: trip.id,
      status: trip.status,
      stops: (stopsByTrip.get(trip.id) ?? []).map((stop) => toDriverStop(stop, documentsByStop)),
      vehiclePlate: trip.plate,
    }))
  }

  private async listStops(input: { readonly companyId: string; readonly tripIds: string[] }) {
    return this.database
      .select({
        arrivedAt: tripStops.arrivedAt,
        completedAt: tripStops.completedAt,
        deliveryWindowEnd: tripStops.deliveryWindowEnd,
        deliveryWindowStart: tripStops.deliveryWindowStart,
        id: tripStops.id,
        label: tripStops.label,
        latitude: tripStops.latitude,
        longitude: tripStops.longitude,
        sequence: tripStops.sequence,
        tripId: tripStops.tripId,
      })
      .from(tripStops)
      .where(
        and(eq(tripStops.companyId, input.companyId), inArray(tripStops.tripId, input.tripIds)),
      )
      .orderBy(asc(tripStops.sequence))
  }

  /**
   * Nota liberada do romaneio saiu da viagem — mostrá-la ao motorista seria pedir a entrega de algo
   * que o escritório já tirou dali. O nome do destinatário entra por `left join` porque nota sem
   * participante é importação incompleta, não motivo para a parada sumir da tela.
   */
  private async listDocuments(input: { readonly companyId: string; readonly tripIds: string[] }) {
    return this.database
      .select({
        deliveredAt: tripDocuments.deliveredAt,
        id: tripDocuments.id,
        recipientName: nfeParticipants.legalName,
        returnReason: tripDocuments.returnReason,
        separationStatus: tripDocuments.separationStatus,
        stopId: tripDocuments.stopId,
      })
      .from(tripDocuments)
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
  }
}

type StopRow = {
  readonly arrivedAt: Date | null
  readonly completedAt: Date | null
  readonly deliveryWindowEnd: Date | null
  readonly deliveryWindowStart: Date | null
  readonly id: string
  readonly label: string
  readonly latitude: string | null
  readonly longitude: string | null
  readonly sequence: bigint
  readonly tripId: string
}

type DocumentRow = {
  readonly deliveredAt: Date | null
  readonly id: string
  readonly recipientName: string | null
  readonly returnReason: string | null
  readonly separationStatus: string
  readonly stopId: string | null
}

function toDriverStop(stop: StopRow, documentsByStop: Map<string | null, DocumentRow[]>): DriverTripStop {
  return {
    arrivedAt: stop.arrivedAt?.toISOString() ?? null,
    completedAt: stop.completedAt?.toISOString() ?? null,
    deliveryWindowEnd: stop.deliveryWindowEnd?.toISOString() ?? null,
    deliveryWindowStart: stop.deliveryWindowStart?.toISOString() ?? null,
    documents: (documentsByStop.get(stop.id) ?? []).map(toDriverDocument),
    id: stop.id,
    label: stop.label,
    latitude: stop.latitude,
    longitude: stop.longitude,
    sequence: Number(stop.sequence),
  }
}

function toDriverDocument(row: DocumentRow): DriverTripDocument {
  return {
    deliveredAt: row.deliveredAt?.toISOString() ?? null,
    id: row.id,
    recipientName: row.recipientName ?? '',
    returnReason: row.returnReason,
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
