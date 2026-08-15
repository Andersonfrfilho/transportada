/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

export const NFSE_PROCESSING_EVENT_TYPE = {
  INVOICE_CANCEL_REQUESTED: 'transportada.nfse.invoice.cancel.requested',
  INVOICE_ISSUE_REQUESTED: 'transportada.nfse.invoice.issue.requested',
} as const

export const NFSE_PROCESSING_ATTEMPT_KIND = ['issue', 'cancel'] as const

export type NfseProcessingAttemptKind = (typeof NFSE_PROCESSING_ATTEMPT_KIND)[number]

/**
 * O payload carrega referência, nunca conteúdo: o motivo do cancelamento é texto livre do operador
 * e fica na linha da nota, lida na hora de transmitir (`security.md` §6). O token da credencial
 * segue selado no envelope de segredo — nada disso atravessa o broker.
 */
export const nfseProcessingEnvelopeV1Schema = z.strictObject({
  eventId: z.uuid(),
  type: z.enum([
    NFSE_PROCESSING_EVENT_TYPE.INVOICE_ISSUE_REQUESTED,
    NFSE_PROCESSING_EVENT_TYPE.INVOICE_CANCEL_REQUESTED,
  ]),
  version: z.literal(1),
  occurredAt: z.iso.datetime(),
  companyId: z.uuid(),
  actorId: z.uuid(),
  correlationId: z.string().trim().min(1).max(128),
  payload: z.strictObject({
    invoiceId: z.uuid(),
    attemptId: z.uuid(),
    attemptKind: z.enum(NFSE_PROCESSING_ATTEMPT_KIND),
    attemptFingerprint: z.string().trim().min(1).max(256),
    status: z.string().trim().min(1).max(128),
  }),
})

export type NfseProcessingEnvelopeV1 = z.infer<typeof nfseProcessingEnvelopeV1Schema>
