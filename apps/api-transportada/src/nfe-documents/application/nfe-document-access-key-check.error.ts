/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

export function invalidAccessKeys(
  invalidKeys: readonly { readonly accessKey: string; readonly index: number }[],
): ApiError {
  return new ApiError({
    code: 'INVALID_ACCESS_KEY',
    details: invalidKeys.map(({ accessKey, index }) => ({
      field: `accessKeys.${index}`,
      message: `Access key ${accessKey} must have 44 positions and a valid check digit`,
    })),
    message: 'Access keys must have 44 positions and a valid check digit',
    status: 400,
  })
}
