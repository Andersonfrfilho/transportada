/* Copyright (c) 2026 Ada Technology. MIT License. */
import { TRIP_ERROR } from './trip.constant'
import { isOccurrenceAttachment, isRecord, isString } from './tripGuards.validation'
import {
  TRIP_OCCURRENCE_CASE_DECISION_KINDS,
  TRIP_OCCURRENCE_CASE_STATUSES,
  type TripOccurrenceAttachment,
  type TripOccurrenceCaseView,
  type TripOccurrenceFeedFilters,
  type TripOccurrenceFeedItem,
  type TripOccurrenceFeedOrder,
  type TripOccurrenceFeedPage,
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

type CaseActionInput = Readonly<{ occurrenceId: string }>
type CaseActionWithNoteInput = Readonly<{ note: string; occurrenceId: string }>

export type TripOccurrenceFeedClient = Readonly<{
  listAttachments: (
    input: Readonly<{ occurrenceId: string }>,
  ) => Promise<readonly TripOccurrenceAttachment[]>
  listOccurrences: (input: ListTripOccurrencesInput) => Promise<TripOccurrenceFeedPage>
  /** Spec 164 T7/RF8b: motivo obrigatório — ocorrência aberta por engano, só de `recorded`/`under_review`. */
  cancelOccurrenceCase: (input: CaseActionWithNoteInput) => Promise<TripOccurrenceCaseView>
  /** RF8: só sai de `decided`. */
  closeOccurrenceCase: (input: CaseActionInput) => Promise<TripOccurrenceCaseView>
  /** RF7: recusa 422 quando `blocked` sem item para acertar. */
  submitOccurrenceCaseToContractor: (input: CaseActionInput) => Promise<TripOccurrenceCaseView>
  /** RF5: `recorded` → `under_review`. */
  reviewOccurrenceCase: (input: CaseActionInput) => Promise<TripOccurrenceCaseView>
  /** RF6: nota obrigatória — encerra dentro da transportadora, sem visibilidade externa. */
  returnOccurrenceCaseToWarehouse: (
    input: CaseActionWithNoteInput,
  ) => Promise<TripOccurrenceCaseView>
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

/** RF10: `null` é "sem tratativa aberta" — nunca um estado inventado. */
function isCaseView(value: unknown): value is TripOccurrenceCaseView {
  if (!isRecord(value)) return false
  const decision = value.decision
  const isValidDecision =
    decision === null ||
    (isRecord(decision) &&
      (decision.decidedAt === null || isString(decision.decidedAt)) &&
      (TRIP_OCCURRENCE_CASE_DECISION_KINDS as readonly unknown[]).includes(decision.kind) &&
      isString(decision.note))
  return (
    isValidDecision &&
    (value.redeliveryPolicy === 'allowed' || value.redeliveryPolicy === 'blocked') &&
    value.settlementTotal === null &&
    (TRIP_OCCURRENCE_CASE_STATUSES as readonly unknown[]).includes(value.status) &&
    isString(value.updatedAt)
  )
}

function isFeedItem(value: unknown): value is TripOccurrenceFeedItem {
  if (!isRecord(value)) return false
  return (
    (value.case === null || isCaseView(value.case)) &&
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

function readPage(payload: unknown): TripOccurrenceFeedPage {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.pagination)) {
    throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  }
  if (!payload.data.every(isFeedItem)) throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  const nextCursor = payload.pagination.nextCursor
  if (!isNullableString(nextCursor)) throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  return { items: payload.data, nextCursor }
}

function readCaseView(payload: unknown): TripOccurrenceCaseView {
  if (!isRecord(payload) || !isCaseView(payload.data)) {
    throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  }
  return payload.data
}

function readAttachments(payload: unknown): readonly TripOccurrenceAttachment[] {
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  }
  if (!payload.data.every(isOccurrenceAttachment)) throw requestError(TRIP_ERROR.RESPONSE_INVALID)
  return payload.data
}

function readErrorCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && isString(payload.error.code)) {
    return payload.error.code
  }
  return TRIP_ERROR.REQUEST_FAILED
}

async function requestJson(
  dependencies: ClientDependencies,
  path: string,
  init?: Readonly<{ body?: object; method?: 'GET' | 'POST' }>,
): Promise<unknown> {
  const accessToken = await dependencies.getAccessToken()
  let response: Response
  try {
    response = await dependencies.fetch(
      new Request(`${dependencies.apiUrl}${path}`, {
        ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(init?.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        method: init?.method ?? 'GET',
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
    async reviewOccurrenceCase(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${input.occurrenceId}/case/review`,
        { method: 'POST' },
      )
      return readCaseView(payload)
    },
    async returnOccurrenceCaseToWarehouse(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${input.occurrenceId}/case/warehouse-return`,
        { body: { note: input.note }, method: 'POST' },
      )
      return readCaseView(payload)
    },
    async submitOccurrenceCaseToContractor(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${input.occurrenceId}/case/contractor-submission`,
        { method: 'POST' },
      )
      return readCaseView(payload)
    },
    async closeOccurrenceCase(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${input.occurrenceId}/case/closure`,
        { method: 'POST' },
      )
      return readCaseView(payload)
    },
    async cancelOccurrenceCase(input) {
      const payload = await requestJson(
        dependencies,
        `${TRIP_OCCURRENCES_PATH}/${input.occurrenceId}/case/cancel`,
        { body: { note: input.note }, method: 'POST' },
      )
      return readCaseView(payload)
    },
  }
}
