/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripDocumentDetail } from './trip.types'

/**
 * Gate de "emitir MDF-e" a partir da viagem — decisão de tela, não de domínio (ADR-0023 §3,
 * spec.md § Fora do escopo). O backend segue recusando item sem CT-e autorizado individualmente,
 * como já fazia; isto só evita a chamada quando já se sabe, de antemão, que ela vai falhar.
 */
export function selectPendingCteDocuments(
  documents: readonly TripDocumentDetail[],
): readonly TripDocumentDetail[] {
  return documents.filter((document) => !document.cteAuthorized)
}

export function canIssueMdfe(documents: readonly TripDocumentDetail[]): boolean {
  return documents.length > 0 && selectPendingCteDocuments(documents).length === 0
}
