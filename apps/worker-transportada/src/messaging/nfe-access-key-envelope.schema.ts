/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

export const NFE_ACCESS_KEY_EVENT_TYPE = {
  REQUESTED: 'transportada.nfe.access-key.requested',
} as const

/** Só referência: a chave inteira nunca viaja no envelope nem no log. */
export const nfeAccessKeyEnvelopeV1Schema = z.strictObject({
  eventId: z.uuid(),
  type: z.literal(NFE_ACCESS_KEY_EVENT_TYPE.REQUESTED),
  version: z.literal(1),
  occurredAt: z.iso.datetime(),
  companyId: z.uuid(),
  actorId: z.uuid(),
  correlationId: z.string().trim().min(1).max(128),
  payload: z.strictObject({
    importId: z.uuid(),
    lookupId: z.uuid(),
  }),
})

export type NfeAccessKeyEnvelopeV1 = z.infer<typeof nfeAccessKeyEnvelopeV1Schema>
