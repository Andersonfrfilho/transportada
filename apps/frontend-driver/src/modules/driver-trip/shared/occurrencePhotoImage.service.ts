/* Cópia por valor de apps/frontend-transportada/src/modules/trip/shared/occurrencePhotoImage.service.ts (ADR-0075 §7). */
/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverOccurrencePhoto } from './driverTrip.types'

/**
 * ⚠️ **Diferença da origem**: só o original. A miniatura da spec 161 é do galpão
 * (`trip_document_occurrence_attachments`); a ocorrência de rua grava o anexo direto em
 * `trip_document_occurrences.attachment_object_id` (spec 179 T203) e não tem miniatura. O PDF também
 * fica de fora: "Não entreguei" é foto tirada na hora. `loadImageFromFile` vem de
 * `apps/frontend-transportada/src/modules/trip/shared/fieldDeliveryImage.service.ts`.
 */

/** D12: original com lado maior ≤ 1600 px — lê etiqueta, lacre rompido e avaria sem pesar mais. */
export const OCCURRENCE_PHOTO_MAX_SIDE = 1600
/** D12/RF29: alvo do original — folga de ~25% até o teto do servidor (512 KiB, RF7/D13). */
export const OCCURRENCE_PHOTO_TARGET_BYTES = 400 * 1024
const OCCURRENCE_PHOTO_QUALITY = 0.85
const OCCURRENCE_PHOTO_MINIMUM_QUALITY = 0.5
const OCCURRENCE_PHOTO_QUALITY_STEP = 0.1
const OCCURRENCE_PHOTO_MIME_TYPE = 'image/jpeg'

export type OccurrencePhotoImageSize = Readonly<{ height: number; width: number }>

/** Pura: escala para o lado maior caber em `OCCURRENCE_PHOTO_MAX_SIDE`, sem aumentar foto pequena. */
export function computeOccurrencePhotoOriginalDimensions({
  height,
  width,
}: OccurrencePhotoImageSize): OccurrencePhotoImageSize {
  const largestSide = Math.max(height, width)
  if (largestSide <= OCCURRENCE_PHOTO_MAX_SIDE) return { height, width }

  const scale = OCCURRENCE_PHOTO_MAX_SIDE / largestSide
  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  }
}

/** Pura: a sequência de qualidades até caber em `OCCURRENCE_PHOTO_TARGET_BYTES`. */
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

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve(image)
      URL.revokeObjectURL(url)
    }
    image.onerror = () => {
      reject(new Error('OCCURRENCE_PHOTO_LOAD_FAILED'))
      URL.revokeObjectURL(url)
    }
    image.src = url
  })
}

function encodeCanvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob === null ? reject(new Error('OCCURRENCE_PHOTO_ENCODE_FAILED')) : resolve(blob),
      OCCURRENCE_PHOTO_MIME_TYPE,
      quality,
    )
  })
}

/**
 * Impura: reencoda pelo canvas em degraus de qualidade até o alvo ou o piso de legibilidade — o
 * canvas descarta o EXIF sozinho, inclusive o GPS da foto (D12/RF29). Devolve a menor tentativa;
 * quem chama confere o teto do servidor (`isOccurrencePhotoWithinLimit`).
 */
export async function reduceOccurrencePhotoToJpeg(file: File): Promise<DriverOccurrencePhoto> {
  const image = await loadImageFromFile(file)
  const size = computeOccurrencePhotoOriginalDimensions({
    height: image.naturalHeight,
    width: image.naturalWidth,
  })
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (context === null) throw new Error('OCCURRENCE_PHOTO_CANVAS_UNAVAILABLE')
  context.drawImage(image, 0, 0, size.width, size.height)

  let smallest: Blob | undefined
  for (const quality of buildOccurrencePhotoQualitySequence()) {
    const blob = await encodeCanvasToJpeg(canvas, quality)
    if (smallest === undefined || blob.size < smallest.size) smallest = blob
    if (blob.size <= OCCURRENCE_PHOTO_TARGET_BYTES) break
  }
  if (smallest === undefined) throw new Error('OCCURRENCE_PHOTO_ENCODE_FAILED')

  const baseName = file.name.replace(/\.[^./\\]+$/u, '') || 'ocorrencia'
  return { blob: smallest, fileName: `${baseName}.jpg` }
}
