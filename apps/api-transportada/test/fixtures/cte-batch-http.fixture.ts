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

type CteBatchCall = {
  readonly batchId?: string
  readonly context: CompanyContext
  readonly correlationId?: string
  readonly cursor?: string | null
  readonly documentIds?: readonly string[]
  readonly emissionProfileId?: string
  readonly filters?: Readonly<Record<string, readonly string[] | string>>
  readonly groupingMode?: string
  readonly idempotencyKey?: string
  readonly itemId?: string
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
    readonly appendItems: (input: CteBatchCall) => Promise<CteBatchSummary>
    readonly cancel: (input: CteBatchCall) => Promise<CteBatchSummary>
    readonly create: (input: CteBatchCall) => Promise<CteBatchSummary>
    readonly get: (input: CteBatchCall) => Promise<CteBatchSummary>
    readonly removeItem: (input: CteBatchCall) => Promise<CteBatchSummary>
    readonly submit: (input: CteBatchCall) => Promise<CteBatchSummary>
  }
  readonly listBatches: {
    readonly execute: (input: CteBatchCall) => Promise<CteBatchPage>
  }
  readonly listCompanyItems: {
    readonly execute: (input: CteBatchCall) => Promise<typeof COMPANY_ITEMS_PAGE>
  }
  readonly summarizeCompanyItems: {
    readonly execute: (input: CteBatchCall) => Promise<typeof COMPANY_ITEMS_SUMMARY>
  }
  readonly listEvents: {
    readonly execute: (input: CteBatchCall) => Promise<typeof EVENTS_PAGE>
  }
  readonly listItems: {
    readonly execute: (input: CteBatchCall) => Promise<typeof ITEMS_RESULT>
  }
  readonly previewBatches: {
    readonly execute: (input: CteBatchCall) => Promise<typeof PREVIEW_RESULT>
  }
}

type CreateFixtureParams = {
  readonly appendItemsError?: Error
  readonly authenticationError?: Error
  readonly createError?: Error
  readonly listCompanyItemsError?: Error
  readonly listItemsError?: Error
  readonly permissions?: CompanyContext['permissions']
  readonly removeItemError?: Error
  readonly submitError?: Error
  readonly summarizeCompanyItemsError?: Error
}

export const FRONTEND_ORIGIN = 'http://localhost:53000'
export const CTE_BATCHES_PATH = '/cte-batches'
export const BATCH_ID = '00000000-0000-4000-8000-000000000501'
export const DOCUMENT_ID = '00000000-0000-4000-8000-000000000502'
export const EMISSION_PROFILE_ID = '00000000-0000-4000-8000-000000000503'
export const ITEM_ID = '00000000-0000-4000-8000-000000000507'
export const FISCAL_DOCUMENT_ID = '00000000-0000-4000-8000-000000000508'
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

export const PREVIEW_RESULT = {
  blocked: [
    {
      batchId: '00000000-0000-4000-8000-000000000504',
      documentId: '00000000-0000-4000-8000-000000000505',
      reason: 'CTE_BATCH_DOCUMENT_ALREADY_LINKED',
    },
  ],
  projections: [
    {
      adjustments: [],
      baseAmount: '958.4800',
      calculatedAmount: '43.1316',
      components: [{ amount: '43.1316', calculationType: 'main', label: 'Frete' }],
      documents: [
        {
          accessKey: '35260705868574001090550020008526741408978623',
          documentId: DOCUMENT_ID,
          number: '852674',
          series: '2',
          totalAmount: '958.4800',
        },
      ],
      fiscalAmount: '43.13',
      fiscalComponents: [{ amount: '43.13', calculationType: 'main', label: 'Frete' }],
      percentage: '0.045000',
      profile: {
        groupingMode: 'per_invoice',
        id: '00000000-0000-4000-8000-000000000506',
        matchedBy: 'sender_tax_id',
        name: 'Perfil Zaragoza',
        resolvedBy: 'auto',
      },
      recipientTaxId: '19354980000159',
      senderTaxId: '05868574001090',
    },
  ],
  summary: { blockedCount: 1, documentCount: 2, projectedCount: 1, totalAmount: '43.13' },
} as const

export const ITEMS_RESULT = {
  items: [
    {
      accessKey: '35260705868574001090570010000000011000000012',
      authorizationProtocol: '135260000000123',
      authorizedAt: '2026-07-23T10:00:00.000Z',
      baseAmount: '958.4800',
      billingStatus: 'invoiced',
      charges: [
        {
          amount: '43.1316',
          baseAmount: '958.4800',
          calculationType: 'percentage_of_cargo',
          label: 'Frete',
          ordinal: '1',
          rate: '0.045000',
        },
      ],
      documents: [
        {
          accessKey: '35260705868574001090550020008526741408978623',
          id: DOCUMENT_ID,
          number: '852674',
          position: '1',
          series: '2',
          totalAmount: '958.4800',
        },
      ],
      fiscalAmount: '43.13',
      fiscalDocumentId: FISCAL_DOCUMENT_ID,
      fiscalNumber: '17',
      fiscalNumberChange: {
        previousNumber: '14',
        reason: 'sefaz_duplicate_number',
        rejectionCode: '539',
      },
      fiscalSeries: '1',
      id: '00000000-0000-4000-8000-000000000507',
      lastErrorCode: null,
      position: '1',
      status: 'authorized',
      totalAmount: '43.1316',
    },
  ],
} as const

export const CTE_BATCH_ITEMS_PATH = '/cte-batch-items'
export const BATCH_NAME = 'Lote CT-e julho'
export const COMPANY_ITEMS_PAGE = {
  items: [
    {
      ...ITEMS_RESULT.items[0],
      batchId: BATCH_ID,
      batchName: BATCH_NAME,
      createdAt: '2026-07-22T20:00:00.000Z',
    },
  ],
  nextCursor: '2026-07-22T20:00:00.000Z::00000000-0000-4000-8000-000000000507',
} as const

export const CTE_BATCH_ITEMS_SUMMARY_PATH = '/cte-batch-items/summary'
export const COMPANY_ITEMS_SUMMARY = {
  baseAmount: '1000.0000',
  batchIds: [BATCH_ID],
  batchIdsTruncated: false,
  count: 167,
  statusCounts: { authorized: 20, pending: 147 },
  totalAmount: '1234.5600',
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
  readonly appendItemCalls: CteBatchCall[]
  readonly cancelCalls: CteBatchCall[]
  readonly createCalls: CteBatchCall[]
  readonly events: string[]
  readonly getCalls: CteBatchCall[]
  readonly handle: (request: Request) => Promise<Response>
  readonly listCalls: CteBatchCall[]
  readonly listCompanyItemCalls: CteBatchCall[]
  readonly listEventCalls: CteBatchCall[]
  readonly listItemCalls: CteBatchCall[]
  readonly previewCalls: CteBatchCall[]
  readonly removeItemCalls: CteBatchCall[]
  readonly submitCalls: CteBatchCall[]
  readonly summarizeCompanyItemCalls: CteBatchCall[]
}> {
  const appendItemCalls: CteBatchCall[] = []
  const cancelCalls: CteBatchCall[] = []
  const createCalls: CteBatchCall[] = []
  const events: string[] = []
  const getCalls: CteBatchCall[] = []
  const listCalls: CteBatchCall[] = []
  const listCompanyItemCalls: CteBatchCall[] = []
  const summarizeCompanyItemCalls: CteBatchCall[] = []
  const listEventCalls: CteBatchCall[] = []
  const listItemCalls: CteBatchCall[] = []
  const previewCalls: CteBatchCall[] = []
  const removeItemCalls: CteBatchCall[] = []
  const submitCalls: CteBatchCall[] = []
  const routes = await loadRoutes({
    cteBatches: {
      async appendItems(input) {
        appendItemCalls.push(structuredClone(input))
        if (params.appendItemsError) throw params.appendItemsError
        return { ...BATCH_SUMMARY, itemCount: 3, version: '2' }
      },
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
      async removeItem(input) {
        removeItemCalls.push(structuredClone(input))
        if (params.removeItemError) throw params.removeItemError
        return { ...BATCH_SUMMARY, itemCount: 0, version: '2' }
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
    listCompanyItems: {
      async execute(input) {
        listCompanyItemCalls.push(structuredClone(input))
        if (params.listCompanyItemsError) throw params.listCompanyItemsError
        return COMPANY_ITEMS_PAGE
      },
    },
    summarizeCompanyItems: {
      async execute(input) {
        summarizeCompanyItemCalls.push(structuredClone(input))
        if (params.summarizeCompanyItemsError) throw params.summarizeCompanyItemsError
        return COMPANY_ITEMS_SUMMARY
      },
    },
    listEvents: {
      async execute(input) {
        listEventCalls.push(structuredClone(input))
        return EVENTS_PAGE
      },
    },
    listItems: {
      async execute(input) {
        listItemCalls.push(structuredClone(input))
        if (params.listItemsError) throw params.listItemsError
        return ITEMS_RESULT
      },
    },
    previewBatches: {
      async execute(input) {
        previewCalls.push(structuredClone(input))
        return PREVIEW_RESULT
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
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    appendItemCalls,
    cancelCalls,
    createCalls,
    events,
    getCalls,
    handle: (request) => handleRequest(request, { timeout() {} }),
    listCalls,
    listCompanyItemCalls,
    listEventCalls,
    listItemCalls,
    previewCalls,
    removeItemCalls,
    submitCalls,
    summarizeCompanyItemCalls,
  }
}

export function summarizeCompanyItemsRequest(input: { readonly search?: string } = {}): Request {
  return new Request(`http://api.test${CTE_BATCH_ITEMS_SUMMARY_PATH}${input.search ?? ''}`, {
    headers: { authorization: 'Bearer token' },
    method: 'GET',
  })
}

export function deleteBatchItemRequest(
  input: {
    readonly batchId?: string
    readonly itemId?: string
    readonly origin?: string
  } = {},
): Request {
  const headers = new Headers({ authorization: 'Bearer token' })
  if (input.origin) headers.set('origin', input.origin)

  return new Request(
    `http://api.test${CTE_BATCHES_PATH}/${input.batchId ?? BATCH_ID}/items/${input.itemId ?? ITEM_ID}`,
    { headers, method: 'DELETE' },
  )
}

export function previewBatchRequest(
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

  return new Request(`http://api.test${CTE_BATCHES_PATH}/preview`, {
    body: JSON.stringify(input.body ?? { documentIds: [DOCUMENT_ID] }),
    headers,
    method: 'POST',
  })
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

export function appendBatchItemsRequest(
  input: {
    readonly body?: unknown
    readonly events?: string[]
    readonly origin?: string
  } = {},
): Request {
  return jsonRequest({
    body: input.body ?? { documentIds: [DOCUMENT_ID] },
    events: input.events,
    idempotencyKey: IDEMPOTENCY_KEY,
    method: 'POST',
    origin: input.origin,
    pathname: `${CTE_BATCHES_PATH}/${BATCH_ID}/items`,
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

export function getBatchItemsRequest(input: { readonly batchId?: string } = {}): Request {
  return new Request(`http://api.test${CTE_BATCHES_PATH}/${input.batchId ?? BATCH_ID}/items`, {
    headers: { authorization: 'Bearer token' },
    method: 'GET',
  })
}

export function listCompanyItemsRequest(input: { readonly search?: string } = {}): Request {
  return new Request(`http://api.test${CTE_BATCH_ITEMS_PATH}${input.search ?? ''}`, {
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
      serviceAccount: false,
      subject: 'cte-batch-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: {
      ...COMPANY_CONTEXT,
      permissions,
    },
  }
}
