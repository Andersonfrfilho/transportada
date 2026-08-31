/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type Page, type Route } from '@playwright/test'

const CORS_HEADERS = {
  'access-control-allow-headers': 'Authorization, Content-Type, Idempotency-Key',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
}
const SMOKE_AUTH_ME_STORAGE_KEY = 'transportada.smoke-auth-me'

const BILLING_INVOICE_ID = '00000000-0000-4000-8000-000000000701'

const BILLING_BATCH_NAME = 'Lote CT-e julho'

const ELIGIBLE_ITEMS = [
  {
    batchId: '00000000-0000-4000-8000-000000000713',
    batchName: BILLING_BATCH_NAME,
    cteId: '00000000-0000-4000-8000-000000000711',
    cteNumber: '123456',
    customerDocument: '12345678000199',
    customerName: 'Transportes Sul Ltda',
    issuedAt: '2026-07-23T10:00:00.000Z',
    nfeNumber: '654321',
    totalAmount: '150.25',
  },
  {
    batchId: '00000000-0000-4000-8000-000000000713',
    batchName: BILLING_BATCH_NAME,
    cteId: '00000000-0000-4000-8000-000000000712',
    cteNumber: '123457',
    customerDocument: '12345678000199',
    customerName: 'Transportes Sul Ltda',
    issuedAt: '2026-07-23T10:05:00.000Z',
    // CT-e sem nota vinculada: o contrato aceita `null`, e a lista precisa provar isso.
    nfeNumber: null,
    totalAmount: '200.25',
  },
] as const

const INVOICE_ITEMS = [
  {
    accessKey: '5'.repeat(44),
    cteNumber: '123456',
    description: 'CT-e 123456',
    totalAmount: '150.25',
  },
  {
    accessKey: '6'.repeat(44),
    cteNumber: '123457',
    description: 'CT-e 123457',
    totalAmount: '200.25',
  },
] as const

const ISSUED_INVOICE = {
  createdAt: '2026-07-23T12:00:00.000Z',
  customer: {
    document: '12345678000199',
    name: 'Transportes Sul Ltda',
  },
  discountAmount: '0.00',
  dueDate: '2026-08-05',
  id: BILLING_INVOICE_ID,
  invoiceNumber: 17,
  issuedAt: '2026-07-23T12:00:00.000Z',
  itemCount: INVOICE_ITEMS.length,
  items: INVOICE_ITEMS,
  observations: 'Faturamento consolidado do lote.',
  status: 'issued',
  subtotalAmount: '350.50',
  surchargeAmount: '0.00',
  totalAmount: '350.50',
  updatedAt: '2026-07-23T12:00:00.000Z',
} as const

export const BILLING_DOCUMENT_FILE_NAME = 'fatura-17.pdf'

/** PDF mínimo válido: o smoke prova o transporte do binário, não o conteúdo fiscal. */
export const BILLING_DOCUMENT_BYTES = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
  'utf8',
)

export const BILLING_DOCUMENT_DOWNLOAD_URL =
  'https://storage.test/temporary/billing-invoice.pdf?signature=redacted'

const DOCUMENTS_PAGE = {
  items: [
    {
      contentType: 'application/pdf',
      documentId: '00000000-0000-4000-8000-000000000702',
      documentType: 'invoice_pdf',
      downloadUrl: BILLING_DOCUMENT_DOWNLOAD_URL,
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
  documentGenerations: number
  documentRequests: number
  failures: string[]
  listRequests: number
  storageDownloads: string[]
  cancellationRequests: number
}

/**
 * Requisição **abortada** não é chamada que falhou: é a que o navegador descartou porque a página
 * mudou embaixo dela. O cabeçalho busca a foto assim que a sessão resolve, e o login navega logo
 * depois — a corrida é normal e não tem consequência nenhuma em produção.
 *
 * O que esta asserção existe para pegar continua pego: rota sem mock escapa para a API real, que não
 * sobe no smoke, e isso vira `ERR_FAILED`/`ERR_CONNECTION_REFUSED`. O `abort` deliberado do smoke do
 * motorista usa `internetdisconnected`, que também não passa por aqui.
 */
function isDiscardedByNavigation(errorText: string | undefined): boolean {
  return errorText === 'net::ERR_ABORTED'
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

/**
 * O cabeçalho busca a foto da pessoa em toda página — o claim `picture` do token aponta para esta
 * mesma rota autenticada, e `<img src>` não manda o `Authorization`. Sem este mock a requisição
 * escapa para a API real, que não sobe no smoke, e o `requestfailed` entra em `failures()`.
 *
 * 404 é a resposta certa para quem não tem foto: o cliente a trata como ausência, e a tela desenha
 * as iniciais.
 */
async function registerUserPictureMock(page: Page): Promise<void> {
  await page.route('**/company-users/*/picture', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ headers: CORS_HEADERS, status: 204 })
      return
    }
    await route.fulfill({ headers: CORS_HEADERS, status: 404 })
  })
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

  await input.page.route(/\/billing\/invoices(?:\?.*)?$/, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await fulfillOptions(route)
      return
    }

    if (route.request().method() === 'GET') {
      await fulfillJson(route, {
        data: [invoiceWithStatus(input.state.currentInvoiceStatus)],
        page: { nextCursor: null },
      })
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
    if (route.request().method() === 'POST') {
      input.state.documentGenerations += 1
      await fulfillJson(route, { data: DOCUMENTS_PAGE.items[0] }, 201)
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

/** A URL assinada abre em outra aba: a rota vai no contexto para valer também no alvo novo. */
async function registerDocumentStorageMock(
  input: Readonly<{ page: Page; state: MockState }>,
): Promise<void> {
  await input.page.context().route('https://storage.test/**', async (route) => {
    input.state.storageDownloads.push(route.request().url())
    await route.fulfill({
      body: BILLING_DOCUMENT_BYTES,
      contentType: 'application/pdf',
      headers: { 'content-disposition': `attachment; filename="${BILLING_DOCUMENT_FILE_NAME}"` },
      status: 200,
    })
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
    documentGenerations: () => number
    documentRequests: () => number
    failures: () => readonly string[]
    listRequests: () => number
    storageDownloads: () => readonly string[]
  }>
> {
  const state: MockState = {
    cancellationRequests: 0,
    createRequests: 0,
    currentInvoiceStatus: input.initialInvoiceStatus ?? 'issued',
    detailRequests: 0,
    documentGenerations: 0,
    documentRequests: 0,
    failures: [],
    listRequests: 0,
    storageDownloads: [],
  }

  input.page.on('requestfailed', (request) => {
    const errorText = request.failure()?.errorText
    if (isDiscardedByNavigation(errorText)) return
    if (new URL(request.url()).origin === 'http://localhost:53001') {
      state.failures.push(`${request.url()} ${errorText}`)
    }
  })

  await Promise.all([
    registerIdentityMock(input),
    registerUserPictureMock(input.page),
    registerBillingMocks({
      eligibleMode: input.eligibleMode ?? 'items',
      initialInvoiceStatus: input.initialInvoiceStatus ?? 'issued',
      page: input.page,
      state,
    }),
    registerDocumentStorageMock({ page: input.page, state }),
  ])

  return {
    cancellationRequests: () => state.cancellationRequests,
    createRequests: () => state.createRequests,
    detailRequests: () => state.detailRequests,
    documentGenerations: () => state.documentGenerations,
    documentRequests: () => state.documentRequests,
    failures: () => state.failures,
    listRequests: () => state.listRequests,
    storageDownloads: () => state.storageDownloads,
  }
}
