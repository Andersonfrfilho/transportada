/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export function invalidAccessKey(): ApiError {
  return new ApiError({
    code: 'INVALID_ACCESS_KEY',
    message: 'Access key must have 44 positions and a valid check digit',
    status: 400,
  })
}

export function nfeAccessKeyLookupNotFound(): ApiError {
  return new ApiError({
    code: 'NFE_ACCESS_KEY_LOOKUP_NOT_FOUND',
    message: 'NF-e access key lookup not found',
    status: 404,
  })
}
