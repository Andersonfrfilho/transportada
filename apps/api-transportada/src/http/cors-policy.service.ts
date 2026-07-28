/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { HTTP_GET_METHOD } from '../shared/api.constant.js'

export function hasResourcePreflightHeaders(input: {
  readonly method: string
  readonly value: string | null
}): boolean {
  if (input.value === null) return false
  const headers = input.value.split(',').map((header) => header.trim().toLowerCase())
  if (new Set(headers).size !== headers.length) return false
  const expected =
    input.method === HTTP_GET_METHOD
      ? new Set(['authorization'])
      : input.method === 'DELETE'
        ? new Set(['authorization'])
        : new Set(['authorization', 'content-type', 'idempotency-key'])
  return headers.length === expected.size && headers.every((header) => expected.has(header))
}
