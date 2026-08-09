/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  hasFilter,
  invalidRequest,
  optionalFilter,
  parseBody,
  parseOption,
  parseUuidFilter,
  readListQuery,
  readPaging,
} from '../../http/request-parsing.service.js'
import { TRIP_STATUSES } from '../../database/trip.schema.js'
import type { TripFilters } from '../application/trip.port.js'
import {
  createTripSchema,
  linkTripDocumentSchema,
  type CreateTripBody,
  type LinkTripDocumentBody,
} from './trip-request.schema.js'

const TRIP_QUERY_KEYS = new Set([
  'cursor',
  'limit',
  'statusEq',
  'vehicleIdEq',
  'driverIdEq',
  'createdFrom',
  'createdUntil',
])

type TripListing = {
  readonly cursor: string | null
  readonly filters?: TripFilters
  readonly limit: number
}

export { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'

export async function parseCreateTripRequest(request: Request): Promise<CreateTripBody> {
  return parseBody(createTripSchema, request)
}

export async function parseLinkTripDocumentRequest(
  request: Request,
): Promise<LinkTripDocumentBody> {
  return parseBody(linkTripDocumentSchema, request)
}

export function parseTripList(url: URL): TripListing {
  const parameters = readListQuery(url, TRIP_QUERY_KEYS)
  const filters: TripFilters = {
    ...optionalFilter('statusEq', parseOption(parameters.get('statusEq'), TRIP_STATUSES)),
    ...optionalFilter('vehicleIdEq', parseUuidFilter(parameters.get('vehicleIdEq'))),
    ...optionalFilter('driverIdEq', parseUuidFilter(parameters.get('driverIdEq'))),
    ...optionalFilter('createdFrom', parseIsoDateTime(parameters.get('createdFrom'))),
    ...optionalFilter('createdUntil', parseIsoDateTime(parameters.get('createdUntil'))),
  }

  return { ...readPaging(parameters), ...(hasFilter(filters) ? { filters } : {}) }
}

function parseIsoDateTime(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!z.iso.datetime().safeParse(value).success) throw invalidRequest()
  return value
}
