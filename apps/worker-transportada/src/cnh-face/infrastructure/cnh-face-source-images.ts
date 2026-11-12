/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs'
import sharp from 'sharp'

import {
  CNH_MIN_SOURCE_IMAGE_SIDE,
  CNH_SOURCE_KINDS,
  PDF_SIGNATURE,
} from '../domain/cnh-face.constant.js'
import type { CnhSourceKind, RawImage } from '../domain/cnh-face.types.js'

const RGB_CHANNELS = 3
const PDF_IMAGE_KIND_ONE_BIT = 1
const PDF_IMAGE_KIND_RGB = 2
const ROTATION_ANGLES = [90, 270, 180] as const

type PdfImageObject = {
  readonly data?: Uint8ClampedArray | Uint8Array
  readonly height: number
  readonly kind?: number
  readonly width: number
}

export type CnhSourceImages = {
  readonly images: readonly RawImage[]
  readonly sourceKind: CnhSourceKind
}

export async function collectCandidateImages(bytes: Uint8Array): Promise<CnhSourceImages> {
  if (new TextDecoder().decode(bytes.subarray(0, PDF_SIGNATURE.length)) === PDF_SIGNATURE) {
    return collectPdfImages(bytes)
  }
  try {
    const { data, info } = await sharp(bytes)
      .rotate()
      .removeAlpha()
      .toColourspace('srgb')
      .raw()
      .toBuffer({ resolveWithObject: true })
    return {
      images: [{ height: info.height, rgb: data, width: info.width }],
      sourceKind: CNH_SOURCE_KINDS.IMAGE,
    }
  } catch {
    return { images: [], sourceKind: CNH_SOURCE_KINDS.UNKNOWN }
  }
}

/**
 * Foto de celular pode vir deitada e sem EXIF; PDF digital nunca gira. O detector acha rosto deitado
 * e de cabeça para baixo com nota 0,96–0,99, então quem chama fica com a rotação de maior nota.
 */
export async function rotationsOf(
  image: RawImage,
  sourceKind: CnhSourceKind,
): Promise<readonly RawImage[]> {
  if (sourceKind === CNH_SOURCE_KINDS.PDF_DIGITAL) return [image]
  const rotations: RawImage[] = [image]
  for (const angle of ROTATION_ANGLES) {
    const { data, info } = await sharp(image.rgb, {
      raw: { channels: RGB_CHANNELS, height: image.height, width: image.width },
    })
      .rotate(angle)
      .raw()
      .toBuffer({ resolveWithObject: true })
    rotations.push({ height: info.height, rgb: data, width: info.width })
  }
  return rotations
}

/** Só a primeira página: na CNH-e o rosto está dentro da imagem da frente do cartão, não num objeto próprio. */
async function collectPdfImages(bytes: Uint8Array): Promise<CnhSourceImages> {
  const loadingTask = getDocument({
    data: bytes.slice(),
    isOffscreenCanvasSupported: false,
    verbosity: 0,
  })
  const document = await loadingTask.promise
  try {
    const page = await document.getPage(1)
    const text = await page.getTextContent()
    const operators = await page.getOperatorList()
    const images: RawImage[] = []
    for (let index = 0; index < operators.fnArray.length; index += 1) {
      if (operators.fnArray[index] !== OPS.paintImageXObject) continue
      const name = operators.argsArray[index]?.[0] as string
      const store = name.startsWith('g_') ? page.commonObjs : page.objs
      const object = await new Promise<PdfImageObject>((resolve) => {
        store.get(name, resolve)
      })
      const image = toRgb(object)
      if (image !== undefined && Math.min(image.width, image.height) >= CNH_MIN_SOURCE_IMAGE_SIDE) {
        images.push(image)
      }
    }
    return {
      images,
      sourceKind:
        text.items.length > 0 ? CNH_SOURCE_KINDS.PDF_DIGITAL : CNH_SOURCE_KINDS.PDF_SCANNED,
    }
  } finally {
    await loadingTask.destroy()
  }
}

/** pdf.js entrega `kind` 1 (1 bpp), 2 (RGB) ou 3 (RGBA); o QR de 1 bpp é descartado. */
function toRgb(object: PdfImageObject): RawImage | undefined {
  const { data, height, kind, width } = object
  if (data === undefined || kind === undefined || kind === PDF_IMAGE_KIND_ONE_BIT) return undefined
  if (kind === PDF_IMAGE_KIND_RGB) {
    return { height, rgb: Buffer.from(data.buffer, data.byteOffset, data.byteLength), width }
  }
  const rgb = Buffer.alloc(width * height * RGB_CHANNELS)
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    for (let channel = 0; channel < RGB_CHANNELS; channel += 1) {
      rgb[pixel * RGB_CHANNELS + channel] = data[pixel * 4 + channel] ?? 0
    }
  }
  return { height, rgb, width }
}
