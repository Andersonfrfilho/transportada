/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154, T202: `GET /v1/toll-booths` — envelope `{ data, pagination, summary }`, `companyId`
 * nunca lido do pedido, e `403` sem `fleet.read` (a tela esconder o botão não é autorização).
 */
import { describe, expect, test } from 'bun:test'

import { HealthService } from '../../src/health/health.service.js'
import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type { AuthenticatedIdentity } from '../../src/identity/domain/authenticated-identity.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { API_TOLL_BOOTHS_PATH } from '../../src/shared/api.constant.js'
import { createTollBoothRoutes } from '../../src/toll-booths/presentation/toll-booth.routes.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'

const COMPANY_ID = '33333333-3333-3333-3333-333333333333'
const USER_ID = '44444444-4444-4444-4444-444444444444'
const FRONTEND_ORIGIN = 'https://app.test'

const SUMMARY = {
  boothCount: 2,
  boothsWithoutAxleChargeCount: 1,
  observedOn: '2026-09-14',
  status: 'current',
} as const

const RESULT = {
  page: 1,
  perPage: 20,
  rows: [
    {
      actorUserId: null,
      catalog: {
        chargeCar: null,
        chargePerAxle: '10.0000',
        chargePerAxleAutomatic: null,
        observedOn: '2026-09-14',
      },
      catalogKnown: true,
      chargeCarSource: 'catalog',
      chargePerAxleAutomaticSource: 'catalog',
      chargePerAxleSource: 'catalog',
      effectiveChargeCar: null,
      effectiveChargePerAxle: '10.0000',
      effectiveChargePerAxleAutomatic: null,
      name: 'Praça 1',
      observedOn: '2026-09-14',
      operator: 'CCR',
      osmNodeId: 1,
      seen: false,
      source: 'catalog',
      updatedAt: null,
    },
  ],
  summary: SUMMARY,
  total: 1,
} as const

type ExecuteCall = Record<string, unknown>

async function createFixture(
  params: { readonly permissions?: CompanyContext['permissions'] } = {},
) {
  const listCatalogCalls: ExecuteCall[] = []
  const routes = createTollBoothRoutes({
    listCatalog: {
      async execute(input) {
        listCatalogCalls.push(structuredClone(input))
        return RESULT
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
      subject: 'toll-booth-http-contract',
      userId: USER_ID,
    } satisfies AuthenticatedIdentity,
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: crypto.randomUUID(),
      permissions: params.permissions ?? new Set(['fleet.read']),
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
    createCorrelationId: () => 'toll-booth-http-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })

  return {
    handle: (request: Request) => handle(request, { timeout() {} }),
    listCatalogCalls,
  }
}

function request(path: string): Request {
  return new Request(`https://api.test${path}`, {
    headers: { authorization: 'Bearer token', origin: FRONTEND_ORIGIN },
    method: 'GET',
  })
}

describe('GET /toll-booths http contract (spec 154, T202)', () => {
  test('answers 200 with the data, pagination and summary envelope', async () => {
    const fixture = await createFixture()

    const response = await fixture.handle(request(API_TOLL_BOOTHS_PATH))
    const body = (await response.json()) as Record<string, unknown>

    expect(response.status).toBe(200)
    expect(body.pagination).toEqual({ page: 1, perPage: 20, total: 1 })
    expect(body.summary).toEqual(SUMMARY)
    expect((body.data as unknown[]).length).toBe(1)
  })

  test('never reads companyId from the request — only from the authenticated context', async () => {
    const fixture = await createFixture()

    await fixture.handle(request(`${API_TOLL_BOOTHS_PATH}?search=anhanguera&page=2&perPage=10`))

    expect(fixture.listCatalogCalls).toEqual([
      { companyId: COMPANY_ID, page: 2, perPage: 10, search: 'anhanguera' },
    ])
  })

  test('answers 403 without fleet.read — hiding the button on the screen is not authorization', async () => {
    const fixture = await createFixture({ permissions: new Set() })

    const response = await fixture.handle(request(API_TOLL_BOOTHS_PATH))

    expect(response.status).toBe(403)
  })
})
