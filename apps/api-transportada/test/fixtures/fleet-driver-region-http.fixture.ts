/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  COMPANY_CONTEXT,
  CORRELATION_ID,
  FRONTEND_ORIGIN,
  REGION_ID,
  authenticatedContext,
  createTestRouter,
} from './freight-region-http.fixture'
import type { FleetDriverRegionCoverage } from '../../src/freight-regions/application/freight-region.port'
import { createRequestHandler } from '../../src/http/request-handler.service'
import type { defineRoute } from '../../src/http/router.service'
import type { CompanyContext } from '../../src/identity/domain/tenant-context'

type RegisteredRoute = ReturnType<typeof defineRoute>

type ExecuteCall = Record<string, unknown>

type RouteDependencies = {
  readonly listCoverage: {
    execute(input: ExecuteCall): Promise<readonly FleetDriverRegionCoverage[]>
  }
  readonly replaceCoverage: {
    execute(input: ExecuteCall): Promise<readonly FleetDriverRegionCoverage[]>
  }
}

type CreateFixtureParams = {
  readonly permissions?: CompanyContext['permissions']
  readonly replaceCoverageError?: Error
}

export const DRIVER_ID = '00000000-0000-4000-8000-000000000931'
export const CITY_REGION_ID = '00000000-0000-4000-8000-000000000932'
export const COVERAGE_PATH = `/fleet/drivers/${DRIVER_ID}/regions`

/** O motorista roda a zona inteira de Barretos e, fora dela, só Barrinha. */
export const REPLACE_COVERAGE_BODY = {
  entries: [
    { regionId: REGION_ID, scope: 'region' },
    { city: 'Barrinha', regionId: CITY_REGION_ID, scope: 'city', state: 'SP' },
  ],
} as const

export const COVERAGE: readonly FleetDriverRegionCoverage[] = [
  {
    city: '',
    code: '1.000',
    name: 'Barretos',
    regionId: REGION_ID,
    scope: 'region',
    state: '',
    zone: 1,
  },
  {
    city: 'BARRINHA',
    code: '2.001',
    name: 'Ribeirão Preto',
    regionId: CITY_REGION_ID,
    scope: 'city',
    state: 'SP',
    zone: 2,
  },
]

/** Quem cuida da frota atribui cobertura; a permissão de configuração não entra nesta rota. */
export const FLEET_ONLY_PERMISSIONS: CompanyContext['permissions'] = new Set([
  'fleet.read',
  'fleet.manage',
])

export const READ_ONLY_PERMISSIONS: CompanyContext['permissions'] = new Set(['fleet.read'])

export async function createFleetDriverRegionHttpFixture(
  params: CreateFixtureParams = {},
): Promise<{
  readonly handle: (request: Request) => Promise<Response>
  readonly listCoverageCalls: ExecuteCall[]
  readonly replaceCoverageCalls: ExecuteCall[]
}> {
  const listCoverageCalls: ExecuteCall[] = []
  const replaceCoverageCalls: ExecuteCall[] = []

  const routes = await loadRoutes({
    listCoverage: {
      async execute(input) {
        listCoverageCalls.push(structuredClone(input))
        return COVERAGE
      },
    },
    replaceCoverage: {
      async execute(input) {
        replaceCoverageCalls.push(structuredClone(input))
        if (params.replaceCoverageError) throw params.replaceCoverageError
        return COVERAGE
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
    handle: (request) => handleRequest(request, { timeout() {} }),
    listCoverageCalls,
    replaceCoverageCalls,
  }
}

async function loadRoutes(input: RouteDependencies): Promise<readonly RegisteredRoute[]> {
  const module = (await import(
    '../../src/freight-regions/presentation/fleet-driver-region.routes.js'
  )) as {
    createFleetDriverRegionRoutes(dependencies: RouteDependencies): readonly RegisteredRoute[]
  }
  return module.createFleetDriverRegionRoutes(input)
}
