/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T201 (RF1): `GET /trip-occurrences/:id`. A permissão é a da listagem (`fleet.read`):
 * `trip.read` é do motorista e do agregado, e servir o detalhe por ela alargaria o acesso a toda
 * ocorrência da empresa. `:id` é o mesmo id que a listagem e as rotas `/:id/attachments` e
 * `/:id/case/*` já usam.
 */
import { describe, expect, test } from 'bun:test'

import { createRequestHandler } from '../../src/http/request-handler.service.js'
import { createRouter } from '../../src/http/router.service.js'
import { HealthService } from '../../src/health/health.service.js'
import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import type { TripOccurrenceDetail } from '../../src/trips/application/read-trip-occurrence-detail.use-case.js'
import { TripOccurrenceNotFoundError } from '../../src/trips/domain/trip.error.js'
import { createTripOccurrenceDetailRoutes } from '../../src/trips/presentation/trip-occurrence-detail.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import {
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
} from '../fixtures/trip-http-payload.fixture.js'
import { OCCURRENCE_DETAIL } from '../fixtures/trip-occurrence-detail.fixture.js'

const OCCURRENCE_ID = OCCURRENCE_DETAIL.id

function createFixture(params: {
  readonly error?: Error
  readonly permissions?: CompanyContext['permissions']
}) {
  const calls: unknown[] = []
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'occurrence-detail-contract',
      userId: COMPANY_CONTEXT.userId,
    },
    scope: {
      ...COMPANY_CONTEXT,
      permissions: params.permissions ?? new Set(['fleet.read'] as const),
    },
  }
  const authorization = new AuthorizationService()
  const router = createRouter({
    authentication: { authenticate: async () => context.identity },
    authorization: { authorize: (value, policy) => authorization.authorize(value, policy) },
    companyFiscalEnvironment: stubCompanyFiscalEnvironment(),
    userPictureExistence: stubUserPictureExistence(),
    healthService: new HealthService({
      database: { async close() {}, healthCheck: async () => ({ healthy: true }) },
      identityReadiness: { checkReadiness: async () => true },
      migrationStatus: appliedMigrations(),
    }),
    routes: createTripOccurrenceDetailRoutes({
      readTripOccurrenceDetail: {
        async execute(input): Promise<TripOccurrenceDetail> {
          calls.push(input)
          if (params.error !== undefined) throw params.error
          return OCCURRENCE_DETAIL
        },
      },
    }),
    rateLimitWindows: { consume: async () => ({ allowed: true }) },
    tenantContext: { resolveCompany: async () => context },
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'occurrence-detail-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return {
    calls,
    context,
    handle: (request: Request) => handleRequest(request, { timeout() {} }),
  }
}

const detailPath = (id: string): string => `/trip-occurrences/${id}`

describe('GET /trip-occurrences/:id (spec 183 T201)', () => {
  test('com fleet.read devolve o detalhe e escopa pela empresa do contexto', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: detailPath(OCCURRENCE_ID) }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: OCCURRENCE_DETAIL })
    expect(fixture.calls).toEqual([{ context: fixture.context.scope, occurrenceId: OCCURRENCE_ID }])
  })

  test('só com trip.read (motorista, agregado) é 403 antes de tocar o caso de uso', async () => {
    const fixture = createFixture({ permissions: new Set(['trip.read'] as const) })
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: detailPath(OCCURRENCE_ID) }),
    )

    expect(response.status).toBe(403)
    expect(fixture.calls).toEqual([])
  })

  test('inexistente ou de outra empresa é 404 TRIP_OCCURRENCE_NOT_FOUND', async () => {
    const fixture = createFixture({ error: new TripOccurrenceNotFoundError() })
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: detailPath(OCCURRENCE_ID) }),
    )

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('TRIP_OCCURRENCE_NOT_FOUND')
  })

  test('id que não é UUID é recusado sem chegar ao caso de uso', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(jsonRequest({ method: 'GET', path: detailPath('abc') }))

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
    expect(fixture.calls).toEqual([])
  })

  test('a resposta não é cacheável: carrega telefone e e-mail do motorista', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: detailPath(OCCURRENCE_ID) }),
    )

    expect(response.headers.get('cache-control')).toContain('no-store')
  })
})
