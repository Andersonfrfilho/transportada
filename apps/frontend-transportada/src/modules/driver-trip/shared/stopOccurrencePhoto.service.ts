/* Copyright (c) 2026 Ada Technology. MIT License. */
import { buildOccurrencePhotoAttachment } from '@/modules/trip/shared/occurrencePhotoImage.service'

import type {
  DriverFieldReport,
  DriverOccurrenceKind,
  DriverOccurrencePhoto,
} from './driverTrip.types'
import { sumReportPhotoBytes } from './offlineQueue.service'

/**
 * Spec 209 (D2): o "Deu problema" vira dois itens da fila — a ocorrência, e a foto atrás dela,
 * amarrada pela chave da ocorrência. A mesma regra da app do motorista
 * (`apps/frontend-driver/src/modules/driver-trip/shared/stopOccurrencePhoto.service.ts`).
 */
export function buildStopOccurrenceReports(input: {
  readonly createKey: () => string
  readonly description: string
  readonly kind: DriverOccurrenceKind
  readonly photo: DriverOccurrencePhoto | undefined
  readonly stopId: string
}): readonly DriverFieldReport[] {
  const occurrence = {
    description: input.description,
    documentId: null,
    idempotencyKey: input.createKey(),
    kind: 'occurrence',
    occurrenceKind: input.kind,
    stopId: input.stopId,
  } as const
  if (input.photo === undefined) return [occurrence]

  return [
    occurrence,
    buildStopOccurrencePhotoReport({ createKey: input.createKey, occurrence, photo: input.photo }),
  ]
}

type StopOccurrenceReport = Extract<DriverFieldReport, { kind: 'occurrence' }>

/**
 * A foto atrás de uma ocorrência que **já está na fila** — o legado reduz a foto depois de gravar a
 * ocorrência, e a ocorrência nunca espera a redução.
 */
export function buildStopOccurrencePhotoReport(input: {
  readonly createKey: () => string
  readonly occurrence: StopOccurrenceReport
  readonly photo: DriverOccurrencePhoto
}): DriverFieldReport {
  return {
    description: input.occurrence.description,
    documentId: input.occurrence.documentId,
    idempotencyKey: input.createKey(),
    kind: 'stopOccurrencePhoto',
    occurrenceKey: input.occurrence.idempotencyKey,
    occurrenceKind: input.occurrence.occurrenceKind,
    photo: input.photo,
    stopId: input.occurrence.stopId,
  }
}

/** Spec 209 (D3): fila cheia derruba **a foto**, nunca o relato — e a tela diz. */
export function fitStopOccurrenceReports(input: {
  readonly maxBytes: number
  readonly reports: readonly DriverFieldReport[]
  readonly usedBytes: number
}): Readonly<{ isPhotoDropped: boolean; reports: readonly DriverFieldReport[] }> {
  const photoBytes = sumReportPhotoBytes(input.reports)
  if (photoBytes === 0 || input.usedBytes + photoBytes <= input.maxBytes) {
    return { isPhotoDropped: false, reports: input.reports }
  }
  return { isPhotoDropped: true, reports: withoutPhotos(input.reports) }
}

export function withoutPhotos(reports: readonly DriverFieldReport[]): readonly DriverFieldReport[] {
  return reports.filter((report) => report.kind !== 'stopOccurrencePhoto')
}

/** ⚠️ Cópia por valor de `OCCURRENCE_PHOTO_MAX_BYTES` (`occurrence-attachment.policy.ts`, 512 KiB). */
export const STOP_OCCURRENCE_PHOTO_MAX_BYTES = 512 * 1024
const STOP_OCCURRENCE_PHOTO_MIME_TYPE = 'image/jpeg'

/**
 * Spec 209: a foto reduzida como a do escritório (JPEG, sem EXIF, lado ≤ 1600 px). `undefined` quando
 * ela não se deixa ler ou passa do teto mesmo reduzida — a ocorrência sobe sem ela, e a tela avisa.
 */
export async function prepareStopOccurrencePhoto(
  file: File,
): Promise<DriverOccurrencePhoto | undefined> {
  try {
    const { original } = await buildOccurrencePhotoAttachment(file)
    if (original.type !== STOP_OCCURRENCE_PHOTO_MIME_TYPE) return undefined
    if (original.size > STOP_OCCURRENCE_PHOTO_MAX_BYTES) return undefined
    return { blob: original, fileName: 'ocorrencia.jpg' }
  } catch {
    return undefined
  }
}
