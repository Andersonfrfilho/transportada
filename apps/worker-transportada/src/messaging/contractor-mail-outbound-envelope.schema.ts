/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

export const CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE = {
  MESSAGE_SEND_REQUESTED: 'transportada.contractor.mail.message.send.requested',
} as const

/**
 * Spec 143 T009. `plan.md` § "Contratos/API/eventos" descreve o payload de saída como só
 * `{ messageId }` — referência, com o corpo no banco. **Desvio registrado em `evidence.md`:** o
 * `payload` carrega também `toAddress` e `replyToAddress`, porque `contractor_mail_messages` (T003)
 * não tem coluna de destinatário nem guarda o token em claro (RF2 — só o hash). Para as mensagens do
 * P1 (T015) o destinatário sai de `contractor_contacts` via `thread.contractorId`; para o e-mail de
 * teste (`setup_test`, sem contratante) o endereço só existe no instante da requisição HTTP, e
 * viaja aqui porque não há onde mais persisti-lo. Nenhum dos dois é "corpo": o texto da mensagem
 * continua vindo só do banco, pelo `messageId`.
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
    replyToAddress: z.string().trim().min(1),
    toAddress: z.string().trim().min(1),
  }),
})

export type ContractorMailOutboundEnvelopeV1 = z.infer<
  typeof contractorMailOutboundEnvelopeV1Schema
>
