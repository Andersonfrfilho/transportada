/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  CTE_BATCH_ID,
  CTE_BATCH_ITEM_ID,
  CTE_DOCUMENT_PAGE,
  CTE_ISSUE_RESPONSE,
  CTE_REJECTED_ISSUANCE,
  CTE_REPROCESS_RESPONSE,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_IDEMPOTENCY_KEY,
  SYNTHETIC_REPROCESS_KEY,
  loadFutureModule,
} from './cte-issuance.fixture'

describe('CT-e issuance client and queries contract', () => {
  test('uses authenticated no-store requests for issue, reprocess, status and document metadata', async () => {
    const requests: Request[] = []
    const { createCteIssuanceClient } = await loadFutureModule<CteIssuanceClientModule>(
      '../../src/modules/cte-issuance/shared/cteIssuanceClient.service',
    )
    const client = createCteIssuanceClient({
      apiUrl: 'https://api.example.test',
      fetch: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return resolveSyntheticResponse(request)
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(
      await client.issueBatch({ batchId: CTE_BATCH_ID, idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY }),
    ).toEqual(CTE_ISSUE_RESPONSE)
    expect(
      await client.reprocessItem({
        batchId: CTE_BATCH_ID,
        batchItemId: CTE_BATCH_ITEM_ID,
        idempotencyKey: SYNTHETIC_REPROCESS_KEY,
        reason: 'Correção de dados de homologação',
      }),
    ).toEqual(CTE_REPROCESS_RESPONSE)
    expect(
      await client.getIssuance({ batchId: CTE_BATCH_ID, batchItemId: CTE_BATCH_ITEM_ID }),
    ).toEqual(CTE_REJECTED_ISSUANCE)
    expect(
      await client.listDocuments({ batchId: CTE_BATCH_ID, batchItemId: CTE_BATCH_ITEM_ID }),
    ).toEqual(CTE_DOCUMENT_PAGE)

    const [issueRequest, reprocessRequest, statusRequest, documentsRequest] = requests
    if (
      issueRequest === undefined ||
      reprocessRequest === undefined ||
      statusRequest === undefined ||
      documentsRequest === undefined
    ) {
      throw new Error('CTE_ISSUANCE_CONTRACT_REQUEST_MISSING')
    }

    expect(issueRequest.url).toBe(`https://api.example.test/cte-batches/${CTE_BATCH_ID}/issue`)
    expect(issueRequest.method).toBe('POST')
    expect(issueRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(issueRequest.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
    expect(issueRequest.cache).toBe('no-store')
    expect(await issueRequest.json()).toEqual({})

    expect(reprocessRequest.url).toBe(
      `https://api.example.test/cte-batches/${CTE_BATCH_ID}/items/${CTE_BATCH_ITEM_ID}/reprocess`,
    )
    expect(reprocessRequest.method).toBe('POST')
    expect(reprocessRequest.headers.get('idempotency-key')).toBe(SYNTHETIC_REPROCESS_KEY)
    expect(reprocessRequest.cache).toBe('no-store')
    expect(await reprocessRequest.json()).toEqual({ reason: 'Correção de dados de homologação' })

    expect(statusRequest.url).toBe(
      `https://api.example.test/cte-batches/${CTE_BATCH_ID}/items/${CTE_BATCH_ITEM_ID}/issuance`,
    )
    expect(statusRequest.method).toBe('GET')
    expect(statusRequest.cache).toBe('no-store')

    expect(documentsRequest.url).toBe(
      `https://api.example.test/cte-batches/${CTE_BATCH_ID}/items/${CTE_BATCH_ITEM_ID}/documents`,
    )
    expect(documentsRequest.method).toBe('GET')
    expect(documentsRequest.cache).toBe('no-store')
    expect(
      JSON.stringify(
        await resolveSyntheticResponse(documentsRequest).then((response) => response.json()),
      ),
    ).not.toContain('<cte')
  })

  test('keeps DTO boundaries strict and rejects XML, storage keys and tenant selectors', async () => {
    const { createCteIssuanceResponseAdapters } = await loadFutureModule<CteIssuanceAdaptersModule>(
      '../../src/modules/cte-issuance/shared/cteIssuanceResponse.validation',
    )
    const adapters = createCteIssuanceResponseAdapters()

    expect(() =>
      adapters.issuanceFromApi({ data: { ...CTE_REJECTED_ISSUANCE, xml: '<cteProc />' } }),
    ).toThrow('CTE_ISSUANCE_INVALID_RESPONSE')
    expect(() =>
      adapters.issuanceFromApi({ data: { ...CTE_REJECTED_ISSUANCE, companyId: 'forbidden' } }),
    ).toThrow('CTE_ISSUANCE_INVALID_RESPONSE')
    expect(() =>
      adapters.documentPageFromApi({
        data: [{ ...CTE_DOCUMENT_PAGE.items[0], storageKey: 's3://secret' }],
        page: { nextCursor: null },
      }),
    ).toThrow('CTE_ISSUANCE_INVALID_DOCUMENTS_RESPONSE')
  })
})

function resolveSyntheticResponse(request: Request): Promise<Response> {
  if (request.url.endsWith(`/cte-batches/${CTE_BATCH_ID}/issue`)) {
    return Promise.resolve(Response.json({ data: CTE_ISSUE_RESPONSE }))
  }
  if (request.url.endsWith(`/cte-batches/${CTE_BATCH_ID}/items/${CTE_BATCH_ITEM_ID}/reprocess`)) {
    return Promise.resolve(Response.json({ data: CTE_REPROCESS_RESPONSE }))
  }
  if (request.url.endsWith(`/cte-batches/${CTE_BATCH_ID}/items/${CTE_BATCH_ITEM_ID}/issuance`)) {
    return Promise.resolve(Response.json({ data: CTE_REJECTED_ISSUANCE }))
  }
  if (request.url.endsWith(`/cte-batches/${CTE_BATCH_ID}/items/${CTE_BATCH_ITEM_ID}/documents`)) {
    return Promise.resolve(
      Response.json({
        data: CTE_DOCUMENT_PAGE.items,
        page: { nextCursor: CTE_DOCUMENT_PAGE.nextCursor },
      }),
    )
  }
  throw new Error(`Unexpected request in contract: ${request.url}`)
}

type CteIssuanceClient = {
  getIssuance(input: { readonly batchId: string; readonly batchItemId: string }): Promise<unknown>
  issueBatch(input: { readonly batchId: string; readonly idempotencyKey: string }): Promise<unknown>
  listDocuments(input: { readonly batchId: string; readonly batchItemId: string }): Promise<unknown>
  reprocessItem(input: {
    readonly batchId: string
    readonly batchItemId: string
    readonly idempotencyKey: string
    readonly reason: string
  }): Promise<unknown>
}

type CteIssuanceClientModule = {
  readonly createCteIssuanceClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => CteIssuanceClient
}

type CteIssuanceAdaptersModule = {
  readonly createCteIssuanceResponseAdapters: () => {
    readonly documentPageFromApi: (input: unknown) => unknown
    readonly issuanceFromApi: (input: unknown) => unknown
  }
}
