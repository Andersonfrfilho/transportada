/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export const NFE_ACCESS_KEY_LOOKUP_ERROR_CODE = {
  BUDGET_ROW_MISSING: 'NFE_ACCESS_KEY_LOOKUP_BUDGET_ROW_MISSING',
  DOCUMENT_MISMATCH: 'NFE_ACCESS_KEY_LOOKUP_DOCUMENT_MISMATCH',
  DOCUMENT_MISSING: 'NFE_ACCESS_KEY_LOOKUP_DOCUMENT_MISSING',
  ENVIRONMENT_MISMATCH: 'NFE_ACCESS_KEY_LOOKUP_ENVIRONMENT_MISMATCH',
  IMPORT_ID_MISMATCH: 'NFE_ACCESS_KEY_LOOKUP_IMPORT_ID_MISMATCH',
  IMPORT_MISSING: 'NFE_ACCESS_KEY_LOOKUP_IMPORT_MISSING',
  NOT_A_DOCUMENT: 'NFE_ACCESS_KEY_LOOKUP_NOT_A_DOCUMENT',
  STORAGE_SHA_CONFLICT: 'NFE_ACCESS_KEY_LOOKUP_STORAGE_SHA_CONFLICT',
  STORED_OBJECT_MISSING: 'NFE_ACCESS_KEY_LOOKUP_STORED_OBJECT_MISSING',
} as const

export type NfeAccessKeyLookupErrorCode =
  (typeof NFE_ACCESS_KEY_LOOKUP_ERROR_CODE)[keyof typeof NFE_ACCESS_KEY_LOOKUP_ERROR_CODE]

export class NfeAccessKeyLookupError extends Error {
  readonly code: NfeAccessKeyLookupErrorCode

  constructor(code: NfeAccessKeyLookupErrorCode) {
    super(code)
    this.name = 'NfeAccessKeyLookupError'
    this.code = code
  }
}

/** Repetir não muda o resultado: o consumidor fecha a busca e manda para a fila morta, sem nova consulta. */
export class NfeAccessKeyLookupNonRetryableError extends NfeAccessKeyLookupError {
  constructor(code: NfeAccessKeyLookupErrorCode) {
    super(code)
    this.name = 'NfeAccessKeyLookupNonRetryableError'
  }
}
