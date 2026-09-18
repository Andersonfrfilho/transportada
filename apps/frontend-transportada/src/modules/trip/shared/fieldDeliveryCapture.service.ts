/* Copyright (c) 2026 Ada Technology. MIT License. */
import { toLuminance } from '@/components/ui/barcodeScanner.service'
import { MAXIMUM_FRAME_WIDTH } from '@/components/ui/cameraFrame.constant'
import type { BarcodeFrame } from '@/components/ui/barcodeDecoder.service'

import {
  identifyCanhotoFromFrame,
  type CanhotoIdentificationResult,
  type CanhotoTripDocument,
} from './canhotoIdentification.service'
import { identifyCanhotoNumber } from './canhotoOcr.service'
import { recognizeCanhotoWords } from './canhotoOcrEngine.service'
import { reduceFieldDeliveryImageToJpeg } from './fieldDeliveryImage.service'
import type { FieldDeliveryCapturedPhoto } from './fieldDeliveryWizard.service'

function captureLuminanceFrame(
  source: CanvasImageSource,
  width: number,
  height: number,
): BarcodeFrame | undefined {
  if (width === 0 || height === 0) return undefined
  const factor = Math.min(1, MAXIMUM_FRAME_WIDTH / width)
  const targetWidth = Math.round(width * factor)
  const targetHeight = Math.round(height * factor)
  const canvas = document.createElement('canvas')
  canvas.width = targetWidth
  canvas.height = targetHeight
  const context = canvas.getContext('2d')
  if (context === null) return undefined
  context.drawImage(source, 0, 0, targetWidth, targetHeight)
  return {
    height: targetHeight,
    luminance: toLuminance(context.getImageData(0, 0, targetWidth, targetHeight).data),
    width: targetWidth,
  }
}

function drawFullResolutionCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
): HTMLCanvasElement | undefined {
  if (width === 0 || height === 0) return undefined
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (context === null) return undefined
  context.drawImage(source, 0, 0, width, height)
  return canvas
}

export type CaptureFieldDeliveryPhotoParams = Readonly<{
  /**
   * Spec 156 T14, ADR-0069 §3: só roda depois do código de barras falhar, e só quando a empresa
   * ligou o interruptor — a leitura sob demanda nunca compete com o caminho comum (código legível).
   */
  canhotoOcrEnabled?: boolean
  expectedDocumentId: string
  height: number
  selectedDocumentIds: readonly string[]
  source: CanvasImageSource
  tripDocuments: readonly CanhotoTripDocument[]
  width: number
}>

/**
 * Spec 156 T11: junta a classificação (T10, sobre um quadro em luminância reduzido) e a redução
 * para JPEG (D9, sobre a fonte original) — a mesma captura alimenta as duas, e nenhuma delas grava
 * nada sozinha (ADR-0067 §4). Serve tanto o quadro do `<video>` quanto a imagem escolhida no
 * "enviar arquivo" — as duas são `CanvasImageSource`.
 *
 * T14: quando o código de barras não resolve (`unreadable`) e o OCR está ligado, tenta ler o
 * número impresso sobre o mesmo quadro, em resolução plena — nunca troca sozinho (R2, R4): o
 * resultado ainda é `matched`/`otherSelected`/`unreadable`, e `ocrSuggestion` só acompanha o
 * número lido para a pessoa comparar antes de confirmar (ADR-0067 §4).
 */
export async function captureFieldDeliveryPhoto({
  canhotoOcrEnabled,
  expectedDocumentId,
  height,
  selectedDocumentIds,
  source,
  tripDocuments,
  width,
}: CaptureFieldDeliveryPhotoParams): Promise<FieldDeliveryCapturedPhoto> {
  const frame = captureLuminanceFrame(source, width, height)
  const identification: CanhotoIdentificationResult =
    frame === undefined
      ? { status: 'unreadable' }
      : identifyCanhotoFromFrame({ expectedDocumentId, frame, selectedDocumentIds, tripDocuments })
  const imageBlob = await reduceFieldDeliveryImageToJpeg(source, { height, width })

  if (identification.status !== 'unreadable' || canhotoOcrEnabled !== true) {
    return { identification, imageBlob }
  }

  const canvas = drawFullResolutionCanvas(source, width, height)
  const words = canvas === undefined ? undefined : await recognizeCanhotoWords(canvas)
  if (words === undefined) return { identification, imageBlob }

  const ocrResult = identifyCanhotoNumber({
    expectedDocumentId,
    selectedDocumentIds,
    tripDocuments: tripDocuments.map((document) => ({
      id: document.id,
      nfeNumber: document.nfeNumber ?? null,
      nfeSeries: document.nfeSeries ?? null,
      releasedAt: document.releasedAt ?? null,
    })),
    words,
  })
  if (ocrResult.status === 'manual') return { identification, imageBlob }

  return {
    identification: { documentId: ocrResult.documentId, status: ocrResult.status },
    imageBlob,
    ocrSuggestion: ocrResult.extraction,
  }
}

/** O arquivo escolhido em "enviar arquivo" (canhoto escaneado) vira `<img>` para o mesmo canvas. */
export function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      resolve(image)
      URL.revokeObjectURL(url)
    }
    image.onerror = () => {
      reject(new Error('FIELD_DELIVERY_IMAGE_LOAD_FAILED'))
      URL.revokeObjectURL(url)
    }
    image.src = url
  })
}
