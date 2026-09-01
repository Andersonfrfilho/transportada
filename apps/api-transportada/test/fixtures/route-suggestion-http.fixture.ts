/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { HealthService } from '../../src/health/health.service'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter, type defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'
import type {
  CorrectedGeocodedAddress,
  RouteSuggestion,
} from '../../src/routing/application/route-suggestion.port'
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture'
import { appliedMigrations } from './health.fixture'
import { COMPANY_CONTEXT as FLEET_COMPANY_CONTEXT } from './fleet-http.fixture'
import { CORRELATION_ID, FRONTEND_ORIGIN } from './fleet-http-payload.fixture'

type RegisteredRoute = ReturnType<typeof defineRoute>
type Call = Record<string, unknown>

export const TRIP_ID = '00000000-0000-4000-8000-000000000701'
export const SUGGESTION_ID = '00000000-0000-4000-8000-000000000702'
export const ADDRESS_KEY = '3550308|01310100|1000'

export const QUEUED_SUGGESTION: RouteSuggestion = {
  assumptions: {
    dutyEnabled: false,
    endPolicy: 'depot',
    fallbackWeightKilograms: '0.00',
    originAddressKey: '',
    serviceTimeSeconds: 600,
    serviceTimeSource: 'default',
    solverTimeBudgetSeconds: 30,
  },
  createdAt: '2026-08-26T12:00:00.000Z',
  decidedAt: null,
  errorCode: '',
  estimatedCostAmount: null,
  estimatedDistanceMeters: null,
  estimatedDurationSeconds: null,
  id: SUGGESTION_ID,
  seed: 12_345,
  status: 'queued',
  stops: [],
  tripId: TRIP_ID,
  truncated: false,
  updatedAt: '2026-08-26T12:00:00.000Z',
  vehicleId: null,
}

export const CORRECTED_ADDRESS: CorrectedGeocodedAddress = {
  addressKey: ADDRESS_KEY,
  latitude: '-23.5613090',
  longitude: '-46.6564870',
  precision: 'rooftop',
  source: 'manual',
}

export const ROUTE_MANAGE_PERMISSIONS: CompanyContext['permissions'] = new Set([
  'fleet.read',
  'trip.manage',
])
export const READ_ONLY_PERMISSIONS: CompanyContext['permissions'] = new Set(['fleet.read'])

type FixtureParams = Readonly<{
  acceptError?: Error
  permissions?: CompanyContext['permissions']
}>

export async function createRouteSuggestionHttpFixture(params: FixtureParams = {}): Promise<{
  readonly acceptCalls: Call[]
  readonly correctCalls: Call[]
  readonly createCalls: Call[]
  readonly handle: (request: Request) => Promise<Response>
  readonly readCalls: Call[]
  readonly refineCalls: Call[]
  readonly rejectCalls: Call[]
}> {
  const acceptCalls: Call[] = []
  const correctCalls: Call[] = []
  const createCalls: Call[] = []
  const readCalls: Call[] = []
  const rejectCalls: Call[] = []

  const refineCalls: Call[] = []
  const routes = await loadRoutes({
    refineAddress: {
      async refine(input) {
        refineCalls.push(structuredClone(input))
        return { outcome: 'refined' }
      },
    },
    refinementQuota: { countInWindow: async () => 0, limit: 60 },
    geocodedAddressCorrection: {
      async correct(input) {
        correctCalls.push(structuredClone(input))
        return CORRECTED_ADDRESS
      },
    },
    routeSuggestions: {
      async accept(input) {
        acceptCalls.push(structuredClone(input))
        if (params.acceptError) throw params.acceptError
        return { ...QUEUED_SUGGESTION, decidedAt: '2026-08-26T12:05:00.000Z', status: 'accepted' }
      },
      async create(input) {
        createCalls.push(structuredClone(input) as unknown as Call)
        return QUEUED_SUGGESTION
      },
      async read(input) {
        readCalls.push(structuredClone(input) as unknown as Call)
        return QUEUED_SUGGESTION
      },
      async reject(input) {
        rejectCalls.push(structuredClone(input) as unknown as Call)
        return { ...QUEUED_SUGGESTION, decidedAt: '2026-08-26T12:05:00.000Z', status: 'rejected' }
      },
    },
  })

  const router = createTestRouter({
    context: authenticatedContext(params.permissions ?? ROUTE_MANAGE_PERMISSIONS),
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
    acceptCalls,
    correctCalls,
    createCalls,
    handle: (request) => handleRequest(request, { timeout() {} }),
    readCalls,
    refineCalls,
    rejectCalls,
  }
}

/**
 * Spec 058 P2: a mesma casca do fixture da sugestão de viagem, para as rotas que vivem **fora** da
 * árvore `/trips/:id`. Ela é montada aqui, e não num arquivo próprio, porque o roteador de teste, o
 * contexto autenticado e a origem do frontend são os mesmos — duplicá-los daria duas versões do
 * mesmo aparato para manter alinhadas.
 */
export async function createMultiVehicleHttpFixture(params: FixtureParams = {}): Promise<{
  readonly acceptCalls: Call[]
  readonly createCalls: Call[]
  readonly handle: (request: Request) => Promise<Response>
  readonly readCalls: Call[]
  readonly refineCalls: Call[]
  readonly rejectCalls: Call[]
}> {
  const acceptCalls: Call[] = []
  const createCalls: Call[] = []
  const readCalls: Call[] = []
  const rejectCalls: Call[] = []
  const refineCalls: Call[] = []

  const { createMultiVehicleSuggestionRoutes } = await import(
    '../../src/routing/presentation/multi-vehicle-suggestion.routes.js'
  )

  const poolSuggestion: RouteSuggestion = { ...QUEUED_SUGGESTION, tripId: null }

  const routes = createMultiVehicleSuggestionRoutes({
    multiVehicleSuggestions: {
      async accept(input) {
        acceptCalls.push(structuredClone(input) as unknown as Call)
        if (params.acceptError) throw params.acceptError
        return {
          suggestion: { ...poolSuggestion, status: 'accepted' as const },
          trips: [{ documentCount: 2, stopCount: 1, tripId: 'trip-1', vehicleId: 'vehicle-1' }],
        }
      },
      async create(input) {
        createCalls.push(structuredClone(input) as unknown as Call)
        return poolSuggestion
      },
      async read(input) {
        readCalls.push(structuredClone(input) as unknown as Call)
        return poolSuggestion
      },
      async reject(input) {
        rejectCalls.push(structuredClone(input) as unknown as Call)
        return { ...poolSuggestion, status: 'rejected' }
      },
    },
  })

  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router: createTestRouter({
      context: authenticatedContext(params.permissions ?? ROUTE_MANAGE_PERMISSIONS),
      routes,
    }),
  })

  return {
    acceptCalls,
    createCalls,
    handle: (request) => handleRequest(request, { timeout() {} }),
    readCalls,
    refineCalls,
    rejectCalls,
  }
}

export function jsonRequest(input: {
  readonly body?: unknown
  readonly method: string
  readonly path: string
}): Request {
  const headers: Record<string, string> = {
    origin: FRONTEND_ORIGIN,
    'x-correlation-id': CORRELATION_ID,
  }
  if (input.body !== undefined) headers['content-type'] = 'application/json'

  return new Request(`${FRONTEND_ORIGIN}${input.path}`, {
    headers,
    method: input.method,
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })
}

async function loadRoutes(input: Parameters<RouteFactory>[0]): Promise<readonly RegisteredRoute[]> {
  const module = (await import('../../src/routing/presentation/route-suggestion.routes.js')) as {
    createRouteSuggestionRoutes: RouteFactory
  }
  return module.createRouteSuggestionRoutes(input)
}

type RouteFactory = (dependencies: {
  readonly geocodedAddressCorrection: { correct(input: Call): Promise<CorrectedGeocodedAddress> }
  readonly refineAddress: { refine(input: Call): Promise<{ readonly outcome: string }> }
  readonly refinementQuota: {
    countInWindow(input: Call): Promise<number>
    limit: number
  }
  readonly routeSuggestions: {
    accept(input: Call): Promise<RouteSuggestion>
    create(input: Call): Promise<RouteSuggestion>
    read(input: Call): Promise<RouteSuggestion>
    reject(input: Call): Promise<RouteSuggestion>
  }
}) => readonly RegisteredRoute[]

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
      companyIdClaim: FLEET_COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'route-suggestion-http-contract',
      userId: FLEET_COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: { ...FLEET_COMPANY_CONTEXT, permissions },
  }
}
