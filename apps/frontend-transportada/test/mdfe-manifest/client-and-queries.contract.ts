/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  AUTHORIZED_MANIFEST_SUMMARY,
  CREATE_MANIFEST_BODY,
  DOCUMENT_ID,
  ISSUANCE_SUMMARY,
  loadFutureModule,
  MANIFEST_DETAIL,
  MANIFEST_ID,
  MANIFEST_PAGE,
  MANIFEST_PREVIEW,
  MANIFEST_SUMMARY,
  SECOND_DOCUMENT_ID,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_CURSOR,
  SYNTHETIC_IDEMPOTENCY_KEY,
  VEHICLE_ID,
} from './mdfe-manifest.fixture'

const API_URL = 'https://api.example.test'
const MANIFESTS_PATH = `${API_URL}/mdfe-manifests`
const CLIENT_MODULE = '../../src/modules/mdfe-manifest/shared/mdfeManifestClient.service'
const ADAPTERS_MODULE = '../../src/modules/mdfe-manifest/shared/mdfeManifestResponse.validation'

describe('mdfe manifest client contract', () => {
  test('lists, previews and creates manifests over authenticated no-store requests', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    expect(
      await client.listManifests({
        cursor: SYNTHETIC_CURSOR,
        filters: { statusEq: 'authorized', vehicleIdEq: VEHICLE_ID },
        limit: 25,
      }),
    ).toEqual(MANIFEST_PAGE)
    expect(
      await client.previewManifest({ documentIds: [DOCUMENT_ID, SECOND_DOCUMENT_ID] }),
    ).toEqual(MANIFEST_PREVIEW)
    expect(await client.createManifest(CREATE_MANIFEST_BODY)).toEqual(MANIFEST_DETAIL)
    expect(await client.getManifest({ manifestId: MANIFEST_ID })).toEqual(MANIFEST_DETAIL)

    const [listRequest, previewRequest, createRequest, detailRequest] = requests
    if (
      listRequest === undefined ||
      previewRequest === undefined ||
      createRequest === undefined ||
      detailRequest === undefined
    ) {
      throw new Error('MDFE_CONTRACT_REQUEST_MISSING')
    }

    expect(listRequest.url).toBe(
      `${MANIFESTS_PATH}?cursor=${encodeURIComponent(SYNTHETIC_CURSOR)}&limit=25&statusEq=authorized&vehicleIdEq=${VEHICLE_ID}`,
    )
    expect(listRequest.method).toBe('GET')
    expect(listRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(listRequest.cache).toBe('no-store')

    expect(previewRequest.url).toBe(`${MANIFESTS_PATH}/preview`)
    expect(previewRequest.method).toBe('POST')
    expect(previewRequest.headers.get('content-type')).toBe('application/json')
    expect(await previewRequest.json()).toEqual({
      documentIds: [DOCUMENT_ID, SECOND_DOCUMENT_ID],
    })

    expect(createRequest.url).toBe(MANIFESTS_PATH)
    expect(createRequest.method).toBe('POST')
    expect(await createRequest.json()).toEqual(CREATE_MANIFEST_BODY)

    expect(detailRequest.url).toBe(`${MANIFESTS_PATH}/${MANIFEST_ID}`)
    expect(detailRequest.method).toBe('GET')
    expect(detailRequest.cache).toBe('no-store')
  })

  test('sends issue, close and cancel as idempotent action requests', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    expect(
      await client.issueManifest({
        idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
        manifestId: MANIFEST_ID,
      }),
    ).toEqual(ISSUANCE_SUMMARY)
    await client.closeManifest({
      closureCityCode: '3106200',
      closureState: 'MG',
      idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
      manifestId: MANIFEST_ID,
    })
    await client.cancelManifest({
      idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
      justification: 'Viagem cancelada pelo embarcador',
      manifestId: MANIFEST_ID,
    })

    const [issueRequest, closeRequest, cancelRequest] = requests
    if (issueRequest === undefined || closeRequest === undefined || cancelRequest === undefined) {
      throw new Error('MDFE_CONTRACT_REQUEST_MISSING')
    }

    expect(issueRequest.url).toBe(`${MANIFESTS_PATH}/${MANIFEST_ID}/issue`)
    expect(issueRequest.method).toBe('POST')
    expect(issueRequest.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
    expect(await issueRequest.json()).toEqual({})

    expect(closeRequest.url).toBe(`${MANIFESTS_PATH}/${MANIFEST_ID}/close`)
    expect(closeRequest.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
    expect(await closeRequest.json()).toEqual({ closureCityCode: '3106200', closureState: 'MG' })

    expect(cancelRequest.url).toBe(`${MANIFESTS_PATH}/${MANIFEST_ID}/cancel`)
    expect(cancelRequest.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
    expect(await cancelRequest.json()).toEqual({
      justification: 'Viagem cancelada pelo embarcador',
    })
  })

  test('never smuggles the tenant identifier into the request path or body', async () => {
    const requests: Request[] = []
    const client = await createRecordingClient(requests)

    await client.createManifest({
      ...CREATE_MANIFEST_BODY,
      companyId: 'forbidden-company',
    } as never)
    await client.previewManifest({
      companyId: 'forbidden-company',
      documentIds: [DOCUMENT_ID],
    } as never)
    await client.cancelManifest({
      companyId: 'forbidden-company',
      idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
      justification: 'Viagem cancelada pelo embarcador',
      manifestId: MANIFEST_ID,
    } as never)

    for (const request of requests) {
      expect(request.url).not.toContain('forbidden-company')
      expect(JSON.stringify(await request.json())).not.toContain('forbidden-company')
    }
  })

  test('surfaces the api error code instead of a generic failure', async () => {
    const { createMdfeManifestClient } = await loadFutureModule<ClientModule>(CLIENT_MODULE)
    const client = createMdfeManifestClient({
      apiUrl: API_URL,
      fetch: () =>
        Promise.resolve(
          Response.json(
            { error: { code: 'MDFE_MANIFEST_ALREADY_CLOSED', message: 'closed' } },
            { status: 409 },
          ),
        ),
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(
      await client
        .cancelManifest({
          idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
          justification: 'Viagem cancelada pelo embarcador',
          manifestId: MANIFEST_ID,
        })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'MDFE_MANIFEST_ALREADY_CLOSED' }))
  })

  test('keeps the manifest dto strict, decimal-safe and free of tenant or xml fields', async () => {
    const { createMdfeManifestResponseAdapters } =
      await loadFutureModule<AdaptersModule>(ADAPTERS_MODULE)
    const adapters = createMdfeManifestResponseAdapters()

    expect(adapters.manifestFromApi(MANIFEST_SUMMARY)).toEqual(MANIFEST_SUMMARY)
    expect(adapters.manifestDetailFromApi(MANIFEST_DETAIL)).toEqual(MANIFEST_DETAIL)
    expect(adapters.previewFromApi(MANIFEST_PREVIEW)).toEqual(MANIFEST_PREVIEW)
    expect(adapters.issuanceSummaryFromApi(ISSUANCE_SUMMARY)).toEqual(ISSUANCE_SUMMARY)
    expect(
      adapters.manifestListFromApi({
        data: [MANIFEST_SUMMARY, AUTHORIZED_MANIFEST_SUMMARY],
        page: { nextCursor: SYNTHETIC_CURSOR },
      }),
    ).toEqual(MANIFEST_PAGE)

    expect(() =>
      adapters.manifestFromApi({ ...MANIFEST_SUMMARY, companyId: 'forbidden-company' }),
    ).toThrow('MDFE_MANIFEST_RESPONSE_INVALID')
    expect(() => adapters.manifestFromApi({ ...MANIFEST_SUMMARY, cargoValue: 15000 })).toThrow(
      'MDFE_MANIFEST_RESPONSE_INVALID',
    )
    expect(() => adapters.manifestFromApi({ ...MANIFEST_SUMMARY, status: 'archived' })).toThrow(
      'MDFE_MANIFEST_RESPONSE_INVALID',
    )
    expect(() => adapters.manifestFromApi({ ...MANIFEST_SUMMARY, cteCount: '2' })).toThrow(
      'MDFE_MANIFEST_RESPONSE_INVALID',
    )
    expect(() =>
      adapters.manifestDetailFromApi({ ...MANIFEST_DETAIL, xml: '<mdfeProc />' }),
    ).toThrow('MDFE_MANIFEST_RESPONSE_INVALID')
    expect(() => adapters.manifestDetailFromApi({ ...MANIFEST_DETAIL, drivers: [{}] })).toThrow(
      'MDFE_MANIFEST_RESPONSE_INVALID',
    )
    expect(() => adapters.previewFromApi({ ...MANIFEST_PREVIEW, totals: null })).toThrow(
      'MDFE_MANIFEST_RESPONSE_INVALID',
    )
    expect(() =>
      adapters.issuanceSummaryFromApi({ ...ISSUANCE_SUMMARY, replayed: 'false' }),
    ).toThrow('MDFE_MANIFEST_RESPONSE_INVALID')
    expect(() => adapters.manifestListFromApi({ data: [MANIFEST_SUMMARY], page: null })).toThrow(
      'MDFE_MANIFEST_RESPONSE_INVALID',
    )
  })
})

describe('mdfe manifest controller contract', () => {
  test('gates every action behind its own permission', async () => {
    const { createMdfeManifestController } = await loadFutureModule<ControllerModule>(
      '../../src/modules/mdfe-manifest/hooks/useMdfeManifests.hook',
    )
    const calls: string[] = []
    const client = createStubClient(calls)

    const readerOnly = createMdfeManifestController({ client, permissions: ['mdfe.read'] })
    expect(readerOnly.canReadManifests).toBeTrue()
    expect(readerOnly.canManageManifests).toBeFalse()
    expect(readerOnly.canIssueManifests).toBeFalse()
    expect(readerOnly.canCloseManifests).toBeFalse()
    expect(readerOnly.canCancelManifests).toBeFalse()
    expect(
      await readerOnly.createManifest(CREATE_MANIFEST_BODY).catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'MDFE_MANIFEST_FORBIDDEN' }))
    expect(
      await readerOnly
        .issueManifest({ idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY, manifestId: MANIFEST_ID })
        .catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'MDFE_MANIFEST_FORBIDDEN' }))
    expect(calls).toEqual([])

    const blind = createMdfeManifestController({ client, permissions: [] })
    expect(
      await blind.listManifests({ cursor: null, limit: 25 }).catch((caught: unknown) => caught),
    ).toEqual(expect.objectContaining({ message: 'MDFE_MANIFEST_FORBIDDEN' }))

    const operator = createMdfeManifestController({
      client,
      permissions: ['mdfe.read', 'mdfe.manage', 'mdfe.issue', 'mdfe.close', 'mdfe.cancel'],
    })
    await operator.listManifests({ cursor: null, limit: 25 })
    await operator.previewManifest({ documentIds: [DOCUMENT_ID] })
    await operator.createManifest(CREATE_MANIFEST_BODY)
    await operator.issueManifest({
      idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
      manifestId: MANIFEST_ID,
    })
    await operator.closeManifest({
      closureCityCode: '3106200',
      closureState: 'MG',
      idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
      manifestId: MANIFEST_ID,
    })
    await operator.cancelManifest({
      idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
      justification: 'Viagem cancelada pelo embarcador',
      manifestId: MANIFEST_ID,
    })
    expect(calls).toEqual(['list', 'preview', 'create', 'issue', 'close', 'cancel'])
  })
})

async function createRecordingClient(requests: Request[]): Promise<ManifestClient> {
  const { createMdfeManifestClient } = await loadFutureModule<ClientModule>(CLIENT_MODULE)
  return createMdfeManifestClient({
    apiUrl: API_URL,
    fetch: async (input, init) => {
      const request = new Request(input, init)
      requests.push(request)
      return resolveSyntheticResponse(request)
    },
    getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
  })
}

function resolveSyntheticResponse(request: Request): Promise<Response> {
  if (request.url === `${MANIFESTS_PATH}/preview`) {
    return Promise.resolve(Response.json({ data: MANIFEST_PREVIEW }))
  }
  if (request.url.endsWith('/issue') || request.url.endsWith('/close')) {
    return Promise.resolve(Response.json({ data: ISSUANCE_SUMMARY }, { status: 202 }))
  }
  if (request.url.endsWith('/cancel')) {
    return Promise.resolve(
      Response.json({ data: { ...ISSUANCE_SUMMARY, attemptKind: 'cancel' } }, { status: 202 }),
    )
  }
  if (request.url === MANIFESTS_PATH) {
    return Promise.resolve(Response.json({ data: MANIFEST_DETAIL }, { status: 201 }))
  }
  if (request.url.startsWith(`${MANIFESTS_PATH}?`)) {
    return Promise.resolve(
      Response.json({ data: MANIFEST_PAGE.items, page: { nextCursor: MANIFEST_PAGE.nextCursor } }),
    )
  }
  if (request.url.startsWith(`${MANIFESTS_PATH}/`)) {
    return Promise.resolve(Response.json({ data: MANIFEST_DETAIL }))
  }

  throw new Error(`Unexpected request in contract: ${request.url}`)
}

function createStubClient(calls: string[]): ManifestClient {
  return {
    cancelManifest: () => {
      calls.push('cancel')
      return Promise.resolve(ISSUANCE_SUMMARY)
    },
    closeManifest: () => {
      calls.push('close')
      return Promise.resolve(ISSUANCE_SUMMARY)
    },
    createManifest: () => {
      calls.push('create')
      return Promise.resolve(MANIFEST_DETAIL)
    },
    getManifest: () => {
      calls.push('detail')
      return Promise.resolve(MANIFEST_DETAIL)
    },
    issueManifest: () => {
      calls.push('issue')
      return Promise.resolve(ISSUANCE_SUMMARY)
    },
    listManifests: () => {
      calls.push('list')
      return Promise.resolve(MANIFEST_PAGE)
    },
    previewManifest: () => {
      calls.push('preview')
      return Promise.resolve(MANIFEST_PREVIEW)
    },
  }
}

type ActionInput = Readonly<{ idempotencyKey: string; manifestId: string }>

type ManifestClient = {
  cancelManifest(input: ActionInput & { readonly justification: string }): Promise<unknown>
  closeManifest(
    input: ActionInput & { readonly closureCityCode: string; readonly closureState: string },
  ): Promise<unknown>
  createManifest(input: typeof CREATE_MANIFEST_BODY): Promise<unknown>
  getManifest(input: Readonly<{ manifestId: string }>): Promise<unknown>
  issueManifest(input: ActionInput): Promise<unknown>
  listManifests(
    input: Readonly<{
      cursor: null | string
      filters?: Readonly<{ statusEq?: string; vehicleIdEq?: string }>
      limit: number
    }>,
  ): Promise<unknown>
  previewManifest(input: Readonly<{ documentIds: readonly string[] }>): Promise<unknown>
}

type ClientModule = {
  readonly createMdfeManifestClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => ManifestClient
}

type AdaptersModule = {
  readonly createMdfeManifestResponseAdapters: () => {
    readonly issuanceSummaryFromApi: (input: unknown) => unknown
    readonly manifestDetailFromApi: (input: unknown) => unknown
    readonly manifestFromApi: (input: unknown) => unknown
    readonly manifestListFromApi: (input: unknown) => unknown
    readonly previewFromApi: (input: unknown) => unknown
  }
}

type ControllerModule = {
  readonly createMdfeManifestController: (input: {
    readonly client: ManifestClient
    readonly permissions: readonly string[]
  }) => ManifestClient & {
    readonly canCancelManifests: boolean
    readonly canCloseManifests: boolean
    readonly canIssueManifests: boolean
    readonly canManageManifests: boolean
    readonly canReadManifests: boolean
  }
}
