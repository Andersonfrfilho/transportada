/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture'
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter, type defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import { COMPANY_CONTEXT as NFE_COMPANY_CONTEXT } from './nfe-import-application.fixture'
import type { NfseInvoiceCancellationSummary } from '../../src/nfse-invoices/application/nfse-invoice-cancellation.use-case'
import type { NfseInvoicePreview } from '../../src/nfse-invoices/application/nfse-invoice-preview.service'
import type {
  NfseFiscalDocumentDownload,
  NfseInvoiceDetail,
  NfseInvoiceLinkedDocument,
  NfseInvoicePage,
} from '../../src/nfse-invoices/application/nfse-invoice.port'
import type { NfseInvoiceSummary } from '../../src/nfse-invoices/application/nfse-issuance-attempt.service'

type RegisteredRoute = ReturnType<typeof defineRoute>

type ExecuteCall = Record<string, unknown>

export const FRONTEND_ORIGIN = 'http://localhost:53000'
export const PROFILE_ID = '00000000-0000-4000-8000-0000000000b1'
export const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000b2'
export const OTHER_DOCUMENT_ID = '00000000-0000-4000-8000-0000000000b3'
export const INVOICE_ID = '00000000-0000-4000-8000-0000000000b4'
export const ATTEMPT_ID = '00000000-0000-4000-8000-0000000000b5'
export const BLOCKED_DOCUMENT_ID = '00000000-0000-4000-8000-0000000000b6'
export const IDEMPOTENCY_KEY = 'nfse-invoice-contract-key-0001'

export const PREVIEW: NfseInvoicePreview = {
  blocked: [{ documentId: BLOCKED_DOCUMENT_ID, reason: 'NFSE_DOCUMENT_ALREADY_LINKED' }],
  invoices: [
    {
      adjustments: [{ amount: '150.0000', type: 'minimum_amount' }],
      baseAmount: '10000.0000',
      calculatedAmount: '850.0000',
      charges: [
        {
          amount: '850.0000',
          baseAmount: '10000.0000',
          calculationType: 'percentage_of_cargo',
          label: 'Frete',
          rate: '0.085000',
        },
      ],
      components: [{ amount: '850.0000', calculationType: 'main', label: 'Frete' }],
      description: 'Transporte rodoviário de cargas referente às notas 000000123.',
      documents: [
        {
          accessKey: '35260812345678000199550010000001231000000123',
          documentId: DOCUMENT_ID,
          issuedAt: '2026-08-01T10:00:00.000Z',
          number: '000000123',
          series: '001',
          totalAmount: '10000.0000',
        },
      ],
      fiscalComponents: [{ amount: '850.00', calculationType: 'main', label: 'Frete' }],
      issAmount: '42.50',
      issRate: '0.050000',
      listedDocuments: 1,
      omittedDocuments: 0,
      percentage: '0.085000',
      profileId: PROFILE_ID,
      serviceAmount: '850.00',
      takerLegalName: 'Cliente Sintético Ltda',
      takerTaxId: '12345678000199',
    },
  ],
}

export const SUMMARY: NfseInvoiceSummary = {
  attemptId: ATTEMPT_ID,
  documentIds: [DOCUMENT_ID],
  invoiceId: INVOICE_ID,
  replayed: false,
  requestedAt: '2026-08-12T12:00:00.000Z',
  status: 'requested',
}

export const DETAIL: NfseInvoiceDetail = {
  authorizedAt: '2026-08-12T13:00:00.000Z',
  cancellationReason: null,
  cancelledAt: null,
  charges: [
    {
      amount: '850.0000',
      baseAmount: '10000.0000',
      calculationType: 'percentage_of_cargo',
      label: 'Frete',
      ordinal: 1,
      rate: '0.085000',
    },
  ],
  createdAt: '2026-08-12T12:00:00.000Z',
  description: 'Transporte rodoviário de cargas referente às notas 000000123.',
  documentCount: 1,
  emissionProfileId: PROFILE_ID,
  id: INVOICE_ID,
  issAmount: '42.50',
  providerNumber: '2026000123',
  rejectionCode: null,
  rejectionMessage: null,
  serviceAmount: '850.00',
  status: 'authorized',
  takerLegalName: 'Cliente Sintético Ltda',
  takerTaxId: '12345678000199',
  updatedAt: '2026-08-12T13:00:00.000Z',
  verificationCode: 'ABC123',
  version: '3',
}

export const LINKED_DOCUMENT: NfseInvoiceLinkedDocument = {
  accessKey: '35260812345678000199550010000001231000000123',
  cancelledAt: null,
  documentId: DOCUMENT_ID,
  issuedAt: '2026-08-01T10:00:00.000Z',
  number: '000000123',
  position: 1,
  series: '001',
  totalAmount: '10000.0000',
}

export const DOWNLOAD: NfseFiscalDocumentDownload = {
  expiresAt: '2026-08-12T12:05:00.000Z',
  url: 'https://storage.local/transportada-fiscal/nfse.xml?signature=stub',
}

export const CANCELLATION: NfseInvoiceCancellationSummary = {
  attemptId: ATTEMPT_ID,
  invoiceId: INVOICE_ID,
  releasedDocumentIds: [DOCUMENT_ID],
  replayed: false,
  requestedAt: '2026-08-12T14:00:00.000Z',
  status: 'cancellation_requested',
}

export const COMPANY_CONTEXT: CompanyContext = {
  ...NFE_COMPANY_CONTEXT,
  permissions: new Set(['nfse.read', 'nfse.issue', 'nfse.cancel']),
}

export const READ_ONLY_PERMISSIONS: CompanyContext['permissions'] = new Set(['nfse.read'])

type InvoiceRouteDependencies = {
  readonly cancelNfseInvoice: {
    execute(input: ExecuteCall): Promise<NfseInvoiceCancellationSummary>
  }
  readonly nfseInvoice: {
    create(input: ExecuteCall): Promise<NfseInvoiceSummary>
    preview(input: ExecuteCall): Promise<NfseInvoicePreview>
  }
  readonly nfseInvoiceQuery: {
    detail(input: ExecuteCall): Promise<NfseInvoiceDetail>
    documents(input: ExecuteCall): Promise<readonly NfseInvoiceLinkedDocument[]>
    download(input: ExecuteCall): Promise<NfseFiscalDocumentDownload>
    list(input: ExecuteCall): Promise<NfseInvoicePage>
  }
}

type CreateFixtureParams = {
  readonly cancelError?: Error
  readonly createError?: Error
  readonly detailError?: Error
  readonly downloadError?: Error
  readonly permissions?: CompanyContext['permissions']
  readonly summary?: NfseInvoiceSummary
}

export async function createNfseInvoicesHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly cancelCalls: ExecuteCall[]
  readonly createCalls: ExecuteCall[]
  readonly detailCalls: ExecuteCall[]
  readonly documentCalls: ExecuteCall[]
  readonly downloadCalls: ExecuteCall[]
  readonly handle: (request: Request) => Promise<Response>
  readonly listCalls: ExecuteCall[]
  readonly previewCalls: ExecuteCall[]
}> {
  const cancelCalls: ExecuteCall[] = []
  const createCalls: ExecuteCall[] = []
  const detailCalls: ExecuteCall[] = []
  const documentCalls: ExecuteCall[] = []
  const downloadCalls: ExecuteCall[] = []
  const listCalls: ExecuteCall[] = []
  const previewCalls: ExecuteCall[] = []

  const routes = await loadInvoiceRoutes({
    cancelNfseInvoice: {
      async execute(input) {
        cancelCalls.push(serializeCall(input))
        if (params.cancelError) throw params.cancelError
        return CANCELLATION
      },
    },
    nfseInvoice: {
      async create(input) {
        createCalls.push(serializeCall(input))
        if (params.createError) throw params.createError
        return params.summary ?? SUMMARY
      },
      async preview(input) {
        previewCalls.push(serializeCall(input))
        return PREVIEW
      },
    },
    nfseInvoiceQuery: {
      async detail(input) {
        detailCalls.push(serializeCall(input))
        if (params.detailError) throw params.detailError
        return DETAIL
      },
      async documents(input) {
        documentCalls.push(serializeCall(input))
        if (params.detailError) throw params.detailError
        return [LINKED_DOCUMENT]
      },
      async download(input) {
        downloadCalls.push(serializeCall(input))
        if (params.detailError) throw params.detailError
        if (params.downloadError) throw params.downloadError
        return DOWNLOAD
      },
      async list(input) {
        listCalls.push(serializeCall(input))
        return { items: [DETAIL], nextCursor: null }
      },
    },
  })

  const router = createTestRouter({
    context: authenticatedContext(params.permissions ?? COMPANY_CONTEXT.permissions),
    routes,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'nfse-invoices-http-correlation',
    frontendOrigin: FRONTEND_ORIGIN,
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    cancelCalls,
    createCalls,
    detailCalls,
    documentCalls,
    downloadCalls,
    handle: (request) => handleRequest(request, { timeout() {} }),
    listCalls,
    previewCalls,
  }
}

/** O contexto carrega um `Set` de permissões — `structuredClone` dele perderia a forma no assert. */
function serializeCall(input: ExecuteCall): ExecuteCall {
  const { context, ...rest } = input as { readonly context?: CompanyContext }
  return {
    ...rest,
    ...(context === undefined ? {} : { companyId: context.companyId, userId: context.userId }),
  }
}

async function loadInvoiceRoutes(
  input: InvoiceRouteDependencies,
): Promise<readonly RegisteredRoute[]> {
  const module = (await import('../../src/nfse-invoices/presentation/nfse-invoices.routes.js')) as {
    createNfseInvoiceRoutes(dependencies: InvoiceRouteDependencies): readonly RegisteredRoute[]
  }
  return module.createNfseInvoiceRoutes(input)
}

function createTestRouter(input: {
  readonly context: AuthenticatedContext<CompanyContext>
  readonly routes: readonly RegisteredRoute[]
}) {
  const authorization = new AuthorizationService()
  return createRouter({
    authentication: {
      async authenticate() {
        return input.context.identity
      },
    },
    authorization: {
      authorize(value, policy) {
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
      subject: 'nfse-invoices-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: { ...COMPANY_CONTEXT, permissions },
  }
}

export function invoiceReadRequest(path: string): Request {
  return new Request(`http://localhost${path}`, {
    headers: new Headers({ authorization: 'Bearer nfse-invoices-contract' }),
    method: 'GET',
  })
}

export function invoiceRequest(input: {
  readonly body: unknown
  readonly idempotencyKey?: string | null
  readonly path: string
}): Request {
  const headers = new Headers({
    authorization: 'Bearer nfse-invoices-contract',
    'content-type': 'application/json',
  })
  const idempotencyKey = input.idempotencyKey === undefined ? IDEMPOTENCY_KEY : input.idempotencyKey
  if (idempotencyKey !== null) headers.set('idempotency-key', idempotencyKey)

  return new Request(`http://localhost${input.path}`, {
    body: JSON.stringify(input.body),
    headers,
    method: 'POST',
  })
}
