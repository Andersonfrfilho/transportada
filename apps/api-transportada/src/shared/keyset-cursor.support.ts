/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
const CURSOR_SEPARATOR = '::'

export type KeysetCursor = {
  readonly createdAt: Date
  readonly id: string
}

export function decodeKeysetCursor(value: string | null): KeysetCursor | null {
  if (value === null) return null
  const separator = value.lastIndexOf(CURSOR_SEPARATOR)
  if (separator < 0) return null
  const createdAt = new Date(value.slice(0, separator))
  const id = value.slice(separator + CURSOR_SEPARATOR.length)
  return Number.isNaN(createdAt.getTime()) || id.length === 0 ? null : { createdAt, id }
}

export function encodeKeysetCursor(record: KeysetCursor): string {
  return `${record.createdAt.toISOString()}${CURSOR_SEPARATOR}${record.id}`
}
