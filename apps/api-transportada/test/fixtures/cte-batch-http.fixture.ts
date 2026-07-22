/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createRequestHandler } from '../../src/http/request-handler.service'
import { HealthService } from '../../src/health/health.service'
import { createRouter, type defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import { ApiError } from '../../src/shared/api.error'
import { COMPANY_CONTEXT as NFE_COMPANY_CONTEXT } from './nfe-import-application.fixture'

type RegisteredRoute = ReturnType<typeof defineRoute>

type CteBatchCall = {
  readonly batchId?: string
  readonly context: CompanyContext
  readonly correlationId?: string
  readonly cursor?: string | null
  readonly documentIds?: readonly string[]
  readonly idempotencyKey?: string
  readonly limit?: number
  readonly name?: string
}

type CteBatchSummary = Readonly<Record<string, unknown>>

type CteBatchPage = {
  readonly items: readonly CteBatchSummary[]
  readonly nextCursor: string | null
}

type CteBatchHttpRouteDependencies = {
  readonly cteBatches: {
    readonly cancel: (input: CteBatchCall) => Promise<CteBatchSummary>
    readonly create: (input: CteBatchCall) => Promise<CteBatchSummary>
    readonly get: (input: CteBatchCall) => Promise<CteBatchSummary>
    readonly submit: (input: CteBatchCall) => Promise<CteBatchSummary>
  }
  readonly listBatches: {
    readonly execute: (input: CteBatchCall) => Promise<CteBatchPage>
  }
  readonly listEvents: {
    readonly execute: (input: CteBatchCall) => Promise<typeof EVENTS_PAGE>
  }
}

type CreateFixtureParams = {
  readonly authenticationError?: Error
  readonly createError?: Error
  readonly permissions?: CompanyContext['permissions']
  readonly submitError?: Error
}

export const FRONTEND_ORIGIN = 'http://localhost:53000'
export const CTE_BATCHES_PATH = '/cte-batches'
export const BATCH_ID = '00000000-0000-4000-8000-000000000501'
export const DOCUMENT_ID = '00000000-0000-4000-8000-000000000502'
export const IDEMPOTENCY_KEY = 'cte-batch-http-key-0001'
export const SUBMIT_IDEMPOTENCY_KEY = 'cte-submit-http-key-0001'
export const COMPANY_CONTEXT: CompanyContext = {
  ...NFE_COMPANY_CONTEXT,
  permissions: new Set(['cte.manage', 'cte.submit']),
}
export const READ_ONLY_CONTEXT: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set(['invoices.read']),
}
export const MANAGE_ONLY_CONTEXT: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set(['cte.manage']),
}

export const BATCH_SUMMARY = {
  correlationId: 'cte-batch-http-correlation',
  createdAt: '2026-07-22T20:00:00.000Z',
  id: BATCH_ID,
  itemCount: 1,
  name: 'Lote CT-e julho',
  status: 'draft',
  updatedAt: '2026-07-22T20:00:00.000Z',
  version: '1',
} as const

export const EVENTS_PAGE = {
  items: [
    {
      batchId: BATCH_ID,
      createdAt: '2026-07-22T20:00:00.000Z',
      eventName: 'created',
      id: '00000000-0000-4000-8000-000000000503',
      payload: { itemCount: 1, status: 'draft' },
    },
  ],
  nextCursor: null,
} as const

export async function createCteBatchHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly cancelCalls: CteBatchCall[]
  readonly createCalls: CteBatchCall[]
  readonly events: string[]
  readonly getCalls: CteBatchCall[]
  readonly handle: (request: Request) => Promise<Response>
  readonly listCalls: CteBatchCall[]
  readonly listEventCalls: CteBatchCall[]
  readonly submitCalls: CteBatchCall[]
}> {
  const cancelCalls: CteBatchCall[] = []
  const createCalls: CteBatchCall[] = []
  const events: string[] = []
  const getCalls: CteBatchCall[] = []
  const listCalls: CteBatchCall[] = []
  const listEventCalls: CteBatchCall[] = []
  const submitCalls: CteBatchCall[] = []
  const routes = await loadRoutes({
    cteBatches: {
      async cancel(input) {
        cancelCalls.push(structuredClone(input))
        return { ...BATCH_SUMMARY, status: 'cancelled' }
      },
      async create(input) {
        createCalls.push(structuredClone(input))
        if (params.createError) throw params.createError
        return BATCH_SUMMARY
      },
      async get(input) {
        getCalls.push(structuredClone(input))
        return BATCH_SUMMARY
      },
      async submit(input) {
        submitCalls.push(structuredClone(input))
        if (params.submitError) throw params.submitError
        return { ...BATCH_SUMMARY, status: 'submitted' }
      },
    },
    listBatches: {
      async execute(input) {
        listCalls.push(structuredClone(input))
        return { items: [BATCH_SUMMARY], nextCursor: null }
      },
    },
    listEvents: {
      async execute(input) {
        listEventCalls.push(structuredClone(input))
        return EVENTS_PAGE
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
    createCorrelationId: () => 'cte-batch-http-correlation',
    frontendOrigin: FRONTEND_ORIGIN,
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    cancelCalls,
    createCalls,
    events,
    getCalls,
    handle: (request) => handleRequest(request, { timeout() {} }),
    listCalls,
    listEventCalls,
    submitCalls,
  }
}

export function createBatchRequest(
  input: {
    readonly body?: unknown
    readonly events?: string[]
    readonly origin?: string
  } = {},
): Request {
  return jsonRequest({
    body: input.body ?? {
      documentIds: [DOCUMENT_ID],
      name: 'Lote CT-e julho',
    },
    events: input.events,
    idempotencyKey: IDEMPOTENCY_KEY,
    method: 'POST',
    origin: input.origin,
    pathname: CTE_BATCHES_PATH,
  })
}

export function submitBatchRequest(
  input: {
    readonly events?: string[]
    readonly origin?: string
  } = {},
): Request {
  return jsonRequest({
    body: {},
    events: input.events,
    idempotencyKey: SUBMIT_IDEMPOTENCY_KEY,
    method: 'POST',
    origin: input.origin,
    pathname: `${CTE_BATCHES_PATH}/${BATCH_ID}/submit`,
  })
}

export function listBatchesRequest(input: { readonly search?: string } = {}): Request {
  return new Request(`http://api.test${CTE_BATCHES_PATH}${input.search ?? ''}`, {
    headers: { authorization: 'Bearer token' },
    method: 'GET',
  })
}

export function getBatchRequest(): Request {
  return new Request(`http://api.test${CTE_BATCHES_PATH}/${BATCH_ID}`, {
    headers: { authorization: 'Bearer token' },
    method: 'GET',
  })
}

export function getBatchEventsRequest(): Request {
  return new Request(`http://api.test${CTE_BATCHES_PATH}/${BATCH_ID}/events`, {
    headers: { authorization: 'Bearer token' },
    method: 'GET',
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
  input: CteBatchHttpRouteDependencies,
): Promise<readonly RegisteredRoute[]> {
  const module = (await import('../../src/cte-batches/presentation/cte-batch.routes.js')) as {
    createCteBatchRoutes(dependencies: CteBatchHttpRouteDependencies): readonly RegisteredRoute[]
  }
  return module.createCteBatchRoutes(input)
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
      subject: 'cte-batch-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: {
      ...COMPANY_CONTEXT,
      permissions,
    },
  }
}
