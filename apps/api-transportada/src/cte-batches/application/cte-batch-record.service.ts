/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createInvalidStateError } from '../domain/cte-batch.error.js'

export function getRequiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.length === 0) throw createInvalidStateError()

  return value
}

export function getRequiredRecord(
  record: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const value = record[field]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw createInvalidStateError()
  }

  return value as Record<string, unknown>
}
