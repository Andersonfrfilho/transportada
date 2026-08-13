/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

export const PASSWORD_RESET_DELIVERY_EVENT_TYPE = {
  CODE_REQUESTED: 'transportada.identity.password-reset.code.requested',
} as const

/**
 * Igual ao envelope do convite, menos `actorId`: quem pede recuperação de senha não está
 * autenticado, e um campo de ator aqui seria um valor inventado viajando como se fosse verdade.
 *
 * O payload carrega referência, nunca o código (`security.md` §6); `strictObject` é o que faz um
 * payload com `code` ser recusado em vez de trafegar.
 */
export const passwordResetDeliveryEnvelopeV1Schema = z.strictObject({
  eventId: z.uuid(),
  type: z.literal(PASSWORD_RESET_DELIVERY_EVENT_TYPE.CODE_REQUESTED),
  version: z.literal(1),
  occurredAt: z.iso.datetime(),
  companyId: z.uuid(),
  correlationId: z.string().trim().min(1).max(128),
  payload: z.strictObject({
    requestId: z.uuid(),
    userId: z.uuid(),
  }),
})

export type PasswordResetDeliveryEnvelopeV1 = z.infer<typeof passwordResetDeliveryEnvelopeV1Schema>
