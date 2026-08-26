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

type CteIssuanceCall = {
  readonly batchId: string
  readonly batchItemId?: string
  readonly context: CompanyContext
  readonly correlationId?: string
  readonly idempotencyKey?: string
  readonly justification?: string
  readonly reason?: string
}

type CteExportCall = {
  readonly context: CompanyContext
  readonly filters?: Readonly<Record<string, unknown>>
  readonly format?: string
  readonly itemIds?: readonly string[]
}

type CteExportResult = {
  readonly documentCount: number
  readonly fileName: string
  readonly stream: ReadableStream<Uint8Array>
}

type CteDacteCall = {
  readonly batchId: string
  readonly batchItemId: string
  readonly context: CompanyContext
}

type CteDacteResult = {
  readonly bytes: Uint8Array
  readonly fileName: string
}

type CreateFixtureParams = {
  readonly authenticationError?: Error
  readonly cancelError?: Error
  readonly dacteError?: Error
  readonly exportError?: Error
  readonly getError?: Error
  readonly issueError?: Error
  readonly permissions?: CompanyContext['permissions']
  readonly reprocessError?: Error
}

type CteIssuanceHttpRouteDependencies = {
  readonly cteDacte: {
    readonly renderDacte: (input: CteDacteCall) => Promise<CteDacteResult>
  }
  readonly cteExport: {
    readonly exportDocuments: (input: CteExportCall) => Promise<CteExportResult>
  }
  readonly cteIssuance: {
    readonly cancel: (input: CteIssuanceCall) => Promise<typeof CANCEL_RESPONSE>
    readonly get: (input: CteIssuanceCall) => Promise<typeof ISSUANCE_SUMMARY>
    readonly issue: (input: CteIssuanceCall) => Promise<typeof ISSUE_RESPONSE>
    readonly listDocuments: (input: CteIssuanceCall) => Promise<typeof DOCUMENTS_PAGE>
    readonly reprocess: (input: CteIssuanceCall) => Promise<typeof REPROCESS_RESPONSE>
  }
}

export const FRONTEND_ORIGIN = 'http://localhost:53000'
export const BATCH_ID = '00000000-0000-4000-8000-000000000601'
export const BATCH_ITEM_ID = '00000000-0000-4000-8000-000000000602'
export const ATTEMPT_ID = '00000000-0000-4000-8000-000000000603'
export const DOCUMENT_ID = '00000000-0000-4000-8000-000000000604'
export const ISSUE_IDEMPOTENCY_KEY = 'cte-issue-http-key-0001'
export const REPROCESS_IDEMPOTENCY_KEY = 'cte-reprocess-http-key-0001'
export const CANCEL_IDEMPOTENCY_KEY = 'cte-cancel-http-key-0001'
export const CANCEL_JUSTIFICATION = 'Prestacao de servico nao realizada pelo tomador'
export const CTE_BATCHES_PATH = '/cte-batches'

export const COMPANY_CONTEXT: CompanyContext = {
  ...NFE_COMPANY_CONTEXT,
  permissions: new Set(['cte.submit']),
}
export const READ_ONLY_CONTEXT: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set(['invoices.read']),
}
export const CANCEL_CONTEXT: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set(['cte.submit', 'cte.cancel']),
}

export const ISSUE_RESPONSE = {
  batchId: BATCH_ID,
  requestedAt: '2026-07-23T12:00:00.000Z',
  status: 'requested',
} as const

export const REPROCESS_RESPONSE = {
  attemptId: ATTEMPT_ID,
  batchId: BATCH_ID,
  batchItemId: BATCH_ITEM_ID,
  status: 'requested',
} as const

export const CANCEL_RESPONSE = {
  attemptId: ATTEMPT_ID,
  batchId: BATCH_ID,
  batchItemId: BATCH_ITEM_ID,
  status: 'requested',
} as const

export const ISSUANCE_SUMMARY = {
  accessKey: '35260761156864000191570010000000011000000010',
  attemptId: ATTEMPT_ID,
  batchId: BATCH_ID,
  batchItemId: BATCH_ITEM_ID,
  environment: 'homologation',
  protocol: '135260000000001',
  reasonCause: 'Duplicidade de CT-e',
  reasonCode: '204',
  status: 'rejected',
  updatedAt: '2026-07-23T12:05:00.000Z',
} as const

export const DACTE_ACCESS_KEY = '35260761156864000191570010000000011000000010'
export const DACTE_FILE_NAME = `dacte-${DACTE_ACCESS_KEY}.pdf`
export const DACTE_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x33])

export const EXPORT_FILE_NAME = 'cte-xml-20260731-120000.zip'
export const EXPORT_DOCUMENT_COUNT = 2
export const EXPORT_ARCHIVE_BYTES = new Uint8Array([0x50, 0x4b, 0x05, 0x06, 0x00, 0x00])

export const DOCUMENTS_PAGE = {
  items: [
    {
      accessKey: '35260761156864000191570010000000011000000010',
      contentType: 'application/xml',
      documentId: DOCUMENT_ID,
      downloadUrl: 'https://storage.test/temporary/cte-document.xml?signature=redacted',
      expiresAt: '2026-07-23T12:15:00.000Z',
      sha256: '0'.repeat(64),
    },
  ],
  nextCursor: null,
} as const

export async function createCteIssuanceHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly cancelCalls: CteIssuanceCall[]
  readonly dacteCalls: CteDacteCall[]
  readonly events: string[]
  readonly exportCalls: CteExportCall[]
  readonly getCalls: CteIssuanceCall[]
  readonly handle: (request: Request) => Promise<Response>
  readonly issueCalls: CteIssuanceCall[]
  readonly listDocumentCalls: CteIssuanceCall[]
  readonly reprocessCalls: CteIssuanceCall[]
}> {
  const cancelCalls: CteIssuanceCall[] = []
  const dacteCalls: CteDacteCall[] = []
  const events: string[] = []
  const exportCalls: CteExportCall[] = []
  const getCalls: CteIssuanceCall[] = []
  const issueCalls: CteIssuanceCall[] = []
  const listDocumentCalls: CteIssuanceCall[] = []
  const reprocessCalls: CteIssuanceCall[] = []
  const routes = await loadRoutes({
    cteDacte: {
      async renderDacte(input) {
        dacteCalls.push(structuredClone(input))
        if (params.dacteError) throw params.dacteError
        return { bytes: DACTE_PDF_BYTES, fileName: DACTE_FILE_NAME }
      },
    },
    cteExport: {
      async exportDocuments(input) {
        exportCalls.push(structuredClone(input))
        if (params.exportError) throw params.exportError
        return {
          documentCount: EXPORT_DOCUMENT_COUNT,
          fileName: EXPORT_FILE_NAME,
          stream: new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(EXPORT_ARCHIVE_BYTES)
              controller.close()
            },
          }),
        }
      },
    },
    cteIssuance: {
      async cancel(input) {
        cancelCalls.push(structuredClone(input))
        if (params.cancelError) throw params.cancelError
        return CANCEL_RESPONSE
      },
      async get(input) {
        getCalls.push(structuredClone(input))
        if (params.getError) throw params.getError
        return ISSUANCE_SUMMARY
      },
      async issue(input) {
        issueCalls.push(structuredClone(input))
        if (params.issueError) throw params.issueError
        return ISSUE_RESPONSE
      },
      async listDocuments(input) {
        listDocumentCalls.push(structuredClone(input))
        return DOCUMENTS_PAGE
      },
      async reprocess(input) {
        reprocessCalls.push(structuredClone(input))
        if (params.reprocessError) throw params.reprocessError
        return REPROCESS_RESPONSE
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
    createCorrelationId: () => 'cte-issuance-http-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    cancelCalls,
    dacteCalls,
    events,
    exportCalls,
    getCalls,
    handle: (request) => handleRequest(request, { timeout() {} }),
    issueCalls,
    listDocumentCalls,
    reprocessCalls,
  }
}

export function issueBatchRequest(
  input: {
    readonly body?: unknown
    readonly events?: string[]
    readonly origin?: string
  } = {},
): Request {
  return jsonRequest({
    body: input.body ?? {},
    events: input.events,
    idempotencyKey: ISSUE_IDEMPOTENCY_KEY,
    method: 'POST',
    origin: input.origin,
    pathname: `${CTE_BATCHES_PATH}/${BATCH_ID}/issue`,
  })
}

export function reprocessItemRequest(
  input: {
    readonly body?: unknown
    readonly events?: string[]
    readonly origin?: string
  } = {},
): Request {
  return jsonRequest({
    body: input.body ?? { reason: 'Correção de dados de homologação' },
    events: input.events,
    idempotencyKey: REPROCESS_IDEMPOTENCY_KEY,
    method: 'POST',
    origin: input.origin,
    pathname: `${CTE_BATCHES_PATH}/${BATCH_ID}/items/${BATCH_ITEM_ID}/reprocess`,
  })
}

export function cancelItemRequest(
  input: {
    readonly body?: unknown
    readonly events?: string[]
    readonly origin?: string
  } = {},
): Request {
  return jsonRequest({
    body: input.body ?? { justification: CANCEL_JUSTIFICATION },
    events: input.events,
    idempotencyKey: CANCEL_IDEMPOTENCY_KEY,
    method: 'POST',
    origin: input.origin,
    pathname: `${CTE_BATCHES_PATH}/${BATCH_ID}/items/${BATCH_ITEM_ID}/cancel`,
  })
}

/** Exportar é leitura: a rota não pode exigir `idempotency-key`. */
export function exportItemsRequest(
  input: {
    readonly body?: unknown
    readonly origin?: string
  } = {},
): Request {
  const headers = new Headers({
    authorization: 'Bearer token',
    'content-type': 'application/json',
  })
  if (input.origin) headers.set('origin', input.origin)

  return new Request(`http://api.test${CTE_BATCHES_PATH}/items/export`, {
    body: JSON.stringify(input.body ?? {}),
    headers,
    method: 'POST',
  })
}

/** Baixar o DACTE é leitura: a rota não pode exigir `idempotency-key`. */
export function downloadDacteRequest(
  input: {
    readonly batchId?: string
    readonly batchItemId?: string
  } = {},
): Request {
  const batchId = input.batchId ?? BATCH_ID
  const batchItemId = input.batchItemId ?? BATCH_ITEM_ID
  return authenticatedRequest(`${CTE_BATCHES_PATH}/${batchId}/items/${batchItemId}/dacte`)
}

export function getIssuanceRequest(): Request {
  return authenticatedRequest(`${CTE_BATCHES_PATH}/${BATCH_ID}/items/${BATCH_ITEM_ID}/issuance`)
}

export function listDocumentsRequest(): Request {
  return authenticatedRequest(`${CTE_BATCHES_PATH}/${BATCH_ID}/items/${BATCH_ITEM_ID}/documents`)
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
  input: CteIssuanceHttpRouteDependencies,
): Promise<readonly RegisteredRoute[]> {
  const module = (await import('../../src/cte-issuance/presentation/cte-issuance.routes.js')) as {
    createCteIssuanceRoutes(
      dependencies: CteIssuanceHttpRouteDependencies,
    ): readonly RegisteredRoute[]
  }
  return module.createCteIssuanceRoutes(input)
}

function authenticatedRequest(pathname: string): Request {
  return new Request(`http://api.test${pathname}`, {
    headers: { authorization: 'Bearer token' },
    method: 'GET',
  })
}

function jsonRequest(input: {
  readonly body: unknown
  readonly events: string[] | undefined
  readonly idempotencyKey: string
  readonly method: string
  readonly origin: string | undefined
  readonly pathname: string
}): Request {
  const headers = new Headers({
    authorization: 'Bearer token',
    'content-type': 'application/json',
    'idempotency-key': input.idempotencyKey,
  })
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
      subject: 'cte-issuance-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: {
      ...COMPANY_CONTEXT,
      permissions,
    },
  }
}
