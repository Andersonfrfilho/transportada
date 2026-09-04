/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A fronteira da listagem de ocorrências: chave desconhecida é recusa, não silêncio — um filtro
 * digitado errado que fosse ignorado devolveria a lista inteira fingindo estar filtrada.
 */
import { z } from 'zod'

import { HTTP_ERROR } from '../../shared/api.constant.js'
import { ApiError } from '../../shared/api.error.js'
import { TRIP_OCCURRENCE_FEED_STAGES } from '../application/trip-occurrence-feed.use-case.js'
import type {
  TripOccurrenceFeedFilters,
  TripOccurrenceFeedStage,
} from '../application/trip-occurrence-feed.use-case.js'
import type { OccurrenceFeedOrder } from '../domain/occurrence-feed.policy.js'

const UUID = z.string().uuid()

export const TRIP_OCCURRENCE_FEED_MAX_PER_PAGE = 100
const DEFAULT_PER_PAGE = 25
const CURSOR_SEPARATOR = '::'
const MULTI_VALUE_SEPARATOR = ','

const ALLOWED_KEYS = new Set([
  'createdFrom',
  'createdUntil',
  'cursor',
  'order',
  'perPage',
  'plateIn',
  'stageIn',
  'typeIn',
])

function invalidRequest(): ApiError {
  return new ApiError(HTTP_ERROR.invalidRequest)
}

function parseCursor(value: string): void {
  const separator = value.lastIndexOf(CURSOR_SEPARATOR)
  if (separator < 0) throw invalidRequest()
  const createdAt = new Date(value.slice(0, separator))
  const identifier = value.slice(separator + CURSOR_SEPARATOR.length)
  if (
    !Number.isFinite(createdAt.getTime()) ||
    createdAt.toISOString() !== value.slice(0, separator) ||
    !UUID.safeParse(identifier).success
  ) {
    throw invalidRequest()
  }
}

function parseIsoDateTime(value: null | string): string | undefined {
  if (value === null) return undefined
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) throw invalidRequest()
  return parsed.toISOString()
}

function parseMultiValue(value: null | string): readonly string[] | undefined {
  if (value === null) return undefined
  const parts = value
    .split(MULTI_VALUE_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (parts.length === 0) throw invalidRequest()
  return parts
}

function parseStageIn(value: null | string): readonly TripOccurrenceFeedStage[] | undefined {
  const parts = parseMultiValue(value)
  if (parts === undefined) return undefined
  const stages = new Set<string>(TRIP_OCCURRENCE_FEED_STAGES)
  if (parts.some((part) => !stages.has(part))) throw invalidRequest()
  return parts as readonly TripOccurrenceFeedStage[]
}

function parsePerPage(value: null | string): number {
  if (value === null) return DEFAULT_PER_PAGE
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > TRIP_OCCURRENCE_FEED_MAX_PER_PAGE) {
    throw invalidRequest()
  }
  return parsed
}

function parseOrder(value: null | string): OccurrenceFeedOrder {
  if (value === null) return 'desc'
  if (value !== 'asc' && value !== 'desc') throw invalidRequest()
  return value
}

export function parseTripOccurrenceFeedList(url: URL): {
  readonly cursor: null | string
  readonly filters?: TripOccurrenceFeedFilters
  readonly limit: number
  readonly order: OccurrenceFeedOrder
} {
  const entries = [...url.searchParams.entries()]
  if (entries.some(([key]) => !ALLOWED_KEYS.has(key))) throw invalidRequest()
  if (new Set(entries.map(([key]) => key)).size !== entries.length) throw invalidRequest()

  const cursor = url.searchParams.get('cursor')
  if (cursor !== null) parseCursor(cursor)

  const createdFrom = parseIsoDateTime(url.searchParams.get('createdFrom'))
  const createdUntil = parseIsoDateTime(url.searchParams.get('createdUntil'))
  const plateIn = parseMultiValue(url.searchParams.get('plateIn'))
  const stageIn = parseStageIn(url.searchParams.get('stageIn'))
  const typeIn = parseMultiValue(url.searchParams.get('typeIn'))

  const filters: TripOccurrenceFeedFilters = {
    ...(createdFrom === undefined ? {} : { createdFrom }),
    ...(createdUntil === undefined ? {} : { createdUntil }),
    ...(plateIn === undefined ? {} : { plateIn }),
    ...(stageIn === undefined ? {} : { stageIn }),
    ...(typeIn === undefined ? {} : { typeIn }),
  }
  const hasFilters = Object.keys(filters).length > 0

  return {
    cursor,
    limit: parsePerPage(url.searchParams.get('perPage')),
    order: parseOrder(url.searchParams.get('order')),
    ...(hasFilters ? { filters } : {}),
  }
}
