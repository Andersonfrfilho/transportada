/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { z } from 'zod'

import {
  hasFilter,
  invalidRequest,
  optionalFilter,
  parseBody,
  parseBooleanFilter,
  parseOption,
  parseOptionList,
  parseOptionalBody,
  parseUuidFilter,
  parseUuidListFilter,
  readListQuery,
  readPaging,
} from '../../http/request-parsing.service.js'
import { TRIP_STATUSES } from '../../database/trip.schema.js'
import type { TripFilters } from '../application/trip.port.js'
import {
  batchTransitionTripDocumentsSchema,
  closeTripSchema,
  createTripCteBatchSchema,
  createTripSchema,
  dispatchTripSchema,
  linkTripDocumentSchema,
  linkTripDocumentsBatchSchema,
  planTripRouteSchema,
  previewTripCargoSchema,
  previewTripValuationSchema,
  routeGeometrySchema,
  overrideDeliveryAddressSchema,
  reorderTripStopsSchema,
  setTripMdfeRequirementSchema,
  setTripTrailerSchema,
  transitionTripDocumentSchema,
  updateTripCrewSchema,
  type BatchTransitionTripDocumentsBody,
  type CloseTripBody,
  type CreateTripBody,
  type CreateTripCteBatchBody,
  type DispatchTripBody,
  type LinkTripDocumentBody,
  type LinkTripDocumentsBatchBody,
  type PlanTripRouteBody,
  type PreviewTripCargoBody,
  type PreviewTripValuationBody,
  type RouteGeometryBody,
  type OverrideDeliveryAddressBody,
  type ReorderTripStopsBody,
  type SetTripMdfeRequirementBody,
  type SetTripTrailerBody,
  type TransitionTripDocumentBody,
  type UpdateTripCrewBody,
} from './trip-request.schema.js'

const TRIP_QUERY_KEYS = new Set([
  'cursor',
  'limit',
  'statusEq',
  'statusIn',
  'vehicleIdEq',
  'vehicleIdIn',
  'driverIdEq',
  'driverIdIn',
  'createdFrom',
  'createdUntil',
  'proofPendingEq',
])

/**
 * Filtro exato e filtro de lista do mesmo campo se anulariam (`statusEq=draft&statusIn=closed` não
 * tem resposta certa) — recusar, em vez de eleger um deles em silêncio. Mesmo desenho de `billing`.
 */
const TRIP_QUERY_CONFLICTS: readonly (readonly [string, string])[] = [
  ['statusEq', 'statusIn'],
  ['vehicleIdEq', 'vehicleIdIn'],
  ['driverIdEq', 'driverIdIn'],
]

type TripListing = {
  readonly cursor: string | null
  readonly filters?: TripFilters
  readonly limit: number
}

export { parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
/** O corpo da geometria avulsa viaja para a rota, como os demais tipos de corpo deste módulo. */
export type { RouteGeometryBody } from './trip-request.schema.js'

export async function parseCreateTripRequest(request: Request): Promise<CreateTripBody> {
  return parseBody(createTripSchema, request)
}

export async function parseUpdateTripCrewRequest(request: Request): Promise<UpdateTripCrewBody> {
  return parseBody(updateTripCrewSchema, request)
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
export async function parseLinkTripDocumentsBatchRequest(
  request: Request,
): Promise<LinkTripDocumentsBatchBody> {
  return parseBody(linkTripDocumentsBatchSchema, request)
}

export async function parsePreviewTripValuationRequest(
  request: Request,
): Promise<PreviewTripValuationBody> {
  return parseBody(previewTripValuationSchema, request)
}

export async function parsePreviewTripCargoRequest(
  request: Request,
): Promise<PreviewTripCargoBody> {
  return parseBody(previewTripCargoSchema, request)
}

export async function parseRouteGeometryRequest(request: Request): Promise<RouteGeometryBody> {
  return parseBody(routeGeometrySchema, request)
}

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

export async function parsePlanTripRouteRequest(request: Request): Promise<PlanTripRouteBody> {
  return parseOptionalBody(planTripRouteSchema, request)
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

export async function parseCloseTripRequest(request: Request): Promise<CloseTripBody> {
  return parseOptionalBody(closeTripSchema, request)
}

export async function parseSetTripTrailerRequest(request: Request): Promise<SetTripTrailerBody> {
  return parseBody(setTripTrailerSchema, request)
}

export function parseTripList(url: URL): TripListing {
  const parameters = readListQuery(url, TRIP_QUERY_KEYS)
  for (const [exactKey, listKey] of TRIP_QUERY_CONFLICTS) {
    if (parameters.has(exactKey) && parameters.has(listKey)) throw invalidRequest()
  }
  const filters: TripFilters = {
    ...optionalFilter('statusEq', parseOption(parameters.get('statusEq'), TRIP_STATUSES)),
    ...optionalFilter('statusIn', parseOptionList(parameters.get('statusIn'), TRIP_STATUSES)),
    ...optionalFilter('vehicleIdEq', parseUuidFilter(parameters.get('vehicleIdEq'))),
    ...optionalFilter('vehicleIdIn', parseUuidListFilter(parameters.get('vehicleIdIn'))),
    ...optionalFilter('driverIdEq', parseUuidFilter(parameters.get('driverIdEq'))),
    ...optionalFilter('driverIdIn', parseUuidListFilter(parameters.get('driverIdIn'))),
    ...optionalFilter('createdFrom', parseIsoDateTime(parameters.get('createdFrom'))),
    ...optionalFilter('createdUntil', parseIsoDateTime(parameters.get('createdUntil'))),
    ...optionalFilter('proofPendingEq', parseBooleanFilter(parameters.get('proofPendingEq'))),
  }

  return { ...readPaging(parameters), ...(hasFilter(filters) ? { filters } : {}) }
}

export function parseIsoDateTime(value: string | null): string | undefined {
  if (value === null) return undefined
  if (!z.iso.datetime().safeParse(value).success) throw invalidRequest()
  return value
}
