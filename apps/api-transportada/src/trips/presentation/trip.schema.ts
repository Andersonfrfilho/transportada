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
  parseOptionalBody,
  parseUuidFilter,
  readListQuery,
  readPaging,
} from '../../http/request-parsing.service.js'
import { TRIP_STATUSES } from '../../database/trip.schema.js'
import type { TripFilters } from '../application/trip.port.js'
import {
  batchTransitionTripDocumentsSchema,
  createTripCteBatchSchema,
  createTripSchema,
  dispatchTripSchema,
  linkTripDocumentSchema,
  overrideDeliveryAddressSchema,
  reorderTripStopsSchema,
  setTripMdfeRequirementSchema,
  transitionTripDocumentSchema,
  type BatchTransitionTripDocumentsBody,
  type CreateTripBody,
  type CreateTripCteBatchBody,
  type DispatchTripBody,
  type LinkTripDocumentBody,
  type OverrideDeliveryAddressBody,
  type ReorderTripStopsBody,
  type SetTripMdfeRequirementBody,
  type TransitionTripDocumentBody,
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

/**
 * Corpo opcional: `separate`/`load`/`deliver` quase sempre chegam sem nota nenhuma — o toque do
 * separador não digita motivo. `return` também usa esta função; o use case (T008/T009) é quem
 * exige `returnReason` quando a ação é `return`, não a fronteira HTTP.
 */
export async function parseTransitionTripDocumentRequest(
  request: Request,
): Promise<TransitionTripDocumentBody> {
  return parseOptionalBody(transitionTripDocumentSchema, request)
}

export async function parseBatchTransitionTripDocumentsRequest(
  request: Request,
): Promise<BatchTransitionTripDocumentsBody> {
  return parseBody(batchTransitionTripDocumentsSchema, request)
}

export async function parseCreateTripCteBatchRequest(
  request: Request,
): Promise<CreateTripCteBatchBody> {
  return parseOptionalBody(createTripCteBatchSchema, request)
}

export async function parseDispatchTripRequest(request: Request): Promise<DispatchTripBody> {
  return parseOptionalBody(dispatchTripSchema, request)
}

export async function parseReorderTripStopsRequest(
  request: Request,
): Promise<ReorderTripStopsBody> {
  return parseBody(reorderTripStopsSchema, request)
}

export async function parseOverrideDeliveryAddressRequest(
  request: Request,
): Promise<OverrideDeliveryAddressBody> {
  return parseBody(overrideDeliveryAddressSchema, request)
}

export async function parseSetTripMdfeRequirementRequest(
  request: Request,
): Promise<SetTripMdfeRequirementBody> {
  return parseBody(setTripMdfeRequirementSchema, request)
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
