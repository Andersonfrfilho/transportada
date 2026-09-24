/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T14a: leitor de `RedeliveryProposalPort` — só `select`, nenhuma transação, nenhum lock.
 * `readOccurrenceDocument` liga `trip_document_occurrences` a `trip_documents` pelo
 * `trip_document_id` já existente (spec 079), sem tabela nova.
 */
import { and, asc, eq, isNull, ne } from 'drizzle-orm'

import {
  tripDocumentOccurrences,
  tripDocuments,
  tripStops,
  trips,
  type TripStatus,
} from '../../database/trip.schema.js'
import type {
  RedeliveryProposalOccurrenceDocument,
  RedeliveryProposalPort,
} from '../application/redelivery-proposal.use-case.js'
import type { TripDatabase } from './trip-queryable.type.js'

export class DrizzleRedeliveryProposalRepository implements RedeliveryProposalPort {
  public constructor(private readonly database: TripDatabase) {}

  public async readOccurrenceDocument(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<RedeliveryProposalOccurrenceDocument | null> {
    const [row] = await this.database
      .select({
        releasedAt: tripDocuments.releasedAt,
        stopId: tripDocuments.stopId,
        tripDocumentId: tripDocuments.id,
        tripId: tripDocuments.tripId,
      })
      .from(tripDocumentOccurrences)
      .innerJoin(
        tripDocuments,
        and(
          eq(tripDocuments.companyId, tripDocumentOccurrences.companyId),
          eq(tripDocuments.id, tripDocumentOccurrences.tripDocumentId),
        ),
      )
      .where(
        and(
          eq(tripDocumentOccurrences.companyId, input.companyId),
          eq(tripDocumentOccurrences.id, input.occurrenceId),
        ),
      )
      .limit(1)
    return row ?? null
  }

  public async readTripStatus(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<TripStatus | null> {
    const [row] = await this.database
      .select({ status: trips.status })
      .from(trips)
      .where(and(eq(trips.companyId, input.companyId), eq(trips.id, input.tripId)))
      .limit(1)
    return row?.status ?? null
  }

  public async readTripStopIds(input: {
    readonly companyId: string
    readonly tripId: string
  }): Promise<readonly string[]> {
    const rows = await this.database
      .select({ id: tripStops.id })
      .from(tripStops)
      .where(and(eq(tripStops.companyId, input.companyId), eq(tripStops.tripId, input.tripId)))
      .orderBy(asc(tripStops.sequence))
    return rows.map((row) => row.id)
  }

  public async countOtherLiveDocumentsAtStop(input: {
    readonly companyId: string
    readonly excludingTripDocumentId: string
    readonly stopId: string
  }): Promise<number> {
    const rows = await this.database
      .select({ id: tripDocuments.id })
      .from(tripDocuments)
      .where(
        and(
          eq(tripDocuments.companyId, input.companyId),
          eq(tripDocuments.stopId, input.stopId),
          isNull(tripDocuments.releasedAt),
          ne(tripDocuments.id, input.excludingTripDocumentId),
        ),
      )
    return rows.length
  }
}
