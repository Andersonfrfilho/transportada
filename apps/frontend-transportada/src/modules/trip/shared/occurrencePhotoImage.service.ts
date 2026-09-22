/* Copyright (c) 2026 Ada Technology. MIT License. */

import { loadImageFromFile } from './fieldDeliveryImage.service'

/** D12: original com lado maior ≤ 1600 px — lê etiqueta, lacre rompido e avaria sem pesar mais. */
export const OCCURRENCE_PHOTO_MAX_SIDE = 1600
/** D12/RF29: alvo do original — folga de ~25% até o teto do servidor (512 KiB, RF7/D13). */
export const OCCURRENCE_PHOTO_TARGET_BYTES = 400 * 1024
const OCCURRENCE_PHOTO_QUALITY = 0.85
const OCCURRENCE_PHOTO_MINIMUM_QUALITY = 0.5
const OCCURRENCE_PHOTO_QUALITY_STEP = 0.1

/** D12: miniatura com lado maior ≤ 320 px, qualidade fixa 0,7 — cache de leitura, não prova. */
export const OCCURRENCE_THUMBNAIL_MAX_SIDE = 320
export const OCCURRENCE_THUMBNAIL_QUALITY = 0.7
export const OCCURRENCE_THUMBNAIL_TARGET_BYTES = 60 * 1024

/**
 * O PDF entra **como está**: reencodar pelo canvas é o que descarta o EXIF de uma foto, e não há
 * canvas que abra um PDF. Ele também não ganha miniatura no navegador — a leitura o desenha com o
 * ícone `document`, nunca em `<img>`.
 */
export const OCCURRENCE_PDF_MIME_TYPE = 'application/pdf'

/** O `accept` do seletor: foto de qualquer formato que o aparelho ofereça, mais o PDF. */
export const OCCURRENCE_ATTACHMENT_ACCEPT = `image/*,${OCCURRENCE_PDF_MIME_TYPE}`

/** O tipo pode vir com parâmetro (`application/pdf; charset=…`) — compara o tipo, não a string. */
export function isOccurrencePdfMimeType(mimeType: string): boolean {
  return mimeType.trim().toLowerCase().split(';')[0] === OCCURRENCE_PDF_MIME_TYPE
}

export type OccurrencePhotoImageSize = Readonly<{ height: number; width: number }>

export type OccurrencePhotoAttachment = Readonly<{
  original: Blob
  /** RF29b: ausente quando a geração da miniatura falhou — o envio segue só com o original. */
  thumbnail: Blob | undefined
}>

/**
 * Pura: mesma conta de `computeFieldDeliveryImageDimensions`, parametrizada pelo teto de lado —
 * o original e a miniatura escalam a partir do mesmo canvas, com tetos diferentes (D12).
 */
export function computeOccurrencePhotoDimensions(
  { height, width }: OccurrencePhotoImageSize,
  maxSide: number,
): OccurrencePhotoImageSize {
  const largestSide = Math.max(height, width)
  if (largestSide <= maxSide) return { height, width }

  const scale = maxSide / largestSide
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  }
}

export function computeOccurrencePhotoOriginalDimensions(
  size: OccurrencePhotoImageSize,
): OccurrencePhotoImageSize {
  return computeOccurrencePhotoDimensions(size, OCCURRENCE_PHOTO_MAX_SIDE)
}

export function computeOccurrencePhotoThumbnailDimensions(
  size: OccurrencePhotoImageSize,
): OccurrencePhotoImageSize {
  return computeOccurrencePhotoDimensions(size, OCCURRENCE_THUMBNAIL_MAX_SIDE)
}

/**
 * Pura: sequência de qualidades do original até caber em `OCCURRENCE_PHOTO_TARGET_BYTES`, mesmo
 * molde de `buildFieldDeliveryImageQualitySequence` (M7, spec 156 T15).
 */
export function buildOccurrencePhotoQualitySequence(
  startQuality: number = OCCURRENCE_PHOTO_QUALITY,
): readonly number[] {
  const sequence: number[] = []
  for (
    let quality = startQuality;
    quality > OCCURRENCE_PHOTO_MINIMUM_QUALITY;
    quality -= OCCURRENCE_PHOTO_QUALITY_STEP
  ) {
    sequence.push(Math.round(quality * 100) / 100)
  }
  sequence.push(OCCURRENCE_PHOTO_MINIMUM_QUALITY)
  return sequence
}

/**
 * Pura: RF29b isolado do canvas — a chamada que gera a miniatura pode falhar (canvas indisponível,
 * memória) e o envio segue só com o original, sem lançar. Recebe a função de encode como
 * dependência para ser testável sem DOM.
 */
export async function attemptOccurrencePhotoThumbnail(
  encode: () => Promise<Blob>,
): Promise<Blob | undefined> {
  try {
    return await encode()
  } catch {
    return undefined
  }
}

function encodeCanvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob === null ? reject(new Error('OCCURRENCE_PHOTO_ENCODE_FAILED')) : resolve(blob),
      'image/jpeg',
      quality,
    )
  })
}

function drawOccurrencePhotoCanvas(
  source: CanvasImageSource,
  size: OccurrencePhotoImageSize,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('OCCURRENCE_PHOTO_CANVAS_UNAVAILABLE')
  context.drawImage(source, 0, 0, size.width, size.height)
  return canvas
}

/**
 * Impura: original em degraus de qualidade até `OCCURRENCE_PHOTO_TARGET_BYTES` ou o piso de
 * legibilidade — reencodar pelo canvas descarta o EXIF sozinho (D12/RF29), inclusive GPS.
 */
export async function reduceOccurrencePhotoOriginalToJpeg(
  source: CanvasImageSource,
  sourceSize: OccurrencePhotoImageSize,
): Promise<Blob> {
  const canvas = drawOccurrencePhotoCanvas(
    source,
    computeOccurrencePhotoOriginalDimensions(sourceSize),
  )

  let smallestBlob: Blob | undefined
  for (const quality of buildOccurrencePhotoQualitySequence()) {
    const blob = await encodeCanvasToJpeg(canvas, quality)
    if (smallestBlob === undefined || blob.size < smallestBlob.size) smallestBlob = blob
    if (blob.size <= OCCURRENCE_PHOTO_TARGET_BYTES) return blob
  }
  return smallestBlob as Blob
}

/** Impura: miniatura de qualidade fixa (D12) a partir do mesmo canvas reduzido. */
function encodeOccurrencePhotoThumbnail(
  source: CanvasImageSource,
  sourceSize: OccurrencePhotoImageSize,
): Promise<Blob> {
  const canvas = drawOccurrencePhotoCanvas(
    source,
    computeOccurrencePhotoThumbnailDimensions(sourceSize),
  )
  return encodeCanvasToJpeg(canvas, OCCURRENCE_THUMBNAIL_QUALITY)
}

/**
 * Impura: reencoda o `File` escolhido/capturado em original + miniatura do mesmo canvas (D12,
 * RF29). Falha na miniatura (RF29b) nunca impede o original — `thumbnail` sai `undefined`.
 */
export async function buildOccurrencePhotoAttachment(
  file: File,
): Promise<OccurrencePhotoAttachment> {
  if (isOccurrencePdfMimeType(file.type)) return { original: file, thumbnail: undefined }

  const image = await loadImageFromFile(file)
  const sourceSize: OccurrencePhotoImageSize = {
    height: image.naturalHeight,
    width: image.naturalWidth,
  }
  const original = await reduceOccurrencePhotoOriginalToJpeg(image, sourceSize)
  const thumbnail = await attemptOccurrencePhotoThumbnail(() =>
    encodeOccurrencePhotoThumbnail(image, sourceSize),
  )
  return { original, thumbnail }
}
