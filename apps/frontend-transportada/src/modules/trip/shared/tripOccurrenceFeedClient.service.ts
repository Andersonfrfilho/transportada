/* Copyright (c) 2026 Ada Technology. MIT License. */
import { TRIP_ERROR } from './trip.constant'
import { isRecord, isString } from './tripGuards.validation'
import type {
  TripOccurrenceAttachment,
  TripOccurrenceFeedFilters,
  TripOccurrenceFeedItem,
  TripOccurrenceFeedOrder,
  TripOccurrenceFeedPage,
} from './tripOccurrenceFeed.service'
import { serializeTripOccurrenceQuery } from './tripOccurrenceFeed.service'

const TRIP_OCCURRENCES_PATH = '/trip-occurrences'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type ListTripOccurrencesInput = Readonly<{
  cursor: null | string
  filters: TripOccurrenceFeedFilters
  order: TripOccurrenceFeedOrder
  perPage: number
}>

export type TripOccurrenceFeedClient = Readonly<{
  listAttachments: (
    input: Readonly<{ occurrenceId: string }>,
  ) => Promise<readonly TripOccurrenceAttachment[]>
  listOccurrences: (input: ListTripOccurrencesInput) => Promise<TripOccurrenceFeedPage>
}>

class TripOccurrenceRequestError extends Error {
  public readonly code: string

  public constructor(code: string) {
    super(code)
    this.code = code
  }
}

function requestError(code: string): TripOccurrenceRequestError {
  return new TripOccurrenceRequestError(code)
}

function isNullableString(value: unknown): value is null | string {
  return value === null || isString(value)
}

function isFeedItem(value: unknown): value is TripOccurrenceFeedItem {
  if (!isRecord(value)) return false
  return (
    isString(value.createdAt) &&
    isString(value.description) &&
    isString(value.driverName) &&
    typeof value.hasAttachment === 'boolean' &&
    isString(value.id) &&
    isNullableString(value.invoiceNumber) &&
    isNullableString(value.invoiceSeries) &&
    typeof value.notifies === 'boolean' &&
    (value.source === 'document' || value.source === 'stop') &&
    (value.stage === null || value.stage === 'delivery' || value.stage === 'separation') &&
    isNullableString(value.stopLabel) &&
    isString(value.tripId) &&
    isString(value.typeName) &&
    isString(value.vehiclePlate)
  )
}

function isAttachment(value: unknown): value is TripOccurrenceAttachment {
  if (!isRecord(value)) return false
  return (
    isString(value.downloadUrl) &&
    isString(value.expiresAt) &&
    isString(value.id) &&
    isString(value.mimeType)
  )
}

function readPage(payload: unknown): TripOccurrenceFeedPage {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.pagination)) {
    throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  }
  if (!payload.data.every(isFeedItem)) throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  const nextCursor = payload.pagination.nextCursor
  if (!isNullableString(nextCursor)) throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  return { items: payload.data, nextCursor }
}

function readAttachments(payload: unknown): readonly TripOccurrenceAttachment[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  }
  if (!payload.data.every(isAttachment)) throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  return payload.data
}

function readErrorCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && isString(payload.error.code)) {
    return payload.error.code
  }
  return TRIP_ERROR.REQUEST_FAILED
}

async function requestJson(dependencies: ClientDependencies, path: string): Promise<unknown> {
  const accessToken = await dependencies.getAccessToken()
  let response: Response
  try {
    response = await dependencies.fetch(
      new Request(`${dependencies.apiUrl}${path}`, {
        cache: 'no-store',
        headers: { authorization: `Bearer ${accessToken}` },
        method: 'GET',
      }),
    )
  } catch {
    throw requestError(TRIP_ERROR.REQUEST_FAILED)
  }
  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw requestError(response.ok ? TRIP_ERROR.RESPONSE_INVALID : TRIP_ERROR.REQUEST_FAILED)
  }
  if (!response.ok) throw requestError(readErrorCode(payload))
  return payload
}

export function createTripOccurrenceFeedClient(
  dependencies: ClientDependencies,
): TripOccurrenceFeedClient {
  return {
    async listAttachments(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${input.occurrenceId}/attachments`,
      )
      return readAttachments(payload)
    },
    async listOccurrences(input) {
      const search = serializeTripOccurrenceQuery(input)
      const payload = await requestJson(dependencies, `${TRIP_OCCURRENCES_PATH}?${search}`)
      return readPage(payload)
    },
  }
}
