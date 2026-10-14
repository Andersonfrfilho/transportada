/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A leitura do Code128 sobre pixels já decodificados, separada da entrada da `worker_thread` do
 * canhoto (`canhoto-barcode.worker.ts`) para que a thread do comprovante (spec 265) a reuse sem
 * disparar o `postMessage` daquela entrada. Sem rede, sem banco e **sem log**.
 */
import { BinaryBitmap, Code128Reader, HybridBinarizer, RGBLuminanceSource } from '@zxing/library'

export type DecodedImage = Readonly<{ data: Uint8ClampedArray; height: number; width: number }>

const RED_WEIGHT = 299
const GREEN_WEIGHT = 587
const BLUE_WEIGHT = 114
const WEIGHT_DIVISOR = 1000

export function toLuminance(image: DecodedImage): Uint8ClampedArray {
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

/** `null` é "olhei e não achei": o Code128 do zxing lança quando não há código legível. */
export function readCode128Text(image: DecodedImage): string | null {
  try {
    const source = new RGBLuminanceSource(toLuminance(image), image.width, image.height)
    const bitmap = new BinaryBitmap(new HybridBinarizer(source))
    return new Code128Reader().decode(bitmap, new Map()).getText()
  } catch {
    return null
  }
}
