/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  captureLuminanceFrame,
  drawFullResolutionCanvas,
} from '@/modules/trip/shared/fieldDeliveryCapture.service'
import {
  reviewCanhoto,
  type CanhotoReviewOutcome,
} from '@/modules/trip/shared/canhotoReview.service'
import type { CanhotoTripDocument } from '@/modules/trip/shared/canhotoIdentification.service'

export type ReadCanhotoFromUrlParams = Readonly<{
  canhotoOcrEnabled: boolean
  documentId: string
  downloadUrl: string
  tripDocuments: readonly CanhotoTripDocument[]
}>

/**
 * Busca a imagem original (nunca a miniatura: 320 px não sustentam um Code-128 de 44 posições) e
 * a desenha em canvas próprio. Um `<img>` sem `crossOrigin` contaminaria o canvas e o
 * `getImageData` lançaria `SecurityError`.
 */
async function loadOriginalCanvas(downloadUrl: string): Promise<HTMLCanvasElement> {
  const response = await fetch(downloadUrl)
  if (!response.ok) throw new Error('CANHOTO_IMAGE_FETCH_FAILED')
  const bitmap = await createImageBitmap(await response.blob())
  try {
    const canvas = drawFullResolutionCanvas(bitmap, bitmap.width, bitmap.height)
    if (canvas === undefined) throw new Error('CANHOTO_IMAGE_EMPTY')
    return canvas
  } finally {
    bitmap.close()
  }
}

export async function readCanhotoFromUrl({
  canhotoOcrEnabled,
  documentId,
  downloadUrl,
  tripDocuments,
}: ReadCanhotoFromUrlParams): Promise<CanhotoReviewOutcome> {
  const canvas = await loadOriginalCanvas(downloadUrl)
  const frame = captureLuminanceFrame(canvas, canvas.width, canvas.height)
  if (frame === undefined) throw new Error('CANHOTO_IMAGE_EMPTY')

  return reviewCanhoto({
    canhotoOcrEnabled,
    expectedDocumentId: documentId,
    frame,
    image: canvas,
    selectedDocumentIds: [documentId],
    tripDocuments: tripDocuments.map((document) => ({
      accessKey: document.accessKey ?? null,
      id: document.id,
      nfeNumber: document.nfeNumber ?? null,
      nfeSeries: document.nfeSeries ?? null,
      releasedAt: document.releasedAt ?? null,
    })),
  })
}
