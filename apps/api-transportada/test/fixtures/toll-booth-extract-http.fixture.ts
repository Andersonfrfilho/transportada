/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154: as rotas de extrato (`POST`/`GET /v1/toll-booths/extracts`) no roteador real, com
 * `AuthorizationService` de verdade. Extraída do contrato da T301 quando a revisão final (D-8)
 * trouxe um segundo contrato sobre as mesmas rotas — o teto de requisições.
 */
import { HealthService } from '../../src/health/health.service.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { API_TOLL_BOOTH_EXTRACTS_PATH } from '../../src/shared/api.constant.js'
import type { TollBoothExtractRow } from '../../src/toll-booths/domain/toll-booth-extract.policy.js'
import { createTollBoothExtractRoutes } from '../../src/toll-booths/presentation/toll-booth-extract.routes.js'
import { appliedMigrations } from './health.fixture.js'
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture.js'
import { stubUserPictureExistence } from './user-picture-existence.fixture.js'

export const COMPANY_ID = '33333333-3333-3333-3333-333333333333'
export const USER_ID = '44444444-4444-4444-4444-444444444444'
const FRONTEND_ORIGIN = 'https://app.test'

export const BOOTH_ROW = {
  chargeCar: '4.2000',
  chargePerAxle: '4.2000',
  latitude: '-23.5101982',
  longitude: '-46.8172702',
  name: 'Barueri - 2',
  operator: 'Ecovias Raposo Castello',
  osmNodeId: '25937851',
}

export const EXTRACT_ROW: TollBoothExtractRow = {
  boothCount: 1,
  boothsWithAxleCharge: 1,
  boothsWithCharge: 1,
  dataset: 'sudeste',
  missingObjectObservedAt: null,
  objectKey: 'toll-booths/osm/sudeste/2026-09-14/toll-booths.json',
  observedOn: '2026-09-14',
  reloadedAt: null,
  reloadedBoothCount: null,
  reloadedByUserId: null,
  sha256: 'a'.repeat(64),
  uploadedByUserId: USER_ID,
}

type ExecuteCall = Record<string, unknown>

export async function createExtractUploadFixture(
  params: {
    readonly createExtractImpl?: (input: ExecuteCall) => Promise<TollBoothExtractRow>
    readonly listExtractsResult?: readonly TollBoothExtractRow[]
    readonly permissions?: CompanyContext['permissions']
  } = {},
) {
  const createExtractCalls: ExecuteCall[] = []
  const routes = createTollBoothExtractRoutes({
    createExtract: {
      async execute(input) {
        createExtractCalls.push(structuredClone({ ...input, rawBody: undefined }))
        if (params.createExtractImpl) return params.createExtractImpl(input)
        return EXTRACT_ROW
      },
    },
    listExtracts: {
      async execute() {
        return params.listExtractsResult ?? [EXTRACT_ROW]
      },
    },
  })

  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'toll-booth-extract-http-contract',
      userId: USER_ID,
    } satisfies AuthenticatedIdentity,
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: crypto.randomUUID(),
      permissions: params.permissions ?? new Set(['settings.manage']),
      roles: [],
      userId: USER_ID,
    },
  }

  const authorization = new AuthorizationService()
  const router = createRouter({
    authentication: {
      async authenticate() {
        return context.identity
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
    routes,
    tenantContext: {
      async resolveCompany() {
        return context
      },
    },
    userPictureExistence: stubUserPictureExistence(),
  })
  const handle = createRequestHandler({
    createCorrelationId: () => 'toll-booth-extract-http-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    createExtractCalls,
    getRequest,
    handle: (request: Request) => handle(request, { timeout() {} }),
    postRequest,
  }
}

export function postRequest(query: string, body: unknown): Request {
  return new Request(`https://api.test${API_TOLL_BOOTH_EXTRACTS_PATH}${query}`, {
    body: JSON.stringify(body),
    headers: {
      authorization: 'Bearer token',
      'content-type': 'application/json',
      origin: FRONTEND_ORIGIN,
    },
    method: 'POST',
  })
}

export function getRequest(): Request {
  return new Request(`https://api.test${API_TOLL_BOOTH_EXTRACTS_PATH}`, {
    headers: { authorization: 'Bearer token', origin: FRONTEND_ORIGIN },
    method: 'GET',
  })
}
