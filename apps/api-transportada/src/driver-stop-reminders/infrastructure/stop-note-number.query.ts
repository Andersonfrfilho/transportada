/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, isNull } from 'drizzle-orm'

import { nfeDocuments } from '../../database/nfe.schema.js'
import { tripDocuments } from '../../database/trip.schema.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'

/** A primeira nota ainda aberta da parada (a que o lembrete mostra), ou `undefined` quando nenhuma está aberta. */
export function createStopNoteNumberReader(executor: TripQueryable) {
  return async (params: {
    readonly companyId: string
    readonly tripStopId: string
  }): Promise<string | undefined> => {
    const [row] = await executor
      .select({ number: nfeDocuments.number })
      .from(tripDocuments)
      .innerJoin(
        nfeDocuments,
        and(
          eq(nfeDocuments.companyId, tripDocuments.companyId),
          eq(nfeDocuments.id, tripDocuments.nfeDocumentId),
        ),
      )
      .where(
        and(
          eq(tripDocuments.companyId, params.companyId),
          eq(tripDocuments.stopId, params.tripStopId),
          isNull(tripDocuments.releasedAt),
          isNull(tripDocuments.deliveredAt),
          isNull(tripDocuments.returnedAt),
        ),
      )
      .orderBy(asc(nfeDocuments.number))
      .limit(1)
    return row?.number
  }
}
