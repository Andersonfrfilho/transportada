/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0067 §3, spec 156 T8c: encerrar a viagem é do escritório, e com motivo — mas só quando há
 * nota que ainda não fechou. Uma nota está em aberto quando não foi entregue, nem devolvida, nem
 * liberada; com todas fechadas, o motivo é opcional.
 */
import type { TripDocumentSeparationStatus } from '../../database/trip.schema.js'

/**
 * code-standart §16: os dois estados que fecham uma nota (fora do lock, na leitura da política) e
 * a mesma checagem repetida na consulta do repositório (`drizzle-trip.repository.ts`) — uma lista
 * só, importada nos dois lugares.
 */
export const TRIP_CLOSE_SETTLED_SEPARATION_STATUSES = [
  'delivered',
  'returned',
] as const satisfies readonly TripDocumentSeparationStatus[]

const SETTLED_SEPARATION_STATUSES = new Set<TripDocumentSeparationStatus>(
  TRIP_CLOSE_SETTLED_SEPARATION_STATUSES,
)

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
