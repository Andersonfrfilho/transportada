/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, isNotNull } from 'drizzle-orm'

import { cteBatchItems, tripDocuments } from '../../database/cte-issuance-execution.schema.js'
import type { TripByBatchItemPort } from '../application/mdfe-auto-issue.port.js'

type WorkerDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleTripByBatchItemRepository(
  database: WorkerDatabase,
): TripByBatchItemPort {
  return {
    async findTripId({ batchItemId, companyId }) {
      // O tenant entra nas duas pontas da junção: item e vínculo de viagem são tabelas diferentes,
      // e uma delas sem filtro atravessaria empresas por um `nfe_document_id` repetido.
      const [row] = await database
        .select({ tripId: tripDocuments.tripId })
        .from(cteBatchItems)
        .innerJoin(
          tripDocuments,
          and(
            eq(tripDocuments.companyId, companyId),
            eq(tripDocuments.nfeDocumentId, cteBatchItems.nfeDocumentId),
          ),
        )
        .where(
          and(
            eq(cteBatchItems.id, batchItemId),
            eq(cteBatchItems.companyId, companyId),
            isNotNull(tripDocuments.nfeDocumentId),
          ),
        )
        .limit(1)

      return row?.tripId ?? null
    },
  }
}
