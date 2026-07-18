/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

export const syntheticMessageEnvelopeV1Schema = z.strictObject({
  eventId: z.uuid(),
  type: z.literal('transportada.synthetic'),
  version: z.literal(1),
  occurredAt: z.iso.datetime(),
  companyId: z.uuid(),
  correlationId: z.string().trim().min(1).max(128),
  payload: z.strictObject({
    operation: z.string().trim().min(1).max(128),
  }),
})

export type SyntheticMessageEnvelopeV1 = z.infer<typeof syntheticMessageEnvelopeV1Schema>
