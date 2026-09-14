/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

export const CONTRACTOR_MAIL_INBOUND_EVENT_TYPE = {
  EMAIL_RECEIVED: 'transportada.contractor.mail.email.received',
} as const

/**
 * Spec 143 T010 (plan.md § Contratos/API/eventos): "Payload de entrada na fila: `{ companyId,
 * providerEmailId }`. O worker busca o resto no Resend." Referência, nunca dado — o corpo, o
 * remetente e o assunto vêm da API do Resend, com a chave; o webhook anônimo nunca é fonte de nada.
 */
export const contractorMailInboundEnvelopeV1Schema = z.strictObject({
  eventId: z.uuid(),
  type: z.literal(CONTRACTOR_MAIL_INBOUND_EVENT_TYPE.EMAIL_RECEIVED),
  version: z.literal(1),
  occurredAt: z.iso.datetime(),
  companyId: z.uuid(),
  correlationId: z.string().trim().min(1).max(128),
  payload: z.strictObject({
    providerEmailId: z.string().trim().min(1),
  }),
})

export type ContractorMailInboundEnvelopeV1 = z.infer<typeof contractorMailInboundEnvelopeV1Schema>
