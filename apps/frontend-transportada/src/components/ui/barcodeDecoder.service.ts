/* Copyright (c) 2026 Ada Technology. MIT License. */
import BinaryBitmap from '@zxing/library/esm/core/BinaryBitmap.js'
import HybridBinarizer from '@zxing/library/esm/core/common/HybridBinarizer.js'
import Code39Reader from '@zxing/library/esm/core/oned/Code39Reader.js'
import Code128Reader from '@zxing/library/esm/core/oned/Code128Reader.js'
import EAN8Reader from '@zxing/library/esm/core/oned/EAN8Reader.js'
import EAN13Reader from '@zxing/library/esm/core/oned/EAN13Reader.js'
import ITFReader from '@zxing/library/esm/core/oned/ITFReader.js'
import UPCAReader from '@zxing/library/esm/core/oned/UPCAReader.js'
import UPCEReader from '@zxing/library/esm/core/oned/UPCEReader.js'
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

/**
 * Lineares primeiro — Code-128 (chave da DANFE) é o mais comum, ITF cobre a caixa de papelão
 * (DUN-14) — e o QR por último: é o formato mais caro de decodificar e o menos usado em etiqueta
 * de caixa.
 */
function buildReaders(): readonly BitmapReader[] {
  return [
    new Code128Reader(),
    new EAN13Reader(),
    new EAN8Reader(),
    new UPCAReader(),
    new UPCEReader(),
    new ITFReader(),
    new Code39Reader(),
    new QRCodeReader(),
  ]
}

export function decodeBarcodeFrame(frame: BarcodeFrame): string | null {
  const source = new RGBLuminanceSource(frame.luminance, frame.width, frame.height)
  const bitmap = new BinaryBitmap(new HybridBinarizer(source))
  for (const reader of buildReaders()) {
    const text = readWith(reader, bitmap)
    if (text !== null) return text
  }
  return null
}
