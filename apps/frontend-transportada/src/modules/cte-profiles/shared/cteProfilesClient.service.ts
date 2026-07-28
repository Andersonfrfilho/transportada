/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  COMPONENT_KEYS,
  CTE_PROFILES_ERROR,
  CTE_PROFILES_PATH,
  FREIGHT_RULE_KEYS,
  MATCHER_KEYS,
  SETTINGS_KEYS,
} from './cteProfiles.constant'
import type {
  CteProfileBody,
  CteProfileDetail,
  CteProfileFilters,
  CteProfileListPage,
  CteProfileVersionInput,
} from './cteProfiles.types'
import { isRecord, isString } from './cteProfilesGuards.validation'
import { createCteProfileResponseAdapters } from './cteProfilesResponse.validation'

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
  newIdempotencyKey: () => string
}>

export type CteProfilesClient = Readonly<{
  activateProfile: (input: CteProfileVersionInput) => Promise<CteProfileDetail>
  createProfile: (input: CteProfileBody) => Promise<CteProfileDetail>
  deactivateProfile: (input: CteProfileVersionInput) => Promise<CteProfileDetail>
  listProfiles: (
    input: Readonly<{ cursor: null | string; filters?: CteProfileFilters; limit: number }>,
  ) => Promise<CteProfileListPage>
  updateProfile: (input: CteProfileBody & CteProfileVersionInput) => Promise<CteProfileDetail>
}>

function requestError(code: string): Error {
  return new Error(code)
}

function readErrorCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && isString(payload.error.code)) {
    return payload.error.code
  }
  return CTE_PROFILES_ERROR.REQUEST_FAILED
}

async function requestJson(
  input: Readonly<{ fetch: ClientDependencies['fetch']; request: Request }>,
): Promise<unknown> {
  let response: Response
  try {
    response = await input.fetch(input.request)
  } catch {
    throw requestError(CTE_PROFILES_ERROR.REQUEST_FAILED)
  }
  const rawBody = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(rawBody) as unknown
  } catch {
    throw requestError(
      response.ok ? CTE_PROFILES_ERROR.RESPONSE_INVALID : CTE_PROFILES_ERROR.REQUEST_FAILED,
    )
  }
  if (!response.ok) throw requestError(readErrorCode(payload))
  return payload
}

async function authorizedRequest(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    idempotencyKey?: string
    method: 'GET' | 'PATCH' | 'POST'
    path: string
  }>,
): Promise<unknown> {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = { authorization: `Bearer ${accessToken}` }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey
  const requestInit: RequestInit = { cache: 'no-store', headers, method: input.method }
  if (input.body !== undefined) requestInit.body = input.body

  return requestJson({
    fetch: input.dependencies.fetch,
    request: new Request(`${input.dependencies.apiUrl}${input.path}`, requestInit),
  })
}

function readEnvelopeData(input: unknown): unknown {
  if (!isRecord(input) || !('data' in input)) {
    throw requestError(CTE_PROFILES_ERROR.RESPONSE_INVALID)
  }
  return input.data
}

function buildProfileSearch(
  input: Readonly<{ cursor: null | string; filters?: CteProfileFilters; limit: number }>,
): string {
  const search = new URLSearchParams()
  if (input.cursor !== null) search.set('cursor', input.cursor)
  search.set('limit', String(input.limit))
  const nameContains = input.filters?.nameContains
  if (nameContains !== undefined && nameContains.length > 0) {
    search.set('nameContains', nameContains)
  }
  const statusEq = input.filters?.statusEq
  if (statusEq !== undefined) search.set('statusEq', statusEq)
  return search.toString()
}

function pickKeys<TValue>(value: TValue, keys: readonly string[]): TValue {
  const source = value as Record<string, unknown>
  const picked: Record<string, unknown> = {}
  for (const key of keys) {
    if (key in source) picked[key] = source[key]
  }
  return picked as TValue
}

function cleanBody(input: CteProfileBody): CteProfileBody {
  return {
    components: input.components.map((component) => pickKeys(component, COMPONENT_KEYS)),
    freightRule: pickKeys(input.freightRule, FREIGHT_RULE_KEYS),
    matchers: input.matchers.map((matcher) => pickKeys(matcher, MATCHER_KEYS)),
    settings: pickKeys(input.settings, SETTINGS_KEYS),
  }
}

export function createCteProfilesClient(dependencies: ClientDependencies): CteProfilesClient {
  const adapters = createCteProfileResponseAdapters()

  async function mutateStatus(
    input: CteProfileVersionInput & Readonly<{ status: 'active' | 'inactive' }>,
  ): Promise<CteProfileDetail> {
    const response = await authorizedRequest({
      body: JSON.stringify({ expectedVersion: input.expectedVersion, status: input.status }),
      dependencies,
      method: 'PATCH',
      path: `${CTE_PROFILES_PATH}/${input.profileId}/status`,
    })
    return adapters.profileFromApi(readEnvelopeData(response))
  }

  return {
    activateProfile: (input) => mutateStatus({ ...input, status: 'active' }),
    async createProfile(input) {
      const response = await authorizedRequest({
        body: JSON.stringify(cleanBody(input)),
        dependencies,
        idempotencyKey: dependencies.newIdempotencyKey(),
        method: 'POST',
        path: CTE_PROFILES_PATH,
      })
      return adapters.profileFromApi(readEnvelopeData(response))
    },
    deactivateProfile: (input) => mutateStatus({ ...input, status: 'inactive' }),
    async listProfiles(input) {
      const response = await authorizedRequest({
        dependencies,
        method: 'GET',
        path: `${CTE_PROFILES_PATH}?${buildProfileSearch(input)}`,
      })
      return adapters.profileListFromApi(response)
    },
    async updateProfile(input) {
      const response = await authorizedRequest({
        body: JSON.stringify({ ...cleanBody(input), expectedVersion: input.expectedVersion }),
        dependencies,
        method: 'PATCH',
        path: `${CTE_PROFILES_PATH}/${input.profileId}`,
      })
      return adapters.profileFromApi(readEnvelopeData(response))
    },
  }
}
