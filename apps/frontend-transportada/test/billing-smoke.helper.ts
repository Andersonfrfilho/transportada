/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type Page, type Route } from '@playwright/test'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}
const SMOKE_AUTH_ME_STORAGE_KEY = 'transportada.smoke-auth-me'

const BILLING_INVOICE_ID = '00000000-0000-4000-8000-000000000701'

const ELIGIBLE_ITEMS = [
  {
    batchId: '00000000-0000-4000-8000-000000000713',
    cteId: '00000000-0000-4000-8000-000000000711',
    cteNumber: '123456',
    customerDocument: '12345678000199',
    customerName: 'Transportes Sul Ltda',
    issuedAt: '2026-07-23T10:00:00.000Z',
    totalAmount: '150.25',
  },
  {
    batchId: '00000000-0000-4000-8000-000000000713',
    cteId: '00000000-0000-4000-8000-000000000712',
    cteNumber: '123457',
    customerDocument: '12345678000199',
    customerName: 'Transportes Sul Ltda',
    issuedAt: '2026-07-23T10:05:00.000Z',
    totalAmount: '200.25',
  },
] as const

const ISSUED_INVOICE = {
  createdAt: '2026-07-23T12:00:00.000Z',
  customer: {
    document: '12345678000199',
    name: 'Transportes Sul Ltda',
  },
  dueDate: '2026-08-05',
  id: BILLING_INVOICE_ID,
  invoiceNumber: 17,
  issuedAt: '2026-07-23T12:00:00.000Z',
  status: 'issued',
  totalAmount: '350.50',
  updatedAt: '2026-07-23T12:00:00.000Z',
} as const

const DOCUMENTS_PAGE = {
  items: [
    {
      contentType: 'application/pdf',
      documentId: '00000000-0000-4000-8000-000000000702',
      documentType: 'invoice_pdf',
      downloadUrl: 'https://storage.test/temporary/billing-invoice.pdf?signature=redacted',
      expiresAt: '2026-07-23T12:30:00.000Z',
      sha256: '1'.repeat(64),
    },
  ],
  nextCursor: null,
} as const

type BillingPermission = 'billing.cancel' | 'billing.create' | 'billing.read'

type EligibleMode = 'empty' | 'items'

type InvoiceStatus = 'cancelled' | 'issued'

type MockState = {
  createRequests: number
  currentInvoiceStatus: InvoiceStatus
  detailRequests: number
  documentRequests: number
  failures: string[]
  listRequests: number
  cancellationRequests: number
}

async function fulfillJson(route: Route, body: unknown, status = 200): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    headers: { ...CORS_HEADERS, 'access-control-allow-origin': '*' },
    status,
  })
}

async function fulfillOptions(route: Route): Promise<void> {
  await route.fulfill({
    headers: { ...CORS_HEADERS, 'access-control-allow-origin': '*' },
    status: 204,
  })
}

function invoiceWithStatus(status: InvoiceStatus) {
  return { ...ISSUED_INVOICE, status }
}

async function registerIdentityMock(
  input: Readonly<{ page: Page; permissions: readonly BillingPermission[] }>,
): Promise<void> {
  await input.page.addInitScript(
    ({ permissions, storageKey }) => {
      window.sessionStorage.setItem(
        storageKey,
        JSON.stringify({
          data: {
            company: { id: '00000000-0000-4000-8000-000000000001' },
            identity: { userId: '00000000-0000-4000-8000-000000000002' },
            permissions,
            roles: ['viewer'],
          },
        }),
      )
    },
    { permissions: input.permissions, storageKey: SMOKE_AUTH_ME_STORAGE_KEY },
  )
  await input.page.route('**/auth/me', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }

    await fulfillJson(route, {
      data: {
        company: { id: '00000000-0000-4000-8000-000000000001' },
        identity: { userId: '00000000-0000-4000-8000-000000000002' },
        permissions: input.permissions,
        roles: ['viewer'],
      },
    })
  })
}

async function registerBillingMocks(
  input: Readonly<{
    eligibleMode: EligibleMode
    initialInvoiceStatus: InvoiceStatus
    page: Page
    state: MockState
  }>,
): Promise<void> {
  input.state.currentInvoiceStatus = input.initialInvoiceStatus

  await input.page.route(/\/billing\/eligible-ctes(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }

    input.state.listRequests += 1
    await fulfillJson(route, {
      data: input.eligibleMode === 'items' ? ELIGIBLE_ITEMS : [],
      page: { nextCursor: null },
    })
  })

  await input.page.route(/\/billing\/invoices$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }

    input.state.createRequests += 1
    input.state.currentInvoiceStatus = 'issued'
    await fulfillJson(route, { data: invoiceWithStatus('issued') }, 201)
  })

  await input.page.route(/\/billing\/invoices\/[^/]+\/documents$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    input.state.documentRequests += 1
    await fulfillJson(route, {
      data: DOCUMENTS_PAGE.items,
      page: { nextCursor: DOCUMENTS_PAGE.nextCursor },
    })
  })

  await input.page.route(/\/billing\/invoices\/[^/]+\/cancel$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    input.state.cancellationRequests += 1
    input.state.currentInvoiceStatus = 'cancelled'
    await fulfillJson(route, { data: invoiceWithStatus('cancelled') })
  })

  await input.page.route(/\/billing\/invoices\/[^/]+$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }
    input.state.detailRequests += 1
    await fulfillJson(route, { data: invoiceWithStatus(input.state.currentInvoiceStatus) })
  })
}

export async function mockBillingWorkspaceApi(
  input: Readonly<{
    eligibleMode?: EligibleMode
    initialInvoiceStatus?: InvoiceStatus
    page: Page
    permissions: readonly BillingPermission[]
  }>,
): Promise<
  Readonly<{
    cancellationRequests: () => number
    createRequests: () => number
    detailRequests: () => number
    documentRequests: () => number
    failures: () => readonly string[]
    listRequests: () => number
  }>
> {
  const state: MockState = {
    cancellationRequests: 0,
    createRequests: 0,
    currentInvoiceStatus: input.initialInvoiceStatus ?? 'issued',
    detailRequests: 0,
    documentRequests: 0,
    failures: [],
    listRequests: 0,
  }

  input.page.on('requestfailed', (request) => {
    if (new URL(request.url()).origin === 'http://localhost:53001') {
      state.failures.push(`${request.url()} ${request.failure()?.errorText}`)
    }
  })

  await Promise.all([
    registerIdentityMock(input),
    registerBillingMocks({
      eligibleMode: input.eligibleMode ?? 'items',
      initialInvoiceStatus: input.initialInvoiceStatus ?? 'issued',
      page: input.page,
      state,
    }),
  ])

  return {
    cancellationRequests: () => state.cancellationRequests,
    createRequests: () => state.createRequests,
    detailRequests: () => state.detailRequests,
    documentRequests: () => state.documentRequests,
    failures: () => state.failures,
    listRequests: () => state.listRequests,
  }
}
