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
import {
  CORRELATION_ID,
  FRONTEND_ORIGIN,
  MDFE_MANIFEST_DETAIL,
  TRIP,
  TRIP_DETAIL,
  TRIP_DOCUMENT,
  TRIP_PAGE,
} from './trip-http-payload.fixture'

type RegisteredRoute = ReturnType<typeof defineRoute>

type ExecuteCall = Record<string, unknown>

type TransitionResult = { readonly document: typeof TRIP_DOCUMENT; readonly tripStatus: string }
type TripStatusResult = { readonly tripStatus: string }

type RouteDependencies = {
  readonly batchStatus: { execute(input: ExecuteCall): Promise<unknown> }
  readonly cancelTrip: { execute(input: ExecuteCall): Promise<TripStatusResult> }
  readonly closeTrip: { execute(input: ExecuteCall): Promise<typeof TRIP_DETAIL> }
  readonly createTrip: { execute(input: ExecuteCall): Promise<typeof TRIP_DETAIL> }
  readonly createTripMdfeManifest: {
    execute(input: ExecuteCall): Promise<typeof MDFE_MANIFEST_DETAIL>
  }
  readonly deliverTripDocument: { execute(input: ExecuteCall): Promise<typeof TRIP_DOCUMENT> }
  readonly dispatchTrip: { execute(input: ExecuteCall): Promise<TripStatusResult> }
  readonly getTrip: { execute(input: ExecuteCall): Promise<typeof TRIP_DETAIL> }
  readonly linkTripDocument: { execute(input: ExecuteCall): Promise<typeof TRIP_DOCUMENT> }
  readonly listStops: { execute(input: ExecuteCall): Promise<unknown> }
  readonly listTrips: { execute(input: ExecuteCall): Promise<typeof TRIP_PAGE> }
  readonly loadTripDocument: { execute(input: ExecuteCall): Promise<TransitionResult> }
  readonly planTripRoute: { execute(input: ExecuteCall): Promise<TripStatusResult> }
  readonly releaseTripDocument: { execute(input: ExecuteCall): Promise<typeof TRIP_DOCUMENT> }
  readonly returnTripDocument: { execute(input: ExecuteCall): Promise<TransitionResult> }
  readonly separateTripDocument: { execute(input: ExecuteCall): Promise<TransitionResult> }
}

type CreateFixtureParams = {
  readonly batchStatusError?: Error
  readonly batchStatusResult?: unknown
  readonly cancelTripError?: Error
  readonly closeTripError?: Error
  readonly createTripError?: Error
  readonly createTripMdfeManifestError?: Error
  readonly deliverTripDocumentError?: Error
  readonly dispatchTripError?: Error
  readonly getTripError?: Error
  readonly linkTripDocumentError?: Error
  readonly listStopsResult?: unknown
  readonly listTripsError?: Error
  readonly loadTripDocumentError?: Error
  readonly permissions?: CompanyContext['permissions']
  readonly planTripRouteError?: Error
  readonly releaseTripDocumentError?: Error
  readonly returnTripDocumentError?: Error
  readonly separateTripDocumentError?: Error
}

export const COMPANY_CONTEXT: CompanyContext = {
  ...NFE_COMPANY_CONTEXT,
  permissions: new Set(['fleet.manage', 'fleet.read', 'mdfe.manage', 'trip.manage']),
}

export const NO_PERMISSIONS: CompanyContext['permissions'] = new Set([])

/** Quem administra frota deixou de administrar viagem: é o ponto da permissão nova. */
export const FLEET_ONLY_PERMISSIONS: CompanyContext['permissions'] = new Set([
  'fleet.manage',
  'fleet.read',
  'mdfe.manage',
])

export const READ_ONLY_PERMISSIONS: CompanyContext['permissions'] = new Set(['fleet.read'])

export async function createTripHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly batchStatusCalls: ExecuteCall[]
  readonly cancelTripCalls: ExecuteCall[]
  readonly closeTripCalls: ExecuteCall[]
  readonly createTripCalls: ExecuteCall[]
  readonly createTripMdfeManifestCalls: ExecuteCall[]
  readonly deliverTripDocumentCalls: ExecuteCall[]
  readonly dispatchTripCalls: ExecuteCall[]
  readonly getTripCalls: ExecuteCall[]
  readonly handle: (request: Request) => Promise<Response>
  readonly linkTripDocumentCalls: ExecuteCall[]
  readonly listStopsCalls: ExecuteCall[]
  readonly listTripsCalls: ExecuteCall[]
  readonly loadTripDocumentCalls: ExecuteCall[]
  readonly planTripRouteCalls: ExecuteCall[]
  readonly releaseTripDocumentCalls: ExecuteCall[]
  readonly returnTripDocumentCalls: ExecuteCall[]
  readonly separateTripDocumentCalls: ExecuteCall[]
}> {
  const batchStatusCalls: ExecuteCall[] = []
  const cancelTripCalls: ExecuteCall[] = []
  const closeTripCalls: ExecuteCall[] = []
  const createTripCalls: ExecuteCall[] = []
  const createTripMdfeManifestCalls: ExecuteCall[] = []
  const deliverTripDocumentCalls: ExecuteCall[] = []
  const dispatchTripCalls: ExecuteCall[] = []
  const getTripCalls: ExecuteCall[] = []
  const linkTripDocumentCalls: ExecuteCall[] = []
  const listStopsCalls: ExecuteCall[] = []
  const listTripsCalls: ExecuteCall[] = []
  const loadTripDocumentCalls: ExecuteCall[] = []
  const planTripRouteCalls: ExecuteCall[] = []
  const releaseTripDocumentCalls: ExecuteCall[] = []
  const returnTripDocumentCalls: ExecuteCall[] = []
  const separateTripDocumentCalls: ExecuteCall[] = []

  const transitionResult = (): TransitionResult => ({
    document: { ...TRIP_DOCUMENT },
    tripStatus: 'separating',
  })

  const routes = await loadRoutes({
    batchStatus: {
      async execute(input) {
        batchStatusCalls.push(structuredClone(input))
        if (params.batchStatusError) throw params.batchStatusError
        return (
          params.batchStatusResult ?? {
            items: [{ documentId: (input as { documentIds: string[] }).documentIds[0], outcome: 'applied' }],
            tripStatus: 'separating',
          }
        )
      },
    },
    cancelTrip: {
      async execute(input) {
        cancelTripCalls.push(structuredClone(input))
        if (params.cancelTripError) throw params.cancelTripError
        return { tripStatus: 'cancelled' }
      },
    },
    closeTrip: {
      async execute(input) {
        closeTripCalls.push(structuredClone(input))
        if (params.closeTripError) throw params.closeTripError
        return { ...TRIP_DETAIL, status: 'completed' }
      },
    },
    createTrip: {
      async execute(input) {
        createTripCalls.push(structuredClone(input))
        if (params.createTripError) throw params.createTripError
        return TRIP_DETAIL
      },
    },
    createTripMdfeManifest: {
      async execute(input) {
        createTripMdfeManifestCalls.push(structuredClone(input))
        if (params.createTripMdfeManifestError) throw params.createTripMdfeManifestError
        return MDFE_MANIFEST_DETAIL
      },
    },
    deliverTripDocument: {
      async execute(input) {
        deliverTripDocumentCalls.push(structuredClone(input))
        if (params.deliverTripDocumentError) throw params.deliverTripDocumentError
        return { ...TRIP_DOCUMENT, deliveredAt: '2026-08-05T09:00:00.000Z' }
      },
    },
    dispatchTrip: {
      async execute(input) {
        dispatchTripCalls.push(structuredClone(input))
        if (params.dispatchTripError) throw params.dispatchTripError
        return { tripStatus: 'dispatched' }
      },
    },
    getTrip: {
      async execute(input) {
        getTripCalls.push(structuredClone(input))
        if (params.getTripError) throw params.getTripError
        return TRIP_DETAIL
      },
    },
    linkTripDocument: {
      async execute(input) {
        linkTripDocumentCalls.push(structuredClone(input))
        if (params.linkTripDocumentError) throw params.linkTripDocumentError
        return TRIP_DOCUMENT
      },
    },
    listStops: {
      async execute(input) {
        listStopsCalls.push(structuredClone(input))
        return params.listStopsResult ?? { stops: [] }
      },
    },
    listTrips: {
      async execute(input) {
        listTripsCalls.push(structuredClone(input))
        if (params.listTripsError) throw params.listTripsError
        return TRIP_PAGE
      },
    },
    loadTripDocument: {
      async execute(input) {
        loadTripDocumentCalls.push(structuredClone(input))
        if (params.loadTripDocumentError) throw params.loadTripDocumentError
        return transitionResult()
      },
    },
    planTripRoute: {
      async execute(input) {
        planTripRouteCalls.push(structuredClone(input))
        if (params.planTripRouteError) throw params.planTripRouteError
        return { tripStatus: 'route_planned' }
      },
    },
    releaseTripDocument: {
      async execute(input) {
        releaseTripDocumentCalls.push(structuredClone(input))
        if (params.releaseTripDocumentError) throw params.releaseTripDocumentError
        return { ...TRIP_DOCUMENT, releasedAt: '2026-08-05T09:00:00.000Z' }
      },
    },
    returnTripDocument: {
      async execute(input) {
        returnTripDocumentCalls.push(structuredClone(input))
        if (params.returnTripDocumentError) throw params.returnTripDocumentError
        return transitionResult()
      },
    },
    separateTripDocument: {
      async execute(input) {
        separateTripDocumentCalls.push(structuredClone(input))
        if (params.separateTripDocumentError) throw params.separateTripDocumentError
        return transitionResult()
      },
    },
  })

  const router = createTestRouter({
    context: authenticatedContext(params.permissions ?? COMPANY_CONTEXT.permissions),
    routes,
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigin: FRONTEND_ORIGIN,
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    batchStatusCalls,
    cancelTripCalls,
    closeTripCalls,
    createTripCalls,
    createTripMdfeManifestCalls,
    deliverTripDocumentCalls,
    dispatchTripCalls,
    getTripCalls,
    handle: (request) => handleRequest(request, { timeout() {} }),
    linkTripDocumentCalls,
    listStopsCalls,
    listTripsCalls,
    loadTripDocumentCalls,
    planTripRouteCalls,
    releaseTripDocumentCalls,
    returnTripDocumentCalls,
    separateTripDocumentCalls,
  }
}

async function loadRoutes(input: RouteDependencies): Promise<readonly RegisteredRoute[]> {
  const module = (await import('../../src/trips/presentation/trip.routes.js')) as {
    createTripRoutes(dependencies: RouteDependencies): readonly RegisteredRoute[]
  }
  return module.createTripRoutes(input)
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
      subject: 'trip-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: { ...COMPANY_CONTEXT, permissions },
  }
}

export { MDFE_MANIFEST_DETAIL, TRIP, TRIP_DETAIL, TRIP_DOCUMENT }
