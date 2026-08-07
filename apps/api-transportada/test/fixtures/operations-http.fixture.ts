/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createRequestHandler } from '../../src/http/request-handler.service'
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRouter, type defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import { ApiError } from '../../src/shared/api.error'
import { COMPANY_CONTEXT as OPERATIONS_COMPANY_CONTEXT } from '../operations-application/support.js'

type RegisteredRoute = ReturnType<typeof defineRoute>

type OperationsCall = {
  readonly context: CompanyContext
  readonly cursor?: string | null
  readonly filters?: Record<string, unknown>
  readonly limit?: number
}

type CreateFixtureParams = {
  readonly auditError?: Error
  readonly authenticationError?: Error
  readonly jobError?: Error
  readonly permissions?: CompanyContext['permissions']
  readonly summaryError?: Error
  readonly timelineError?: Error
}

type OperationsHttpRouteDependencies = {
  readonly operations: {
    readonly getSummary: (input: OperationsCall) => Promise<Record<string, unknown>>
    readonly listJobs: (input: OperationsCall) => Promise<typeof JOBS_PAGE>
    readonly listTimeline: (input: OperationsCall) => Promise<typeof TIMELINE_PAGE>
  }
  readonly audit: {
    readonly listEvents: (input: OperationsCall) => Promise<typeof AUDIT_PAGE>
  }
}

export const FRONTEND_ORIGIN = 'http://localhost:53000'
export const OPERATIONS_SUMMARY_PATH = '/operations/summary'
export const OPERATIONS_TIMELINE_PATH = '/operations/timeline'
export const OPERATIONS_JOBS_PATH = '/operations/jobs'
export const AUDIT_EVENTS_PATH = '/audit/events'
export const OPERATIONS_QUERY =
  '?from=2026-07-23T00%3A00%3A00.000Z&to=2026-07-23T23%3A59%3A59.999Z&module=cte_issuance&status=retry_scheduled&correlationId=correlation-operations-001'
export const TIMELINE_QUERY =
  '?cursor=2026-07-23T14%3A00%3A00.000Z%3A%3A00000000-0000-4000-8000-000000000001&limit=25&module=nfe&entityType=nfe_import&entityId=00000000-0000-4000-8000-000000000010&correlationId=correlation-operations-001'
export const JOBS_QUERY =
  '?limit=500&module=cte_issuance&status=retry_scheduled&correlationId=correlation-operations-001'
export const AUDIT_QUERY =
  '?limit=50&action=billing.invoice.cancel&actorUserId=user-001&targetType=billing_invoice&targetId=00000000-0000-4000-8000-000000000010&result=allowed&correlationId=correlation-operations-001'

export const COMPANY_CONTEXT: CompanyContext = {
  companyId: OPERATIONS_COMPANY_CONTEXT.companyId,
  kind: 'company',
  membershipId: OPERATIONS_COMPANY_CONTEXT.membershipId,
  permissions: new Set(['operations.read', 'audit.read']),
  roles: ['company-admin'],
  userId: OPERATIONS_COMPANY_CONTEXT.userId,
}
export const READ_ONLY_CONTEXT: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set(['operations.read', 'audit.read']),
}
export const OPERATIONS_ONLY_CONTEXT: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set(['operations.read']),
}

export const SUMMARY_RESULT = {
  generatedAt: '2026-07-23T15:00:00.000Z',
  modules: [
    {
      failed: 1,
      module: 'nfe',
      pending: 2,
      processing: 0,
      retryScheduled: 1,
      succeeded: 14,
    },
    {
      failed: 0,
      module: 'billing',
      pending: 1,
      processing: 1,
      retryScheduled: 0,
      succeeded: 9,
    },
  ],
  recentErrors: [
    {
      code: 'SEFAZ_TIMEOUT',
      correlationId: 'correlation-operations-001',
      message: 'Timeout sanitized',
      module: 'cte_issuance',
      occurredAt: '2026-07-23T14:58:00.000Z',
    },
  ],
} as const

export const TIMELINE_PAGE = {
  items: [
    {
      action: 'nfe_import_requested',
      correlationId: 'correlation-operations-001',
      entityId: '00000000-0000-4000-8000-000000000010',
      entityType: 'nfe_import',
      metadata: {
        accessKeySuffix: '0010',
      },
      occurredAt: '2026-07-23T14:50:00.000Z',
      result: 'allowed',
    },
    {
      action: 'billing_invoice_issued',
      correlationId: 'correlation-operations-001',
      entityId: '00000000-0000-4000-8000-000000000012',
      entityType: 'billing_invoice',
      metadata: {
        invoiceNumber: '1001',
      },
      occurredAt: '2026-07-23T15:00:00.000Z',
      result: 'allowed',
    },
  ],
  nextCursor: '2026-07-23T15:01:00.000Z::00000000-0000-4000-8000-000000000011',
} as const

export const JOBS_PAGE = {
  items: [
    {
      attemptCount: 3,
      correlationId: 'correlation-operations-001',
      entityId: '00000000-0000-4000-8000-000000000010',
      entityType: 'cte_issuance',
      id: 'processing-job-001',
      lastErrorCode: 'TECHNICAL_TIMEOUT',
      lastErrorMessage: 'Provider timeout sanitized',
      metadata: {},
      module: 'cte_issuance',
      nextAttemptAt: '2026-07-23T15:05:00.000Z',
      status: 'retry_scheduled',
      updatedAt: '2026-07-23T15:00:00.000Z',
    },
    {
      attemptCount: 5,
      correlationId: 'correlation-dead-letter-001',
      entityId: '00000000-0000-4000-8000-000000000013',
      entityType: 'billing_invoice',
      id: 'processing-job-002',
      lastErrorCode: 'MANUAL_REVIEW_REQUIRED',
      lastErrorMessage: 'Manual review required',
      module: 'billing',
      nextAttemptAt: null,
      status: 'dead_letter',
      updatedAt: '2026-07-23T15:00:00.000Z',
    },
  ],
  nextCursor: '2026-07-23T15:01:00.000Z::00000000-0000-4000-8000-000000000011',
} as const

export const AUDIT_PAGE = {
  items: [
    {
      action: 'billing.invoice.cancel',
      actorUserId: COMPANY_CONTEXT.userId,
      correlationId: 'correlation-operations-001',
      createdAt: '2026-07-23T15:00:00.000Z',
      id: 'audit-log-001',
      metadata: {},
      permission: 'billing.manage',
      reason: 'Duplicidade operacional',
      result: 'allowed',
      targetId: '00000000-0000-4000-8000-000000000010',
      targetType: 'billing_invoice',
    },
  ],
  nextCursor: '2026-07-23T15:01:00.000Z::00000000-0000-4000-8000-000000000011',
} as const

export async function createOperationsHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly auditCalls: OperationsCall[]
  readonly events: string[]
  readonly handle: (request: Request) => Promise<Response>
  readonly jobCalls: OperationsCall[]
  readonly options: () => Promise<readonly string[]>
  readonly reprocessCalls: OperationsCall[]
  readonly summaryCalls: OperationsCall[]
  readonly timelineCalls: OperationsCall[]
}> {
  const auditCalls: OperationsCall[] = []
  const events: string[] = []
  const jobCalls: OperationsCall[] = []
  const reprocessCalls: OperationsCall[] = []
  const summaryCalls: OperationsCall[] = []
  const timelineCalls: OperationsCall[] = []
  const routes = await loadRoutes({
    audit: {
      async listEvents(input) {
        auditCalls.push(structuredClone(input))
        if (params.auditError) throw params.auditError
        return AUDIT_PAGE
      },
    },
    operations: {
      async getSummary(input) {
        summaryCalls.push(structuredClone(input))
        if (params.summaryError) throw params.summaryError
        return SUMMARY_RESULT
      },
      async listJobs(input) {
        jobCalls.push(structuredClone(input))
        if (params.jobError) throw params.jobError
        return JOBS_PAGE
      },
      async listTimeline(input) {
        timelineCalls.push(structuredClone(input))
        if (params.timelineError) throw params.timelineError
        return TIMELINE_PAGE
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
    createCorrelationId: () => 'operations-http-correlation',
    frontendOrigin: FRONTEND_ORIGIN,
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    auditCalls,
    events,
    handle: (request) => handleRequest(request, { timeout() {} }),
    jobCalls,
    options: async () => routes.map((route) => `${route.method} ${route.pathname}`),
    reprocessCalls,
    summaryCalls,
    timelineCalls,
  }
}

export function summaryRequest(): Request {
  return authenticatedRequest(`${OPERATIONS_SUMMARY_PATH}${OPERATIONS_QUERY}`)
}

export function listTimelineRequest(): Request {
  return authenticatedRequest(`${OPERATIONS_TIMELINE_PATH}${TIMELINE_QUERY}`)
}

export function listJobsRequest(input: { readonly origin?: string } = {}): Request {
  return authenticatedRequest(`${OPERATIONS_JOBS_PATH}${JOBS_QUERY}`, input.origin)
}

export function listAuditEventsRequest(
  input: { readonly query?: string; readonly origin?: string } = {},
): Request {
  return authenticatedRequest(`${AUDIT_EVENTS_PATH}${input.query ?? AUDIT_QUERY}`, input.origin)
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
  input: OperationsHttpRouteDependencies,
): Promise<readonly RegisteredRoute[]> {
  const module = (await import('../../src/operations/presentation/operations.routes.js')) as {
    createOperationsRoutes(
      dependencies: OperationsHttpRouteDependencies,
    ): readonly RegisteredRoute[]
  }
  return module.createOperationsRoutes(input)
}

function authenticatedRequest(pathname: string, origin?: string): Request {
  const headers = new Headers({ authorization: 'Bearer token' })
  if (origin) headers.set('origin', origin)
  return new Request(`http://api.test${pathname}`, {
    headers,
    method: 'GET',
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
      subject: 'operations-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: {
      ...COMPANY_CONTEXT,
      permissions,
    },
  }
}
