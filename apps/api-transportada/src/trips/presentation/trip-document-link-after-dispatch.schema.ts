/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 257 D2: o corpo e a resposta de `POST /trips/:id/documents/after-dispatch`. O corpo é estrito:
 * nada além das notas e do motivo entra.
 */
import { z } from 'zod'

import { TRIP_DOCUMENT_LINK_EVENT_REASON_MAXIMUM_LENGTH } from '../../database/trip.schema.js'
import { parseBody } from '../../http/request-parsing.service.js'
import type { LinkTripDocumentsAfterDispatchResult } from '../application/trip-document-link-after-dispatch.types.js'

export const MAX_DOCUMENTS_AFTER_DISPATCH = 300

export const linkTripDocumentsAfterDispatchSchema = z
  .object({
    nfeDocumentIds: z.array(z.uuid()).min(1).max(MAX_DOCUMENTS_AFTER_DISPATCH),
    reason: z.string().trim().min(1).max(TRIP_DOCUMENT_LINK_EVENT_REASON_MAXIMUM_LENGTH),
  })
  .strict()

export type LinkTripDocumentsAfterDispatchBody = z.infer<
  typeof linkTripDocumentsAfterDispatchSchema
>

export async function parseLinkTripDocumentsAfterDispatchRequest(
  request: Request,
): Promise<LinkTripDocumentsAfterDispatchBody> {
  return parseBody(linkTripDocumentsAfterDispatchSchema, request)
}

/** Só o que o painel precisa: o que entrou, o que foi pulado e os dois avisos fiscais. */
export function serializeTripDocumentLink(link: LinkTripDocumentsAfterDispatchResult) {
  return {
    createdStopIds: link.createdStopIds,
    documentsWithoutCte: link.documentsWithoutCte,
    eventId: link.eventId,
    linked: link.linked.map((document) => ({
      nfeDocumentId: document.nfeDocumentId,
      stopId: document.stopId,
      tripDocumentId: document.tripDocumentId,
    })),
    mdfeDocumentDivergence: link.mdfeDocumentDivergence,
    skipped: link.skipped.map((document) => ({
      nfeDocumentId: document.nfeDocumentId,
      reason: document.reason,
    })),
  }
}
