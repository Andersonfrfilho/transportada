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
  FleetVehicleCatalogPort,
  ListVehicleCatalogBrandsInput,
  ListVehicleCatalogModelsInput,
  VehicleCatalogResult,
} from '../../src/fleet/application/fleet-vehicle-catalog.port.js'
import { COMPANY_CONTEXT } from './fleet-http.fixture'
import { CORRELATION_ID, FRONTEND_ORIGIN } from './fleet-http-payload.fixture'

type RegisteredRoute = ReturnType<typeof defineRoute>

const DEFAULT_RESULT: VehicleCatalogResult = {
  items: [{ label: 'AGRALE', value: '102' }],
  source: 'fipe',
}

type CreateFixtureParams = {
  readonly permissions?: CompanyContext['permissions']
  readonly result?: VehicleCatalogResult
}

export async function createFleetCatalogHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly handle: (request: Request) => Promise<Response>
  readonly listBrandsCalls: (ListVehicleCatalogBrandsInput | undefined)[]
  readonly listModelsCalls: (ListVehicleCatalogModelsInput | undefined)[]
}> {
  const listBrandsCalls: (ListVehicleCatalogBrandsInput | undefined)[] = []
  const listModelsCalls: (ListVehicleCatalogModelsInput | undefined)[] = []

  const vehicleCatalog: FleetVehicleCatalogPort = {
    async listBrands(input) {
      listBrandsCalls.push(structuredClone(input))
      return params.result ?? DEFAULT_RESULT
    },
    async listModels(input) {
      listModelsCalls.push(structuredClone(input))
      return params.result ?? DEFAULT_RESULT
    },
  }

  const routes = await loadRoutes({ vehicleCatalog })

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
    handle: (request) => handleRequest(request, { timeout() {} }),
    listBrandsCalls,
    listModelsCalls,
  }
}

async function loadRoutes(input: {
  readonly vehicleCatalog: FleetVehicleCatalogPort
}): Promise<readonly RegisteredRoute[]> {
  const module = (await import('../../src/fleet/presentation/fleet-catalog.routes.js')) as {
    createFleetCatalogRoutes(dependencies: {
      readonly vehicleCatalog: FleetVehicleCatalogPort
    }): readonly RegisteredRoute[]
  }
  return module.createFleetCatalogRoutes(input)
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
      subject: 'fleet-catalog-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: { ...COMPANY_CONTEXT, permissions },
  }
}
