/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export const DISTRIBUTION_CURSOR_NSU_PATTERN = /^\d{15}$/

export function distributionCursorNotFound(): ApiError {
  return new ApiError({
    code: 'DISTRIBUTION_CURSOR_NOT_FOUND',
    message: 'Distribution cursor not found',
    status: 404,
  })
}

export function distributionCursorInvalidNsu(): ApiError {
  return new ApiError({
    code: 'DISTRIBUTION_CURSOR_INVALID_NSU',
    message: 'ultNsu must have exactly fifteen digits',
    status: 422,
  })
}

/** NSU acima do máximo do Ambiente Nacional cai na rejeição 589 — barrar antes é mais honesto. */
export function distributionCursorAboveMaxNsu(): ApiError {
  return new ApiError({
    code: 'DISTRIBUTION_CURSOR_ABOVE_MAX_NSU',
    message: 'ultNsu cannot exceed the maximum NSU served by SEFAZ',
    status: 422,
  })
}
