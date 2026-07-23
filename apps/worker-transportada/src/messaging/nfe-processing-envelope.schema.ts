/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

export const NFE_PROCESSING_EVENT_TYPE = {
  DISTRIBUTION_REQUESTED: 'transportada.nfe.distribution.requested',
  IMPORT_REQUESTED: 'transportada.nfe.import.requested',
} as const

export const nfeProcessingEnvelopeV1Schema = z.strictObject({
  eventId: z.uuid(),
  type: z.enum([
    NFE_PROCESSING_EVENT_TYPE.IMPORT_REQUESTED,
    NFE_PROCESSING_EVENT_TYPE.DISTRIBUTION_REQUESTED,
  ]),
  version: z.literal(1),
  occurredAt: z.iso.datetime(),
  companyId: z.uuid(),
  actorId: z.uuid(),
  correlationId: z.string().trim().min(1).max(128),
  payload: z.strictObject({
    importId: z.uuid(),
  }),
})

export type NfeProcessingEnvelopeV1 = z.infer<typeof nfeProcessingEnvelopeV1Schema>
