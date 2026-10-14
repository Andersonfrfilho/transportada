/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 RF5: o tratamento da imagem do comprovante, sem tocar em `worker_threads` — a thread
 * (`delivery-proof-image.worker.ts`) só o chama, e o contrato o roda no processo de teste com o codec
 * real ou com um dublê. Decodifica **uma vez**, orienta, lê o código de barras sobre o **original** em
 * resolução total (é o ganho da spec: a leitura deixa de ser sobre um JPEG degradado no aparelho),
 * reduz à régua da 212 e gera a miniatura. Sem rede, sem banco e **sem log** (RNF2).
 */
import { readCode128Text } from '../../canhoto-read/infrastructure/canhoto-barcode.reader.js'
import type {
  DeliveryProofImageParams,
  DeliveryProofImageResult,
} from '../application/delivery-proof-image.port.js'
import {
  DELIVERY_PROOF_PROCESSING_ERROR_CODES as ERROR_CODES,
  PROOF_MAX_SIDE_SHRINKS,
  PROOF_QUALITY_STEP,
  PROOF_REDUCED_MAX_BYTES,
  PROOF_REDUCED_MAX_SIDE,
  PROOF_REDUCED_MIN_QUALITY,
  PROOF_REDUCED_START_QUALITY,
  PROOF_REDUCED_TARGET_BYTES,
  PROOF_SIDE_SHRINK_FACTOR,
  PROOF_THUMBNAIL_MAX_BYTES,
  PROOF_THUMBNAIL_MAX_SIDE,
  PROOF_THUMBNAIL_MIN_QUALITY,
  PROOF_THUMBNAIL_START_QUALITY,
  PROOF_THUMBNAIL_TARGET_BYTES,
  type ProofSupportedMediaType,
} from '../domain/delivery-proof-processing.constant.js'
import {
  exceedsPixelCeiling,
  readImageDimensions,
  readJpegOrientation,
} from '../domain/image-header.policy.js'
import {
  applyOrientation,
  encodeWithinBudget,
  flattenAlphaOntoWhite,
  type EncodingPlan,
  type JpegEncoder,
  type RgbaImage,
} from '../domain/image-transform.policy.js'

export type ProofImageDecoder = (buffer: ArrayBuffer) => Promise<RgbaImage>

export type ProofImageCodecs = Readonly<{
  encodeJpeg: JpegEncoder
  loadDecoder: (mediaType: ProofSupportedMediaType) => Promise<ProofImageDecoder>
}>

const REDUCED_PLAN: EncodingPlan = {
  maxBytes: PROOF_REDUCED_MAX_BYTES,
  maxSide: PROOF_REDUCED_MAX_SIDE,
  maxSideShrinks: PROOF_MAX_SIDE_SHRINKS,
  minQuality: PROOF_REDUCED_MIN_QUALITY,
  qualityStep: PROOF_QUALITY_STEP,
  shrinkFactor: PROOF_SIDE_SHRINK_FACTOR,
  startQuality: PROOF_REDUCED_START_QUALITY,
  targetBytes: PROOF_REDUCED_TARGET_BYTES,
}

const THUMBNAIL_PLAN: EncodingPlan = {
  maxBytes: PROOF_THUMBNAIL_MAX_BYTES,
  maxSide: PROOF_THUMBNAIL_MAX_SIDE,
  maxSideShrinks: 1,
  minQuality: PROOF_THUMBNAIL_MIN_QUALITY,
  qualityStep: PROOF_QUALITY_STEP,
  shrinkFactor: PROOF_SIDE_SHRINK_FACTOR,
  startQuality: PROOF_THUMBNAIL_START_QUALITY,
  targetBytes: PROOF_THUMBNAIL_TARGET_BYTES,
}

/**
 * Carregar o módulo fica **fora** do `try` da decodificação, como na thread do canhoto: wasm que não
 * carrega é falha de infraestrutura em toda foto, e virar "imagem ilegível" marcaria `processing_failed`
 * em todo comprovante sem nunca chegar ao Sentry.
 */
export const defaultProofImageCodecs: ProofImageCodecs = {
  async encodeJpeg(image, quality) {
    const { default: encode } = await import('@jsquash/jpeg/encode.js')
    return new Uint8Array(await encode(image as unknown as ImageData, { quality }))
  },
  async loadDecoder(mediaType) {
    if (mediaType === 'image/jpeg') return (await import('@jsquash/jpeg/decode.js')).default
    if (mediaType === 'image/png') return (await import('@jsquash/png/decode.js')).default
    return (await import('@jsquash/webp/decode.js')).default
  },
}

function isBrokenWasmModule(error: unknown): boolean {
  return error instanceof WebAssembly.CompileError || error instanceof WebAssembly.LinkError
}

function rejected(code: (typeof ERROR_CODES)[keyof typeof ERROR_CODES]): DeliveryProofImageResult {
  return { code, kind: 'rejected' }
}

/** O ArrayBuffer próprio do decodificador: o `Uint8Array` pode ser uma janela de um buffer maior. */
function toOwnedBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export async function processDeliveryProofImage(
  params: DeliveryProofImageParams,
  codecs: ProofImageCodecs = defaultProofImageCodecs,
): Promise<DeliveryProofImageResult> {
  const dimensions = readImageDimensions(params.bytes, params.mediaType)
  if (dimensions === null || dimensions.width < 1 || dimensions.height < 1) {
    return rejected(ERROR_CODES.imageUnreadable)
  }
  if (exceedsPixelCeiling(dimensions)) return rejected(ERROR_CODES.imageTooLargePixels)

  const decode = await codecs.loadDecoder(params.mediaType)
  let decoded: RgbaImage
  try {
    decoded = await decode(toOwnedBuffer(params.bytes))
  } catch (error) {
    if (isBrokenWasmModule(error)) throw error
    return rejected(ERROR_CODES.imageUnreadable)
  }
  // O cabeçalho pode mentir: o decodificador já alocou, mas nada além disto é alocado sobre a mentira.
  if (exceedsPixelCeiling(decoded)) return rejected(ERROR_CODES.imageTooLargePixels)

  if (params.mediaType !== 'image/jpeg') flattenAlphaOntoWhite(decoded)
  const oriented = applyOrientation(
    decoded,
    params.mediaType === 'image/jpeg' ? readJpegOrientation(params.bytes) : 1,
  )

  const barcodeText = params.readBarcode ? readCode128Text(oriented) : null
  const reduced = await encodeWithinBudget({
    encode: codecs.encodeJpeg,
    image: oriented,
    plan: REDUCED_PLAN,
  })
  if (reduced === null) return rejected(ERROR_CODES.reductionTooLarge)

  const thumbnail = params.withThumbnail
    ? await encodeWithinBudget({
        encode: codecs.encodeJpeg,
        image: oriented,
        plan: THUMBNAIL_PLAN,
      })
    : null

  return {
    barcodeText,
    kind: 'processed',
    reduced: { bytes: reduced.bytes, height: reduced.height, width: reduced.width },
    thumbnail: thumbnail === null ? null : { bytes: thumbnail.bytes },
  }
}
