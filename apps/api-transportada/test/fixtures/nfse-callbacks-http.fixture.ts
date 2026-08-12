/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture'
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter, type RegisteredAnonymousRoute } from '../../src/http/router.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type {
  NfseCallbackCredential,
  NfseCallbackRepositoryPort,
} from '../../src/nfse-callbacks/application/nfse-callback.port'
import type { ApiLogger } from '../../src/shared/api.types'

export const CALLBACK_PATH_PREFIX = '/public/nfse-callbacks'
export const FRONTEND_ORIGIN = 'http://localhost:53000'
export const CORRELATION_ID = 'nfse-callback-contract'

export const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
export const OTHER_COMPANY_ID = '00000000-0000-4000-8000-0000000000c2'

/**
 * Segredos sintéticos: se qualquer um deles aparecer numa resposta ou num log, o contrato falha.
 * Nenhum valor real de callback entra em fixture, evidência ou commit.
 */
export const CALLBACK_TOKEN = 'nfse-callback-synthetic-token-do-not-leak'
export const OTHER_CALLBACK_TOKEN = 'nfse-callback-synthetic-token-of-another-company'
export const UNKNOWN_CALLBACK_TOKEN = 'nfse-callback-synthetic-token-nobody-issued'

type LogEntry = {
  readonly level: string
  readonly message: string
  readonly metadata: Record<string, unknown>
}

type AnticipateCall = {
  readonly companyId: string
}

type CreateFixtureParams = {
  readonly anticipateError?: Error
  readonly callbackBaseUrl?: string | undefined
  readonly credentials?: readonly NfseCallbackCredential[]
  readonly listError?: Error
}

export const CALLBACK_BASE_URL = 'http://localhost:53001'

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Buffer.from(digest).toString('hex')
}

export async function defaultCredentials(): Promise<readonly NfseCallbackCredential[]> {
  return [
    { callbackTokenSha256: await sha256Hex(OTHER_CALLBACK_TOKEN), companyId: OTHER_COMPANY_ID },
    { callbackTokenSha256: await sha256Hex(CALLBACK_TOKEN), companyId: COMPANY_ID },
  ]
}

export async function createNfseCallbacksHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly anticipateCalls: AnticipateCall[]
  readonly events: string[]
  readonly handle: (request: Request) => Promise<Response>
  readonly logs: LogEntry[]
}> {
  const anticipateCalls: AnticipateCall[] = []
  const events: string[] = []
  const logs: LogEntry[] = []
  const credentials = params.credentials ?? (await defaultCredentials())

  // Um logger só para a rota e para o handler: o contrato varre estas linhas atrás de token e corpo.
  const logger: ApiLogger = {
    error(message, metadata) {
      logs.push({ level: 'error', message, metadata: metadata ?? {} })
    },
    info(message, metadata) {
      logs.push({ level: 'info', message, metadata: metadata ?? {} })
    },
    warn(message, metadata) {
      logs.push({ level: 'warn', message, metadata: metadata ?? {} })
    },
  }

  const repository: NfseCallbackRepositoryPort = {
    async anticipateStatusChecks(input) {
      anticipateCalls.push({ companyId: input.companyId })
      if (params.anticipateError) throw params.anticipateError
    },
    async listActiveCallbackCredentials() {
      events.push('listCredentials')
      if (params.listError) throw params.listError
      return credentials
    },
  }

  const anonymousRoutes = await loadRoutes({
    callbackBaseUrl: 'callbackBaseUrl' in params ? params.callbackBaseUrl : CALLBACK_BASE_URL,
    logger,
    repository,
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
        throw new Error('A rota anônima de callback nunca resolve empresa pelo contexto')
      },
    },
  })

  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigin: FRONTEND_ORIGIN,
    logger,
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    anticipateCalls,
    events,
    handle: (request) => handleRequest(request, { timeout() {} }),
    logs,
  }
}

type CallbackRequestParams = {
  readonly body?: unknown
  readonly contentType?: string
  readonly method?: string
  readonly token?: string
}

export function callbackRequest(params: CallbackRequestParams = {}): Request {
  const method = params.method ?? 'POST'
  const token = params.token ?? CALLBACK_TOKEN
  const url = `${FRONTEND_ORIGIN}${CALLBACK_PATH_PREFIX}/${token}`

  if (params.body === undefined) {
    return new Request(url, { method })
  }

  return new Request(url, {
    body: typeof params.body === 'string' ? params.body : JSON.stringify(params.body),
    headers: { 'content-type': params.contentType ?? 'application/json' },
    method,
  })
}

type LoadRoutesParams = {
  readonly callbackBaseUrl: string | undefined
  readonly logger: ApiLogger
  readonly repository: NfseCallbackRepositoryPort
}

async function loadRoutes({
  callbackBaseUrl,
  logger,
  repository,
}: LoadRoutesParams): Promise<readonly RegisteredAnonymousRoute[]> {
  const routesModule = (await import(
    '../../src/nfse-callbacks/presentation/nfse-callbacks.routes.js'
  )) as {
    createNfseCallbackRoutes(input: {
      readonly callbackBaseUrl: string | undefined
      readonly logger: ApiLogger
      readonly notifyNfseCallback: { execute(params: { readonly token: string }): Promise<void> }
    }): readonly RegisteredAnonymousRoute[]
  }
  const useCaseModule = (await import(
    '../../src/nfse-callbacks/application/notify-nfse-callback.use-case.js'
  )) as {
    createNotifyNfseCallbackUseCase(input: { readonly repository: NfseCallbackRepositoryPort }): {
      execute(params: { readonly token: string }): Promise<void>
    }
  }

  return routesModule.createNfseCallbackRoutes({
    callbackBaseUrl,
    logger,
    notifyNfseCallback: useCaseModule.createNotifyNfseCallbackUseCase({ repository }),
  })
}

/** Só existe para provar que a rota anônima nunca chega a usar a identidade. */
function anonymousIdentity(): AuthenticatedIdentity {
  return {
    companyIdClaim: '00000000-0000-4000-8000-0000000000c9',
    externalIdentityId: '00000000-0000-4000-8000-0000000000ca',
    issuer: 'http://localhost:58080/realms/transportada-local',
    platformAdmin: false,
    subject: 'nfse-callback-should-never-authenticate',
    userId: '00000000-0000-4000-8000-0000000000cb',
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
