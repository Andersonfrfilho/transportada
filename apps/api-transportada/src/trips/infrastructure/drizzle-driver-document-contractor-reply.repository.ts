/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T5.4: the contractor reply status of the occurrences of the requested notes, in one query and
 * always with `company_id` on both tables. Which notes are the driver's is decided by the use case; here only
 * ids arrive. Only the occurrence id and the status leave: the reply row also holds the configuration copy,
 * the operator note and the attachment, none of which belongs to the driver.
 */
import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'

import {
  occurrenceContractorReplies,
  tripDocumentOccurrences,
} from '../../database/database.schema.js'
import type {
  DriverDocumentContractorReply,
  DriverDocumentContractorReplyPort,
} from '../application/driver-document-contractor-reply.port.js'
import type { TripQueryable } from './trip-queryable.type.js'

export class DrizzleDriverDocumentContractorReplyRepository
  implements DriverDocumentContractorReplyPort
{
  constructor(private readonly database: TripQueryable) {}

  async list(input: {
    readonly companyId: string
    readonly documentIds: readonly string[]
  }): Promise<readonly DriverDocumentContractorReply[]> {
    if (input.documentIds.length === 0) return []
    const rows = await this.database
      .select({
        documentId: tripDocumentOccurrences.tripDocumentId,
        occurrenceId: tripDocumentOccurrences.id,
        status: occurrenceContractorReplies.status,
      })
      .from(tripDocumentOccurrences)
      .innerJoin(
        occurrenceContractorReplies,
        and(
          eq(occurrenceContractorReplies.companyId, tripDocumentOccurrences.companyId),
          eq(occurrenceContractorReplies.occurrenceId, tripDocumentOccurrences.id),
        ),
      )
      .where(
        and(
          eq(tripDocumentOccurrences.companyId, input.companyId),
          isNotNull(tripDocumentOccurrences.tripDocumentId),
          inArray(tripDocumentOccurrences.tripDocumentId, [...input.documentIds]),
        ),
      )
      .orderBy(asc(tripDocumentOccurrences.createdAt), asc(tripDocumentOccurrences.id))
    return rows.flatMap((row) =>
      row.documentId === null
        ? []
        : [{ documentId: row.documentId, occurrenceId: row.occurrenceId, status: row.status }],
    )
  }
}
