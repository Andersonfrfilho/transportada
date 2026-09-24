/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripDocument } from './trip.types'

/**
 * Spec 156 T8c (ADR-0067), revisão do code-reviewer: a mesma regra do servidor
 * (`trip-close.policy.ts`, `drizzle-trip.repository.ts`), não `deliveredAt`/`returnedAt` — os dois
 * campos que a escrita órfã de `deliverDocument` deixava divergentes (hora de entrega sem
 * `separationStatus`). Uma nota está em aberto quando não foi liberada e o estado dela não é
 * `delivered` nem `returned`.
 */
export function isTripDocumentOpenForClose(document: TripDocument): boolean {
  if (document.releasedAt !== null) return false
  return document.separationStatus !== 'delivered' && document.separationStatus !== 'returned'
}

export function countOpenTripDocumentsForClose(documents: readonly TripDocument[]): number {
  return documents.filter(isTripDocumentOpenForClose).length
}
