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
import type {
  LookupPostalCodeRequest,
  LookupPostalCodeUseCase,
} from '../../src/addresses/application/lookup-postal-code.use-case.js'
import type { PostalCodeSuggestion } from '../../src/addresses/domain/postal-code-suggestion.policy.js'
import { COMPANY_CONTEXT } from './fleet-http.fixture'
import { CORRELATION_ID, FRONTEND_ORIGIN } from './fleet-http-payload.fixture'

type RegisteredRoute = ReturnType<typeof defineRoute>

export const ADDRESSES_READ_PERMISSIONS: CompanyContext['permissions'] = new Set(['addresses.read'])

export const SUGGESTION: PostalCodeSuggestion = {
  city: 'Ribeirão Preto',
  district: 'Jardim Paulista',
  state: 'SP',
  street: 'Avenida Independência',
}

type CreateFixtureParams = {
  readonly permissions?: CompanyContext['permissions']
  readonly suggestion?: PostalCodeSuggestion | null
}

export async function createPostalCodeHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly companyId: string
  readonly handle: (request: Request) => Promise<Response>
  readonly lookupCalls: LookupPostalCodeRequest[]
}> {
  const lookupCalls: LookupPostalCodeRequest[] = []

  const lookup: LookupPostalCodeUseCase = {
    execute: async (request) => {
      lookupCalls.push(structuredClone(request))
      return params.suggestion === undefined ? SUGGESTION : params.suggestion
    },
  }

  const router = createTestRouter({
    context: authenticatedContext(params.permissions ?? ADDRESSES_READ_PERMISSIONS),
    routes: await loadRoutes({ lookup }),
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigin: FRONTEND_ORIGIN,
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    companyId: COMPANY_CONTEXT.companyId,
    handle: (request) => handleRequest(request, { timeout() {} }),
    lookupCalls,
  }
}

async function loadRoutes(input: {
  readonly lookup: LookupPostalCodeUseCase
}): Promise<readonly RegisteredRoute[]> {
  const module = (await import('../../src/addresses/presentation/postal-code.routes.js')) as {
    createPostalCodeRoutes(dependencies: {
      readonly lookup: LookupPostalCodeUseCase
    }): readonly RegisteredRoute[]
  }
  return module.createPostalCodeRoutes(input)
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
      subject: 'postal-code-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: { ...COMPANY_CONTEXT, permissions },
  }
}
