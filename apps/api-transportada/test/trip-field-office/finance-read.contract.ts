/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T7, D11 e aceite 14: o `finance` lê a viagem sem ler a frota. A variante "qualquer uma
 * de" (`anyPermission`) vale em cinco leituras, e só nelas; a decisão é lida pelo `authorize` real,
 * nunca por uma lista de nomes de permissão.
 */
import { describe, expect, it } from 'bun:test'

import { createFleetRoutes } from '../../src/fleet/presentation/fleet.routes.js'
import { HealthService } from '../../src/health/health.service.js'
import { createRouter, defineRoute } from '../../src/http/router.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import {
  grantsAnyPermission,
  resolveCompanyPermissions,
  type CompanyAnyPermissionPolicy,
} from '../../src/identity/domain/authorization.policy.js'
import type {
  AuthenticatedContext,
  CompanyContext,
  PlatformContext,
} from '../../src/identity/domain/tenant-context.js'
import { createTripDocumentReviewRoutes } from '../../src/trips/presentation/trip-document-review.routes.js'
import { createTripFieldOfficeRoutes } from '../../src/trips/presentation/trip-field-office.routes.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'
import { TRIP_DETAIL, TRIP_ID, TRIP_PAGE } from '../fixtures/trip-http-payload.fixture.js'

const USER_ID = '00000000-0000-4000-8000-000000000001'
const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000d01'

const ANY_POLICY: CompanyAnyPermissionPolicy = {
  anyPermission: ['fleet.read', 'trip.report-on-behalf'],
  scope: 'company',
}

function companyContext(
  permissions: CompanyContext['permissions'],
  roles: CompanyContext['roles'] = ['finance'],
): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: '00000000-0000-4000-8000-000000000004',
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'finance',
      userId: USER_ID,
    },
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000003',
      permissions,
      roles,
      userId: USER_ID,
    },
  }
}

function roleContext(role: CompanyContext['roles'][number]): AuthenticatedContext<CompanyContext> {
  return companyContext(resolveCompanyPermissions([role]), [role])
}

function unusedDependencies(): unknown {
  const handler: ProxyHandler<() => unknown> = {
    apply: () => unusedDependencies(),
    get: () => unusedDependencies(),
  }
  return new Proxy(() => unusedDependencies(), handler)
}

const OFFICE_ROUTES = createTripFieldOfficeRoutes(unusedDependencies() as never)

function routeSignatures(): readonly {
  readonly route: ReturnType<typeof defineRoute>
  readonly signature: string
}[] {
  const dependencies = unusedDependencies() as never
  return [
    ...createTripRoutes(dependencies),
    ...createFleetRoutes(dependencies),
    ...createTripDocumentReviewRoutes(dependencies),
    ...OFFICE_ROUTES,
  ].map((route) => ({ route, signature: `${route.method} ${route.pathname}` }))
}

function reachableRoutes(context: AuthenticatedContext<CompanyContext>): readonly string[] {
  const authorization = new AuthorizationService()
  return routeSignatures()
    .filter(({ route }) => {
      try {
        authorization.authorize(context, route.policy)
        return true
      } catch {
        return false
      }
    })
    .map(({ signature }) => signature)
    .toSorted()
}

const FIVE_READS = [
  'GET /trips',
  'GET /trips/:id',
  'GET /trips/:id/documents/:documentId/occurrences',
  'GET /trips/:id/documents/:documentId/proof',
  'GET /trips/:id/stops',
] as const

describe('anyPermission — "qualquer uma de" (spec 156 D11)', () => {
  const authorization = new AuthorizationService()

  it('grantsAnyPermission: basta uma das exigidas', () => {
    const required = ['fleet.read', 'trip.report-on-behalf'] as const
    expect(grantsAnyPermission({ granted: new Set(['fleet.read']), required })).toBe(true)
    expect(grantsAnyPermission({ granted: new Set(['trip.report-on-behalf']), required })).toBe(
      true,
    )
    expect(grantsAnyPermission({ granted: new Set(['trip.manage']), required })).toBe(false)
  })

  it('o authorize passa com a primeira ou com a segunda', () => {
    expect(() =>
      authorization.authorize(companyContext(new Set(['fleet.read'])), ANY_POLICY),
    ).not.toThrow()
    expect(() =>
      authorization.authorize(companyContext(new Set(['trip.report-on-behalf'])), ANY_POLICY),
    ).not.toThrow()
  })

  it('o authorize recusa sem nenhuma, e recusa o serviço de automação', () => {
    expect(() =>
      authorization.authorize(companyContext(new Set(['trip.manage'])), ANY_POLICY),
    ).toThrow()
    expect(() => authorization.authorize(roleContext('automation'), ANY_POLICY)).toThrow()
  })

  it('o authorize recusa o escopo de plataforma', () => {
    const platform = {
      identity: companyContext(new Set()).identity,
      scope: { kind: 'platform', userId: USER_ID },
    } as unknown as AuthenticatedContext<PlatformContext>
    expect(() => authorization.authorize(platform, ANY_POLICY)).toThrow()
  })

  it('uma permissão só não é anyPermission', () => {
    // @ts-expect-error — com uma permissão, a política é `CompanyAuthorizationPolicy`
    const single: CompanyAnyPermissionPolicy = { anyPermission: ['fleet.read'], scope: 'company' }
    expect(single.anyPermission).toHaveLength(1)
  })
})

function buildRouter(routes: readonly ReturnType<typeof defineRoute>[]) {
  return createRouter({
    authentication: {
      authenticate: async () => {
        throw new Error('não chamado')
      },
    },
    authorization: new AuthorizationService(),
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    userPictureExistence: stubUserPictureExistence(),
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
      resolveCompany: async () => {
        throw new Error('não chamado')
      },
    },
  })
}

function anyPermissionRoute(method: string) {
  return defineRoute({
    handle: async () => new Response(null, { status: 204 }),
    method,
    parse: () => ({}),
    pathname: '/qualquer-coisa',
    policy: ANY_POLICY,
  })
}

describe('anyPermission só em leitura (guarda de boot)', () => {
  it('o roteador não sobe com anyPermission fora de GET', () => {
    expect(() => buildRouter([anyPermissionRoute('POST')])).toThrow('POST /qualquer-coisa')
  })

  it('com GET o roteador sobe', () => {
    expect(() => buildRouter([anyPermissionRoute('GET')])).not.toThrow()
  })
})

describe('o finance lê a viagem sem ler a frota (aceite 14)', () => {
  it('alcança as cinco leituras e as rotas de baixa, e nada da frota', () => {
    expect(reachableRoutes(roleContext('finance'))).toEqual([
      'GET /trips',
      'GET /trips/:id',
      'GET /trips/:id/costs',
      'GET /trips/:id/documents/:documentId/occurrences',
      'GET /trips/:id/documents/:documentId/proof',
      'GET /trips/:id/financial-result',
      'GET /trips/:id/stops',
      'GET /trips/:id/valuation',
      'POST /trips/:id/confirm-load',
      'POST /trips/:id/documents/:documentId/field-delivery',
      'POST /trips/:id/documents/:documentId/field-proof',
      'POST /trips/:id/documents/:documentId/field-return',
      'POST /trips/:id/financial-result/recalculate',
      'POST /trips/:id/start-route',
      'POST /trips/:id/stops/:stopId/arrive',
      'POST /trips/:id/stops/:stopId/occurrences',
      'POST /trips/valuation-preview',
    ])
  })

  it('continua 403 na frota, no feed e na geometria', () => {
    const reachable = new Set(reachableRoutes(roleContext('finance')))
    for (const signature of [
      'GET /fleet/drivers',
      'GET /trip-occurrences',
      'GET /trip-occurrences/:id/attachments',
      'GET /trips/:id/route-geometry',
      'POST /route-geometry',
      'GET /trips/:id/documents/:documentId/products',
      'GET /trips/:id/schedules',
      'GET /trips/:id/fiscal-readiness',
      'GET /trips/:id/documents/:documentId/delivery-address-history',
    ]) {
      expect(reachable.has(signature)).toBe(false)
    }
  })

  it('o operator e o separator seguem alcançando as cinco (fleet.read)', () => {
    for (const role of ['operator', 'separator', 'viewer'] as const) {
      const reachable = new Set(reachableRoutes(roleContext(role)))
      for (const signature of FIVE_READS) expect(reachable.has(signature)).toBe(true)
    }
  })

  it('o motorista não alcança nenhuma das cinco', () => {
    const reachable = new Set(reachableRoutes(roleContext('driver')))
    for (const signature of FIVE_READS) expect(reachable.has(signature)).toBe(false)
  })

  it('as cinco respondem 200 ao finance', async () => {
    const results: Readonly<Record<string, unknown>> = {
      getTrip: TRIP_DETAIL,
      listStops: { stops: [] },
      listTripOccurrences: [],
      listTrips: TRIP_PAGE,
      readDeliveryProofs: [],
    }
    const dependencies = new Proxy(
      {},
      { get: (_target, name) => ({ execute: async () => results[String(name)] }) },
    )
    const routes = createTripRoutes(dependencies as never)
    const context = roleContext('finance')
    const authorization = new AuthorizationService()
    const pathParameters = { documentId: DOCUMENT_ID, id: TRIP_ID }

    for (const signature of FIVE_READS) {
      const route = routes.find(
        (candidate) => `${candidate.method} ${candidate.pathname}` === signature,
      )
      expect(route).toBeDefined()
      expect(() => authorization.authorize(context, route?.policy)).not.toThrow()
      const response = await route?.execute({
        context,
        correlationId: 'finance-read',
        pathParameters,
        request: new Request(`http://localhost${signature.slice(4)}`),
      })
      expect(response?.status).toBe(200)
    }
  })
})
