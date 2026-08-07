/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
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
  DRIVER,
  DRIVER_PAGE,
  DRIVER_VEHICLE_ASSIGNMENTS,
  FRONTEND_ORIGIN,
  VEHICLE,
  VEHICLE_LOOKUP,
  VEHICLE_PAGE,
} from './fleet-http-payload.fixture'

type RegisteredRoute = ReturnType<typeof defineRoute>

type ExecuteCall = Record<string, unknown>

type RouteDependencies = {
  readonly createDriver: { execute(input: ExecuteCall): Promise<typeof DRIVER> }
  readonly createVehicle: { execute(input: ExecuteCall): Promise<typeof VEHICLE> }
  readonly listDrivers: { execute(input: ExecuteCall): Promise<typeof DRIVER_PAGE> }
  readonly listVehicles: { execute(input: ExecuteCall): Promise<typeof VEHICLE_PAGE> }
  readonly updateDriver: { execute(input: ExecuteCall): Promise<typeof DRIVER> }
  readonly updateVehicle: { execute(input: ExecuteCall): Promise<typeof VEHICLE> }
  readonly driverVehicles: {
    list(input: ExecuteCall): Promise<typeof DRIVER_VEHICLE_ASSIGNMENTS>
    replace(input: ExecuteCall): Promise<typeof DRIVER_VEHICLE_ASSIGNMENTS>
  }
  readonly vehicleLookup: {
    isAvailable(): boolean
    lookup(input: ExecuteCall): Promise<typeof VEHICLE_LOOKUP | null>
  }
}

type CreateFixtureParams = {
  readonly createDriverError?: Error
  readonly permissions?: CompanyContext['permissions']
  readonly replaceDriverVehiclesError?: Error
  readonly updateVehicleError?: Error
  readonly vehicleLookupAvailable?: boolean
  readonly vehicleLookupError?: Error
  readonly vehicleLookupResult?: typeof VEHICLE_LOOKUP | null
}

export const COMPANY_CONTEXT: CompanyContext = {
  ...NFE_COMPANY_CONTEXT,
  permissions: new Set(['fleet.read', 'fleet.manage']),
}

export const READ_ONLY_PERMISSIONS: CompanyContext['permissions'] = new Set(['fleet.read'])

export async function createFleetHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly createDriverCalls: ExecuteCall[]
  readonly createVehicleCalls: ExecuteCall[]
  readonly handle: (request: Request) => Promise<Response>
  readonly listDriverCalls: ExecuteCall[]
  readonly listDriverVehicleCalls: ExecuteCall[]
  readonly listVehicleCalls: ExecuteCall[]
  readonly lookupVehicleCalls: ExecuteCall[]
  readonly replaceDriverVehicleCalls: ExecuteCall[]
  readonly updateDriverCalls: ExecuteCall[]
  readonly updateVehicleCalls: ExecuteCall[]
}> {
  const createDriverCalls: ExecuteCall[] = []
  const createVehicleCalls: ExecuteCall[] = []
  const listDriverCalls: ExecuteCall[] = []
  const listDriverVehicleCalls: ExecuteCall[] = []
  const listVehicleCalls: ExecuteCall[] = []
  const lookupVehicleCalls: ExecuteCall[] = []
  const replaceDriverVehicleCalls: ExecuteCall[] = []
  const updateDriverCalls: ExecuteCall[] = []
  const updateVehicleCalls: ExecuteCall[] = []

  const routes = await loadRoutes({
    createDriver: {
      async execute(input) {
        createDriverCalls.push(structuredClone(input))
        if (params.createDriverError) throw params.createDriverError
        return DRIVER
      },
    },
    createVehicle: {
      async execute(input) {
        createVehicleCalls.push(structuredClone(input))
        return VEHICLE
      },
    },
    driverVehicles: {
      async list(input) {
        listDriverVehicleCalls.push(structuredClone(input))
        return DRIVER_VEHICLE_ASSIGNMENTS
      },
      async replace(input) {
        replaceDriverVehicleCalls.push(structuredClone(input))
        if (params.replaceDriverVehiclesError) throw params.replaceDriverVehiclesError
        return DRIVER_VEHICLE_ASSIGNMENTS
      },
    },
    listDrivers: {
      async execute(input) {
        listDriverCalls.push(structuredClone(input))
        return DRIVER_PAGE
      },
    },
    listVehicles: {
      async execute(input) {
        listVehicleCalls.push(structuredClone(input))
        return VEHICLE_PAGE
      },
    },
    updateDriver: {
      async execute(input) {
        updateDriverCalls.push(structuredClone(input))
        return { ...DRIVER, version: '2' }
      },
    },
    updateVehicle: {
      async execute(input) {
        updateVehicleCalls.push(structuredClone(input))
        if (params.updateVehicleError) throw params.updateVehicleError
        return { ...VEHICLE, version: '2' }
      },
    },
    vehicleLookup: {
      isAvailable: () => params.vehicleLookupAvailable ?? true,
      async lookup(input) {
        lookupVehicleCalls.push(structuredClone(input))
        if (params.vehicleLookupError) throw params.vehicleLookupError
        return params.vehicleLookupResult === undefined
          ? VEHICLE_LOOKUP
          : params.vehicleLookupResult
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
    createDriverCalls,
    createVehicleCalls,
    handle: (request) => handleRequest(request, { timeout() {} }),
    listDriverCalls,
    listDriverVehicleCalls,
    listVehicleCalls,
    lookupVehicleCalls,
    replaceDriverVehicleCalls,
    updateDriverCalls,
    updateVehicleCalls,
  }
}

async function loadRoutes(input: RouteDependencies): Promise<readonly RegisteredRoute[]> {
  const module = (await import('../../src/fleet/presentation/fleet.routes.js')) as {
    createFleetRoutes(dependencies: RouteDependencies): readonly RegisteredRoute[]
  }
  return module.createFleetRoutes(input)
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
      subject: 'fleet-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: { ...COMPANY_CONTEXT, permissions },
  }
}
