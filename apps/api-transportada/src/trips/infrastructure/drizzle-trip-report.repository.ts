/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, count, eq, inArray, isNull, ne, notExists, sql } from 'drizzle-orm'

import { contractors } from '../../database/delivery-client.schema.js'
import { freightCalculations } from '../../database/freight.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import {
  tripDocuments,
  trips,
  type TripDocumentSeparationStatus,
} from '../../database/trip.schema.js'
import type {
  TripReportPort,
  TripReportRecord,
  TripReportScopeParams,
} from '../application/trip-report.port.js'
import type {
  ListTripReportFacetsParams,
  TripReportFacetEmitter,
  TripReportFacetPlaceKind,
  TripReportFacetSide,
  TripReportQuery,
} from '../domain/trip-report.types.js'
import type { TripDatabase } from './trip-queryable.type.js'
import { selectFacetEmitters, selectFacetPlaces } from './trip-report-facets.query.js'
import {
  REPORT_ORDER,
  buildTripReportBase,
  buildTripReportConditions,
  reportDocument,
  reportEmitter,
  reportRecipient,
} from './trip-report.query.js'

const TRIP_CREATED_AT_MICROSECONDS = sql<string>`to_char(${trips.createdAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

export class DrizzleTripReportRepository implements TripReportPort {
  constructor(private readonly database: TripDatabase) {}

  async countRows(params: TripReportScopeParams): Promise<number> {
    const { address, emitterAddress, query } = buildTripReportBase(this.database, () => ({
      total: count(),
    }))
    const [row] = await query.where(
      and(
        ...buildTripReportConditions({
          address,
          companyId: params.companyId,
          cursor: undefined,
          emitterAddress,
          filters: params.filters,
        }),
      ),
    )
    return Number(row?.total ?? 0)
  }

  listFacetEmitters(
    params: ListTripReportFacetsParams,
  ): Promise<readonly TripReportFacetEmitter[]> {
    return selectFacetEmitters(this.database, params)
  }

  listFacetPlaces(
    params: ListTripReportFacetsParams & {
      readonly kind: TripReportFacetPlaceKind
      readonly side: TripReportFacetSide
    },
  ): Promise<readonly string[]> {
    return selectFacetPlaces(this.database, params)
  }

  async listRows(params: {
    readonly companyId: string
    readonly query: TripReportQuery
  }): Promise<readonly TripReportRecord[]> {
    const { address, emitterAddress, query } = buildTripReportBase(
      this.database,
      (recipientAddress) => ({
        accessKey: reportDocument.accessKey,
        amount: reportDocument.totalValue,
        contractorName: sql<string>`coalesce(${contractors.displayName}, ${reportEmitter.legalName}, ${reportEmitter.tradeName})`,
        deliveredAt: tripDocuments.deliveredAt,
        documentNumber: reportDocument.number,
        documentSeries: reportDocument.series,
        documentStatus: tripDocuments.separationStatus,
        recipientCity: recipientAddress.city,
        recipientName: sql<string>`coalesce(${reportRecipient.legalName}, ${reportRecipient.tradeName}, '')`,
        recipientState: recipientAddress.state,
        returnReason: tripDocuments.returnReason,
        returnedAt: tripDocuments.returnedAt,
        tripCreatedAt: TRIP_CREATED_AT_MICROSECONDS,
        tripDocumentId: tripDocuments.id,
        tripId: trips.id,
        tripStatus: trips.status,
      }),
    )
    const rows = await query
      .where(
        and(
          ...buildTripReportConditions({
            address,
            companyId: params.companyId,
            cursor: params.query.cursor,
            emitterAddress,
            filters: params.query.filters,
          }),
        ),
      )
      .orderBy(...REPORT_ORDER)
      .limit(params.query.limit)
    return rows as unknown as readonly TripReportRecord[]
  }

  async listDocumentStatusesByTrip(params: {
    readonly companyId: string
    readonly tripIds: readonly string[]
  }): Promise<ReadonlyMap<string, readonly TripDocumentSeparationStatus[]>> {
    const statusesByTrip = new Map<string, TripDocumentSeparationStatus[]>()
    if (params.tripIds.length === 0) return statusesByTrip

    const rows = await this.database
      .select({ status: tripDocuments.separationStatus, tripId: tripDocuments.tripId })
      .from(tripDocuments)
      .where(
        and(
          eq(tripDocuments.companyId, params.companyId),
          inArray(tripDocuments.tripId, [...params.tripIds]),
          isNull(tripDocuments.releasedAt),
        ),
      )
    for (const row of rows) {
      statusesByTrip.set(row.tripId, [...(statusesByTrip.get(row.tripId) ?? []), row.status])
    }
    return statusesByTrip
  }

  async countDocumentsWithoutTrip(params: {
    readonly companyId: string
    readonly documentIds: readonly string[]
  }): Promise<number> {
    if (params.documentIds.length === 0) return 0

    const reachableThroughTrip = this.database
      .select({ one: sql`1` })
      .from(tripDocuments)
      .innerJoin(
        trips,
        and(eq(trips.companyId, tripDocuments.companyId), eq(trips.id, tripDocuments.tripId)),
      )
      .leftJoin(
        freightCalculations,
        and(
          eq(freightCalculations.companyId, tripDocuments.companyId),
          eq(freightCalculations.id, tripDocuments.freightCalculationId),
        ),
      )
      .where(
        and(
          eq(tripDocuments.companyId, nfeDocuments.companyId),
          isNull(tripDocuments.releasedAt),
          ne(trips.status, 'cancelled'),
          sql`coalesce(${tripDocuments.nfeDocumentId}, ${freightCalculations.nfeDocumentId}) = ${nfeDocuments.id}`,
        ),
      )
    const [row] = await this.database
      .select({ total: count() })
      .from(nfeDocuments)
      .where(
        and(
          eq(nfeDocuments.companyId, params.companyId),
          inArray(nfeDocuments.id, [...params.documentIds]),
          notExists(reachableThroughTrip),
        ),
      )
    return row?.total ?? 0
  }
}
