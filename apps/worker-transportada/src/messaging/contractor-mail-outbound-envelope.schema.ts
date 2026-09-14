/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

export const CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE = {
  MESSAGE_SEND_REQUESTED: 'transportada.contractor.mail.message.send.requested',
} as const

/**
 * Correção pós-entrega da T009 (spec 143). O `plan.md` § "Contratos/API/eventos" sempre pediu só
 * `{ messageId }` — referência, com o corpo no banco (§6 do baseline de segurança: job carrega
 * referência, nunca dado). A primeira versão desta task desviou disso (endereço e token em claro no
 * payload) para contornar uma lacuna real do schema — `contractor_mail_messages` não tinha
 * destinatário nem assunto —, mas isso pôs dado pessoal e o token de resposta na fila e na fila
 * `dead`. A correção fecha a lacuna do lado certo: `subject`/`to_addresses` viraram colunas da
 * mensagem, e o `Reply-To` passou a ser **derivado** pelo worker a partir da configuração
 * (`reply-token.policy.ts`) — nada disso precisa mais atravessar o broker.
 */
export const contractorMailOutboundEnvelopeV1Schema = z.strictObject({
  eventId: z.uuid(),
  type: z.literal(CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE.MESSAGE_SEND_REQUESTED),
  version: z.literal(1),
  occurredAt: z.iso.datetime(),
  companyId: z.uuid(),
  correlationId: z.string().trim().min(1).max(128),
  payload: z.strictObject({
    messageId: z.uuid(),
  }),
})

export type ContractorMailOutboundEnvelopeV1 = z.infer<
  typeof contractorMailOutboundEnvelopeV1Schema
>
