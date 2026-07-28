/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

export const MDFE_PROCESSING_EVENT_TYPE = {
  MANIFEST_CANCEL_REQUESTED: 'transportada.mdfe.manifest.cancel.requested',
  MANIFEST_CLOSE_REQUESTED: 'transportada.mdfe.manifest.close.requested',
  MANIFEST_ISSUE_REQUESTED: 'transportada.mdfe.manifest.issue.requested',
} as const

export const MDFE_PROCESSING_ATTEMPT_KIND = ['issue', 'close', 'cancel'] as const

export type MdfeProcessingAttemptKind = (typeof MDFE_PROCESSING_ATTEMPT_KIND)[number]

export const mdfeProcessingEnvelopeV1Schema = z.strictObject({
  eventId: z.uuid(),
  type: z.enum([
    MDFE_PROCESSING_EVENT_TYPE.MANIFEST_ISSUE_REQUESTED,
    MDFE_PROCESSING_EVENT_TYPE.MANIFEST_CLOSE_REQUESTED,
    MDFE_PROCESSING_EVENT_TYPE.MANIFEST_CANCEL_REQUESTED,
  ]),
  version: z.literal(1),
  occurredAt: z.iso.datetime(),
  companyId: z.uuid(),
  actorId: z.uuid(),
  correlationId: z.string().trim().min(1).max(128),
  payload: z.strictObject({
    manifestId: z.uuid(),
    attemptId: z.uuid(),
    attemptKind: z.enum(MDFE_PROCESSING_ATTEMPT_KIND),
    attemptFingerprint: z.string().trim().min(1).max(256),
    status: z.string().trim().min(1).max(128),
  }),
})

export type MdfeProcessingEnvelopeV1 = z.infer<typeof mdfeProcessingEnvelopeV1Schema>
