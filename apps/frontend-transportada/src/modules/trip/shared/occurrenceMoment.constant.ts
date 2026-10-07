/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 RF0/T1b.6: os códigos estáveis que a API devolve ao gravar o conjunto de momentos do tipo.
 */
export const OCCURRENCE_TYPE_MOMENTS_ERROR = {
  DOCUMENT_AND_STOP: 'OCCURRENCE_TYPE_MOMENTS_DOCUMENT_AND_STOP',
  REQUIRED: 'OCCURRENCE_TYPE_MOMENTS_REQUIRED',
  STAGE_CONFLICT: 'OCCURRENCE_TYPE_MOMENTS_STAGE_CONFLICT',
} as const
