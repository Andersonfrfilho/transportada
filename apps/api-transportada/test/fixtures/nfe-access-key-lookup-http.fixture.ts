/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture'
import { stubUserPictureExistence } from './user-picture-existence.fixture'
import { HealthService } from '../../src/health/health.service'
import { appliedMigrations } from './health.fixture'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter, type defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import { FRONTEND_ORIGIN } from './fleet-http-payload.fixture'
import { COMPANY_CONTEXT, CORRELATION_ID } from './nfe-access-key-lookup.fixture'

type RegisteredRoute = ReturnType<typeof defineRoute>
type ExecuteCall = Record<string, unknown>
type UseCase = { execute(input: ExecuteCall): Promise<unknown> }

type CreateFixtureParams = {
  readonly getResult?: unknown | Error
  readonly permissions?: CompanyContext['permissions']
  readonly requestResult?: unknown | Error
}

export async function createNfeAccessKeyLookupHttpFixture(params: CreateFixtureParams = {}) {
  const getCalls: ExecuteCall[] = []
  const requestCalls: ExecuteCall[] = []
  const resolve = (value: unknown) => {
    if (value instanceof Error) throw value
    return value
  }
  const routes = await loadRoutes({
    getLookup: {
      async execute(input) {
        getCalls.push(structuredClone(input))
        return resolve(params.getResult)
      },
    },
    requestLookup: {
      async execute(input) {
        requestCalls.push(structuredClone(input))
        return resolve(params.requestResult)
      },
    },
  })
  const router = createTestRouter({
    context: authenticatedContext(params.permissions ?? COMPANY_CONTEXT.permissions),
    routes,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return {
    getCalls,
    handle: (request: Request) => handleRequest(request, { timeout() {} }),
    requestCalls,
    routes,
  }
}

async function loadRoutes(input: {
  readonly getLookup: UseCase
  readonly requestLookup: UseCase
}): Promise<readonly RegisteredRoute[]> {
  const module = (await import(
    '../../src/nfe-access-key-lookups/presentation/nfe-access-key-lookups.routes.js'
  )) as {
    createNfeAccessKeyLookupRoutes(dependencies: typeof input): readonly RegisteredRoute[]
  }
  return module.createNfeAccessKeyLookupRoutes(input)
}

export function createTestRouter(input: {
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
    userPictureExistence: stubUserPictureExistence(),
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
    rateLimitWindows: { consume: async () => ({ allowed: true }) },
    routes: input.routes,
    tenantContext: {
      async resolveCompany() {
        return input.context
      },
    },
  })
}

export function authenticatedContext(
  permissions: CompanyContext['permissions'],
): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'nfe-access-key-lookup-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: { ...COMPANY_CONTEXT, permissions },
  }
}
