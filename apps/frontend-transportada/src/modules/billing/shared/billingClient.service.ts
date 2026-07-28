/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createBillingResponseAdapters } from './billingResponse.validation'

export type BillingEligibleCte = Readonly<{
  batchId: string
  cteId: string
  cteNumber: string
  customerDocument: string
  customerName: string
  issuedAt: string
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

export type BillingInvoiceSummary = Readonly<{
  createdAt: string
  customer: Readonly<{ document: string; name: string }>
  dueDate: string
  id: string
  invoiceNumber: number
  itemCount?: number
  issuedAt: string
  status: 'cancelled' | 'issued'
  totalAmount: string
  updatedAt: string
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

export type BillingEligibleFilters = Readonly<{
  batchId?: string
  cteNumber?: string
  customerDocument?: string
  issuedFrom?: string
  issuedTo?: string
  limit: number
  maxAmount?: string
  minAmount?: string
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
  getInvoice: (input: Readonly<{ invoiceId: string }>) => Promise<BillingInvoiceSummary>
  listDocuments: (input: Readonly<{ invoiceId: string }>) => Promise<BillingDocumentPage>
  listEligibleCtes: (
    input: Readonly<{ cursor: null | string } & BillingEligibleFilters>,
  ) => Promise<BillingEligiblePage>
}>

function requestError(code: string): Error {
  return new Error(code)
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
  if (!response.ok) throw requestError('BILLING_REQUEST_FAILED')
  try {
    return JSON.parse(await response.text()) as unknown
  } catch {
    throw requestError('BILLING_RESPONSE_INVALID')
  }
}

async function authorizedRequest(
  input: Readonly<{
    body?: string
    dependencies: ClientDependencies
    idempotencyKey?: string
    method: 'GET' | 'POST'
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

function buildEligibleSearch(
  input: Readonly<{ cursor: null | string } & BillingEligibleFilters>,
): string {
  const search = new URLSearchParams()
  if (input.batchId !== undefined) search.set('batchId', input.batchId)
  if (input.cteNumber !== undefined) search.set('cteNumber', input.cteNumber)
  if (input.customerDocument !== undefined) search.set('customerDocument', input.customerDocument)
  if (input.issuedFrom !== undefined) search.set('issuedFrom', input.issuedFrom)
  if (input.issuedTo !== undefined) search.set('issuedTo', input.issuedTo)
  if (input.minAmount !== undefined) search.set('minAmount', input.minAmount)
  if (input.maxAmount !== undefined) search.set('maxAmount', input.maxAmount)
  search.set('limit', String(input.limit))
  if (input.cursor !== null) search.set('cursor', input.cursor)
  return search.toString()
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
    async getInvoice(input) {
      return adapters.invoiceFromApi(
        await authorizedRequest({
          dependencies,
          method: 'GET',
          path: `/billing/invoices/${input.invoiceId}`,
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
          path: `/billing/eligible-ctes?${buildEligibleSearch(input)}`,
        }),
      )
    },
  }
}
