/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, lt } from 'drizzle-orm'

import { tripOccurrenceUploads } from '../../database/trip-occurrence-upload.schema.js'
import type { TripOccurrenceUploadExpireGateway } from '../application/trip-occurrence-upload-expire-unit.port.js'

export type TripOccurrenceUploadExpireDatabase = ReturnType<typeof createDrizzleProvider>['db']

/** Adaptador Drizzle da porta da unidade — a única camada que fala SQL nesta rotina. */
export function createDrizzleTripOccurrenceUploadExpireGateway(
  database: TripOccurrenceUploadExpireDatabase,
): TripOccurrenceUploadExpireGateway {
  return {
    async lockExpiredPendingUpload({ before, id }) {
      const [row] = await database
        .select({
          bucket: tripOccurrenceUploads.bucket,
          id: tripOccurrenceUploads.id,
          key: tripOccurrenceUploads.objectKey,
        })
        .from(tripOccurrenceUploads)
        .where(
          and(
            eq(tripOccurrenceUploads.id, id),
            eq(tripOccurrenceUploads.status, 'pending'),
            lt(tripOccurrenceUploads.expiresAt, before),
          ),
        )
        .limit(1)
        .for('update', { skipLocked: true })

      return row
    },

    async markExpired(id) {
      await database
        .update(tripOccurrenceUploads)
        .set({ status: 'expired' })
        .where(eq(tripOccurrenceUploads.id, id))
    },

    runInTransaction(work) {
      return database.transaction((transaction) =>
        work(createDrizzleTripOccurrenceUploadExpireGateway(transaction)),
      )
    },
  }
}
