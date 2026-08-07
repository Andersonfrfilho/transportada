/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter, type defineAnonymousRoute } from '../../src/http/router.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'

export const ACTIVATION_PATH = '/user-activation'
export const FRONTEND_ORIGIN = 'http://localhost:53000'
export const CORRELATION_ID = 'user-activation-contract'

/** Valores sintéticos: nenhum código ou senha real entra em fixture, log ou evidência. */
export const ACTIVATION_CODE = 'CODIGO-SINTETICO-DE-CONTRATO'
export const ACTIVATION_PASSWORD = 'Senha-sintetica-de-contrato-9'

export const ACTIVATION_BODY = {
  code: ACTIVATION_CODE,
  password: ACTIVATION_PASSWORD,
} as const

type RegisteredAnonymousRoute = ReturnType<typeof defineAnonymousRoute>

type ExecuteCall = Record<string, unknown>

type RouteDependencies = {
  readonly activateInvitation: { execute(input: ExecuteCall): Promise<void> }
}

type LogEntry = {
  readonly level: string
  readonly message: string
  readonly metadata: Record<string, unknown>
}

type CreateFixtureParams = {
  readonly executeError?: Error
}

export async function createUserActivationHttpFixture({
  executeError,
}: CreateFixtureParams = {}): Promise<{
  readonly events: string[]
  readonly executeCalls: ExecuteCall[]
  readonly handle: (request: Request) => Promise<Response>
  readonly logs: LogEntry[]
}> {
  const events: string[] = []
  const executeCalls: ExecuteCall[] = []
  const logs: LogEntry[] = []

  const anonymousRoutes = await loadRoutes({
    activateInvitation: {
      async execute(input) {
        executeCalls.push(structuredClone(input))
        if (executeError) throw executeError
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

  const handleRequest = createRequestHandler({
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
    events,
    executeCalls,
    handle: (request) => handleRequest(request, { timeout() {} }),
    logs,
  }
}

type ActivationRequestParams = {
  readonly body?: unknown
  readonly method?: string
  readonly token?: string
}

export function activationRequest(params: ActivationRequestParams = {}): Request {
  const method = params.method ?? 'POST'
  const headers: Record<string, string> = {
    origin: FRONTEND_ORIGIN,
    ...(params.token === undefined ? {} : { authorization: `Bearer ${params.token}` }),
  }

  if (method === 'GET') {
    return new Request(`${FRONTEND_ORIGIN}${ACTIVATION_PATH}`, { headers })
  }

  const body = params.body ?? ACTIVATION_BODY
  return new Request(`${FRONTEND_ORIGIN}${ACTIVATION_PATH}`, {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { ...headers, 'content-type': 'application/json' },
    method,
  })
}

async function loadRoutes(
  dependencies: RouteDependencies,
): Promise<readonly RegisteredAnonymousRoute[]> {
  const module = (await import('../../src/identity/presentation/user-activation.routes.js')) as {
    createUserActivationRoutes(input: RouteDependencies): readonly RegisteredAnonymousRoute[]
  }
  return module.createUserActivationRoutes(dependencies)
}

/** Só existe para provar que a rota anônima nunca chega a usar a identidade. */
function anonymousIdentity(): AuthenticatedIdentity {
  return {
    companyIdClaim: '00000000-0000-4000-8000-0000000009a1',
    externalIdentityId: '00000000-0000-4000-8000-0000000009a2',
    issuer: 'http://localhost:58080/realms/transportada-local',
    platformAdmin: false,
    subject: 'user-activation-should-never-authenticate',
    userId: '00000000-0000-4000-8000-0000000009a3',
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
    migrationStatus: appliedMigrations(),
  })
}
