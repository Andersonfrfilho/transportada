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
  VehicleReference,
  VehicleReferencePort,
} from '../../src/fleet/application/vehicle-reference.port.js'
import { COMPANY_CONTEXT } from './fleet-http.fixture'
import { CORRELATION_ID, FRONTEND_ORIGIN } from './fleet-http-payload.fixture'

type RegisteredRoute = ReturnType<typeof defineRoute>

const DEFAULT_REFERENCES: readonly VehicleReference[] = [
  {
    bodyType: '02',
    cargoHeightM: '2.150',
    cargoLengthM: '4.200',
    cargoWidthM: '2.100',
    maxPayloadKg: '1500.000',
    vehicleType: 'vuc',
  },
  {
    bodyType: '02',
    cargoHeightM: '2.700',
    cargoLengthM: '14.270',
    cargoWidthM: '2.460',
    /** O implemento: `vehicleType` vazio, e sem carga publicada. */
    maxPayloadKg: null,
    vehicleType: '',
  },
]

type CreateFixtureParams = {
  readonly permissions?: CompanyContext['permissions']
  readonly references?: readonly VehicleReference[]
}

export async function createVehicleReferenceHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly handle: (request: Request) => Promise<Response>
  readonly listCalls: number
}> {
  const calls = { count: 0 }

  const vehicleReferences: VehicleReferencePort = {
    async list() {
      calls.count += 1
      return params.references ?? DEFAULT_REFERENCES
    },
  }

  const routes = await loadRoutes({ vehicleReferences })

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
    get listCalls() {
      return calls.count
    },
  }
}

async function loadRoutes(input: {
  readonly vehicleReferences: VehicleReferencePort
}): Promise<readonly RegisteredRoute[]> {
  const module = (await import('../../src/fleet/presentation/vehicle-reference.routes.js')) as {
    createVehicleReferenceRoutes(dependencies: {
      readonly vehicleReferences: VehicleReferencePort
    }): readonly RegisteredRoute[]
  }
  return module.createVehicleReferenceRoutes(input)
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
      serviceAccount: false,
      subject: 'fleet-catalog-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: { ...COMPANY_CONTEXT, permissions },
  }
}
