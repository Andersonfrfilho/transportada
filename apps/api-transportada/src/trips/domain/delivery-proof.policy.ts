/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * ADR-0045 §7: foto é cara em 3G ruim. O teto é declarado, e acima dele a recusa é **explícita e
 * não trava a entrega** — a nota já foi entregue, e perder a confirmação por causa do anexo seria
 * punir o motorista pelo aparelho dele.
 */
export const DELIVERY_PROOF_MAX_BYTES = 2_000_000

/** O que o celular produz: foto comprimida e o traço da assinatura. Nada de PDF nem de vídeo. */
export const DELIVERY_PROOF_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type DeliveryProofMimeType = (typeof DELIVERY_PROOF_MIME_TYPES)[number]

export function isDeliveryProofMimeType(value: string): value is DeliveryProofMimeType {
  return (DELIVERY_PROOF_MIME_TYPES as readonly string[]).includes(value)
}

/**
 * A chave do objeto **não leva nome de pessoa** (`security.md` §7): quem lista o bucket não pode
 * aprender quem recebeu o quê só pelo caminho. Identificadores opacos, e só.
 */
export function buildDeliveryProofObjectKey(input: {
  readonly companyId: string
  readonly eventId: string
  readonly objectId: string
}): string {
  return `tenants/${input.companyId}/delivery-proofs/${input.eventId}/${input.objectId}`
}
