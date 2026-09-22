/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T6: chave desconhecida é recusa (molde de `readListQuery`). `cursor` só confere presença
 * e tipo string na fronteira — o parse de verdade é `parseTripTimelineCursor` (T5, infraestrutura),
 * reaproveitado aqui porque é quem sabe o formato que ele mesmo produziu (evidence.md T5). `limit`
 * é 1..200, padrão 100 — diferente do teto de 100 de `readPaging`, por isso não reaproveitado.
 */
import { invalidRequest, readListQuery } from '../../http/request-parsing.service.js'
import { parseTripTimelineCursor } from '../application/trip-timeline-cursor.service.js'
import type { TripTimelineCursor } from '../application/trip-timeline.types.js'
import { TripTimelineCursorInvalidError } from '../domain/trip.error.js'

const DEFAULT_LIMIT = 100
const MIN_LIMIT = 1
const MAX_LIMIT = 200
const ALLOWED_KEYS = new Set(['cursor', 'limit'])

function parseLimit(value: string | null): number {
  if (value === null) return DEFAULT_LIMIT
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < MIN_LIMIT || parsed > MAX_LIMIT) {
    throw invalidRequest()
  }
  return parsed
}

function parseCursor(value: string | null): TripTimelineCursor | null {
  if (value === null) return null
  const cursor = parseTripTimelineCursor(value)
  if (cursor === null) throw new TripTimelineCursorInvalidError()
  return cursor
}

export function parseTripTimelineQuery(url: URL): {
  readonly cursor: TripTimelineCursor | null
  readonly limit: number
} {
  const parameters = readListQuery(url, ALLOWED_KEYS)
  return {
    cursor: parseCursor(parameters.get('cursor')),
    limit: parseLimit(parameters.get('limit')),
  }
}
