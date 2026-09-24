/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, asc, eq, lt } from 'drizzle-orm'

import { tripOccurrenceUploads } from '../../database/trip-occurrence-upload.schema.js'
import { expireOccurrenceUploadUnit } from '../application/trip-occurrence-upload-expire-unit.service.js'
import type { DeleteStoredObjectBytes } from '../application/trip-occurrence-upload-expire-unit.port.js'
import type { ExpireOccurrenceUploadBatch } from '../application/trip-occurrence-upload-expire.port.js'
import { createDrizzleTripOccurrenceUploadExpireGateway } from './drizzle-trip-occurrence-upload-expire-gateway.js'
import type { TripOccurrenceUploadExpireDatabase } from './drizzle-trip-occurrence-upload-expire-gateway.js'

export type { TripOccurrenceUploadExpireDatabase } from './drizzle-trip-occurrence-upload-expire-gateway.js'

export function createDrizzleExpireOccurrenceUploadBatch(input: {
  readonly database: TripOccurrenceUploadExpireDatabase
  readonly deleteObject: DeleteStoredObjectBytes
}): ExpireOccurrenceUploadBatch {
  const gateway = createDrizzleTripOccurrenceUploadExpireGateway(input.database)

  return async ({ before, limit }) => {
    // Leitura fora de transação: cada candidato abre a própria transação — o lote inteiro não pode
    // travar atrás de I/O de storage (mesmo desenho de `trip-occurrence-attachment-purge`).
    const candidates = await input.database
      .select({ id: tripOccurrenceUploads.id })
      .from(tripOccurrenceUploads)
      .where(
        and(eq(tripOccurrenceUploads.status, 'pending'), lt(tripOccurrenceUploads.expiresAt, before)),
      )
      .orderBy(asc(tripOccurrenceUploads.expiresAt))
      .limit(limit)

    if (candidates.length === 0) return { expired: 0, failed: 0, missing: 0, processed: 0 }

    let expired = 0
    let missing = 0
    let failed = 0

    for (const candidate of candidates) {
      const outcome = await expireOccurrenceUploadUnit({
        before,
        deleteObject: input.deleteObject,
        gateway,
        id: candidate.id,
      })
      if (outcome.result === 'expired') expired += 1
      else if (outcome.result === 'missing') missing += 1
      else failed += 1
    }

    return { expired, failed, missing, processed: candidates.length }
  }
}
