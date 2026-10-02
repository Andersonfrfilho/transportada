/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Entrada da `worker_thread` do canhoto (ADR-0053): decodificar uma foto de 12 MP é CPU e memória,
 * e no processo principal pararia a emissão fiscal junto. Sem rede, sem banco e **sem log**.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { BinaryBitmap, Code128Reader, HybridBinarizer, RGBLuminanceSource } from '@zxing/library'

import type { DecodeCanhotoBarcodeParams } from '../application/canhoto-barcode-decoder.port.js'

type DecodedImage = Readonly<{ data: Uint8ClampedArray; height: number; width: number }>

const RED_WEIGHT = 299
const GREEN_WEIGHT = 587
const BLUE_WEIGHT = 114
const WEIGHT_DIVISOR = 1000

async function decodeImage(params: DecodeCanhotoBarcodeParams): Promise<DecodedImage> {
  const buffer = params.bytes.buffer as ArrayBuffer
  if (params.mediaType === 'image/jpeg') {
    return (await import('@jsquash/jpeg/decode.js')).default(buffer)
  }
  if (params.mediaType === 'image/png') {
    return (await import('@jsquash/png/decode.js')).default(buffer)
  }
  return (await import('@jsquash/webp/decode.js')).default(buffer)
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
async function readBarcodeText(params: DecodeCanhotoBarcodeParams): Promise<string | null> {
  try {
    const image = await decodeImage(params)
    const source = new RGBLuminanceSource(toLuminance(image), image.width, image.height)
    const bitmap = new BinaryBitmap(new HybridBinarizer(source))
    return new Code128Reader().decode(bitmap, new Map()).getText()
  } catch {
    return null
  }
}

parentPort?.postMessage({ text: await readBarcodeText(workerData as DecodeCanhotoBarcodeParams) })
