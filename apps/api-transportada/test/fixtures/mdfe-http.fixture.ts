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

type RegisteredRoute = ReturnType<typeof defineRoute>

type ExecuteCall = Record<string, unknown>

type RouteDependencies = {
  readonly createManifest: { execute(input: ExecuteCall): Promise<typeof MANIFEST_DETAIL> }
  readonly getManifest: { execute(input: ExecuteCall): Promise<typeof MANIFEST_DETAIL> }
  readonly listManifests: { execute(input: ExecuteCall): Promise<typeof MANIFEST_PAGE> }
  readonly previewManifest: { execute(input: ExecuteCall): Promise<typeof PREVIEW> }
}

type IssuanceRouteDependencies = {
  readonly mdfeIssuance: {
    cancel(input: ExecuteCall): Promise<ExecuteCall>
    close(input: ExecuteCall): Promise<ExecuteCall>
    issue(input: ExecuteCall): Promise<ExecuteCall>
  }
}

type CreateFixtureParams = {
  readonly cancelError?: Error
  readonly closeError?: Error
  readonly createError?: Error
  readonly getError?: Error
  readonly issueError?: Error
  readonly listError?: Error
  readonly permissions?: CompanyContext['permissions']
  readonly previewError?: Error
}

export const CORRELATION_ID = 'mdfe-http-correlation'
export const FRONTEND_ORIGIN = 'http://127.0.0.1:53000'
export const MDFE_MANIFESTS_PATH = '/mdfe-manifests'
export const MDFE_MANIFESTS_PREVIEW_PATH = '/mdfe-manifests/preview'

export const DOCUMENT_ID = '00000000-0000-4000-8000-0000000009b1'
export const OTHER_DOCUMENT_ID = '00000000-0000-4000-8000-0000000009b2'
export const DRIVER_ID = '00000000-0000-4000-8000-0000000009b3'
export const MANIFEST_ID = '00000000-0000-4000-8000-0000000009b4'
export const VEHICLE_ID = '00000000-0000-4000-8000-0000000009b5'

export const PREVIEW = {
  blocked: [{ fiscalDocumentId: OTHER_DOCUMENT_ID, reason: 'MDFE_DOCUMENT_ALREADY_MANIFESTED' }],
  destinationState: 'SP',
  destinationStateOptions: ['SP'],
  dischargeCities: [
    {
      accessKeys: ['35260712345678000195570010000000011000000010'],
      cityCode: '3550308',
      cityName: 'Sao Paulo',
      state: 'SP',
    },
  ],
  documents: [
    {
      accessKey: '35260712345678000195570010000000011000000010',
      cargoValue: '1250.00',
      cargoWeight: '850.0000',
      dischargeCityCode: '3550308',
      dischargeCityName: 'Sao Paulo',
      dischargeState: 'SP',
      fiscalDocumentId: DOCUMENT_ID,
      originCityCode: '4106902',
      originCityName: 'Curitiba',
      originState: 'PR',
    },
  ],
  fiscalEnvironment: 'homologation',
  loadingCities: [{ cityCode: '4106902', cityName: 'Curitiba', state: 'PR' }],
  originState: 'PR',
  totals: { cargoValue: '1250.00', cargoWeight: '850.0000', cteCount: 1 },
} as const

export const MANIFEST = {
  additionalInformation: '',
  cargoProduct: 'Bebidas',
  cargoProductNcm: '22021000',
  cargoType: '05',
  cargoUnit: '01',
  cargoValue: '1250.00',
  cargoWeight: '850.0000',
  contractorName: 'Industria Contratante',
  contractorTaxId: '11222333000181',
  createdAt: '2026-07-27T12:00:00.000Z',
  cteCount: 1,
  destinationState: 'SP',
  dischargePostalCode: '01310100',
  emitterType: '1',
  fiscalEnvironment: 'homologation',
  fiscalNumber: null,
  fiscalSeries: '',
  freightValue: '480.00',
  id: MANIFEST_ID,
  insuranceEndorsement: '12345678901234',
  loadingPostalCode: '80010000',
  originState: 'PR',
  rntrc: '12345678',
  status: 'draft',
  transporterType: '1',
  tripStartedAt: null,
  updatedAt: '2026-07-27T12:00:00.000Z',
  vehicleId: VEHICLE_ID,
  version: '1',
} as const

export const MANIFEST_DETAIL = {
  ...MANIFEST,
  drivers: [
    { driverId: DRIVER_ID, driverName: 'Ana Souza', driverTaxId: '12345678909', position: 1 },
  ],
  items: [
    {
      accessKey: '35260712345678000195570010000000011000000010',
      cargoValue: '1250.00',
      cargoWeight: '850.0000',
      cteFiscalDocumentId: DOCUMENT_ID,
      dischargeCityCode: '3550308',
      dischargeCityName: 'Sao Paulo',
    },
  ],
  loadingCities: [{ cityCode: '4106902', cityName: 'Curitiba', position: 1 }],
} as const

export const MANIFEST_PAGE = {
  items: [MANIFEST],
  nextCursor: '2026-07-27T12:00:00.000Z::00000000-0000-4000-8000-0000000009b4',
} as const

export const CREATE_MANIFEST_BODY = {
  cargoProduct: 'Bebidas',
  cargoProductNcm: '22021000',
  cargoType: '05',
  cargoUnit: '01',
  contractorName: 'Industria Contratante',
  contractorTaxId: '11222333000181',
  destinationState: 'SP',
  dischargePostalCode: '01310100',
  documentIds: [DOCUMENT_ID],
  driverIds: [DRIVER_ID],
  emitterType: '1',
  freightValue: '480.00',
  insuranceEndorsement: '12345678901234',
  loadingPostalCode: '80010000',
  transporterType: '1',
  vehicleId: VEHICLE_ID,
} as const

export const ATTEMPT_ID = '00000000-0000-4000-8000-0000000009b6'

export const IDEMPOTENCY_KEY = 'mdfe-issue-key-1'

export const CLOSURE_BODY = { closureCityCode: '3550308', closureState: 'SP' } as const

export const CANCELLATION_BODY = { justification: 'Viagem cancelada pelo embarcador' } as const

export const ISSUANCE_SUMMARY = {
  attemptId: ATTEMPT_ID,
  attemptKind: 'issue',
  manifestId: MANIFEST_ID,
  manifestStatus: 'issuing',
  replayed: false,
  requestedAt: '2026-07-28T12:00:00.000Z',
} as const

export const COMPANY_CONTEXT: CompanyContext = {
  ...NFE_COMPANY_CONTEXT,
  permissions: new Set(['mdfe.read', 'mdfe.manage', 'mdfe.issue', 'mdfe.close', 'mdfe.cancel']),
}

export const READ_ONLY_PERMISSIONS: CompanyContext['permissions'] = new Set(['mdfe.read'])

export async function createMdfeHttpFixture(params: CreateFixtureParams = {}): Promise<{
  readonly cancelCalls: ExecuteCall[]
  readonly closeCalls: ExecuteCall[]
  readonly createCalls: ExecuteCall[]
  readonly getCalls: ExecuteCall[]
  readonly handle: (request: Request) => Promise<Response>
  readonly issueCalls: ExecuteCall[]
  readonly listCalls: ExecuteCall[]
  readonly previewCalls: ExecuteCall[]
}> {
  const cancelCalls: ExecuteCall[] = []
  const closeCalls: ExecuteCall[] = []
  const createCalls: ExecuteCall[] = []
  const getCalls: ExecuteCall[] = []
  const issueCalls: ExecuteCall[] = []
  const listCalls: ExecuteCall[] = []
  const previewCalls: ExecuteCall[] = []

  const issuanceRoutes = await loadIssuanceRoutes({
    mdfeIssuance: {
      async cancel(input) {
        cancelCalls.push(structuredClone(input))
        if (params.cancelError) throw params.cancelError
        return { ...ISSUANCE_SUMMARY, attemptKind: 'cancel' }
      },
      async close(input) {
        closeCalls.push(structuredClone(input))
        if (params.closeError) throw params.closeError
        return { ...ISSUANCE_SUMMARY, attemptKind: 'close' }
      },
      async issue(input) {
        issueCalls.push(structuredClone(input))
        if (params.issueError) throw params.issueError
        return ISSUANCE_SUMMARY
      },
    },
  })

  const routes = await loadRoutes({
    createManifest: {
      async execute(input) {
        createCalls.push(structuredClone(input))
        if (params.createError) throw params.createError
        return MANIFEST_DETAIL
      },
    },
    getManifest: {
      async execute(input) {
        getCalls.push(structuredClone(input))
        if (params.getError) throw params.getError
        return MANIFEST_DETAIL
      },
    },
    listManifests: {
      async execute(input) {
        listCalls.push(structuredClone(input))
        if (params.listError) throw params.listError
        return MANIFEST_PAGE
      },
    },
    previewManifest: {
      async execute(input) {
        previewCalls.push(structuredClone(input))
        if (params.previewError) throw params.previewError
        return PREVIEW
      },
    },
  })

  const router = createTestRouter({
    context: authenticatedContext(params.permissions ?? COMPANY_CONTEXT.permissions),
    routes: [...routes, ...issuanceRoutes],
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => CORRELATION_ID,
    frontendOrigin: FRONTEND_ORIGIN,
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    cancelCalls,
    closeCalls,
    createCalls,
    getCalls,
    handle: (request) => handleRequest(request, { timeout() {} }),
    issueCalls,
    listCalls,
    previewCalls,
  }
}

export function jsonRequest(input: {
  readonly body?: unknown
  readonly idempotencyKey?: string
  readonly method: string
  readonly path: string
}): Request {
  const headers: Record<string, string> = {
    origin: FRONTEND_ORIGIN,
    'x-correlation-id': CORRELATION_ID,
  }
  if (input.body !== undefined) headers['content-type'] = 'application/json'
  if (input.idempotencyKey !== undefined) headers['idempotency-key'] = input.idempotencyKey

  return new Request(`${FRONTEND_ORIGIN}${input.path}`, {
    headers,
    method: input.method,
    ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
  })
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

export async function responseData<TData extends object = object>(
  response: Response,
): Promise<TData> {
  return ((await response.json()) as { readonly data: TData }).data
}

async function loadRoutes(input: RouteDependencies): Promise<readonly RegisteredRoute[]> {
  const module = (await import(
    '../../src/mdfe-manifests/presentation/mdfe-manifests.routes.js'
  )) as {
    createMdfeManifestRoutes(dependencies: RouteDependencies): readonly RegisteredRoute[]
  }
  return module.createMdfeManifestRoutes(input)
}

async function loadIssuanceRoutes(
  input: IssuanceRouteDependencies,
): Promise<readonly RegisteredRoute[]> {
  const module = (await import(
    '../../src/mdfe-manifests/presentation/mdfe-issuance.routes.js'
  )) as {
    createMdfeIssuanceRoutes(dependencies: IssuanceRouteDependencies): readonly RegisteredRoute[]
  }
  return module.createMdfeIssuanceRoutes(input)
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
      subject: 'mdfe-http-contract',
      userId: COMPANY_CONTEXT.userId,
    } satisfies AuthenticatedIdentity,
    scope: { ...COMPANY_CONTEXT, permissions },
  }
}
