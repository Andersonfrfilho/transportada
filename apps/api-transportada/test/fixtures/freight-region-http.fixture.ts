/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture'
import { appliedMigrations } from './health.fixture'
import { COMPANY_CONTEXT as NFE_COMPANY_CONTEXT } from './nfe-import-application.fixture'
import type {
  FreightRegion,
  FreightRegionImportSummary,
  FreightRegionPage,
} from '../../src/freight-regions/application/freight-region.port'
import { HealthService } from '../../src/health/health.service'
import { createRequestHandler } from '../../src/http/request-handler.service'
import { createRouter, type defineRoute } from '../../src/http/router.service'
import { AuthorizationService } from '../../src/identity/application/authorization.service'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity'
import type { AuthenticatedContext, CompanyContext } from '../../src/identity/domain/tenant-context'

type RegisteredRoute = ReturnType<typeof defineRoute>

type ExecuteCall = Record<string, unknown>

type RouteDependencies = {
  readonly createRegion: { execute(input: ExecuteCall): Promise<FreightRegion> }
  readonly deleteRegion: { execute(input: ExecuteCall): Promise<void> }
  readonly importRegions: { execute(input: ExecuteCall): Promise<FreightRegionImportSummary> }
  readonly listRegions: { execute(input: ExecuteCall): Promise<FreightRegionPage> }
  readonly updateRegion: { execute(input: ExecuteCall): Promise<FreightRegion> }
}

type CreateFixtureParams = {
  readonly createRegionError?: Error
  readonly deleteRegionError?: Error
  readonly importRegionsError?: Error
  readonly permissions?: CompanyContext['permissions']
}

export const FREIGHT_REGIONS_PATH = '/freight-regions'
export const FRONTEND_ORIGIN = 'http://127.0.0.1:53000'
export const CORRELATION_ID = 'freight-regions-http-correlation'
export const REGION_ID = '00000000-0000-4000-8000-000000000921'

/** Barretos zona 1 da tabela do cliente: duas cidades, dois valores de pagamento ao motorista. */
export const CREATE_REGION_BODY = {
  cities: [
    { city: 'Barretos', state: 'SP' },
    { city: 'Barrinha', state: 'SP' },
  ],
  code: '1.000',
  name: 'Barretos',
  rates: [
    { driverAmount: '812.4500', freightClass: 'toco' },
    { driverAmount: '1086.1200', freightClass: 'truck' },
  ],
} as const

export const UPDATE_REGION_BODY = {
  ...CREATE_REGION_BODY,
  expectedVersion: '1',
  status: 'active',
} as const

export const REGION: FreightRegion = {
  cities: [
    { city: 'BARRETOS', state: 'SP' },
    { city: 'BARRINHA', state: 'SP' },
  ],
  code: '1.000',
  createdAt: '2026-08-19T12:00:00.000Z',
  id: REGION_ID,
  name: 'Barretos',
  rates: [
    { driverAmount: '812.4500', freightClass: 'toco' },
    { driverAmount: '1086.1200', freightClass: 'truck' },
  ],
  status: 'active',
  updatedAt: '2026-08-19T12:00:00.000Z',
  version: '1',
  zone: 1,
}

export const REGION_PAGE: FreightRegionPage = { items: [REGION], nextCursor: null }

export const IMPORT_SUMMARY: FreightRegionImportSummary = { created: 2, deactivated: 1, updated: 3 }

/** As duas metades do arquivo do cliente: uma linha por cidade, uma linha de valores por rota. */
export const IMPORT_REGIONS_CSV = [
  'code,name,zone,city,state',
  '1.000,BARRETOS,1,BARRETOS,SP',
  '1.000,BARRETOS,1,BARRINHA,SP',
].join('\n')

export const IMPORT_RATES_CSV = [
  'code,utility,van,vuc,three_quarter,toco,truck',
  '1.000,0.00,540.00,621.00,695.52,848.53,1086.12',
].join('\n')

export const IMPORT_BODY = { rates: IMPORT_RATES_CSV, regions: IMPORT_REGIONS_CSV } as const

export const COMPANY_CONTEXT: CompanyContext = {
  ...NFE_COMPANY_CONTEXT,
  permissions: new Set(['fleet.read', 'fleet.manage', 'settings.manage']),
}

/** Quem cuida da frota lê a tabela de rotas, mas não a reescreve. */
export const FLEET_ONLY_PERMISSIONS: CompanyContext['permissions'] = new Set([
  'fleet.read',
  'fleet.manage',
])

export async function createFreightRegionHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly createRegionCalls: ExecuteCall[]
  readonly deleteRegionCalls: ExecuteCall[]
  readonly handle: (request: Request) => Promise<Response>
  readonly importRegionCalls: ExecuteCall[]
  readonly listRegionCalls: ExecuteCall[]
  readonly updateRegionCalls: ExecuteCall[]
}> {
  const createRegionCalls: ExecuteCall[] = []
  const deleteRegionCalls: ExecuteCall[] = []
  const importRegionCalls: ExecuteCall[] = []
  const listRegionCalls: ExecuteCall[] = []
  const updateRegionCalls: ExecuteCall[] = []

  const routes = await loadRoutes({
    createRegion: {
      async execute(input) {
        createRegionCalls.push(structuredClone(input))
        if (params.createRegionError) throw params.createRegionError
        return REGION
      },
    },
    deleteRegion: {
      async execute(input) {
        deleteRegionCalls.push(structuredClone(input))
        if (params.deleteRegionError) throw params.deleteRegionError
      },
    },
    importRegions: {
      async execute(input) {
        importRegionCalls.push(structuredClone(input))
        if (params.importRegionsError) throw params.importRegionsError
        return IMPORT_SUMMARY
      },
    },
    listRegions: {
      async execute(input) {
        listRegionCalls.push(structuredClone(input))
        return REGION_PAGE
      },
    },
    updateRegion: {
      async execute(input) {
        updateRegionCalls.push(structuredClone(input))
        return { ...REGION, version: '2' }
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
    createRegionCalls,
    deleteRegionCalls,
    handle: (request) => handleRequest(request, { timeout() {} }),
    importRegionCalls,
    listRegionCalls,
    updateRegionCalls,
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

export async function responseData<TData extends object = object>(
  response: Response,
): Promise<TData> {
  return ((await response.json()) as { readonly data: TData }).data
}

export async function responseApiError(response: Response): Promise<{
  readonly code: string
  readonly message: string
}> {
  const payload = (await response.json()) as {
    readonly error: { readonly code: string; readonly message: string }
  }
  return payload.error
}

async function loadRoutes(input: RouteDependencies): Promise<readonly RegisteredRoute[]> {
  const module = (await import(
    '../../src/freight-regions/presentation/freight-region.routes.js'
  )) as {
    createFreightRegionRoutes(dependencies: RouteDependencies): readonly RegisteredRoute[]
  }
  return module.createFreightRegionRoutes(input)
}

export function createTestRouter(input: {
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

export function authenticatedContext(
  permissions: CompanyContext['permissions'],
): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      subject: 'freight-regions-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: { ...COMPANY_CONTEXT, permissions },
  }
}
