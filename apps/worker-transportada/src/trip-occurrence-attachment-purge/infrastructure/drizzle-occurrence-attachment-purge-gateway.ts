/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, ne, or } from 'drizzle-orm'

import { storedObjects } from '../../database/stored-object.schema.js'
import { tripOccurrenceAttachments } from '../../database/trip-occurrence-attachment.schema.js'
import type { OccurrenceAttachmentPurgeGateway } from '../application/trip-occurrence-attachment-purge-unit.port.js'

export type TripOccurrenceAttachmentPurgeDatabase = ReturnType<typeof createDrizzleProvider>['db']

/** Adaptador Drizzle da porta da unidade — a única camada que fala SQL nesta rotina. */
export function createDrizzleOccurrenceAttachmentPurgeGateway(
  database: TripOccurrenceAttachmentPurgeDatabase,
): OccurrenceAttachmentPurgeGateway {
  return {
    async deleteAttachment(attachmentId) {
      await database
        .delete(tripOccurrenceAttachments)
        .where(eq(tripOccurrenceAttachments.id, attachmentId))
    },

    async findAttachmentByObjectId(objectId) {
      const [attachment] = await database
        .select()
        .from(tripOccurrenceAttachments)
        .where(
          or(
            eq(tripOccurrenceAttachments.storedObjectId, objectId),
            eq(tripOccurrenceAttachments.thumbnailObjectId, objectId),
          ),
        )
        .limit(1)
      return attachment === undefined ? undefined : attachment
    },

    // Ordem determinística por `id`: quem chega pelo original e quem chega pela miniatura travam
    // na mesma ordem, o que evita deadlock entre execuções concorrentes (ajuste 3).
    async lockStoredObjects(ids) {
      const sorted = [...ids].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
      return database
        .select({
          bucket: storedObjects.bucket,
          id: storedObjects.id,
          key: storedObjects.objectKey,
        })
        .from(storedObjects)
        .where(and(inArray(storedObjects.id, sorted), ne(storedObjects.status, 'deleted')))
        .orderBy(storedObjects.id)
        .for('update', { skipLocked: true })
    },

    async markObjectsDeleted(ids) {
      await database
        .update(storedObjects)
        .set({ deletedAt: new Date(), status: 'deleted' })
        .where(inArray(storedObjects.id, ids))
    },

    runInTransaction(work) {
      return database.transaction((transaction) =>
        work(createDrizzleOccurrenceAttachmentPurgeGateway(transaction)),
      )
    },
  }
}
