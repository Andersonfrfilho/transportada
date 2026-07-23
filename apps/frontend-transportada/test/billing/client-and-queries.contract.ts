/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  BILLING_CREATE_REQUEST,
  BILLING_DOCUMENT_PAGE,
  BILLING_ELIGIBLE_FILTERS,
  BILLING_ELIGIBLE_PAGE,
  BILLING_INVOICE_ID,
  BILLING_ISSUED_INVOICE,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_CURSOR,
  SYNTHETIC_IDEMPOTENCY_KEY,
  loadFutureModule,
} from './billing.fixture'

describe('billing client and queries contract', () => {
  test('uses authenticated no-store requests for eligibility, create, detail, documents and cancellation', async () => {
    const requests: Request[] = []
    const { createBillingClient } = await loadFutureModule<BillingClientModule>(
      '../../src/modules/billing/shared/billingClient.service',
    )
    const client = createBillingClient({
      apiUrl: 'https://api.example.test',
      fetch: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return resolveSyntheticResponse(request)
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(
      await client.listEligibleCtes({
        ...BILLING_ELIGIBLE_FILTERS,
        cursor: SYNTHETIC_CURSOR,
      }),
    ).toEqual(BILLING_ELIGIBLE_PAGE)
    expect(
      await client.createInvoice({
        idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
        ...BILLING_CREATE_REQUEST,
      }),
    ).toEqual(BILLING_ISSUED_INVOICE)
    expect(await client.getInvoice({ invoiceId: BILLING_INVOICE_ID })).toEqual(
      BILLING_ISSUED_INVOICE,
    )
    expect(await client.listDocuments({ invoiceId: BILLING_INVOICE_ID })).toEqual(
      BILLING_DOCUMENT_PAGE,
    )
    expect(
      await client.cancelInvoice({
        invoiceId: BILLING_INVOICE_ID,
        reason: 'Cancelamento operacional por ajuste de cobranca',
      }),
    ).toEqual(BILLING_ISSUED_INVOICE)

    const [eligibleRequest, createRequest, detailRequest, documentsRequest, cancelRequest] =
      requests
    if (
      eligibleRequest === undefined ||
      createRequest === undefined ||
      detailRequest === undefined ||
      documentsRequest === undefined ||
      cancelRequest === undefined
    ) {
      throw new Error('BILLING_CONTRACT_REQUEST_MISSING')
    }

    expect(eligibleRequest.url).toBe(
      `https://api.example.test/billing/eligible-ctes?batchId=${BILLING_ELIGIBLE_FILTERS.batchId}&cteNumber=${BILLING_ELIGIBLE_FILTERS.cteNumber}&customerDocument=${BILLING_ELIGIBLE_FILTERS.customerDocument}&issuedFrom=${BILLING_ELIGIBLE_FILTERS.issuedFrom}&issuedTo=${BILLING_ELIGIBLE_FILTERS.issuedTo}&minAmount=${BILLING_ELIGIBLE_FILTERS.minAmount}&maxAmount=${BILLING_ELIGIBLE_FILTERS.maxAmount}&limit=25&cursor=${encodeURIComponent(SYNTHETIC_CURSOR)}`,
    )
    expect(eligibleRequest.method).toBe('GET')
    expect(eligibleRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(eligibleRequest.cache).toBe('no-store')

    expect(createRequest.url).toBe('https://api.example.test/billing/invoices')
    expect(createRequest.method).toBe('POST')
    expect(createRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(createRequest.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
    expect(createRequest.headers.get('content-type')).toBe('application/json')
    expect(createRequest.cache).toBe('no-store')
    expect(await createRequest.json()).toEqual(BILLING_CREATE_REQUEST)

    expect(detailRequest.url).toBe(
      `https://api.example.test/billing/invoices/${BILLING_INVOICE_ID}`,
    )
    expect(detailRequest.method).toBe('GET')
    expect(detailRequest.cache).toBe('no-store')

    expect(documentsRequest.url).toBe(
      `https://api.example.test/billing/invoices/${BILLING_INVOICE_ID}/documents`,
    )
    expect(documentsRequest.method).toBe('GET')
    expect(documentsRequest.cache).toBe('no-store')

    expect(cancelRequest.url).toBe(
      `https://api.example.test/billing/invoices/${BILLING_INVOICE_ID}/cancel`,
    )
    expect(cancelRequest.method).toBe('POST')
    expect(cancelRequest.cache).toBe('no-store')
    expect(await cancelRequest.json()).toEqual({
      reason: 'Cancelamento operacional por ajuste de cobranca',
    })
  })

  test('keeps eligibility, invoice and document dto boundaries strict and rejects sensitive fields', async () => {
    const { createBillingResponseAdapters } = await loadFutureModule<BillingAdaptersModule>(
      '../../src/modules/billing/shared/billingResponse.validation',
    )
    const adapters = createBillingResponseAdapters()

    expect(() =>
      adapters.eligiblePageFromApi({
        data: [{ ...BILLING_ELIGIBLE_PAGE.items[0], companyId: 'forbidden-company' }],
        page: { nextCursor: null },
      }),
    ).toThrow('BILLING_INVALID_ELIGIBLE_RESPONSE')
    expect(() =>
      adapters.invoiceFromApi({
        data: { ...BILLING_ISSUED_INVOICE, totalAmount: 350.5 },
      }),
    ).toThrow('BILLING_INVALID_INVOICE_RESPONSE')
    expect(() =>
      adapters.invoiceFromApi({
        data: { ...BILLING_ISSUED_INVOICE, xml: '<cteProc />' },
      }),
    ).toThrow('BILLING_INVALID_INVOICE_RESPONSE')
    expect(() =>
      adapters.documentPageFromApi({
        data: [{ ...BILLING_DOCUMENT_PAGE.items[0], storageKey: 's3://secret' }],
        page: { nextCursor: null },
      }),
    ).toThrow('BILLING_INVALID_DOCUMENTS_RESPONSE')
  })
})

function resolveSyntheticResponse(request: Request): Promise<Response> {
  if (request.url.includes('/billing/eligible-ctes?')) {
    return Promise.resolve(
      Response.json({
        data: BILLING_ELIGIBLE_PAGE.items,
        page: { nextCursor: BILLING_ELIGIBLE_PAGE.nextCursor },
      }),
    )
  }
  if (request.url.endsWith('/billing/invoices')) {
    return Promise.resolve(Response.json({ data: BILLING_ISSUED_INVOICE }))
  }
  if (request.url.endsWith(`/billing/invoices/${BILLING_INVOICE_ID}`)) {
    return Promise.resolve(Response.json({ data: BILLING_ISSUED_INVOICE }))
  }
  if (request.url.endsWith(`/billing/invoices/${BILLING_INVOICE_ID}/documents`)) {
    return Promise.resolve(
      Response.json({
        data: BILLING_DOCUMENT_PAGE.items,
        page: { nextCursor: BILLING_DOCUMENT_PAGE.nextCursor },
      }),
    )
  }
  if (request.url.endsWith(`/billing/invoices/${BILLING_INVOICE_ID}/cancel`)) {
    return Promise.resolve(Response.json({ data: BILLING_ISSUED_INVOICE }))
  }
  throw new Error(`Unexpected request in contract: ${request.url}`)
}

type BillingClient = {
  cancelInvoice(input: { readonly invoiceId: string; readonly reason: string }): Promise<unknown>
  createInvoice(input: {
    readonly cteIds: readonly string[]
    readonly dueDate: string
    readonly idempotencyKey: string
  }): Promise<unknown>
  getInvoice(input: { readonly invoiceId: string }): Promise<unknown>
  listDocuments(input: { readonly invoiceId: string }): Promise<unknown>
  listEligibleCtes(input: {
    readonly batchId: string
    readonly cteNumber: string
    readonly cursor: null | string
    readonly customerDocument: string
    readonly issuedFrom: string
    readonly issuedTo: string
    readonly limit: number
    readonly maxAmount: string
    readonly minAmount: string
  }): Promise<unknown>
}

type BillingClientModule = {
  readonly createBillingClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => BillingClient
}

type BillingAdaptersModule = {
  readonly createBillingResponseAdapters: () => {
    readonly documentPageFromApi: (input: unknown) => unknown
    readonly eligiblePageFromApi: (input: unknown) => unknown
    readonly invoiceFromApi: (input: unknown) => unknown
  }
}
