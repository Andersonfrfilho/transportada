/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture'
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter, type defineAnonymousRoute } from '../../src/http/router.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'

export const PASSWORD_RESET_PATH = '/password-resets'
export const PASSWORD_RESET_CONFIRM_PATH = '/password-resets/confirm'
export const FRONTEND_ORIGIN = 'http://localhost:53000'
export const CORRELATION_ID = 'password-reset-contract'

/** Valores sintéticos: nenhum login, código ou senha real entra em fixture, log ou evidência. */
export const RESET_USERNAME = 'usuario.sintetico.de.contrato'
export const RESET_CODE = 'CODIGO-SINTETICO-DE-CONTRATO'
export const RESET_PASSWORD = 'Senha-sintetica-de-contrato-9'

export const REQUEST_BODY = { username: RESET_USERNAME } as const
export const CONFIRM_BODY = { code: RESET_CODE, password: RESET_PASSWORD } as const

type RegisteredAnonymousRoute = ReturnType<typeof defineAnonymousRoute>

type ExecuteCall = Record<string, unknown>

type RouteDependencies = {
  readonly confirmPasswordReset: { execute(input: ExecuteCall): Promise<void> }
  readonly requestPasswordReset: { execute(input: ExecuteCall): Promise<void> }
}

type LogEntry = {
  readonly level: string
  readonly message: string
  readonly metadata: Record<string, unknown>
}

type CreateFixtureParams = {
  readonly confirmError?: Error
  readonly requestError?: Error
}

export async function createPasswordResetHttpFixture({
  confirmError,
  requestError,
}: CreateFixtureParams = {}): Promise<{
  readonly confirmCalls: ExecuteCall[]
  readonly events: string[]
  readonly handle: (request: Request) => Promise<Response>
  readonly logs: LogEntry[]
  readonly requestCalls: ExecuteCall[]
}> {
  const confirmCalls: ExecuteCall[] = []
  const events: string[] = []
  const logs: LogEntry[] = []
  const requestCalls: ExecuteCall[] = []

  const anonymousRoutes = await loadRoutes({
    confirmPasswordReset: {
      async execute(input) {
        confirmCalls.push(structuredClone(input))
        if (confirmError) throw confirmError
      },
    },
    requestPasswordReset: {
      async execute(input) {
        requestCalls.push(structuredClone(input))
        if (requestError) throw requestError
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
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
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
    frontendOrigins: [FRONTEND_ORIGIN],
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
    confirmCalls,
    events,
    handle: (request) => handleRequest(request, { timeout() {} }),
    logs,
    requestCalls,
  }
}

type ResetRequestParams = {
  readonly body?: unknown
  readonly method?: string
  readonly pathname?: string
  readonly token?: string
}

export function resetRequest(params: ResetRequestParams = {}): Request {
  const method = params.method ?? 'POST'
  const pathname = params.pathname ?? PASSWORD_RESET_PATH
  const headers: Record<string, string> = {
    origin: FRONTEND_ORIGIN,
    ...(params.token === undefined ? {} : { authorization: `Bearer ${params.token}` }),
  }

  if (method === 'GET') {
    return new Request(`${FRONTEND_ORIGIN}${pathname}`, { headers })
  }

  const body = params.body ?? (pathname === PASSWORD_RESET_PATH ? REQUEST_BODY : CONFIRM_BODY)
  return new Request(`${FRONTEND_ORIGIN}${pathname}`, {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { ...headers, 'content-type': 'application/json' },
    method,
  })
}

async function loadRoutes(
  dependencies: RouteDependencies,
): Promise<readonly RegisteredAnonymousRoute[]> {
  const module = (await import('../../src/identity/presentation/password-reset.routes.js')) as {
    createPasswordResetRoutes(input: RouteDependencies): readonly RegisteredAnonymousRoute[]
  }
  return module.createPasswordResetRoutes(dependencies)
}

/** Só existe para provar que a rota anônima nunca chega a usar a identidade. */
function anonymousIdentity(): AuthenticatedIdentity {
  return {
    companyIdClaim: '00000000-0000-4000-8000-0000000009b1',
    externalIdentityId: '00000000-0000-4000-8000-0000000009b2',
    issuer: 'http://localhost:58080/realms/transportada-local',
    platformAdmin: false,
    subject: 'password-reset-should-never-authenticate',
    userId: '00000000-0000-4000-8000-0000000009b3',
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
