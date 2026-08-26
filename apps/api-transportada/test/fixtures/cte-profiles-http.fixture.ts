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
import { COMPANY_CONTEXT as NFE_COMPANY_CONTEXT } from './nfe-import-application.fixture'
import { FRONTEND_ORIGIN, PROFILE_DETAIL, PROFILES_PAGE } from './cte-profiles-http-payload.fixture'

type RegisteredRoute = ReturnType<typeof defineRoute>

type ExecuteCall = Record<string, unknown>

type RouteDependencies = {
  readonly activateProfile: { execute(input: ExecuteCall): Promise<typeof PROFILE_DETAIL> }
  readonly createProfile: { execute(input: ExecuteCall): Promise<typeof PROFILE_DETAIL> }
  readonly deactivateProfile: { execute(input: ExecuteCall): Promise<typeof PROFILE_DETAIL> }
  readonly deleteProfile?: never
  readonly listProfiles: { execute(input: ExecuteCall): Promise<typeof PROFILES_PAGE> }
  readonly updateProfile: { execute(input: ExecuteCall): Promise<typeof PROFILE_DETAIL> }
}

type CreateFixtureParams = {
  readonly createError?: Error
  readonly createResult?: typeof PROFILE_DETAIL
  readonly permissions?: CompanyContext['permissions']
  readonly updateError?: Error
}

export const COMPANY_CONTEXT: CompanyContext = {
  ...NFE_COMPANY_CONTEXT,
  permissions: new Set(['settings.manage', 'invoices.read']),
}

export const READ_ONLY_CONTEXT: CompanyContext = {
  ...COMPANY_CONTEXT,
  permissions: new Set(['invoices.read']),
}

export async function createCteProfilesHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly activateCalls: ExecuteCall[]
  readonly createCalls: ExecuteCall[]
  readonly deactivateCalls: ExecuteCall[]
  readonly handle: (request: Request) => Promise<Response>
  readonly listCalls: ExecuteCall[]
  readonly updateCalls: ExecuteCall[]
}> {
  const activateCalls: ExecuteCall[] = []
  const createCalls: ExecuteCall[] = []
  const deactivateCalls: ExecuteCall[] = []
  const listCalls: ExecuteCall[] = []
  const updateCalls: ExecuteCall[] = []

  const routes = await loadRoutes({
    activateProfile: {
      async execute(input) {
        activateCalls.push(structuredClone(input))
        return { ...PROFILE_DETAIL, status: 'active', version: '2' }
      },
    },
    createProfile: {
      async execute(input) {
        createCalls.push(structuredClone(input))
        if (params.createError) throw params.createError
        return params.createResult ?? PROFILE_DETAIL
      },
    },
    deactivateProfile: {
      async execute(input) {
        deactivateCalls.push(structuredClone(input))
        return { ...PROFILE_DETAIL, status: 'inactive', version: '3' }
      },
    },
    listProfiles: {
      async execute(input) {
        listCalls.push(structuredClone(input))
        return PROFILES_PAGE
      },
    },
    updateProfile: {
      async execute(input) {
        updateCalls.push(structuredClone(input))
        if (params.updateError) throw params.updateError
        return { ...PROFILE_DETAIL, version: '2' }
      },
    },
  })

  const router = createTestRouter({
    context: authenticatedContext(params.permissions ?? COMPANY_CONTEXT.permissions),
    routes,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'cte-profiles-http-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    activateCalls,
    createCalls,
    deactivateCalls,
    handle: (request) => handleRequest(request, { timeout() {} }),
    listCalls,
    updateCalls,
  }
}

async function loadRoutes(input: RouteDependencies): Promise<readonly RegisteredRoute[]> {
  const module = (await import(
    '../../src/cte-profiles/presentation/cte-emission-profiles.routes.js'
  )) as {
    createCteEmissionProfileRoutes(dependencies: RouteDependencies): readonly RegisteredRoute[]
  }
  return module.createCteEmissionProfileRoutes(input)
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
      subject: 'cte-profiles-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: { ...COMPANY_CONTEXT, permissions },
  }
}
