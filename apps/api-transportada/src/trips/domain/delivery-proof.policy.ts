/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 156 T15 M7: o teto do arquivo nas rotas multipart do escritório. O corpo inteiro da
 * requisição para em `APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES` (1 MiB, 413 antes da rota), e o
 * roteador não tem teto por rota — então o arquivo para 64 KiB abaixo, a folga dos campos e das
 * fronteiras do multipart. Acima disto e abaixo de 1 MiB, a resposta é 422 `TOO_LARGE`, com o código
 * que a tela sabe explicar. A tela reduz a foto para ~900 KB antes de enviar.
 */
export const OFFICE_PROOF_MAX_BYTES = 960 * 1024

/**
 * ADR-0045 §7: foto é cara em 3G ruim. O teto é declarado, e acima dele a recusa é **explícita e
 * não trava a entrega** — a nota já foi entregue, e perder a confirmação por causa do anexo seria
 * punir o motorista pelo aparelho dele. Spec 212: o mesmo teto do escritório, pelo mesmo motivo —
 * os 2 MB de antes ficavam acima do corpo de 1 MiB, e a foto grande voltava 413 sem código que a
 * app soubesse explicar; o 422 `TOO_LARGE` nunca era alcançado.
 */
export const DELIVERY_PROOF_MAX_BYTES = OFFICE_PROOF_MAX_BYTES

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

/**
 * Spec 156 T15 seg B2: o `content-type` do multipart é o que o cliente disse. A assinatura dos
 * primeiros bytes confere que o arquivo é mesmo a imagem declarada — JPEG `FF D8 FF`, PNG
 * `89 50 4E 47 0D 0A 1A 0A`, WebP `RIFF····WEBP`.
 */
const DELIVERY_PROOF_SIGNATURES: Record<
  DeliveryProofMimeType,
  readonly { readonly bytes: readonly number[]; readonly offset: number }[]
> = {
  'image/jpeg': [{ bytes: [0xff, 0xd8, 0xff], offset: 0 }],
  'image/png': [{ bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], offset: 0 }],
  'image/webp': [
    { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },
    { bytes: [0x57, 0x45, 0x42, 0x50], offset: 8 },
  ],
}

export function matchesDeliveryProofSignature(input: {
  readonly bytes: Uint8Array
  readonly mimeType: DeliveryProofMimeType
}): boolean {
  return DELIVERY_PROOF_SIGNATURES[input.mimeType].every((signature) =>
    signature.bytes.every((byte, index) => input.bytes[signature.offset + index] === byte),
  )
}
