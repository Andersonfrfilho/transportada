/* Copyright (c) 2026 Ada Technology. MIT License. */
import { TRIP_ERROR } from './trip.constant'
import {
  readTripReportMaxRows,
  TRIP_REPORT_PATH,
  TRIP_REPORT_TOO_LARGE_CODE,
  TripReportTooLargeError,
} from './tripReport.service'
import type {
  TripReportFacets,
  TripReportFetchFacets,
  TripReportFetchPage,
  TripReportFilters,
  TripReportPage,
  TripReportPageInput,
  TripReportRow,
} from './tripReport.types'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

const LIST_FILTER_KEYS = [
  'contractorIdIn',
  'documentIdIn',
  'documentStatusIn',
  'driverIdIn',
  'emitterCityIn',
  'emitterNameIn',
  'emitterStateIn',
  'emitterTaxIdIn',
  'fiscalStatusIn',
  'recipientCityIn',
  'recipientStateIn',
  'statusIn',
  'tripIdIn',
  'vehicleIdIn',
] as const
const TEXT_FILTER_KEYS = [
  'createdFrom',
  'createdUntil',
  'cteIssued',
  'emitterAddress',
  'issuedFrom',
  'issuedUntil',
  'numberFrom',
  'numberTo',
  'recipientAddress',
  'recipientName',
  'search',
  'valueAmount',
  'valueOperator',
] as const

export function buildTripReportSearch(input: TripReportPageInput): string {
  const search = new URLSearchParams()
  const filters: TripReportFilters = input.filters
  if (input.cursor !== null) search.set('cursor', input.cursor)
  search.set('limit', String(input.limit))
  for (const key of LIST_FILTER_KEYS) {
    const values = filters[key]
    if (values !== undefined && values.length > 0) search.set(key, values.join(','))
  }
  for (const key of TEXT_FILTER_KEYS) {
    const value = filters[key]
    if (value !== undefined && value.length > 0) search.set(key, value)
  }
  if (filters.proofPendingEq !== undefined)
    search.set('proofPendingEq', String(filters.proofPendingEq))
  return search.toString()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readErrorField(payload: unknown, field: 'code' | 'message'): unknown {
  return isRecord(payload) && isRecord(payload.error) ? payload.error[field] : undefined
}

function readPage(payload: unknown): TripReportPage {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.page)) {
    throw new Error(TRIP_ERROR.RESPONSE_INVALID)
  }
  const { nextCursor, total } = payload.page
  if (nextCursor !== null && typeof nextCursor !== 'string') {
    throw new Error(TRIP_ERROR.RESPONSE_INVALID)
  }
  const excluded = payload.excludedWithoutTrip
  return {
    nextCursor,
    rows: payload.data as readonly TripReportRow[],
    ...(typeof excluded === 'number' ? { excludedWithoutTrip: excluded } : {}),
    ...(typeof total === 'number' ? { total } : {}),
  }
}

async function readResponseJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown
  } catch {
    return undefined
  }
}

const FACETS_PATH = '/trip-document-report/facets'

function isStringList(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function isFacetSides(value: unknown): value is TripReportFacets['cities'] {
  return isRecord(value) && isStringList(value.emitter) && isStringList(value.recipient)
}

function isFacetEmitter(value: unknown): value is TripReportFacets['emitters'][number] {
  return isRecord(value) && typeof value.name === 'string' && typeof value.taxId === 'string'
}

function readFacets(payload: unknown): TripReportFacets {
  const data = isRecord(payload) ? payload.data : undefined
  if (
    !isRecord(data) ||
    !isFacetSides(data.cities) ||
    !isFacetSides(data.states) ||
    !Array.isArray(data.emitters) ||
    !data.emitters.every(isFacetEmitter)
  ) {
    throw new Error(TRIP_ERROR.RESPONSE_INVALID)
  }
  return { cities: data.cities, emitters: data.emitters, states: data.states }
}

export function createTripReportFetchFacets(
  dependencies: ClientDependencies,
): TripReportFetchFacets {
  return async (input) => {
    const accessToken = await dependencies.getAccessToken()
    const response = await dependencies.fetch(
      new Request(`${dependencies.apiUrl}${FACETS_PATH}`, {
        cache: 'no-store',
        headers: { authorization: `Bearer ${accessToken}` },
        method: 'GET',
        ...(input?.signal === undefined ? {} : { signal: input.signal }),
      }),
    )
    const payload = await readResponseJson(response)
    if (response.ok) return readFacets(payload)
    const code = readErrorField(payload, 'code')
    throw new Error(typeof code === 'string' ? code : TRIP_ERROR.REQUEST_FAILED)
  }
}

export function createTripReportFetchPage(dependencies: ClientDependencies): TripReportFetchPage {
  return async (input) => {
    const accessToken = await dependencies.getAccessToken()
    const request = new Request(
      `${dependencies.apiUrl}${TRIP_REPORT_PATH}?${buildTripReportSearch(input)}`,
      {
        cache: 'no-store',
        headers: { authorization: `Bearer ${accessToken}` },
        method: 'GET',
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      },
    )
    const response = await dependencies.fetch(request)
    const payload = await readResponseJson(response)
    if (response.ok) return readPage(payload)
    if (readErrorField(payload, 'code') === TRIP_REPORT_TOO_LARGE_CODE) {
      throw new TripReportTooLargeError(readTripReportMaxRows(readErrorField(payload, 'message')))
    }
    throw new Error(
      typeof readErrorField(payload, 'code') === 'string'
        ? String(readErrorField(payload, 'code'))
        : TRIP_ERROR.REQUEST_FAILED,
    )
  }
}
