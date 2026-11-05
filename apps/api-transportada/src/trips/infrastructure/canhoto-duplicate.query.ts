/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF26: a mesma imagem (SHA-256 do conteúdo) já anexada como canhoto de alguma nota da empresa.
 */
import { and, desc, eq, isNotNull } from 'drizzle-orm'

import { storedObjects } from '../../database/storage.schema.js'
import { tripDeliveryProofs, tripStopEvents } from '../../database/trip.schema.js'
import type { AttachedCanhoto } from '../application/canhoto-attachment.types.js'
import { PHOTO_PROOF_KIND } from '../domain/delivery-event.constant.js'
import type { TripQueryable } from './trip-queryable.type.js'

export async function findCanhotoByHash(
  executor: TripQueryable,
  input: { readonly companyId: string; readonly sha256: string },
): Promise<AttachedCanhoto | null> {
  const [record] = await executor
    .select({
      attachedAt: tripDeliveryProofs.createdAt,
      documentId: tripStopEvents.tripDocumentId,
      proofId: tripDeliveryProofs.id,
    })
    .from(tripDeliveryProofs)
    .innerJoin(
      storedObjects,
      and(
        eq(storedObjects.companyId, tripDeliveryProofs.companyId),
        eq(storedObjects.id, tripDeliveryProofs.objectId),
      ),
    )
    .innerJoin(
      tripStopEvents,
      and(
        eq(tripStopEvents.companyId, tripDeliveryProofs.companyId),
        eq(tripStopEvents.id, tripDeliveryProofs.stopEventId),
      ),
    )
    .where(
      and(
        eq(tripDeliveryProofs.companyId, input.companyId),
        eq(tripDeliveryProofs.kind, PHOTO_PROOF_KIND),
        eq(storedObjects.companyId, input.companyId),
        eq(storedObjects.sha256, input.sha256),
        eq(storedObjects.purpose, 'delivery_proof'),
        isNotNull(tripStopEvents.tripDocumentId),
      ),
    )
    .orderBy(desc(tripDeliveryProofs.createdAt))
    .limit(1)

  if (record === undefined || record.documentId === null) return null
  return { attachedAt: record.attachedAt, documentId: record.documentId, proofId: record.proofId }
}
