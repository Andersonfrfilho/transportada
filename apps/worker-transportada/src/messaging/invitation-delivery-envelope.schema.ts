/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

export const INVITATION_DELIVERY_EVENT_TYPE = {
  CODE_REQUESTED: 'transportada.identity.invitation.code.requested',
} as const

/**
 * O payload carrega referência, nunca o código: o claro fica selado na linha do convite e é aberto
 * aqui na hora de entregar (`security.md` §6). `strictObject` é o que faz um payload com `code`
 * ser recusado em vez de trafegar.
 */
export const invitationDeliveryEnvelopeV1Schema = z.strictObject({
  eventId: z.uuid(),
  type: z.literal(INVITATION_DELIVERY_EVENT_TYPE.CODE_REQUESTED),
  version: z.literal(1),
  occurredAt: z.iso.datetime(),
  companyId: z.uuid(),
  actorId: z.uuid(),
  correlationId: z.string().trim().min(1).max(128),
  payload: z.strictObject({
    invitationId: z.uuid(),
    userId: z.uuid(),
  }),
})

export type InvitationDeliveryEnvelopeV1 = z.infer<typeof invitationDeliveryEnvelopeV1Schema>
