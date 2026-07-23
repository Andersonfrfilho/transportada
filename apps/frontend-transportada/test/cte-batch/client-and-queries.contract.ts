/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  CTE_BATCH,
  CTE_BATCH_CREATE,
  CTE_BATCH_EVENTS_PAGE,
  CTE_BATCH_ID,
  CTE_BATCH_PAGE,
  CTE_SUBMITTED_BATCH,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_CURSOR,
  SYNTHETIC_IDEMPOTENCY_KEY,
  SYNTHETIC_SUBMIT_KEY,
  loadFutureModule,
} from './cte-batch.fixture'

describe('CT-e batch client and queries contract', () => {
  test('uses relative authenticated no-store requests for batch create, query, submit, cancel and events', async () => {
    const requests: Request[] = []
    const { createCteBatchClient } = await loadFutureModule<CteBatchClientModule>(
      '../../src/modules/cte-batch/shared/cteBatchClient.service',
    )
    const client = createCteBatchClient({
      apiUrl: 'https://api.example.test',
      fetch: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return resolveSyntheticResponse(request)
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
      newIdempotencyKey: () => SYNTHETIC_IDEMPOTENCY_KEY,
      newSubmitIdempotencyKey: () => SYNTHETIC_SUBMIT_KEY,
    })

    expect(await client.listBatches({ cursor: SYNTHETIC_CURSOR, limit: 25 })).toEqual(
      CTE_BATCH_PAGE,
    )
    expect(await client.createBatch(CTE_BATCH_CREATE)).toEqual(CTE_BATCH)
    expect(await client.getBatch(CTE_BATCH_ID)).toEqual(CTE_BATCH)
    expect(await client.submitBatch(CTE_BATCH_ID)).toEqual(CTE_SUBMITTED_BATCH)
    expect(await client.cancelBatch(CTE_BATCH_ID)).toEqual({ ...CTE_BATCH, status: 'cancelled' })
    expect(await client.listEvents({ batchId: CTE_BATCH_ID, cursor: null, limit: 25 })).toEqual(
      CTE_BATCH_EVENTS_PAGE,
    )

    const [listRequest, createRequest, getRequest, submitRequest, cancelRequest, eventsRequest] =
      requests
    if (
      listRequest === undefined ||
      createRequest === undefined ||
      getRequest === undefined ||
      submitRequest === undefined ||
      cancelRequest === undefined ||
      eventsRequest === undefined
    ) {
      throw new Error('CTE_BATCH_CONTRACT_REQUEST_MISSING')
    }

    expect(listRequest.url).toBe(
      `https://api.example.test/cte-batches?cursor=${encodeURIComponent(SYNTHETIC_CURSOR)}&limit=25`,
    )
    expect(createRequest.url).toBe('https://api.example.test/cte-batches')
    expect(getRequest.url).toBe(`https://api.example.test/cte-batches/${CTE_BATCH_ID}`)
    expect(submitRequest.url).toBe(`https://api.example.test/cte-batches/${CTE_BATCH_ID}/submit`)
    expect(cancelRequest.url).toBe(`https://api.example.test/cte-batches/${CTE_BATCH_ID}/cancel`)
    expect(eventsRequest.url).toBe(
      `https://api.example.test/cte-batches/${CTE_BATCH_ID}/events?limit=25`,
    )
    for (const request of requests) {
      expect(request.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
      expect(request.cache).toBe('no-store')
    }
    expect(createRequest.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
    expect(submitRequest.headers.get('idempotency-key')).toBe(SYNTHETIC_SUBMIT_KEY)
    expect(await createRequest.json()).toEqual(CTE_BATCH_CREATE)
    expect(await submitRequest.json()).toEqual({})
    expect(await cancelRequest.json()).toEqual({})
  })

  test('keeps batch DTO boundaries strict and excludes tenant or fiscal payload fields', async () => {
    const { createCteBatchResponseAdapters } = await loadFutureModule<CteBatchAdaptersModule>(
      '../../src/modules/cte-batch/shared/cteBatchResponse.validation',
    )
    const adapters = createCteBatchResponseAdapters()

    expect(() => adapters.batchFromApi({ ...CTE_BATCH, companyId: 'forbidden-company' })).toThrow(
      'CTE_BATCH_INVALID_RESPONSE',
    )
    expect(() => adapters.batchFromApi({ ...CTE_BATCH, itemCount: '1' })).toThrow(
      'CTE_BATCH_INVALID_RESPONSE',
    )
    expect(() =>
      adapters.batchListFromApi({ data: [{ ...CTE_BATCH, xml: '<cteProc />' }], page: {} }),
    ).toThrow('CTE_BATCH_INVALID_LIST_RESPONSE')
    expect(() =>
      adapters.eventsFromApi({
        data: [{ ...CTE_BATCH_EVENTS_PAGE.items[0], xmlPayload: '<cteProc />' }],
        page: { nextCursor: null },
      }),
    ).toThrow('CTE_BATCH_INVALID_EVENTS_RESPONSE')
  })
})

function resolveSyntheticResponse(request: Request): Promise<Response> {
  if (request.url.includes('/cte-batches?')) {
    return Promise.resolve(
      Response.json({
        data: CTE_BATCH_PAGE.items,
        page: { nextCursor: CTE_BATCH_PAGE.nextCursor },
      }),
    )
  }
  if (request.url.endsWith('/cte-batches')) {
    return Promise.resolve(Response.json({ data: CTE_BATCH }))
  }
  if (request.url.endsWith(`/${CTE_BATCH_ID}/submit`)) {
    return Promise.resolve(Response.json({ data: CTE_SUBMITTED_BATCH }))
  }
  if (request.url.endsWith(`/${CTE_BATCH_ID}/cancel`)) {
    return Promise.resolve(Response.json({ data: { ...CTE_BATCH, status: 'cancelled' } }))
  }
  if (request.url.includes(`/${CTE_BATCH_ID}/events?limit=25`)) {
    return Promise.resolve(
      Response.json({
        data: CTE_BATCH_EVENTS_PAGE.items,
        page: { nextCursor: CTE_BATCH_EVENTS_PAGE.nextCursor },
      }),
    )
  }
  if (request.url.endsWith(`/cte-batches/${CTE_BATCH_ID}`)) {
    return Promise.resolve(Response.json({ data: CTE_BATCH }))
  }

  throw new Error(`Unexpected request in contract: ${request.url}`)
}

type CteBatchClient = {
  cancelBatch(batchId: string): Promise<unknown>
  createBatch(input: typeof CTE_BATCH_CREATE): Promise<unknown>
  getBatch(batchId: string): Promise<unknown>
  listBatches(input: { readonly cursor: null | string; readonly limit: number }): Promise<unknown>
  listEvents(input: {
    readonly batchId: string
    readonly cursor: null | string
    readonly limit: number
  }): Promise<unknown>
  submitBatch(batchId: string): Promise<unknown>
}

type CteBatchClientModule = {
  readonly createCteBatchClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
    readonly newIdempotencyKey: () => string
    readonly newSubmitIdempotencyKey: () => string
  }) => CteBatchClient
}

type CteBatchAdaptersModule = {
  readonly createCteBatchResponseAdapters: () => {
    readonly batchFromApi: (input: unknown) => unknown
    readonly batchListFromApi: (input: unknown) => unknown
    readonly eventsFromApi: (input: unknown) => unknown
  }
}
