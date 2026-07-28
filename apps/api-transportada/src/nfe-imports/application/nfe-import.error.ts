/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export function nfeImportNotFound(): ApiError {
  return new ApiError({
    code: 'NFE_IMPORT_NOT_FOUND',
    message: 'NF-e import not found',
    status: 404,
  })
}

export function nfeImportReprocessNotAllowed(): ApiError {
  return new ApiError({
    code: 'NFE_IMPORT_REPROCESS_NOT_ALLOWED',
    message: 'NF-e import cannot be reprocessed',
    status: 409,
  })
}

export function nfeDistributionNotConfigured(): ApiError {
  return new ApiError({
    code: 'NFE_DISTRIBUTION_NOT_CONFIGURED',
    message: 'NF-e distribution is not configured for this company',
    status: 409,
  })
}

export function idempotencyKeyReused(): ApiError {
  return new ApiError({
    code: 'IDEMPOTENCY_KEY_REUSED',
    message: 'Idempotency key cannot be reused',
    status: 409,
  })
}
