/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 RF0/T1b.6: os códigos estáveis que a API devolve ao gravar o conjunto de momentos do tipo.
 */
/** Spec 247 RF1: o código estável da recusa do valor pago por linha em tipo sem produtos. */
export const OCCURRENCE_TYPE_DECLARED_AMOUNT_ERROR = {
  NEEDS_ITEMS: 'OCCURRENCE_TYPE_DECLARED_AMOUNT_NEEDS_ITEMS',
} as const

export const OCCURRENCE_TYPE_MOMENTS_ERROR = {
  DOCUMENT_AND_STOP: 'OCCURRENCE_TYPE_MOMENTS_DOCUMENT_AND_STOP',
  REQUIRED: 'OCCURRENCE_TYPE_MOMENTS_REQUIRED',
  STAGE_CONFLICT: 'OCCURRENCE_TYPE_MOMENTS_STAGE_CONFLICT',
} as const
