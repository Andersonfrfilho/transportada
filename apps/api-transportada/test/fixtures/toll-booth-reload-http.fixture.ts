/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154, T302: a rota de recarga no roteador real, sobre as portas de
 * `toll-booth-reload-ports.fixture.ts`.
 */
import { createHash } from 'node:crypto'

import { HealthService } from '../../src/health/health.service.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { API_TOLL_BOOTH_RELOAD_PATH } from '../../src/shared/api.constant.js'
import type { TollBoothExtractRow } from '../../src/toll-booths/domain/toll-booth-extract.policy.js'
import { createTollBoothCatalogReloadRoutes } from '../../src/toll-booths/presentation/toll-booth-extract.routes.js'
import { stubCompanyFiscalEnvironment } from './company-fiscal-environment.fixture.js'
import { appliedMigrations } from './health.fixture.js'
import { createReloadPorts, type ReloadPortParams } from './toll-booth-reload-ports.fixture.js'
import { stubUserPictureExistence } from './user-picture-existence.fixture.js'

export const RELOAD_COMPANY_ID = '33333333-3333-3333-3333-333333333333'
export const RELOAD_USER_ID = '44444444-4444-4444-4444-444444444444'
export const RELOAD_CORRELATION_ID = 'toll-booth-reload-http-correlation'
const FRONTEND_ORIGIN = 'https://app.test'

export const RELOAD_BOOTH_ROW = {
  chargeCar: '4.2000',
  chargePerAxle: '4.2000',
  latitude: '-23.5101982',
  longitude: '-46.8172702',
  name: 'Barueri - 2',
  operator: 'Ecovias Raposo Castello',
  osmNodeId: '25937851',
} as const

export function encodeExtract(rows: readonly unknown[]): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(rows))
}

export function buildExtractRow(bytes: Uint8Array): TollBoothExtractRow {
  return {
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
    sha256: createHash('sha256').update(bytes).digest('hex'),
    uploadedByUserId: RELOAD_USER_ID,
  }
}

type ReloadFixtureParams = ReloadPortParams & {
  readonly permissions?: CompanyContext['permissions']
}

export function createReloadFixture(params: ReloadFixtureParams = {}) {
  const { useCase, ...recorders } = createReloadPorts(params)

  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: RELOAD_COMPANY_ID,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'toll-booth-reload-http-contract',
      userId: RELOAD_USER_ID,
    } satisfies AuthenticatedIdentity,
    scope: {
      companyId: RELOAD_COMPANY_ID,
      kind: 'company',
      membershipId: crypto.randomUUID(),
      permissions: params.permissions ?? new Set(['settings.manage']),
      roles: [],
      userId: RELOAD_USER_ID,
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
    routes: createTollBoothCatalogReloadRoutes({ reloadCatalog: useCase }),
    tenantContext: {
      async resolveCompany() {
        return context
      },
    },
    userPictureExistence: stubUserPictureExistence(),
  })
  const handle = createRequestHandler({
    createCorrelationId: () => RELOAD_CORRELATION_ID,
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    ...recorders,
    handle: (query: string) =>
      handle(
        new Request(`https://api.test${API_TOLL_BOOTH_RELOAD_PATH}${query}`, {
          headers: { authorization: 'Bearer token', origin: FRONTEND_ORIGIN },
          method: 'POST',
        }),
        { timeout() {} },
      ),
  }
}
