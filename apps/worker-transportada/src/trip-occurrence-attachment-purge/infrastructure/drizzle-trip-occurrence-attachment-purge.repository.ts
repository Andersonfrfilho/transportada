/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, inArray, lt, ne } from 'drizzle-orm'

import { storedObjects } from '../../database/stored-object.schema.js'
import { purgeOccurrenceAttachmentUnit } from '../application/trip-occurrence-attachment-purge-unit.service.js'
import type { DeleteStoredObjectBytes } from '../application/trip-occurrence-attachment-purge-unit.port.js'
import { TRIP_OCCURRENCE_ATTACHMENT_STORAGE_PURPOSES } from '../domain/trip-occurrence-attachment-purge.constant.js'
import type { PurgeOccurrenceAttachmentBatch } from '../application/trip-occurrence-attachment-purge.port.js'
import { createDrizzleOccurrenceAttachmentPurgeGateway } from './drizzle-occurrence-attachment-purge-gateway.js'
import type { TripOccurrenceAttachmentPurgeDatabase } from './drizzle-occurrence-attachment-purge-gateway.js'

export type { TripOccurrenceAttachmentPurgeDatabase } from './drizzle-occurrence-attachment-purge-gateway.js'

export function createDrizzlePurgeOccurrenceAttachmentBatch(input: {
  readonly database: TripOccurrenceAttachmentPurgeDatabase
  readonly deleteObject: DeleteStoredObjectBytes
}): PurgeOccurrenceAttachmentBatch {
  const gateway = createDrizzleOccurrenceAttachmentPurgeGateway(input.database)

  return async ({ before, limit }) => {
    // Leitura fora de transação: é o índice parcial `stored_objects_purpose_retention_idx`, barata,
    // e cada candidato abre a própria transação — o lote inteiro não pode travar atrás de I/O.
    const candidates = await input.database
      .select({ id: storedObjects.id })
      .from(storedObjects)
      .where(
        and(
          inArray(storedObjects.purpose, TRIP_OCCURRENCE_ATTACHMENT_STORAGE_PURPOSES),
          ne(storedObjects.status, 'deleted'),
          lt(storedObjects.retentionUntil, before),
        ),
      )
      .orderBy(storedObjects.id)
      .limit(limit)

    if (candidates.length === 0) return { deleted: 0, failed: 0, missing: 0, processed: 0 }

    let deleted = 0
    let missing = 0
    let failed = 0

    for (const candidate of candidates) {
      const outcome = await purgeOccurrenceAttachmentUnit({
        deleteObject: input.deleteObject,
        gateway,
        objectId: candidate.id,
      })
      if (outcome.result === 'deleted') deleted += 1
      else if (outcome.result === 'missing') missing += 1
      else failed += 1
    }

    return { deleted, failed, missing, processed: candidates.length }
  }
}
