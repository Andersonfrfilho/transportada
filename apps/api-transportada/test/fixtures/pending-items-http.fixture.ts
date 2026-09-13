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
import type { PendingItemPage } from '../../src/pending-items/application/pending-item-source.port'
import { FRONTEND_ORIGIN } from './fleet-http-payload.fixture'

type RegisteredRoute = ReturnType<typeof defineRoute>

export const CORRELATION_ID = 'pending-items-http-correlation'
export const COMPANY_ID = '00000000-0000-4000-8000-000000000921'
export const USER_ID = '00000000-0000-4000-8000-000000000922'
export const MEMBERSHIP_ID = '00000000-0000-4000-8000-000000000923'
export const VEHICLE_ID = '00000000-0000-4000-8000-000000000924'

export const COMPANY_CONTEXT: CompanyContext = {
  companyId: COMPANY_ID,
  kind: 'company',
  membershipId: MEMBERSHIP_ID,
  permissions: new Set(['fleet.read']),
  roles: ['operator'],
  userId: USER_ID,
}

export const PENDING_ITEM_PAGE: PendingItemPage = {
  items: [
    {
      entityId: VEHICLE_ID,
      entityType: 'vehicle',
      kind: 'vehicleBodyTypeMissing',
      label: 'ABC1D23',
    },
  ],
  nextCursor: null,
}

type ExecuteCall = Record<string, unknown>

type CreateFixtureParams = {
  readonly page?: PendingItemPage
  readonly permissions?: CompanyContext['permissions']
}

export async function createPendingItemsHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly handle: (request: Request) => Promise<Response>
  readonly listCalls: ExecuteCall[]
}> {
  const listCalls: ExecuteCall[] = []

  const routes = await loadRoutes({
    listPendingItems: {
      async execute(input) {
        listCalls.push(structuredClone(input))
        return params.page ?? PENDING_ITEM_PAGE
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

  return { handle: (request) => handleRequest(request, { timeout() {} }), listCalls }
}

async function loadRoutes(input: {
  readonly listPendingItems: { execute(input: ExecuteCall): Promise<PendingItemPage> }
}): Promise<readonly RegisteredRoute[]> {
  const module = (await import('../../src/pending-items/presentation/pending-items.routes.js')) as {
    createPendingItemsRoutes(dependencies: typeof input): readonly RegisteredRoute[]
  }
  return module.createPendingItemsRoutes(input)
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
      serviceAccount: false,
      subject: 'pending-items-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: { ...COMPANY_CONTEXT, permissions },
  }
}
