/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265: as réguas do tratamento do comprovante enviado sem redução (`variant = original`).
 * O worker não importa código de outra app, então a régua da 212 / 213 / 220 RF17 é cópia por valor do
 * aparelho (`proofPhotoReduction.service.ts`) e da API (`delivery-proof.policy.ts`);
 * `test/delivery-proof-processing/constants.contract.ts` guarda os números.
 */

/** O nome do evento que a API grava no outbox e o relay publica (RF4). */
export const DELIVERY_PROOF_PROCESSING_EVENT_TYPE = {
  REQUESTED: 'transportada.delivery-proof.processing.requested',
} as const

/** Cópia de `PROOF_ORIGINAL_MAX_BYTES` da API: nem o worker baixa o que a API não aceitaria. */
export const PROOF_ORIGINAL_MAX_BYTES = 12 * 1024 * 1024

/** Régua da 212: lado maior 2000 px, JPEG em degraus de qualidade até ~900 KiB, teto de 960 KiB. */
export const PROOF_REDUCED_MAX_SIDE = 2000
export const PROOF_REDUCED_TARGET_BYTES = 900 * 1024
export const PROOF_REDUCED_MAX_BYTES = 960 * 1024
export const PROOF_REDUCED_START_QUALITY = 85
export const PROOF_REDUCED_MIN_QUALITY = 45
export const PROOF_QUALITY_STEP = 8
/** Quando o piso de qualidade ainda estoura o teto, o lado encolhe por este fator, no máximo duas vezes. */
export const PROOF_SIDE_SHRINK_FACTOR = 0.8
export const PROOF_MAX_SIDE_SHRINKS = 3

/** Spec 213 / 220 RF17: miniatura de 320 px, qualidade 0,7, alvo 60 KiB, teto 128 KiB. */
export const PROOF_THUMBNAIL_MAX_SIDE = 320
export const PROOF_THUMBNAIL_START_QUALITY = 70
export const PROOF_THUMBNAIL_MIN_QUALITY = 30
export const PROOF_THUMBNAIL_TARGET_BYTES = 60 * 1024
export const PROOF_THUMBNAIL_MAX_BYTES = 128 * 1024

/**
 * RNF1 (anti decompression bomb): o teto de pixels é conferido no **cabeçalho**, antes de alocar um
 * único pixel. 40 MP (RGBA, 160 MiB) cobre a câmera de 48 MP em modo binado e o 12 MP com folga; o
 * Bun ignora `resourceLimits` da thread, então este teto e o de bytes são a defesa.
 */
export const PROOF_MAX_PIXELS = 40_000_000

/** O prazo da thread: decodificar 12 MP, orientar, ler o código e reencodar 2 vezes cabe em segundos. */
export const PROOF_IMAGE_BUDGET_MILLISECONDS = 45_000

export const PROOF_REDUCED_MIME_TYPE = 'image/jpeg'
export const PROOF_OBJECT_PURPOSE = 'delivery_proof'
export const PROOF_THUMBNAIL_OBJECT_PURPOSE = 'trip_delivery_proof_thumbnail'

/** Os formatos que a API aceita no `original` (assinatura dos bytes) e o decodificador wasm lê. */
export const PROOF_SUPPORTED_MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type ProofSupportedMediaType = (typeof PROOF_SUPPORTED_MEDIA_TYPES)[number]

/**
 * `processing_error` é **só código** (coluna `varchar(64)`): nunca texto de erro, nome de arquivo nem
 * EXIF. Os `permanent` não adiantam repetir; os demais gastam as tentativas do trilho.
 */
export const DELIVERY_PROOF_PROCESSING_ERROR_CODES = {
  imageTooLargePixels: 'IMAGE_TOO_LARGE_PIXELS',
  imageUnreadable: 'IMAGE_UNREADABLE',
  imageUnsupported: 'IMAGE_UNSUPPORTED',
  originalMissing: 'ORIGINAL_MISSING',
  originalTooLarge: 'ORIGINAL_TOO_LARGE',
  processingAbandoned: 'PROCESSING_ABANDONED',
  reductionTooLarge: 'REDUCTION_TOO_LARGE',
  thumbnailTooLarge: 'THUMBNAIL_TOO_LARGE',
} as const
export type DeliveryProofProcessingErrorCode =
  (typeof DELIVERY_PROOF_PROCESSING_ERROR_CODES)[keyof typeof DELIVERY_PROOF_PROCESSING_ERROR_CODES]
