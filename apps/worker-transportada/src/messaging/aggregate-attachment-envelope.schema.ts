/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

export const AGGREGATE_ATTACHMENT_EVENT_TYPE = {
  EXTRACTION_REQUESTED: 'transportada.aggregate.attachment.extraction.requested',
} as const

/**
 * ⚠️ Cópia por valor de `AGGREGATE_APPLICATION_ATTACHMENT_TYPES` da api — o worker não importa
 * código-fonte de outra app, e o CHECK do banco mora lá. Tipo novo de um lado é tipo novo do outro:
 * sem isso o envelope recusa uma mensagem que a API acabou de gravar, e o anexo nunca é lido.
 * `test/aggregate-attachment/envelope.contract.ts` guarda a lista.
 */
export const AGGREGATE_ATTACHMENT_TYPES = [
  'address_proof',
  'ccmei',
  'cnh',
  'company_document',
  'crlv',
  'other',
] as const
export type AggregateAttachmentType = (typeof AGGREGATE_ATTACHMENT_TYPES)[number]

/**
 * Sem `actorId`, como o envelope de recuperação de senha: quem anexa é anônimo, e um campo de ator
 * aqui seria um valor inventado viajando como se fosse verdade (ADR-0053).
 *
 * O payload carrega **referência** — bucket e chave —, nunca os bytes (`security.md` §6). Um PDF com
 * CPF e endereço dentro de uma fila é PII em repouso, num lugar sem prazo de descarte. `strictObject`
 * é o que faz um payload com `bytes` ser recusado em vez de trafegar.
 */
export const aggregateAttachmentEnvelopeV1Schema = z.strictObject({
  eventId: z.uuid(),
  type: z.literal(AGGREGATE_ATTACHMENT_EVENT_TYPE.EXTRACTION_REQUESTED),
  version: z.literal(1),
  occurredAt: z.iso.datetime(),
  companyId: z.uuid(),
  correlationId: z.string().trim().min(1).max(128),
  payload: z.strictObject({
    attachmentId: z.uuid(),
    bucket: z.string().trim().min(1),
    objectKey: z.string().trim().min(1),
    type: z.enum(AGGREGATE_ATTACHMENT_TYPES),
  }),
})

export type AggregateAttachmentEnvelopeV1 = z.infer<typeof aggregateAttachmentEnvelopeV1Schema>
