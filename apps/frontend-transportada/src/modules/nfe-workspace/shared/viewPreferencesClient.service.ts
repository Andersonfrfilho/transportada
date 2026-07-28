/* Copyright (c) 2026 Ada Technology. MIT License. */
export type ViewPreferencesRecord = Readonly<{
  preferences: Record<string, unknown>
  updatedAt: string
}>

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type ViewPreferencesClient = Readonly<{
  get: (input: Readonly<{ viewKey: string }>) => Promise<ViewPreferencesRecord | null>
  save: (
    input: Readonly<{ preferences: Record<string, unknown>; viewKey: string }>,
  ) => Promise<ViewPreferencesRecord>
}>

export type ViewPreferencesClientFactory = (input: ClientDependencies) => ViewPreferencesClient

const VIEW_PREFERENCES_PATH = '/view-preferences'

function requestError(code: string): Error {
  return new Error(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function envelopeData(value: unknown): unknown {
  if (!isRecord(value) || !('data' in value)) {
    throw requestError('VIEW_PREFERENCES_RESPONSE_INVALID')
  }
  return value.data
}

function mapRecord(value: unknown): ViewPreferencesRecord {
  if (!isRecord(value) || !isRecord(value.preferences) || !isString(value.updatedAt)) {
    throw requestError('VIEW_PREFERENCES_RESPONSE_INVALID')
  }
  return { preferences: value.preferences, updatedAt: value.updatedAt }
}

function mapNullableRecord(value: unknown): ViewPreferencesRecord | null {
  const data = envelopeData(value)
  return data === null ? null : mapRecord(data)
}

async function getAccessTokenRequest(
  input: Readonly<{
    dependencies: ClientDependencies
    init?: RequestInit
    path: string
  }>,
): Promise<Request> {
  const accessToken = await input.dependencies.getAccessToken()
  const requestHeaders = new Headers(input.init?.headers)
  requestHeaders.set('authorization', `Bearer ${accessToken}`)
  return new Request(`${input.dependencies.apiUrl}${input.path}`, {
    ...input.init,
    cache: 'no-store',
    headers: requestHeaders,
  })
}

async function requestJson(
  input: Readonly<{
    dependencies: ClientDependencies
    init?: RequestInit
    path: string
  }>,
): Promise<unknown> {
  const request = await getAccessTokenRequest(input)
  let response: Response
  try {
    response = await input.dependencies.fetch(request)
  } catch {
    throw requestError('VIEW_PREFERENCES_REQUEST_FAILED')
  }
  if (!response.ok) {
    throw requestError('VIEW_PREFERENCES_REQUEST_FAILED')
  }
  try {
    return JSON.parse(await response.text()) as unknown
  } catch {
    throw requestError('VIEW_PREFERENCES_RESPONSE_INVALID')
  }
}

function readPath(viewKey: string): string {
  const search = new URLSearchParams()
  search.set('viewKey', viewKey)
  return `${VIEW_PREFERENCES_PATH}?${search.toString()}`
}

export const createViewPreferencesClient: ViewPreferencesClientFactory = (dependencies) => ({
  async get(input) {
    const response = await requestJson({
      dependencies,
      init: { method: 'GET' },
      path: readPath(input.viewKey),
    })
    return mapNullableRecord(response)
  },
  async save(input) {
    const response = await requestJson({
      dependencies,
      init: {
        body: JSON.stringify({ preferences: input.preferences, viewKey: input.viewKey }),
        headers: { 'content-type': 'application/json' },
        method: 'PUT',
      },
      path: VIEW_PREFERENCES_PATH,
    })
    return mapRecord(envelopeData(response))
  },
})
