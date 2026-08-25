/* Copyright (c) 2026 Ada Technology. MIT License. */
import { TRIP_DOCUMENT_SEPARATION_STATUS, type TripDocumentDetail } from './trip.types'

export type TripStopProgress = Readonly<{
  percentByStatus: Readonly<Record<string, number>>
  total: number
}>

/**
 * ADR-0043 §1: a barra de progresso é a mesma máquina de fases da nota, só contada — nenhum
 * cálculo novo, cada nota entra numa e só uma coluna de `TRIP_DOCUMENT_SEPARATION_STATUS`.
 */
export function computeTripStopProgress(
  documents: readonly TripDocumentDetail[],
): TripStopProgress {
  const total = documents.length
  const countByStatus: Record<string, number> = {}
  for (const status of TRIP_DOCUMENT_SEPARATION_STATUS) countByStatus[status] = 0
  for (const document of documents) {
    countByStatus[document.separationStatus] = (countByStatus[document.separationStatus] ?? 0) + 1
  }

  const percentByStatus: Record<string, number> = {}
  for (const status of TRIP_DOCUMENT_SEPARATION_STATUS) {
    percentByStatus[status] = total === 0 ? 0 : ((countByStatus[status] ?? 0) / total) * 100
  }

  return { percentByStatus, total }
}
