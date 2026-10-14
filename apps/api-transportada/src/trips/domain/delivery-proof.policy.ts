/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

import type { TripDeliveryProofProcessingState } from '../../database/trip.schema.js'

/**
 * Spec 156 T15 M7: o teto do arquivo nas rotas multipart do escritório. O corpo inteiro da
 * requisição para em `APPLICATION_MAX_REQUEST_BODY_SIZE_BYTES` (1 MiB, 413 antes da rota), e o
 * roteador não tem teto por rota (só a rota do comprovante do motorista tem, spec 265, para o `original`) —
 * então o arquivo para 64 KiB abaixo, a folga dos campos e das
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

/**
 * Spec 265 (decisão de 14/10/2026): o teto do **original** que sobe sem redução quando o aparelho estourou o
 * orçamento de 8 s. 12 MiB cobrem a câmera de celular com folga; vale **só** para `variant = 'original'` do
 * comprovante do motorista — o corpo da requisição ganha o teto correspondente
 * (`PROOF_ORIGINAL_MAX_REQUEST_BODY_SIZE_BYTES`), e a versão reduzida e o escritório seguem em 960 KiB.
 */
export const PROOF_ORIGINAL_MAX_BYTES = 12 * 1024 * 1024

/**
 * Spec 265 RF3: o cliente declara a variante, o servidor não confia nela para o tamanho nem para o tipo.
 * `reduced` é a foto que o aparelho já reduziu (e a única que o escritório e o app antigo conhecem);
 * `original` é a foto da câmera como saiu, que o worker reduz depois.
 */
export const DELIVERY_PROOF_VARIANTS = ['reduced', 'original'] as const
export type DeliveryProofVariant = (typeof DELIVERY_PROOF_VARIANTS)[number]
export const DEFAULT_DELIVERY_PROOF_VARIANT: DeliveryProofVariant = 'reduced'

export function isDeliveryProofVariant(value: unknown): value is DeliveryProofVariant {
  return typeof value === 'string' && (DELIVERY_PROOF_VARIANTS as readonly string[]).includes(value)
}

/**
 * Spec 265 RF6: o que as leituras publicam do estado do tratamento do arquivo. Coluna nula (o comprovante
 * que sobe já leve e todo o histórico) é `ready` — não há nada a esperar.
 */
export const DELIVERY_PROOF_READY_STATE: TripDeliveryProofProcessingState = 'ready'

export function resolveDeliveryProofProcessingState(
  state: TripDeliveryProofProcessingState | null | undefined,
): TripDeliveryProofProcessingState {
  return state ?? DELIVERY_PROOF_READY_STATE
}

/** Spec 220 RF17 (spec 161 D12): o teto duro da miniatura gerada no cliente — 320 px cabem folgados. */
export const DELIVERY_PROOF_THUMBNAIL_MAX_BYTES = 128 * 1024

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

/**
 * Spec 265 RF3: o tipo **pelos bytes**, para o `original` — o `content-type` do multipart é o que o cliente
 * disse, e o arquivo vai ser decodificado no worker. `null` quando nenhuma das três assinaturas casa
 * (HEIC, PDF, arquivo vazio e o que mais for).
 */
export function detectDeliveryProofMimeType(bytes: Uint8Array): DeliveryProofMimeType | null {
  return (
    DELIVERY_PROOF_MIME_TYPES.find((mimeType) =>
      matchesDeliveryProofSignature({ bytes, mimeType }),
    ) ?? null
  )
}
