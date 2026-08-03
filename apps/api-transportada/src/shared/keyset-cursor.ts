/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type KeysetCursor = {
  readonly createdAt: Date
  readonly id: string
}

/** Cursor de paginação keyset no formato `<iso>::<uuid>`, compartilhado por todas as listagens. */
export function decodeKeysetCursor(value: string | null): KeysetCursor | null {
  if (value === null) return null
  const separator = value.lastIndexOf('::')
  if (separator < 0) return null
  const createdAt = new Date(value.slice(0, separator))
  const id = value.slice(separator + 2)

  return Number.isNaN(createdAt.getTime()) || id.length === 0 ? null : { createdAt, id }
}

export function encodeKeysetCursor(cursor: KeysetCursor): string {
  return `${cursor.createdAt.toISOString()}::${cursor.id}`
}
