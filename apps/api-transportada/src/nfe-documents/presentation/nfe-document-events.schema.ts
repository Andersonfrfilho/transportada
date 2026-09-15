/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'

const CURSOR_SEPARATOR = '::'
/** Microssegundos, como o `to_char` que gera o cursor (`registered_at`) — D19. */
const CURSOR_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/
const MILLISECOND_ISO_LENGTH = 23
const DEFAULT_LIMIT = 20
/** Teto 100 (docs de APIs) — só dígitos de 1 a 100, sem zero à esquerda. */
const LIMIT_PATTERN = /^(?:[1-9]|[1-9][0-9]|100)$/

const querySchema = z
  .object({
    cursor: z.string().refine(isCursorValue).nullable(),
    limit: z.string().regex(LIMIT_PATTERN).transform(Number).nullable(),
  })
  .strict()

export function parseDocumentEventList(url: URL): {
  readonly cursor: string | null
  readonly limit: number
} {
  const allowed = new Set(['cursor', 'limit'])
  const entries = [...url.searchParams.entries()]
  if (entries.some(([key]) => !allowed.has(key))) throw invalidRequest()
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw invalidRequest()

  const result = querySchema.safeParse({
    cursor: url.searchParams.get('cursor'),
    limit: url.searchParams.get('limit'),
  })
  if (!result.success) throw invalidRequest()
  return { cursor: result.data.cursor, limit: result.data.limit ?? DEFAULT_LIMIT }
}

/** `<registered_at>::<id>` — o `registered_at` é `created_at` do evento ou `changed_at` da mudança. */
function isCursorValue(value: string): boolean {
  const [registeredAt = '', id = '', ...rest] = value.split(CURSOR_SEPARATOR)
  return rest.length === 0 && isCursorTimestamp(registeredAt) && z.uuid().safeParse(id).success
}

function isCursorTimestamp(value: string): boolean {
  if (!CURSOR_TIMESTAMP_PATTERN.test(value)) return false
  const millisecondIso = `${value.slice(0, MILLISECOND_ISO_LENGTH)}Z`
  const parsed = new Date(millisecondIso)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === millisecondIso
}

function invalidRequest(): ApiError {
  return new ApiError(HTTP_ERROR.invalidRequest)
}
