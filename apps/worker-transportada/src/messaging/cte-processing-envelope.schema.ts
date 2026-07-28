/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

export const CTE_PROCESSING_EVENT_TYPE = {
  ITEM_CANCEL_REQUESTED: 'transportada.cte.item.cancel.requested',
  ITEM_ISSUE_REQUESTED: 'transportada.cte.item.issue.requested',
} as const

export const CTE_PROCESSING_ATTEMPT_KIND = ['issue', 'reprocess', 'cancel'] as const

export type CteProcessingAttemptKind = (typeof CTE_PROCESSING_ATTEMPT_KIND)[number]

export const cteProcessingEnvelopeV1Schema = z.strictObject({
  eventId: z.uuid(),
  type: z.enum([
    CTE_PROCESSING_EVENT_TYPE.ITEM_ISSUE_REQUESTED,
    CTE_PROCESSING_EVENT_TYPE.ITEM_CANCEL_REQUESTED,
  ]),
  version: z.literal(1),
  occurredAt: z.iso.datetime(),
  companyId: z.uuid(),
  actorId: z.uuid(),
  correlationId: z.string().trim().min(1).max(128),
  payload: z.strictObject({
    batchItemId: z.uuid(),
    batchId: z.uuid(),
    attemptId: z.uuid(),
    attemptKind: z.enum(CTE_PROCESSING_ATTEMPT_KIND),
    attemptFingerprint: z.string().trim().min(1).max(256),
    status: z.string().trim().min(1).max(128),
  }),
})

export type CteProcessingEnvelopeV1 = z.infer<typeof cteProcessingEnvelopeV1Schema>
