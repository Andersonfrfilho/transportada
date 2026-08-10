/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRouter, type defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import { ApiError } from '../../src/shared/api.error'
import { COMPANY_CONTEXT as NFE_COMPANY_CONTEXT } from './nfe-import-application.fixture'

type RegisteredRoute = ReturnType<typeof defineRoute>

type BillingInvoiceCall = {
  readonly batchId?: string
  readonly batchIdIn?: readonly string[]
  readonly context: CompanyContext
  readonly cteIds?: readonly string[]
  readonly cteNumber?: string
  readonly cteNumberFrom?: string
  readonly cteNumberIn?: readonly string[]
  readonly cteNumberTo?: string
  readonly correlationId?: string
  readonly cursor?: string | null
  readonly customerDocument?: string
  readonly customerDocumentIn?: readonly string[]
  readonly customerName?: string
  readonly discountAmount?: string
  readonly dueDate?: string
  readonly dueFrom?: string
  readonly dueTo?: string
  readonly idempotencyKey?: string
  readonly invoiceId?: string
  readonly invoiceNumber?: string
  readonly invoiceNumberFrom?: string
  readonly invoiceNumberIn?: readonly string[]
  readonly invoiceNumberTo?: string
  readonly issuedFrom?: string
  readonly issuedTo?: string
  readonly limit?: number
  readonly maxAmount?: string
  readonly minAmount?: string
  readonly nfeNumberFrom?: string
  readonly nfeNumberIn?: readonly string[]
  readonly nfeNumberTo?: string
  readonly observations?: string
  readonly reason?: string
  readonly status?: string
  readonly statusIn?: readonly string[]
  readonly surchargeAmount?: string
}

type BillingInvoiceSummary = Readonly<Record<string, unknown>>

type BillingInvoicePage = {
  readonly items: readonly BillingInvoiceSummary[]
  readonly nextCursor: string | null
}

type CreateFixtureParams = {
  readonly authenticationError?: Error
  readonly cancelError?: Error
  readonly createError?: Error
  readonly eligiblePage?: unknown
  readonly generateDocumentError?: Error
  readonly getError?: Error
  readonly invoice?: unknown
  readonly invoicesPage?: unknown
  readonly permissions?: CompanyContext['permissions']
  readonly previewError?: Error
  readonly updateError?: Error
}

type BillingHttpRouteDependencies = {
  readonly billingInvoices: {
    readonly cancel: (input: BillingInvoiceCall) => Promise<BillingInvoiceSummary>
    readonly create: (input: BillingInvoiceCall) => Promise<BillingInvoiceSummary>
    readonly generateDocument: (input: BillingInvoiceCall) => Promise<BillingInvoiceSummary>
    readonly get: (input: BillingInvoiceCall) => Promise<BillingInvoiceSummary>
    readonly list: (input: BillingInvoiceCall) => Promise<BillingInvoicePage>
    readonly listDocuments: (input: BillingInvoiceCall) => Promise<typeof DOCUMENTS_PAGE>
    readonly preview: (input: BillingInvoiceCall) => Promise<typeof INVOICE_PREVIEW>
    readonly update: (input: BillingInvoiceCall) => Promise<BillingInvoiceSummary>
  }
  readonly listEligibleBillingCtes: {
    readonly execute: (input: BillingInvoiceCall) => Promise<BillingInvoicePage>
  }
}

export const FRONTEND_ORIGIN = 'http://localhost:53000'
export const BILLING_ELIGIBLE_CTES_PATH = '/billing/eligible-ctes'
export const BILLING_INVOICES_PATH = '/billing/invoices'
export const BILLING_INVOICE_PREVIEW_PATH = '/billing/invoices/preview'
export const INVOICE_ID = '00000000-0000-4000-8000-000000000701'
export const SECONDARY_INVOICE_ID = '00000000-0000-4000-8000-000000000703'
export const DOCUMENT_ID = '00000000-0000-4000-8000-000000000702'
export const CTE_ID_PRIMARY = '00000000-0000-4000-8000-000000000711'
export const CTE_ID_SECONDARY = '00000000-0000-4000-8000-000000000712'
export const INVOICE_IDEMPOTENCY_KEY = 'billing-http-key-0001'
export const ELIGIBLE_FILTERS_QUERY =
  '?batchId=00000000-0000-4000-8000-000000000713&cteNumber=123456&customerDocument=12345678000199&issuedFrom=2026-07-01&issuedTo=2026-07-31&minAmount=100.00&maxAmount=350.50&limit=25&cursor=eligible-cursor-001'
export const INVOICES_FILTERS_QUERY =
  '?status=issued&issuedFrom=2026-07-01&issuedTo=2026-07-31&dueFrom=2026-08-01&dueTo=2026-08-31&customerDocument=12345678000199&invoiceNumber=17&limit=25&cursor=invoices-cursor-001'

export const COMPANY_CONTEXT: CompanyContext = {
  ...NFE_COMPANY_CONTEXT,
  permissions: new Set(['billing.read', 'billing.create', 'billing.cancel']),
}
export const READ_ONLY_CONTEXT: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set(['billing.read']),
}
export const CREATE_ONLY_CONTEXT: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set(['billing.create']),
}

export const INVOICE_ITEMS = [
  {
    accessKey: '35260711222333000181570010000000011000000015',
    cteNumber: '123456',
    description: 'Frete CT-e 123456',
    totalAmount: '150.25',
  },
  {
    accessKey: '35260711222333000181570010000000021000000023',
    cteNumber: '123457',
    description: 'Frete CT-e 123457',
    totalAmount: '200.25',
  },
] as const

export const INVOICE_SUMMARY = {
  createdAt: '2026-07-23T12:00:00.000Z',
  customer: {
    document: '12345678000199',
    name: 'Transportes Sul Ltda',
  },
  discountAmount: '0.00',
  dueDate: '2026-08-05',
  id: INVOICE_ID,
  invoiceNumber: 17,
  issuedAt: '2026-07-23T12:00:00.000Z',
  itemCount: INVOICE_ITEMS.length,
  items: INVOICE_ITEMS,
  observations: '',
  status: 'issued',
  subtotalAmount: '350.50',
  surchargeAmount: '0.00',
  totalAmount: '350.50',
  updatedAt: '2026-07-23T12:00:00.000Z',
} as const

export const UPDATED_INVOICE_SUMMARY = {
  ...INVOICE_SUMMARY,
  discountAmount: '50.00',
  observations: 'Desconto comercial negociado',
  surchargeAmount: '10.25',
  totalAmount: '310.75',
  updatedAt: '2026-07-23T12:20:00.000Z',
} as const

export const CANCELLED_INVOICE_SUMMARY = {
  ...INVOICE_SUMMARY,
  cancellationReason: 'Cancelamento operacional por ajuste de cobranca',
  cancelledAt: '2026-07-23T12:15:00.000Z',
  status: 'cancelled',
  updatedAt: '2026-07-23T12:15:00.000Z',
} as const

export const ELIGIBLE_CTES_PAGE = {
  items: [
    {
      batchId: '00000000-0000-4000-8000-000000000713',
      batchName: 'Lote CT-e julho',
      cteId: CTE_ID_PRIMARY,
      cteNumber: '123456',
      customerDocument: '12345678000199',
      customerName: 'Transportes Sul Ltda',
      issuedAt: '2026-07-23T10:00:00.000Z',
      nfeNumber: '4521',
      totalAmount: '150.25',
    },
    {
      batchId: '00000000-0000-4000-8000-000000000713',
      batchName: 'Lote CT-e julho',
      cteId: CTE_ID_SECONDARY,
      cteNumber: '123457',
      customerDocument: '12345678000199',
      customerName: 'Transportes Sul Ltda',
      issuedAt: '2026-07-23T10:05:00.000Z',
      /** Item sem nota vinculada continua listável: a coluna fica vazia, a linha não some. */
      nfeNumber: null,
      totalAmount: '200.25',
    },
  ],
  nextCursor: 'eligible-cursor-002',
} as const

export const INVOICES_PAGE = {
  items: [
    { ...INVOICE_SUMMARY, id: INVOICE_ID },
    { ...CANCELLED_INVOICE_SUMMARY, id: SECONDARY_INVOICE_ID, invoiceNumber: 16 },
  ],
  nextCursor: 'invoices-cursor-002',
} as const

export const DOCUMENTS_PAGE = {
  items: [
    {
      contentType: 'application/pdf',
      documentId: DOCUMENT_ID,
      documentType: 'invoice_pdf',
      downloadUrl: 'https://storage.test/temporary/billing-invoice.pdf?signature=redacted',
      expiresAt: '2026-07-23T12:30:00.000Z',
      sha256: '1'.repeat(64),
    },
  ],
  nextCursor: null,
} as const

export const GENERATED_DOCUMENT = DOCUMENTS_PAGE.items[0]

export const INVOICE_PREVIEW = {
  blocked: [{ cteId: CTE_ID_SECONDARY, reason: 'already_invoiced' }],
  groups: [
    {
      cteCount: 1,
      cteIds: [CTE_ID_PRIMARY],
      customerDocument: '12345678000199',
      customerName: 'Transportes Sul Ltda',
      totalAmount: '150.25',
    },
  ],
} as const

export async function createBillingHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly cancelCalls: BillingInvoiceCall[]
  readonly createCalls: BillingInvoiceCall[]
  readonly events: string[]
  readonly generateDocumentCalls: BillingInvoiceCall[]
  readonly getCalls: BillingInvoiceCall[]
  readonly handle: (request: Request) => Promise<Response>
  readonly listDocumentCalls: BillingInvoiceCall[]
  readonly listEligibleCalls: BillingInvoiceCall[]
  readonly listInvoiceCalls: BillingInvoiceCall[]
  readonly previewCalls: BillingInvoiceCall[]
  readonly updateCalls: BillingInvoiceCall[]
}> {
  const cancelCalls: BillingInvoiceCall[] = []
  const createCalls: BillingInvoiceCall[] = []
  const events: string[] = []
  const generateDocumentCalls: BillingInvoiceCall[] = []
  const getCalls: BillingInvoiceCall[] = []
  const listDocumentCalls: BillingInvoiceCall[] = []
  const listEligibleCalls: BillingInvoiceCall[] = []
  const listInvoiceCalls: BillingInvoiceCall[] = []
  const previewCalls: BillingInvoiceCall[] = []
  const updateCalls: BillingInvoiceCall[] = []
  const routes = await loadRoutes({
    billingInvoices: {
      async cancel(input) {
        cancelCalls.push(structuredClone(input))
        if (params.cancelError) throw params.cancelError
        return CANCELLED_INVOICE_SUMMARY
      },
      async create(input) {
        createCalls.push(structuredClone(input))
        if (params.createError) throw params.createError
        return INVOICE_SUMMARY
      },
      async generateDocument(input) {
        generateDocumentCalls.push(structuredClone(input))
        if (params.generateDocumentError) throw params.generateDocumentError
        return GENERATED_DOCUMENT
      },
      async get(input) {
        getCalls.push(structuredClone(input))
        if (params.getError) throw params.getError
        return (params.invoice ?? INVOICE_SUMMARY) as BillingInvoiceSummary
      },
      async list(input) {
        listInvoiceCalls.push(structuredClone(input))
        return (params.invoicesPage ?? INVOICES_PAGE) as BillingInvoicePage
      },
      async listDocuments(input) {
        listDocumentCalls.push(structuredClone(input))
        return DOCUMENTS_PAGE
      },
      async preview(input) {
        previewCalls.push(structuredClone(input))
        if (params.previewError) throw params.previewError
        return INVOICE_PREVIEW
      },
      async update(input) {
        updateCalls.push(structuredClone(input))
        if (params.updateError) throw params.updateError
        return UPDATED_INVOICE_SUMMARY
      },
    },
    listEligibleBillingCtes: {
      async execute(input) {
        listEligibleCalls.push(structuredClone(input))
        return (params.eligiblePage ?? ELIGIBLE_CTES_PAGE) as BillingInvoicePage
      },
    },
  })
  const router = createTestRouter({
    authenticationError: params.authenticationError,
    context: authenticatedContext(params.permissions ?? COMPANY_CONTEXT.permissions),
    events,
    routes,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'billing-http-correlation',
    frontendOrigin: FRONTEND_ORIGIN,
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    cancelCalls,
    createCalls,
    events,
    generateDocumentCalls,
    getCalls,
    handle: (request) => handleRequest(request, { timeout() {} }),
    listDocumentCalls,
    listEligibleCalls,
    listInvoiceCalls,
    previewCalls,
    updateCalls,
  }
}

export function updateBillingInvoiceRequest(
  input: {
    readonly body?: unknown
    readonly contentType?: string | null
    readonly events?: string[]
    readonly idempotencyKey?: string | null
    readonly origin?: string
  } = {},
): Request {
  return jsonRequest({
    body: input.body ?? {
      discountAmount: '50.00',
      observations: 'Desconto comercial negociado',
      surchargeAmount: '10.25',
    },
    contentType: input.contentType,
    events: input.events,
    idempotencyKey:
      input.idempotencyKey === null ? undefined : (input.idempotencyKey ?? INVOICE_IDEMPOTENCY_KEY),
    method: 'PATCH',
    origin: input.origin,
    pathname: `${BILLING_INVOICES_PATH}/${INVOICE_ID}`,
  })
}

export function previewBillingInvoiceRequest(
  input: {
    readonly body?: unknown
    readonly origin?: string
  } = {},
): Request {
  return jsonRequest({
    body: input.body ?? { cteIds: [CTE_ID_PRIMARY, CTE_ID_SECONDARY] },
    events: undefined,
    method: 'POST',
    origin: input.origin,
    pathname: BILLING_INVOICE_PREVIEW_PATH,
  })
}

export function createBillingInvoiceRequest(
  input: {
    readonly body?: unknown
    readonly events?: string[]
    readonly origin?: string
  } = {},
): Request {
  return jsonRequest({
    body: input.body ?? {
      cteIds: [CTE_ID_PRIMARY, CTE_ID_SECONDARY],
      dueDate: '2026-08-05',
    },
    events: input.events,
    idempotencyKey: INVOICE_IDEMPOTENCY_KEY,
    method: 'POST',
    origin: input.origin,
    pathname: BILLING_INVOICES_PATH,
  })
}

export function listEligibleCtesRequest(query: string = ELIGIBLE_FILTERS_QUERY): Request {
  return authenticatedRequest(`${BILLING_ELIGIBLE_CTES_PATH}${query}`)
}

export function listBillingInvoicesRequest(query: string = INVOICES_FILTERS_QUERY): Request {
  return authenticatedRequest(`${BILLING_INVOICES_PATH}${query}`)
}

export function getBillingInvoiceRequest(): Request {
  return authenticatedRequest(`${BILLING_INVOICES_PATH}/${INVOICE_ID}`)
}

export function listBillingDocumentsRequest(): Request {
  return authenticatedRequest(`${BILLING_INVOICES_PATH}/${INVOICE_ID}/documents`)
}

export function generateBillingDocumentRequest(): Request {
  return new Request(`http://api.test${BILLING_INVOICES_PATH}/${INVOICE_ID}/documents`, {
    headers: { authorization: 'Bearer token' },
    method: 'POST',
  })
}

export function cancelBillingInvoiceRequest(
  input: {
    readonly body?: unknown
    readonly events?: string[]
    readonly origin?: string
  } = {},
): Request {
  return jsonRequest({
    body: input.body ?? {
      reason: 'Cancelamento operacional por ajuste de cobranca',
    },
    events: input.events,
    method: 'POST',
    origin: input.origin,
    pathname: `${BILLING_INVOICES_PATH}/${INVOICE_ID}/cancel`,
  })
}

export async function responseApiError(response: Response): Promise<{
  readonly error: { readonly code: string; readonly message: string }
}> {
  return (await response.json()) as {
    readonly error: { readonly code: string; readonly message: string }
  }
}

export function unauthenticatedError(): ApiError {
  return new ApiError({
    code: 'UNAUTHENTICATED',
    message: 'Authentication is required',
    status: 401,
  })
}

async function loadRoutes(
  input: BillingHttpRouteDependencies,
): Promise<readonly RegisteredRoute[]> {
  const module = (await import('../../src/billing/presentation/billing.routes.js')) as {
    createBillingRoutes(dependencies: BillingHttpRouteDependencies): readonly RegisteredRoute[]
  }
  return module.createBillingRoutes(input)
}

function authenticatedRequest(pathname: string): Request {
  return new Request(`http://api.test${pathname}`, {
    headers: { authorization: 'Bearer token' },
    method: 'GET',
  })
}

function jsonRequest(input: {
  readonly body: unknown
  readonly contentType?: string | null | undefined
  readonly events: string[] | undefined
  readonly idempotencyKey?: string | undefined
  readonly method: string
  readonly origin: string | undefined
  readonly pathname: string
}): Request {
  const headers = new Headers({ authorization: 'Bearer token' })
  const contentType = input.contentType === undefined ? 'application/json' : input.contentType
  if (contentType !== null) headers.set('content-type', contentType)
  if (input.idempotencyKey) headers.set('idempotency-key', input.idempotencyKey)
  if (input.origin) headers.set('origin', input.origin)
  const request = new Request(`http://api.test${input.pathname}`, {
    body: JSON.stringify(input.body),
    headers,
    method: input.method,
  })
  if (input.events === undefined) return request

  return new Proxy(request, {
    get(target, property) {
      if (property === 'body') input.events?.push('body')
      const value: unknown = Reflect.get(target, property, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
}

function createTestRouter(input: {
  readonly authenticationError: Error | undefined
  readonly context: AuthenticatedContext<CompanyContext>
  readonly events: string[]
  readonly routes: readonly RegisteredRoute[]
}) {
  const authorization = new AuthorizationService()
  return createRouter({
    authentication: {
      async authenticate() {
        input.events.push('authenticate')
        if (input.authenticationError) throw input.authenticationError
        return input.context.identity
      },
    },
    authorization: {
      authorize(value, policy) {
        input.events.push('authorize')
        authorization.authorize(value, policy)
      },
    },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    healthService: new HealthService({
      database: {
        async close() {},
        async healthCheck() {
          return { healthy: true }
        },
      },
      identityReadiness: {
        async checkReadiness() {
          return true
        },
      },
      migrationStatus: appliedMigrations(),
    }),
    routes: input.routes,
    tenantContext: {
      async resolveCompany() {
        input.events.push('tenant')
        return input.context
      },
    },
  })
}

function authenticatedContext(
  permissions: CompanyContext['permissions'],
): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      subject: 'billing-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: {
      ...COMPANY_CONTEXT,
      permissions,
    },
  }
}
