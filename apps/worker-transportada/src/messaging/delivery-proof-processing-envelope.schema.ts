/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { DELIVERY_PROOF_PROCESSING_EVENT_TYPE } from '../delivery-proof-processing/domain/delivery-proof-processing.constant.js'

/**
 * Spec 265 RF4/RF7: o pedido de tratamento do comprovante enviado sem redução. O payload é a mesma
 * **referência** que a API grava em `delivery_proof_outbox.payload` — empresa, comprovante, chave do
 * anexo, variante e chave do objeto —, nunca os bytes: foto de canhoto na fila seria dado de terceiro
 * em repouso, sem prazo de descarte (`security.md` §6). `strictObject` recusa um payload com `bytes`.
 *
 * `variant` é só `original`: o `reduced` não gera evento (a leitura do código de barras dele segue na
 * rotina `trip.canhoto.read`). `attachmentKey` pode ser vazia — o app antigo não a manda.
 */
export const deliveryProofProcessingEnvelopeV1Schema = z.strictObject({
  eventId: z.uuid(),
  type: z.literal(DELIVERY_PROOF_PROCESSING_EVENT_TYPE.REQUESTED),
  version: z.literal(1),
  occurredAt: z.iso.datetime(),
  companyId: z.uuid(),
  correlationId: z.string().trim().min(1).max(128),
  payload: z.strictObject({
    attachmentKey: z.string().max(256),
    objectKey: z.string().trim().min(1),
    proofId: z.uuid(),
    variant: z.literal('original'),
  }),
})

export type DeliveryProofProcessingEnvelopeV1 = z.infer<
  typeof deliveryProofProcessingEnvelopeV1Schema
>
