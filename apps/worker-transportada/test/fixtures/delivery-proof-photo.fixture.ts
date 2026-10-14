/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 265: fotos de comprovante fabricadas para o contrato do tratamento. Reusa o canhoto da 222
 * (`canhoto-photo.fixture.ts`) e acrescenta o que a câmera real traz e a foto de laboratório não: um
 * segmento EXIF (orientação e GPS) e cabeçalhos que mentem sobre as dimensões.
 */
import { buildCanhotoPhoto } from './canhoto-photo.fixture.js'

export { buildCanhotoPhoto, CANHOTO_PHOTO_ACCESS_KEY } from './canhoto-photo.fixture.js'

/** O texto que prova que o EXIF/GPS não sobreviveu: ele só existe dentro do segmento APP1 injetado. */
export const EXIF_GPS_MARKER = 'GPS-MARKER-12345'

function u16(value: number, littleEndian: boolean): number[] {
  return littleEndian ? [value & 0xff, value >> 8] : [value >> 8, value & 0xff]
}

function u32(value: number, littleEndian: boolean): number[] {
  const high = u16(Math.floor(value / 0x10000), littleEndian)
  const low = u16(value & 0xffff, littleEndian)
  return littleEndian ? [...low, ...high] : [...high, ...low]
}

/** Um APP1 `Exif` com a tag de orientação (0x0112) e um texto de "GPS" depois da IFD. */
export function buildExifSegment(input: {
  readonly littleEndian?: boolean
  readonly orientation: number
}): Uint8Array {
  const littleEndian = input.littleEndian ?? false
  const tiff = [
    ...(littleEndian ? [0x49, 0x49] : [0x4d, 0x4d]),
    ...u16(42, littleEndian),
    ...u32(8, littleEndian),
    ...u16(1, littleEndian),
    ...u16(0x0112, littleEndian),
    ...u16(3, littleEndian),
    ...u32(1, littleEndian),
    ...u16(input.orientation, littleEndian),
    0,
    0,
    ...u32(0, littleEndian),
    ...new TextEncoder().encode(EXIF_GPS_MARKER),
  ]
  const body = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff]
  return Uint8Array.from([0xff, 0xe1, ...u16(body.length + 2, false), ...body])
}

/** Insere o segmento logo depois do SOI, onde a câmera o põe. */
export function withExif(jpeg: Uint8Array, exif: Uint8Array): Uint8Array {
  const output = new Uint8Array(jpeg.length + exif.length)
  output.set(jpeg.subarray(0, 2), 0)
  output.set(exif, 2)
  output.set(jpeg.subarray(2), 2 + exif.length)
  return output
}

export function containsText(bytes: Uint8Array, text: string): boolean {
  return Buffer.from(bytes).includes(Buffer.from(text))
}

/** Um JPEG de poucos bytes que **declara** `width × height` — a bomba de descompressão. */
export function buildJpegHeaderClaiming(width: number, height: number): Uint8Array {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xc0,
    0x00,
    0x0b,
    0x08,
    ...u16(height, false),
    ...u16(width, false),
    0x01,
    0x01,
    0x11,
    0x00,
    0xff,
    0xd9,
  ])
}

/** Uma foto de 12 MP com ruído de papel: passa de 1 MiB no JPEG, como a da câmera. */
export async function buildLargeCameraPhoto(
  overrides: { readonly hasBarcode?: boolean } = {},
): Promise<Uint8Array> {
  return buildCanhotoPhoto({
    format: 'jpeg',
    hasBarcode: overrides.hasBarcode ?? true,
    heightPixels: 4032,
    moduleWidthPixels: 4,
    noisyPaper: true,
    widthPixels: 3024,
  })
}
