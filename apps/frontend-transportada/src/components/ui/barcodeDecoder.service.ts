/* Copyright (c) 2026 Ada Technology. MIT License. */
import BinaryBitmap from '@zxing/library/esm/core/BinaryBitmap.js'
import HybridBinarizer from '@zxing/library/esm/core/common/HybridBinarizer.js'
import Code128Reader from '@zxing/library/esm/core/oned/Code128Reader.js'
import QRCodeReader from '@zxing/library/esm/core/qrcode/QRCodeReader.js'
import RGBLuminanceSource from '@zxing/library/esm/core/RGBLuminanceSource.js'

export type BarcodeFrame = Readonly<{
  height: number
  luminance: Uint8ClampedArray
  width: number
}>

type DecodeHints = Map<number, unknown>

type BitmapReader = Readonly<{
  decode: (bitmap: BinaryBitmap, hints: DecodeHints) => Readonly<{ getText: () => string }>
}>

/** Quadro sem etiqueta é o caso normal do laço: a exceção do zxing vira ausência. */
function readWith(reader: BitmapReader, bitmap: BinaryBitmap): string | null {
  try {
    return reader.decode(bitmap, new Map<number, unknown>()).getText()
  } catch {
    return null
  }
}

export function decodeBarcodeFrame(frame: BarcodeFrame): string | null {
  const source = new RGBLuminanceSource(frame.luminance, frame.width, frame.height)
  const bitmap = new BinaryBitmap(new HybridBinarizer(source))
  return readWith(new Code128Reader(), bitmap) ?? readWith(new QRCodeReader(), bitmap)
}
