/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  serializeBillingBatchCteQuery,
  type BillingBatchCteQuery,
} from './billingBatchSelection.service'
import {
  serializeBillingEligibleQuery,
  type BillingEligibleTableFilters,
} from './billingEligibleTable.service'
import {
  serializeBillingInvoiceQuery,
  type BillingInvoiceTableFilters,
} from './billingInvoiceTable.service'
import { createBillingResponseAdapters } from './billingResponse.validation'

export type BillingEligibleCte = Readonly<{
  batchId: string
  batchName: string
  cteId: string
  cteNumber: string
  customerDocument: string
  customerName: string
  issuedAt: string
  nfeNumber: null | string
  totalAmount: string
}>

export type BillingEligiblePage = Readonly<{
  items: readonly BillingEligibleCte[]
  nextCursor: null | string
}>

export type BillingInvoiceCreate = Readonly<{
  cteIds: readonly string[]
  dueDate: string
}>

export type BillingInvoiceEdit = Readonly<{
  discountAmount?: string
  invoiceId: string
  observations?: string
  surchargeAmount?: string
}>

export type BillingPreviewGroup = Readonly<{
  cteCount: number
  cteIds: readonly string[]
  customerDocument: string
  customerName: string
  totalAmount: string
}>

export type BillingPreviewBlock = Readonly<{ cteId: string; reason: string }>

export type BillingPreview = Readonly<{
  blocked: readonly BillingPreviewBlock[]
  groups: readonly BillingPreviewGroup[]
}>

export type BillingInvoiceItem = Readonly<{
  accessKey: string
  cteNumber: string
  description: string
  totalAmount: string
}>

export type BillingInvoiceSummary = Readonly<{
  createdAt: string
  customer: Readonly<{ document: string; name: string }>
  discountAmount: string
  dueDate: string
  id: string
  invoiceNumber: number
  itemCount: number
  items: readonly BillingInvoiceItem[]
  issuedAt: string
  observations: string
  status: 'cancelled' | 'issued'
  subtotalAmount: string
  surchargeAmount: string
  totalAmount: string
  updatedAt: string
}>

export type BillingInvoicePage = Readonly<{
  items: readonly BillingInvoiceSummary[]
  nextCursor: null | string
}>

export type BillingDocument = Readonly<{
  contentType: 'application/pdf'
  documentId: string
  documentType: 'invoice_pdf'
  downloadUrl: string
  expiresAt: string
  sha256: string
}>

export type BillingDocumentPage = Readonly<{
  items: readonly BillingDocument[]
  nextCursor: null | string
}>

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type BillingClient = Readonly<{
  cancelInvoice: (
    input: Readonly<{ invoiceId: string; reason: string }>,
  ) => Promise<BillingInvoiceSummary>
  createInvoice: (
    input: Readonly<{ cteIds: readonly string[]; dueDate: string; idempotencyKey: string }>,
  ) => Promise<BillingInvoiceSummary>
  generateDocument: (input: Readonly<{ invoiceId: string }>) => Promise<BillingDocument>
  getInvoice: (input: Readonly<{ invoiceId: string }>) => Promise<BillingInvoiceSummary>
  listBillableCtesForBatches: (input: BillingBatchCteQuery) => Promise<BillingEligiblePage>
  listDocuments: (input: Readonly<{ invoiceId: string }>) => Promise<BillingDocumentPage>
  listEligibleCtes: (
    input: Readonly<{
      cursor: null | string
      filters: BillingEligibleTableFilters
      limit: number
    }>,
  ) => Promise<BillingEligiblePage>
  listInvoices: (
    input: Readonly<{ cursor: null | string; filters: BillingInvoiceTableFilters; limit: number }>,
  ) => Promise<BillingInvoicePage>
  previewInvoice: (input: Readonly<{ cteIds: readonly string[] }>) => Promise<BillingPreview>
  updateInvoice: (
    input: BillingInvoiceEdit & Readonly<{ idempotencyKey: string }>,
  ) => Promise<BillingInvoiceSummary>
}>

function requestError(code: string): Error {
  return new Error(code)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function readErrorCode(payload: unknown): string {
  if (isRecord(payload) && isRecord(payload.error) && typeof payload.error.code === 'string') {
    return payload.error.code
  }
  return 'BILLING_REQUEST_FAILED'
}

async function requestJson(
  input: Readonly<{ fetch: ClientDependencies['fetch']; request: Request }>,
) {
  let response: Response
  try {
    response = await input.fetch(input.request)
  } catch {
    throw requestError('BILLING_REQUEST_FAILED')
  }
  let payload: unknown
  try {
    payload = JSON.parse(await response.text()) as unknown
  } catch {
    throw requestError(response.ok ? 'BILLING_RESPONSE_INVALID' : 'BILLING_REQUEST_FAILED')
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
) {
  const accessToken = await input.dependencies.getAccessToken()
  const headers: Record<string, string> = {
    authorization: `Bearer ${accessToken}`,
  }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey
  const requestInit: RequestInit = {
    cache: 'no-store',
    headers,
    method: input.method,
  }
  if (input.body !== undefined) {
    requestInit.body = input.body
  }
  return requestJson({
    fetch: input.dependencies.fetch,
    request: new Request(`${input.dependencies.apiUrl}${input.path}`, requestInit),
  })
}

export function createBillingClient(dependencies: ClientDependencies): BillingClient {
  const adapters = createBillingResponseAdapters()
  return {
    async cancelInvoice(input) {
      return adapters.invoiceFromApi(
        await authorizedRequest({
          body: JSON.stringify({ reason: input.reason }),
          dependencies,
          method: 'POST',
          path: `/billing/invoices/${input.invoiceId}/cancel`,
        }),
      )
    },
    async createInvoice(input) {
      return adapters.invoiceFromApi(
        await authorizedRequest({
          body: JSON.stringify({ cteIds: input.cteIds, dueDate: input.dueDate }),
          dependencies,
          idempotencyKey: input.idempotencyKey,
          method: 'POST',
          path: '/billing/invoices',
        }),
      )
    },
    async generateDocument(input) {
      return adapters.documentFromApi(
        await authorizedRequest({
          dependencies,
          method: 'POST',
          path: `/billing/invoices/${input.invoiceId}/documents`,
        }),
      )
    },
    async getInvoice(input) {
      return adapters.invoiceFromApi(
        await authorizedRequest({
          dependencies,
          method: 'GET',
          path: `/billing/invoices/${input.invoiceId}`,
        }),
      )
    },
    async listBillableCtesForBatches(input) {
      return adapters.eligiblePageFromApi(
        await authorizedRequest({
          dependencies,
          method: 'GET',
          path: `/billing/eligible-ctes?${serializeBillingBatchCteQuery(input)}`,
        }),
      )
    },
    async listDocuments(input) {
      return adapters.documentPageFromApi(
        await authorizedRequest({
          dependencies,
          method: 'GET',
          path: `/billing/invoices/${input.invoiceId}/documents`,
        }),
      )
    },
    async listEligibleCtes(input) {
      return adapters.eligiblePageFromApi(
        await authorizedRequest({
          dependencies,
          method: 'GET',
          path: `/billing/eligible-ctes?${serializeBillingEligibleQuery(input)}`,
        }),
      )
    },
    async listInvoices(input) {
      return adapters.invoicePageFromApi(
        await authorizedRequest({
          dependencies,
          method: 'GET',
          path: `/billing/invoices?${serializeBillingInvoiceQuery(input)}`,
        }),
      )
    },
    async updateInvoice(input) {
      const body: Record<string, string> = {}
      if (input.discountAmount !== undefined) body.discountAmount = input.discountAmount
      if (input.observations !== undefined) body.observations = input.observations
      if (input.surchargeAmount !== undefined) body.surchargeAmount = input.surchargeAmount
      return adapters.invoiceFromApi(
        await authorizedRequest({
          body: JSON.stringify(body),
          dependencies,
          idempotencyKey: input.idempotencyKey,
          method: 'PATCH',
          path: `/billing/invoices/${input.invoiceId}`,
        }),
      )
    },
    async previewInvoice(input) {
      return adapters.previewFromApi(
        await authorizedRequest({
          body: JSON.stringify({ cteIds: input.cteIds }),
          dependencies,
          method: 'POST',
          path: '/billing/invoices/preview',
        }),
      )
    },
  }
}
