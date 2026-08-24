/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, isNull, notInArray } from 'drizzle-orm'

import { nfeDocuments } from '../../database/nfe.schema.js'
import { tripDocuments, tripStops, trips } from '../../database/trip.schema.js'
import { buildDocumentListFilters } from '../../nfe-documents/infrastructure/drizzle-nfe-document.repository.js'
import type { FindTripLocationByAccessKeyPort } from '../application/find-trip-location-by-access-key.use-case.js'
import type { ListTripStopsPort, TripStopSummary } from '../application/list-trip-stops.use-case.js'
import type { TripDatabase } from './trip-queryable.type.js'

export class DrizzleTripStopLookupRepository
  implements ListTripStopsPort, FindTripLocationByAccessKeyPort
{
  public constructor(private readonly database: TripDatabase) {}

  public async listStops(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly TripStopSummary[] | null> {
    const [tripRecord] = await this.database
      .select({ id: trips.id })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)
    if (tripRecord === undefined) return null

    const stopRows = await this.database
      .select()
      .from(tripStops)
      .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))
      .orderBy(asc(tripStops.sequence))

    const documentRows = await this.database
      .select({ id: tripDocuments.id, stopId: tripDocuments.stopId })
      .from(tripDocuments)
      .where(
        and(
          eq(tripDocuments.companyId, input.companyId),
          eq(tripDocuments.tripId, input.tripId),
          isNull(tripDocuments.releasedAt),
          notInArray(tripDocuments.separationStatus, ['returned']),
        ),
      )

    const documentIdsByStop = new Map<string, string[]>()
    for (const row of documentRows) {
      if (row.stopId === null) continue
      const list = documentIdsByStop.get(row.stopId) ?? []
      list.push(row.id)
      documentIdsByStop.set(row.stopId, list)
    }

    return stopRows.map((stop) => ({
      addressKey: stop.addressKey,
      arrivedAt: stop.arrivedAt === null ? null : stop.arrivedAt.toISOString(),
      completedAt: stop.completedAt === null ? null : stop.completedAt.toISOString(),
      deliveryWindowEnd: stop.deliveryWindowEnd === null ? null : stop.deliveryWindowEnd.toISOString(),
      deliveryWindowStart:
        stop.deliveryWindowStart === null ? null : stop.deliveryWindowStart.toISOString(),
      documentIds: documentIdsByStop.get(stop.id) ?? [],
      id: stop.id,
      label: stop.label,
      sequence: Number(stop.sequence),
    }))
  }

  /**
   * Reusa `buildDocumentListFilters` da 055 (`drizzle-nfe-document.repository.ts`) em vez de
   * reescrever o filtro de chave de acesso — é a redução que a T012 pede explicitamente.
   */
  public async findByAccessKey(input: { readonly accessKey: string; readonly companyId: string }) {
    const filters = buildDocumentListFilters({
      accessKey: input.accessKey,
      companyId: input.companyId,
      cursor: null,
    })

    const [record] = await this.database
      .select({
        documentId: tripDocuments.id,
        separationStatus: tripDocuments.separationStatus,
        stopId: tripStops.id,
        stopLabel: tripStops.label,
        stopSequence: tripStops.sequence,
        tripId: tripDocuments.tripId,
        tripStatus: trips.status,
      })
      .from(nfeDocuments)
      .innerJoin(
        tripDocuments,
        and(
          eq(tripDocuments.companyId, nfeDocuments.companyId),
          eq(tripDocuments.nfeDocumentId, nfeDocuments.id),
          isNull(tripDocuments.releasedAt),
        ),
      )
      .innerJoin(
        trips,
        and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
      )
      .leftJoin(
        tripStops,
        and(eq(tripStops.companyId, tripDocuments.companyId), eq(tripStops.id, tripDocuments.stopId)),
      )
      .where(and(...filters))
      .limit(1)

    if (record === undefined) return null

    return {
      documentId: record.documentId,
      separationStatus: record.separationStatus,
      stop:
        record.stopId === null || record.stopLabel === null || record.stopSequence === null
          ? null
          : { id: record.stopId, label: record.stopLabel, sequence: Number(record.stopSequence) },
      tripId: record.tripId,
      tripStatus: record.tripStatus,
    }
  }
}
