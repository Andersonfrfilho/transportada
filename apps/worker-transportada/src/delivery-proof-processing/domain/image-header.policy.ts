/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265 RNF1: as dimensões e a orientação saem dos primeiros bytes, **antes** de o decodificador
 * alocar `largura × altura × 4`. Um JPEG de 30 KB pode declarar 60000 × 60000 pixels; quem decodifica
 * primeiro e confere depois já perdeu a memória do processo.
 */
import { PROOF_MAX_PIXELS } from './delivery-proof-processing.constant.js'

export type ImageDimensions = Readonly<{ height: number; width: number }>

const JPEG_START_OF_IMAGE = 0xffd8
const JPEG_START_OF_SCAN = 0xda
const JPEG_APP1 = 0xe1
const JPEG_NON_FRAME_MARKERS: ReadonlySet<number> = new Set([0xc4, 0xc8, 0xcc])
const EXIF_ORIENTATION_TAG = 0x0112
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]

function readU16(bytes: Uint8Array, offset: number, littleEndian = false): number | undefined {
  const first = bytes[offset]
  const second = bytes[offset + 1]
  if (first === undefined || second === undefined) return undefined
  return littleEndian ? first | (second << 8) : (first << 8) | second
}

function readU32(bytes: Uint8Array, offset: number, littleEndian = false): number | undefined {
  const high = readU16(bytes, littleEndian ? offset + 2 : offset, littleEndian)
  const low = readU16(bytes, littleEndian ? offset : offset + 2, littleEndian)
  if (high === undefined || low === undefined) return undefined
  return high * 0x10000 + low
}

function readU24Le(bytes: Uint8Array, offset: number): number | undefined {
  const low = readU16(bytes, offset, true)
  const high = bytes[offset + 2]
  if (low === undefined || high === undefined) return undefined
  return low | (high << 16)
}

function isStandaloneJpegMarker(marker: number): boolean {
  return marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)
}

/** Percorre os segmentos até o primeiro quadro (`SOF`); o `SOS` sem quadro antes dele é arquivo inválido. */
function readJpegDimensions(bytes: Uint8Array): ImageDimensions | null {
  if (readU16(bytes, 0) !== JPEG_START_OF_IMAGE) return null
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null
    const marker = bytes[offset + 1]
    if (marker === undefined) return null
    if (marker === 0xff) {
      offset += 1
      continue
    }
    if (isStandaloneJpegMarker(marker)) {
      offset += 2
      continue
    }
    if (marker === JPEG_START_OF_SCAN) return null
    const length = readU16(bytes, offset + 2)
    if (length === undefined || length < 2) return null
    const isFrame = marker >= 0xc0 && marker <= 0xcf && !JPEG_NON_FRAME_MARKERS.has(marker)
    if (isFrame) {
      const height = readU16(bytes, offset + 5)
      const width = readU16(bytes, offset + 7)
      if (height === undefined || width === undefined) return null
      return { height, width }
    }
    offset += 2 + length
  }
  return null
}

function readPngDimensions(bytes: Uint8Array): ImageDimensions | null {
  const isPng = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
    (byte, index) => bytes[index] === byte,
  )
  if (!isPng) return null
  const width = readU32(bytes, 16)
  const height = readU32(bytes, 20)
  if (width === undefined || height === undefined) return null
  return { height, width }
}

function readWebpDimensions(bytes: Uint8Array): ImageDimensions | null {
  const tag = (offset: number): string => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') return null
  const chunk = tag(12)
  if (chunk === 'VP8 ') {
    const width = readU16(bytes, 26, true)
    const height = readU16(bytes, 28, true)
    if (width === undefined || height === undefined) return null
    return { height: height & 0x3fff, width: width & 0x3fff }
  }
  if (chunk === 'VP8L') {
    const packed = readU32(bytes, 21, true)
    if (packed === undefined) return null
    return { height: ((packed >>> 14) & 0x3fff) + 1, width: (packed & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') {
    const width = readU24Le(bytes, 24)
    const height = readU24Le(bytes, 27)
    if (width === undefined || height === undefined) return null
    return { height: height + 1, width: width + 1 }
  }
  return null
}

/** `null` quando o cabeçalho não diz as dimensões — o chamador trata como imagem ilegível. */
export function readImageDimensions(bytes: Uint8Array, mediaType: string): ImageDimensions | null {
  if (mediaType === 'image/jpeg') return readJpegDimensions(bytes)
  if (mediaType === 'image/png') return readPngDimensions(bytes)
  if (mediaType === 'image/webp') return readWebpDimensions(bytes)
  return null
}

export function exceedsPixelCeiling(dimensions: ImageDimensions): boolean {
  return dimensions.width * dimensions.height > PROOF_MAX_PIXELS
}

/** Só diz "estourou" quando o cabeçalho **leu** e as dimensões passam do teto; ilegível é problema de quem decodifica. */
export function isImageOverPixelCeiling(bytes: Uint8Array, mediaType: string): boolean {
  const dimensions = readImageDimensions(bytes, mediaType)
  return dimensions !== null && exceedsPixelCeiling(dimensions)
}

/**
 * A orientação EXIF (1 a 8) do JPEG, `1` quando não há. O canvas do aparelho aplica a orientação ao
 * desenhar; reencodar sem ela viraria a foto de lado, e o código de barras também.
 */
export function readJpegOrientation(bytes: Uint8Array): number {
  if (readU16(bytes, 0) !== JPEG_START_OF_IMAGE) return 1
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return 1
    const marker = bytes[offset + 1]
    if (marker === undefined || marker === JPEG_START_OF_SCAN) return 1
    if (marker === 0xff) {
      offset += 1
      continue
    }
    if (isStandaloneJpegMarker(marker)) {
      offset += 2
      continue
    }
    const length = readU16(bytes, offset + 2)
    if (length === undefined || length < 2) return 1
    if (marker === JPEG_APP1) return readExifOrientation(bytes, offset + 4, offset + 2 + length)
    offset += 2 + length
  }
  return 1
}

function readExifOrientation(bytes: Uint8Array, start: number, end: number): number {
  if (!EXIF_HEADER.every((byte, index) => bytes[start + index] === byte)) return 1
  const tiff = start + EXIF_HEADER.length
  const byteOrder = readU16(bytes, tiff)
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return 1
  const littleEndian = byteOrder === 0x4949
  const firstIfd = readU32(bytes, tiff + 4, littleEndian)
  if (firstIfd === undefined) return 1
  const ifd = tiff + firstIfd
  const entries = readU16(bytes, ifd, littleEndian)
  if (entries === undefined) return 1
  for (let index = 0; index < entries; index += 1) {
    const entry = ifd + 2 + index * 12
    if (entry + 12 > end) return 1
    if (readU16(bytes, entry, littleEndian) !== EXIF_ORIENTATION_TAG) continue
    const value = readU16(bytes, entry + 8, littleEndian)
    return value !== undefined && value >= 1 && value <= 8 ? value : 1
  }
  return 1
}
