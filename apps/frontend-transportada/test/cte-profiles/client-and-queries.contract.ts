/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  loadFutureModule,
  PROFILE_BODY,
  PROFILE_DETAIL,
  PROFILE_ID,
  PROFILE_LIST_PAGE,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_CURSOR,
  SYNTHETIC_IDEMPOTENCY_KEY,
} from './cte-profiles.fixture'

const API_URL = 'https://api.example.test'
const PROFILES_PATH = `${API_URL}/cte-emission-profiles`

describe('cte emission profiles client contract', () => {
  test('lists, creates, versions and transitions profiles over authenticated no-store requests', async () => {
    const requests: Request[] = []
    const { createCteProfilesClient } = await loadFutureModule<CteProfilesClientModule>(
      '../../src/modules/cte-profiles/shared/cteProfilesClient.service',
    )
    const client = createCteProfilesClient({
      apiUrl: API_URL,
      fetch: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return resolveSyntheticResponse(request)
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
      newIdempotencyKey: () => SYNTHETIC_IDEMPOTENCY_KEY,
    })

    expect(
      await client.listProfiles({
        cursor: SYNTHETIC_CURSOR,
        filters: { nameContains: 'Perfil', statusEq: 'draft' },
        limit: 25,
      }),
    ).toEqual(PROFILE_LIST_PAGE)
    expect(await client.createProfile(PROFILE_BODY)).toEqual(PROFILE_DETAIL)
    expect(
      await client.updateProfile({ ...PROFILE_BODY, expectedVersion: '1', profileId: PROFILE_ID }),
    ).toEqual(PROFILE_DETAIL)
    expect(await client.activateProfile({ expectedVersion: '1', profileId: PROFILE_ID })).toEqual(
      PROFILE_DETAIL,
    )
    expect(await client.deactivateProfile({ expectedVersion: '2', profileId: PROFILE_ID })).toEqual(
      PROFILE_DETAIL,
    )

    const [listRequest, createRequest, updateRequest, activateRequest, deactivateRequest] = requests
    if (
      listRequest === undefined ||
      createRequest === undefined ||
      updateRequest === undefined ||
      activateRequest === undefined ||
      deactivateRequest === undefined
    ) {
      throw new Error('CTE_PROFILES_CONTRACT_REQUEST_MISSING')
    }

    expect(listRequest.url).toBe(
      `${PROFILES_PATH}?cursor=${encodeURIComponent(SYNTHETIC_CURSOR)}&limit=25&nameContains=Perfil&statusEq=draft`,
    )
    expect(listRequest.method).toBe('GET')
    expect(listRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(listRequest.cache).toBe('no-store')

    expect(createRequest.url).toBe(PROFILES_PATH)
    expect(createRequest.method).toBe('POST')
    expect(createRequest.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
    expect(createRequest.headers.get('content-type')).toBe('application/json')
    expect(await createRequest.json()).toEqual(PROFILE_BODY)

    expect(updateRequest.url).toBe(`${PROFILES_PATH}/${PROFILE_ID}`)
    expect(updateRequest.method).toBe('PATCH')
    expect(await updateRequest.json()).toEqual({ ...PROFILE_BODY, expectedVersion: '1' })

    expect(activateRequest.url).toBe(`${PROFILES_PATH}/${PROFILE_ID}/status`)
    expect(activateRequest.method).toBe('PATCH')
    expect(await activateRequest.json()).toEqual({ expectedVersion: '1', status: 'active' })

    expect(deactivateRequest.url).toBe(`${PROFILES_PATH}/${PROFILE_ID}/status`)
    expect(await deactivateRequest.json()).toEqual({ expectedVersion: '2', status: 'inactive' })
  })

  test('never smuggles the tenant identifier into the request path or body', async () => {
    const requests: Request[] = []
    const { createCteProfilesClient } = await loadFutureModule<CteProfilesClientModule>(
      '../../src/modules/cte-profiles/shared/cteProfilesClient.service',
    )
    const client = createCteProfilesClient({
      apiUrl: API_URL,
      fetch: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return resolveSyntheticResponse(request)
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
      newIdempotencyKey: () => SYNTHETIC_IDEMPOTENCY_KEY,
    })

    await client.createProfile({
      ...PROFILE_BODY,
      companyId: 'forbidden-company',
      settings: { ...PROFILE_BODY.settings, companyId: 'forbidden-company' },
    } as never)

    const [createRequest] = requests
    if (createRequest === undefined) throw new Error('CTE_PROFILES_CONTRACT_REQUEST_MISSING')
    expect(JSON.stringify(await createRequest.json())).not.toContain('forbidden-company')
  })

  test('surfaces the api error code instead of a generic failure', async () => {
    const { createCteProfilesClient } = await loadFutureModule<CteProfilesClientModule>(
      '../../src/modules/cte-profiles/shared/cteProfilesClient.service',
    )
    const client = createCteProfilesClient({
      apiUrl: API_URL,
      fetch: () =>
        Promise.resolve(
          Response.json(
            { error: { code: 'CTE_EMISSION_PROFILE_VERSION_CONFLICT', message: 'conflict' } },
            { status: 409 },
          ),
        ),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
      newIdempotencyKey: () => SYNTHETIC_IDEMPOTENCY_KEY,
    })

    expect(
      await client
        .updateProfile({ ...PROFILE_BODY, expectedVersion: '1', profileId: PROFILE_ID })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'CTE_EMISSION_PROFILE_VERSION_CONFLICT' }))
  })

  test('keeps the profile dto strict, decimal-safe and free of tenant fields', async () => {
    const { createCteProfileResponseAdapters } = await loadFutureModule<CteProfilesAdaptersModule>(
      '../../src/modules/cte-profiles/shared/cteProfilesResponse.validation',
    )
    const adapters = createCteProfileResponseAdapters()

    expect(adapters.profileFromApi(PROFILE_DETAIL)).toEqual(PROFILE_DETAIL)
    expect(() =>
      adapters.profileFromApi({ ...PROFILE_DETAIL, companyId: 'forbidden-company' }),
    ).toThrow('CTE_PROFILES_RESPONSE_INVALID')
    expect(() =>
      adapters.profileFromApi({
        ...PROFILE_DETAIL,
        freightRule: { ...PROFILE_DETAIL.freightRule, percentage: 0.045 },
      }),
    ).toThrow('CTE_PROFILES_RESPONSE_INVALID')
    expect(() => adapters.profileFromApi({ ...PROFILE_DETAIL, icmsRate: 'not-decimal' })).toThrow(
      'CTE_PROFILES_RESPONSE_INVALID',
    )
    expect(() => adapters.profileFromApi({ ...PROFILE_DETAIL, status: 'authorized' })).toThrow(
      'CTE_PROFILES_RESPONSE_INVALID',
    )
    expect(() =>
      adapters.profileListFromApi({
        data: [{ ...PROFILE_DETAIL, xml: '<cteProc />' }],
        page: null,
      }),
    ).toThrow('CTE_PROFILES_RESPONSE_INVALID')
  })
})

function resolveSyntheticResponse(request: Request): Promise<Response> {
  if (request.url.includes('/cte-emission-profiles?')) {
    return Promise.resolve(
      Response.json({
        data: PROFILE_LIST_PAGE.items,
        page: { nextCursor: PROFILE_LIST_PAGE.nextCursor },
      }),
    )
  }
  if (request.url.endsWith('/cte-emission-profiles')) {
    return Promise.resolve(Response.json({ data: PROFILE_DETAIL }, { status: 201 }))
  }
  if (request.url.includes(`/cte-emission-profiles/${PROFILE_ID}`)) {
    return Promise.resolve(Response.json({ data: PROFILE_DETAIL }))
  }

  throw new Error(`Unexpected request in contract: ${request.url}`)
}

type CteProfilesClient = {
  activateProfile(input: {
    readonly expectedVersion: string
    readonly profileId: string
  }): Promise<unknown>
  createProfile(input: typeof PROFILE_BODY): Promise<unknown>
  deactivateProfile(input: {
    readonly expectedVersion: string
    readonly profileId: string
  }): Promise<unknown>
  listProfiles(input: {
    readonly cursor: null | string
    readonly filters?: Readonly<{ nameContains?: string; statusEq?: string }>
    readonly limit: number
  }): Promise<unknown>
  updateProfile(
    input: typeof PROFILE_BODY & {
      readonly expectedVersion: string
      readonly profileId: string
    },
  ): Promise<unknown>
}

type CteProfilesClientModule = {
  readonly createCteProfilesClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
    readonly newIdempotencyKey: () => string
  }) => CteProfilesClient
}

type CteProfilesAdaptersModule = {
  readonly createCteProfileResponseAdapters: () => {
    readonly profileFromApi: (input: unknown) => unknown
    readonly profileListFromApi: (input: unknown) => unknown
  }
}
