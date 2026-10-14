/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Entrada da `worker_thread` do canhoto (ADR-0053): decodificar uma foto de 12 MP é CPU e memória,
 * e no processo principal pararia a emissão fiscal junto. Sem rede, sem banco e **sem log**.
 */
import { parentPort, workerData } from 'node:worker_threads'

import type { DecodeCanhotoBarcodeParams } from '../application/canhoto-barcode-decoder.port.js'
import type { CanhotoSupportedMediaType } from '../domain/canhoto-read.constant.js'
import { isImageOverPixelCeiling } from '../../delivery-proof-processing/domain/image-header.policy.js'
import { readCode128Text, type DecodedImage } from './canhoto-barcode.reader.js'

type ImageDecoder = (buffer: ArrayBuffer) => Promise<DecodedImage>

export type ImageDecoderLoader = (mediaType: CanhotoSupportedMediaType) => Promise<ImageDecoder>

/**
 * Carregar o decodificador fica **fora** do `try` da leitura: módulo ausente é falha de
 * infraestrutura em toda foto, e virar `null` aqui carimbaria a tentativa e tiraria o comprovante
 * da fila para sempre, sem Sentry.
 */
const loadImageDecoder: ImageDecoderLoader = async (mediaType) => {
  if (mediaType === 'image/jpeg') return (await import('@jsquash/jpeg/decode.js')).default
  if (mediaType === 'image/png') return (await import('@jsquash/png/decode.js')).default
  return (await import('@jsquash/webp/decode.js')).default
}

/** Binário wasm que não compila nem liga é a mesma falha de infraestrutura — nunca "sem código". */
function isBrokenWasmModule(error: unknown): boolean {
  return error instanceof WebAssembly.CompileError || error instanceof WebAssembly.LinkError
}

/**
 * Imagem ilegível ou sem código é o mesmo fato para a rotina — "olhou e não achou" —, então vira `null`.
 * Spec 265 RNF1: o cabeçalho diz as dimensões antes de qualquer pixel ser alocado; o que passa do teto
 * de pixels (anti decompression bomb) nem chega ao decodificador — o original do motorista pode ter
 * até 12 MiB, e a leitura do `processing_failed` passa a abri-lo.
 */
export async function readBarcodeText(input: {
  readonly loadDecoder: ImageDecoderLoader
  readonly params: DecodeCanhotoBarcodeParams
}): Promise<string | null> {
  if (isImageOverPixelCeiling(input.params.bytes, input.params.mediaType)) return null
  const decode = await input.loadDecoder(input.params.mediaType)
  try {
    return readCode128Text(await decode(input.params.bytes.buffer as ArrayBuffer))
  } catch (error) {
    if (isBrokenWasmModule(error)) throw error
    return null
  }
}

if (parentPort !== null) {
  parentPort.postMessage({
    text: await readBarcodeText({
      loadDecoder: loadImageDecoder,
      params: workerData as DecodeCanhotoBarcodeParams,
    }),
  })
}
