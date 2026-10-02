/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Entrada da `worker_thread` do canhoto (ADR-0053): decodificar uma foto de 12 MP é CPU e memória,
 * e no processo principal pararia a emissão fiscal junto. Sem rede, sem banco e **sem log**.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { BinaryBitmap, Code128Reader, HybridBinarizer, RGBLuminanceSource } from '@zxing/library'

import type { DecodeCanhotoBarcodeParams } from '../application/canhoto-barcode-decoder.port.js'
import type { CanhotoSupportedMediaType } from '../domain/canhoto-read.constant.js'

type DecodedImage = Readonly<{ data: Uint8ClampedArray; height: number; width: number }>

type ImageDecoder = (buffer: ArrayBuffer) => Promise<DecodedImage>

export type ImageDecoderLoader = (mediaType: CanhotoSupportedMediaType) => Promise<ImageDecoder>

const RED_WEIGHT = 299
const GREEN_WEIGHT = 587
const BLUE_WEIGHT = 114
const WEIGHT_DIVISOR = 1000

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

function toLuminance(image: DecodedImage): Uint8ClampedArray {
  const luminance = new Uint8ClampedArray(image.width * image.height)
  for (let index = 0, offset = 0; index < luminance.length; index += 1, offset += 4) {
    luminance[index] =
      ((image.data[offset] ?? 0) * RED_WEIGHT +
        (image.data[offset + 1] ?? 0) * GREEN_WEIGHT +
        (image.data[offset + 2] ?? 0) * BLUE_WEIGHT) /
      WEIGHT_DIVISOR
  }
  return luminance
}

/** Imagem ilegível ou sem código é o mesmo fato para a rotina — "olhou e não achou" —, então vira `null`. */
export async function readBarcodeText(input: {
  readonly loadDecoder: ImageDecoderLoader
  readonly params: DecodeCanhotoBarcodeParams
}): Promise<string | null> {
  const decode = await input.loadDecoder(input.params.mediaType)
  try {
    const image = await decode(input.params.bytes.buffer as ArrayBuffer)
    const source = new RGBLuminanceSource(toLuminance(image), image.width, image.height)
    const bitmap = new BinaryBitmap(new HybridBinarizer(source))
    return new Code128Reader().decode(bitmap, new Map()).getText()
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
