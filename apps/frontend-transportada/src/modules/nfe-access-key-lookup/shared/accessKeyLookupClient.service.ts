/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  LOOKUP_REASONS,
  LOOKUP_STATUSES,
  REQUEST_FAILED_CODE,
  RESPONSE_INVALID_CODE,
  type LookupReason,
  type LookupStatus,
} from './accessKeyLookup.constant'

export type AccessKeyCheckEntry = Readonly<{ accessKey: string; documentId: null | string }>

export type AccessKeyLookupView = Readonly<{
  documentId: null | string
  id: string
  notBefore: null | string
  reason: LookupReason | null
  status: LookupStatus
}>

/** A resposta de `POST`: nota já cadastrada, ou a busca (criada ou já existente). */
export type RequestLookupResult =
  | Readonly<{ documentId: string; kind: 'found' }>
  | Readonly<{ kind: 'lookup'; lookup: AccessKeyLookupView }>

export type AccessKeyLookupClient = Readonly<{
  checkAccessKeys: (accessKeys: readonly string[]) => Promise<readonly AccessKeyCheckEntry[]>
  getLookup: (lookupId: string) => Promise<AccessKeyLookupView>
  requestLookup: (accessKey: string) => Promise<RequestLookupResult>
}>

export type AccessKeyLookupClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export class AccessKeyLookupRequestError extends Error {
  public readonly code: string

  public constructor(code: string) {
    super(code)
    this.name = 'AccessKeyLookupRequestError'
    this.code = code
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readNullableString(value: unknown): null | string | undefined {
  if (value === null || value === undefined) return null
  return typeof value === 'string' ? value : undefined
}

function readErrorCode(payload: unknown): string | undefined {
  if (!isRecord(payload) || !isRecord(payload.error)) return undefined
  return typeof payload.error.code === 'string' ? payload.error.code : undefined
}

function isLookupStatus(value: unknown): value is LookupStatus {
  return LOOKUP_STATUSES.some((status) => status === value)
}

function isLookupReason(value: unknown): value is LookupReason {
  return LOOKUP_REASONS.some((reason) => reason === value)
}

function invalidResponse(): AccessKeyLookupRequestError {
  return new AccessKeyLookupRequestError(RESPONSE_INVALID_CODE)
}

export function mapLookupView(value: unknown): AccessKeyLookupView {
  if (!isRecord(value) || typeof value.id !== 'string' || !isLookupStatus(value.status)) {
    throw invalidResponse()
  }
  const documentId = readNullableString(value.documentId)
  const notBefore = readNullableString(value.notBefore)
  const rawReason = value.reason ?? null
  if (documentId === undefined || notBefore === undefined) throw invalidResponse()
  if (rawReason !== null && !isLookupReason(rawReason)) throw invalidResponse()

  return { documentId, id: value.id, notBefore, reason: rawReason, status: value.status }
}

function mapRequestResult(value: unknown): RequestLookupResult {
  if (isRecord(value) && value.status === 'found') {
    if (typeof value.documentId !== 'string') throw invalidResponse()
    return { documentId: value.documentId, kind: 'found' }
  }
  return { kind: 'lookup', lookup: mapLookupView(value) }
}

function mapChecks(value: unknown): readonly AccessKeyCheckEntry[] {
  if (!Array.isArray(value)) throw invalidResponse()
  return value.map((entry: unknown) => {
    if (!isRecord(entry) || typeof entry.accessKey !== 'string') throw invalidResponse()
    const documentId = readNullableString(entry.documentId)
    if (documentId === undefined) throw invalidResponse()
    return { accessKey: entry.accessKey, documentId }
  })
}

async function requestData(
  input: Readonly<{
    body?: object
    dependencies: AccessKeyLookupClientDependencies
    method: 'GET' | 'POST'
    path: string
  }>,
): Promise<unknown> {
  let response: Response
  try {
    const accessToken = await input.dependencies.getAccessToken()
    response = await input.dependencies.fetch(
      new Request(`${input.dependencies.apiUrl}${input.path}`, {
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${accessToken}`,
          ...(input.body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        method: input.method,
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      }),
    )
  } catch {
    throw new AccessKeyLookupRequestError(REQUEST_FAILED_CODE)
  }
  let payload: unknown
  try {
    payload = JSON.parse(await response.text()) as unknown
  } catch {
    payload = undefined
  }
  if (!response.ok) {
    throw new AccessKeyLookupRequestError(
      readErrorCode(payload) ?? (response.status === 429 ? 'RATE_LIMITED' : REQUEST_FAILED_CODE),
    )
  }
  if (!isRecord(payload) || !('data' in payload)) throw invalidResponse()
  return payload.data
}

export function createAccessKeyLookupClient(
  dependencies: AccessKeyLookupClientDependencies,
): AccessKeyLookupClient {
  return {
    async checkAccessKeys(accessKeys) {
      return mapChecks(
        await requestData({
          body: { accessKeys },
          dependencies,
          method: 'POST',
          path: '/nfe-documents/access-key-checks',
        }),
      )
    },
    async getLookup(lookupId) {
      return mapLookupView(
        await requestData({
          dependencies,
          method: 'GET',
          path: `/nfe-access-key-lookups/${encodeURIComponent(lookupId)}`,
        }),
      )
    },
    async requestLookup(accessKey) {
      return mapRequestResult(
        await requestData({
          body: { accessKey },
          dependencies,
          method: 'POST',
          path: '/nfe-access-key-lookups',
        }),
      )
    },
  }
}
