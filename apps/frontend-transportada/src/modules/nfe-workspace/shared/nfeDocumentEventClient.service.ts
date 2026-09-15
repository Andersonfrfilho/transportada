/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Spec 149 D19 — o mesmo domínio de `NfeDocumentListItem['status']`, cópia por valor. */
export type NfeDocumentEventStatus = 'authorized' | 'cancelled' | 'denied' | 'unsigned'

export type NfeDocumentEventKind = 'event' | 'statusChange'
export type NfeDocumentEventOrigin = 'automatic' | 'manual' | 'unknown'

export type NfeDocumentEventActor = Readonly<{
  id: string
  name: string
}>

export type NfeDocumentEventEntry = Readonly<{
  actor: NfeDocumentEventActor | null
  correctionText: string | null
  eventType: string | null
  id: string
  kind: NfeDocumentEventKind
  occurredAt: string | null
  origin: NfeDocumentEventOrigin
  protocol: string | null
  registeredAt: string
  requestedBy: NfeDocumentEventActor | null
  sequence: string | null
  statusAfter: NfeDocumentEventStatus | null
  statusBefore: NfeDocumentEventStatus | null
  statusCode: string | null
}>

export type NfeDocumentEventPage = Readonly<{
  items: readonly NfeDocumentEventEntry[]
  nextCursor: string | null
}>

const NFE_DOCUMENT_EVENT_ERROR = {
  REQUEST_FAILED: 'NFE_DOCUMENT_EVENT_REQUEST_FAILED',
  RESPONSE_INVALID: 'NFE_DOCUMENT_EVENT_RESPONSE_INVALID',
} as const

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type ListNfeDocumentEventsInput = Readonly<{
  cursor: string | null
  documentId: string
  limit: number
}>

export type NfeDocumentEventClient = Readonly<{
  listDocumentEvents: (input: ListNfeDocumentEventsInput) => Promise<NfeDocumentEventPage>
}>

function requestError(code: string): Error {
  return new Error(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableString(value: unknown): value is null | string {
  return value === null || isString(value)
}

function isEventActor(value: unknown): value is NfeDocumentEventActor {
  return isRecord(value) && isString(value.id) && isString(value.name)
}

function isEventActorOrNull(value: unknown): value is NfeDocumentEventActor | null {
  return value === null || isEventActor(value)
}

function isEventStatus(value: unknown): value is NfeDocumentEventStatus | null {
  return (
    value === null ||
    (isString(value) && ['authorized', 'cancelled', 'denied', 'unsigned'].includes(value))
  )
}

function isEventEntry(value: unknown): value is NfeDocumentEventEntry {
  if (!isRecord(value)) return false
  return (
    isEventActorOrNull(value.actor) &&
    isNullableString(value.correctionText) &&
    isNullableString(value.eventType) &&
    isString(value.id) &&
    (value.kind === 'event' || value.kind === 'statusChange') &&
    isNullableString(value.occurredAt) &&
    (value.origin === 'automatic' || value.origin === 'manual' || value.origin === 'unknown') &&
    isNullableString(value.protocol) &&
    isString(value.registeredAt) &&
    isEventActorOrNull(value.requestedBy) &&
    isNullableString(value.sequence) &&
    isEventStatus(value.statusAfter) &&
    isEventStatus(value.statusBefore) &&
    isNullableString(value.statusCode)
  )
}

function readErrorCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && isString(payload.error.code)) {
    return payload.error.code
  }
  return NFE_DOCUMENT_EVENT_ERROR.REQUEST_FAILED
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
    throw requestError(NFE_DOCUMENT_EVENT_ERROR.REQUEST_FAILED)
  }
  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = rawBody.length === 0 ? {} : (JSON.parse(rawBody) as unknown)
  } catch {
    throw requestError(
      response.ok
        ? NFE_DOCUMENT_EVENT_ERROR.RESPONSE_INVALID
        : NFE_DOCUMENT_EVENT_ERROR.REQUEST_FAILED,
    )
  }
  if (!response.ok) throw requestError(readErrorCode(payload))
  return payload
}

function readPage(payload: unknown): NfeDocumentEventPage {
  if (!isRecord(payload) || !Array.isArray(payload.data) || !isRecord(payload.page)) {
    throw requestError(NFE_DOCUMENT_EVENT_ERROR.RESPONSE_INVALID)
  }
  if (!payload.data.every(isEventEntry)) {
    throw requestError(NFE_DOCUMENT_EVENT_ERROR.RESPONSE_INVALID)
  }
  const nextCursor = payload.page.nextCursor
  if (!isNullableString(nextCursor)) throw requestError(NFE_DOCUMENT_EVENT_ERROR.RESPONSE_INVALID)
  return { items: payload.data, nextCursor }
}

function buildEventsSearch(input: ListNfeDocumentEventsInput): string {
  const search = new URLSearchParams()
  if (input.cursor !== null) search.set('cursor', input.cursor)
  search.set('limit', String(input.limit))
  return search.toString()
}

export function createNfeDocumentEventClient(
  dependencies: ClientDependencies,
): NfeDocumentEventClient {
  return {
    async listDocumentEvents(input) {
      const search = buildEventsSearch(input)
      const payload = await requestJson(
        dependencies,
        `/nfe-documents/${input.documentId}/events?${search}`,
      )
      return readPage(payload)
    },
  }
}
