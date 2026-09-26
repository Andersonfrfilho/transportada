/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  DriverFieldReport,
  DriverOccurrenceKind,
  DriverOccurrencePhoto,
} from './driverTrip.types'
import { sumReportPhotoBytes } from './offlineQueue.service'

/**
 * Spec 209 (D2): o "Deu problema" vira dois itens da fila — a ocorrência, e a foto atrás dela,
 * amarrada pela chave da ocorrência. A ocorrência é o fato e sobe sozinha; a foto que falha fica à
 * vista como pendente, sem segurar o relato.
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
    /** A ocorrência da parada não aponta nota: é da parada, e a foto também (spec 209). */
    documentId: null,
    idempotencyKey: input.createKey(),
    kind: 'occurrence',
    occurrenceKind: input.kind,
    stopId: input.stopId,
  } as const
  if (input.photo === undefined) return [occurrence]

  return [
    occurrence,
    {
      description: occurrence.description,
      documentId: occurrence.documentId,
      idempotencyKey: input.createKey(),
      kind: 'stopOccurrencePhoto',
      occurrenceKey: occurrence.idempotencyKey,
      occurrenceKind: occurrence.occurrenceKind,
      photo: input.photo,
      stopId: occurrence.stopId,
    },
  ]
}

/**
 * Spec 209 (D3): fila cheia derruba **a foto**, nunca o relato. É a mesma regra para toda foto de
 * ocorrência de parada (vale para a 195): o que não cabe no teto de bytes do aparelho sai, e a tela
 * diz — nunca um descarte calado, nunca o relato recusado por causa da foto.
 */
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
