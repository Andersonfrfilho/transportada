/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 148 T7 (D7): a trilha de auditoria da fila — ator, nota, viagem de origem e de destino.
 */
export const TRIP_DOCUMENT_REVIEW_AUDIT_ACTION = {
  moved: 'trip_document.moved',
  released: 'trip_document.released',
  swapped: 'trip_document.swapped',
} as const

export type TripDocumentReviewAuditAction =
  (typeof TRIP_DOCUMENT_REVIEW_AUDIT_ACTION)[keyof typeof TRIP_DOCUMENT_REVIEW_AUDIT_ACTION]

export const TRIP_DOCUMENT_REVIEW_AUDIT_PERMISSION = 'trip.manage'
export const TRIP_DOCUMENT_REVIEW_ENTITY_TYPE = 'trip_document_review'
export const NFE_DOCUMENT_TARGET_TYPE = 'nfe_document'

/** A fila é de trabalho, não de arquivo: mais que isto é revisão que ninguém vai ler numa tela. */
export const TRIP_DOCUMENT_REVIEW_LIST_LIMIT = 500
