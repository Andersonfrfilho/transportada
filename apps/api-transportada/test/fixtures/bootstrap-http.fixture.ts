/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { HealthService } from '../../src/health/health.service'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter, type defineAnonymousRoute } from '../../src/http/router.service'
import type {
  BootstrapFirstAdminInput,
  BootstrapFirstAdminResult,
} from '../../src/identity/application/bootstrap-first-admin.port'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'

export const BOOTSTRAP_PATH = '/bootstrap/first-admin'
export const FRONTEND_ORIGIN = 'http://localhost:53000'
export const CORRELATION_ID = 'bootstrap-first-admin-contract'
export const VALID_TOKEN = 'arranque-de-instalacao-para-contrato'
export const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
export const CREATED_USER_ID = '00000000-0000-4000-8000-0000000000c2'
export const CREATED_SUBJECT = '00000000-0000-4000-8000-0000000000c3'
export const ADMINISTRATOR_PASSWORD = 'Arranque-forte-para-contrato-9'

export const VALID_ADMINISTRATOR = {
  email: 'admin@transportada.test',
  firstName: 'Ada',
  lastName: 'Lovelace',
  password: ADMINISTRATOR_PASSWORD,
  username: 'company-admin',
} as const

export const EXPECTED_RESULT: BootstrapFirstAdminResult = {
  companyId: COMPANY_ID,
  subject: CREATED_SUBJECT,
  userId: CREATED_USER_ID,
}

type RegisteredAnonymousRoute = ReturnType<typeof defineAnonymousRoute>

type AvailabilityCall = { readonly token: string | undefined }

type RouteDependencies = {
  readonly bootstrapFirstAdmin: {
    assertAvailable(input: AvailabilityCall): Promise<void>
    execute(input: BootstrapFirstAdminInput): Promise<BootstrapFirstAdminResult>
  }
}

type LogEntry = {
  readonly level: string
  readonly message: string
  readonly metadata: Record<string, unknown>
}

type CreateFixtureParams = {
  readonly availabilityError?: Error
  readonly executeError?: Error
  readonly result?: BootstrapFirstAdminResult
}

export async function createBootstrapHttpFixture({
  availabilityError,
  executeError,
  result = EXPECTED_RESULT,
}: CreateFixtureParams = {}) {
  const availabilityCalls: AvailabilityCall[] = []
  const events: string[] = []
  const executeCalls: BootstrapFirstAdminInput[] = []
  const logs: LogEntry[] = []
  const anonymousRoutes = await loadRoutes({
    bootstrapFirstAdmin: {
      async assertAvailable(call) {
        availabilityCalls.push(call)
        if (availabilityError) throw availabilityError
      },
      async execute(call) {
        executeCalls.push(structuredClone(call))
        if (executeError) throw executeError
        return result
      },
    },
  })
  const router = createRouter({
    anonymousRoutes,
    authentication: {
      async authenticate() {
        events.push('authenticate')
        return anonymousIdentity()
      },
    },
    authorization: {
      authorize() {
        events.push('authorize')
      },
    },
    healthService: healthService(),
    routes: [],
    tenantContext: {
      async resolveCompany() {
        events.push('tenant')
        throw new Error('An anonymous route must never resolve a company')
      },
    },
  })
  const handle = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigin: FRONTEND_ORIGIN,
    logger: {
      error(message, metadata) {
        logs.push({ level: 'error', message, metadata: metadata ?? {} })
      },
      info(message, metadata) {
        logs.push({ level: 'info', message, metadata: metadata ?? {} })
      },
      warn(message, metadata) {
        logs.push({ level: 'warn', message, metadata: metadata ?? {} })
      },
    },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    availabilityCalls,
    events,
    executeCalls,
    handle: (request: Request) => handle(request, { timeout() {} }),
    logs,
  }
}

type FirstAdminRequestParams = {
  readonly body?: unknown
  readonly contentType?: string
  readonly method?: string
  readonly origin?: string
  readonly pathname?: string
  readonly token?: string
}

export function firstAdminRequest(params: FirstAdminRequestParams = {}): Request {
  const method = params.method ?? 'POST'
  const body = params.body ?? VALID_ADMINISTRATOR
  const headers = {
    ...(params.token === undefined ? {} : { authorization: `Bearer ${params.token}` }),
    ...(params.origin ? { origin: params.origin } : {}),
  }

  if (method === 'GET') {
    return new Request(`http://localhost${params.pathname ?? BOOTSTRAP_PATH}`, { headers })
  }

  return new Request(`http://localhost${params.pathname ?? BOOTSTRAP_PATH}`, {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { ...headers, 'content-type': params.contentType ?? 'application/json' },
    method,
  })
}

type PreflightRequestParams = {
  readonly headers?: string
  readonly method?: string
  readonly origin?: string
}

export function firstAdminPreflightRequest(params: PreflightRequestParams = {}): Request {
  return new Request(`http://localhost${BOOTSTRAP_PATH}`, {
    headers: {
      'access-control-request-headers': params.headers ?? 'authorization, content-type',
      'access-control-request-method': params.method ?? 'POST',
      origin: params.origin ?? FRONTEND_ORIGIN,
    },
    method: 'OPTIONS',
  })
}

export async function responseBody(response: Response): Promise<unknown> {
  return response.json()
}

async function loadRoutes(
  dependencies: RouteDependencies,
): Promise<readonly RegisteredAnonymousRoute[]> {
  const module = (await import('../../src/identity/presentation/bootstrap.routes.js')) as {
    createBootstrapRoutes(input: RouteDependencies): readonly RegisteredAnonymousRoute[]
  }
  return module.createBootstrapRoutes(dependencies)
}

/** Só existe para provar que a rota anônima nunca chega a usar a identidade. */
function anonymousIdentity(): AuthenticatedIdentity {
  return {
    companyIdClaim: COMPANY_ID,
    externalIdentityId: '00000000-0000-4000-8000-0000000000c4',
    issuer: 'http://localhost:58080/realms/transportada-local',
    platformAdmin: false,
    subject: 'bootstrap-contract-should-never-authenticate',
    userId: CREATED_USER_ID,
  }
}

function healthService(): HealthService {
  return new HealthService({
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
  })
}
