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

export type ResolveMdfeIssueButtonVisibilityInput = Readonly<{
  canManageMdfe: boolean
  documentCount: number
  isCompleted: boolean
}>

/**
 * A permissão do botão é `mdfe.manage`, nunca `trip.manage`: o separador tem a segunda e não a
 * primeira, e o papel `fiscal` — que emite MDF-e — tem a primeira e não a segunda. Pelo gate
 * antigo o barracão via o botão para tomar 403, e quem emite não o via.
 */
export function resolveMdfeIssueButtonVisibility({
  canManageMdfe,
  documentCount,
  isCompleted,
}: ResolveMdfeIssueButtonVisibilityInput): boolean {
  return canManageMdfe && !isCompleted && documentCount > 0
}
