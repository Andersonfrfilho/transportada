/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0067 §3, spec 156 T8c: encerrar a viagem é do escritório, e com motivo — mas só quando há
 * nota que ainda não fechou. Uma nota está em aberto quando não foi entregue, nem devolvida, nem
 * liberada; com todas fechadas, o motivo é opcional.
 */
import type { TripDocumentSeparationStatus } from '../../database/trip.schema.js'

const SETTLED_SEPARATION_STATUSES = new Set<TripDocumentSeparationStatus>(['delivered', 'returned'])

export type TripCloseDocumentState = {
  readonly releasedAt: string | null
  readonly separationStatus: TripDocumentSeparationStatus
}

export function isTripDocumentOpenForClose(document: TripCloseDocumentState): boolean {
  if (document.releasedAt !== null) return false
  return !SETTLED_SEPARATION_STATUSES.has(document.separationStatus)
}

export function countOpenTripDocumentsForClose(
  documents: readonly TripCloseDocumentState[],
): number {
  return documents.filter(isTripDocumentOpenForClose).length
}

export function checkTripCloseRequiresReason(
  documents: readonly TripCloseDocumentState[],
): boolean {
  return documents.some(isTripDocumentOpenForClose)
}
