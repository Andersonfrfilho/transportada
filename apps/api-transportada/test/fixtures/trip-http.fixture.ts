/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { HealthService } from '../../src/health/health.service'
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

type RouteDependencies = {
  readonly closeTrip: { execute(input: ExecuteCall): Promise<typeof TRIP_DETAIL> }
  readonly createTrip: { execute(input: ExecuteCall): Promise<typeof TRIP_DETAIL> }
  readonly createTripMdfeManifest: {
    execute(input: ExecuteCall): Promise<typeof MDFE_MANIFEST_DETAIL>
  }
  readonly deliverTripDocument: { execute(input: ExecuteCall): Promise<typeof TRIP_DOCUMENT> }
  readonly getTrip: { execute(input: ExecuteCall): Promise<typeof TRIP_DETAIL> }
  readonly linkTripDocument: { execute(input: ExecuteCall): Promise<typeof TRIP_DOCUMENT> }
  readonly listTrips: { execute(input: ExecuteCall): Promise<typeof TRIP_PAGE> }
  readonly releaseTripDocument: { execute(input: ExecuteCall): Promise<typeof TRIP_DOCUMENT> }
}

type CreateFixtureParams = {
  readonly closeTripError?: Error
  readonly createTripError?: Error
  readonly createTripMdfeManifestError?: Error
  readonly deliverTripDocumentError?: Error
  readonly getTripError?: Error
  readonly linkTripDocumentError?: Error
  readonly listTripsError?: Error
  readonly permissions?: CompanyContext['permissions']
  readonly releaseTripDocumentError?: Error
}

export const COMPANY_CONTEXT: CompanyContext = {
  ...NFE_COMPANY_CONTEXT,
  permissions: new Set(['fleet.manage', 'fleet.read', 'mdfe.manage']),
}

export const NO_PERMISSIONS: CompanyContext['permissions'] = new Set([])

export const READ_ONLY_PERMISSIONS: CompanyContext['permissions'] = new Set(['fleet.read'])

export async function createTripHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly closeTripCalls: ExecuteCall[]
  readonly createTripCalls: ExecuteCall[]
  readonly createTripMdfeManifestCalls: ExecuteCall[]
  readonly deliverTripDocumentCalls: ExecuteCall[]
  readonly getTripCalls: ExecuteCall[]
  readonly handle: (request: Request) => Promise<Response>
  readonly linkTripDocumentCalls: ExecuteCall[]
  readonly listTripsCalls: ExecuteCall[]
  readonly releaseTripDocumentCalls: ExecuteCall[]
}> {
  const closeTripCalls: ExecuteCall[] = []
  const createTripCalls: ExecuteCall[] = []
  const createTripMdfeManifestCalls: ExecuteCall[] = []
  const deliverTripDocumentCalls: ExecuteCall[] = []
  const getTripCalls: ExecuteCall[] = []
  const linkTripDocumentCalls: ExecuteCall[] = []
  const listTripsCalls: ExecuteCall[] = []
  const releaseTripDocumentCalls: ExecuteCall[] = []

  const routes = await loadRoutes({
    closeTrip: {
      async execute(input) {
        closeTripCalls.push(structuredClone(input))
        if (params.closeTripError) throw params.closeTripError
        return { ...TRIP_DETAIL, status: 'closed' }
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
    listTrips: {
      async execute(input) {
        listTripsCalls.push(structuredClone(input))
        if (params.listTripsError) throw params.listTripsError
        return TRIP_PAGE
      },
    },
    releaseTripDocument: {
      async execute(input) {
        releaseTripDocumentCalls.push(structuredClone(input))
        if (params.releaseTripDocumentError) throw params.releaseTripDocumentError
        return { ...TRIP_DOCUMENT, releasedAt: '2026-08-05T09:00:00.000Z' }
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
    closeTripCalls,
    createTripCalls,
    createTripMdfeManifestCalls,
    deliverTripDocumentCalls,
    getTripCalls,
    handle: (request) => handleRequest(request, { timeout() {} }),
    linkTripDocumentCalls,
    listTripsCalls,
    releaseTripDocumentCalls,
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
