/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 148 T7: as rotas da fila de revisão — permissão, empresa do contexto e o mapa dos erros. O
 * comportamento contra Postgres real (tenant, despacho, idempotência, troca, CT-e) está em
 * `test/integration/trip-document-review.integration.ts`.
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
import type { TripDocumentReviewPort } from '../../src/trips/application/trip-document-review.port.js'
import {
  TripCargoLayoutOutdatedError,
  TripDocumentReviewDoesNotFitError,
  TripDocumentReviewNotFoundError,
} from '../../src/trips/domain/trip-document-review.error.js'
import {
  TripNotFoundError,
  TripStateTransitionNotAllowedError,
} from '../../src/trips/domain/trip.error.js'
import { TRIP_TRANSITION_BLOCK } from '../../src/trips/domain/trip-state.policy.js'
import { createTripDocumentReviewRoutes } from '../../src/trips/presentation/trip-document-review.routes.js'
import { stubCompanyFiscalEnvironment } from '../fixtures/company-fiscal-environment.fixture.js'
import { stubUserPictureExistence } from '../fixtures/user-picture-existence.fixture.js'
import { appliedMigrations } from '../fixtures/health.fixture.js'
import { COMPANY_CONTEXT } from '../fixtures/trip-http.fixture.js'
import {
  FRONTEND_ORIGIN,
  jsonRequest,
  responseApiError,
} from '../fixtures/trip-http-payload.fixture.js'

const TRIP_ID = '00000000-0000-4000-8000-00000000c001'
const LAYOUT_ID = '00000000-0000-4000-8000-00000000c002'
const REVIEW_ID = '00000000-0000-4000-8000-00000000c003'
const TARGET_TRIP_ID = '00000000-0000-4000-8000-00000000c004'
const OUT_TRIP_DOCUMENT_ID = '00000000-0000-4000-8000-00000000c005'

const REVIEW = {
  createdAt: '2026-09-14T10:00:00.000Z',
  id: REVIEW_ID,
  nfeDocumentId: '00000000-0000-4000-8000-00000000c006',
  nfeNumber: '123',
  reason: 'bedFull',
  resolutionTripId: null,
  resolvedAt: null,
  sourceTripId: TRIP_ID,
  status: 'pending',
  swappedReviewId: null,
} as const

type Calls = Record<keyof TripDocumentReviewPort, unknown[]>

function createFixture(params: {
  readonly error?: Error
  readonly permissions?: CompanyContext['permissions']
}) {
  const calls: Calls = {
    list: [],
    listSwapSuggestions: [],
    move: [],
    previewChange: [],
    releaseUnplaced: [],
    swap: [],
  }
  function record<TResult>(name: keyof TripDocumentReviewPort, result: TResult) {
    return async (input: unknown): Promise<TResult> => {
      calls[name].push(input)
      if (params.error !== undefined) throw params.error
      return result
    }
  }
  const reviews: TripDocumentReviewPort = {
    list: record('list', [REVIEW]),
    listSwapSuggestions: record('listSwapSuggestions', {
      incoming: { volumeM3: 1, weightKilograms: 10 },
      reviewId: REVIEW_ID,
      suggestions: [],
    }),
    move: record('move', { ...REVIEW, status: 'moved' as const }),
    previewChange: record('previewChange', { layoutId: LAYOUT_ID }),
    releaseUnplaced: record('releaseUnplaced', { kept: [], reviews: [REVIEW] }),
    swap: record('swap', {
      review: { ...REVIEW, status: 'swapped_in' as const },
      swappedOut: { ...REVIEW, id: OUT_TRIP_DOCUMENT_ID, reason: 'swapped_out' as const },
    }),
  }
  const context: AuthenticatedContext<CompanyContext> = {
    identity: {
      companyIdClaim: COMPANY_CONTEXT.companyId,
      externalIdentityId: crypto.randomUUID(),
      issuer: 'http://localhost:58080/realms/transportada-local',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'trip-review-contract',
      userId: COMPANY_CONTEXT.userId,
    },
    scope: { ...COMPANY_CONTEXT, permissions: params.permissions ?? COMPANY_CONTEXT.permissions },
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
    routes: createTripDocumentReviewRoutes({ reviews }),
    tenantContext: { resolveCompany: async () => context },
  })
  const handleRequest = createRequestHandler({
    createCorrelationId: () => 'trip-review-correlation',
    frontendOrigins: [FRONTEND_ORIGIN],
    logger: { error() {}, info() {}, warn() {} },
    requestTimeoutSeconds: 10,
    router,
  })
  return { calls, handle: (request: Request) => handleRequest(request, { timeout() {} }) }
}

const RELEASE_PATH = `/trips/${TRIP_ID}/cargo-layouts/${LAYOUT_ID}/release-unplaced`
const REVIEWS_PATH = '/trip-document-reviews'
const REVIEW_PATH = `${REVIEWS_PATH}/${REVIEW_ID}`

const WRITE_REQUESTS = [
  { body: {}, path: RELEASE_PATH },
  { body: { targetTripId: TARGET_TRIP_ID }, path: `${REVIEW_PATH}/move-preview` },
  {
    body: { targetTripId: TARGET_TRIP_ID, validatedLayoutId: LAYOUT_ID },
    path: `${REVIEW_PATH}/move`,
  },
  {
    body: { outTripDocumentId: OUT_TRIP_DOCUMENT_ID, validatedLayoutId: LAYOUT_ID },
    path: `${REVIEW_PATH}/swap`,
  },
] as const

describe('rotas da fila de revisão (spec 148 T7)', () => {
  test('sem trip.manage, nenhuma escrita: 403 antes de tocar a fila', async () => {
    const fixture = createFixture({ permissions: new Set(['fleet.read']) })
    for (const request of WRITE_REQUESTS) {
      const response = await fixture.handle(
        jsonRequest({ body: request.body, method: 'POST', path: request.path }),
      )
      expect(response.status).toBe(403)
    }
    expect(fixture.calls.releaseUnplaced).toEqual([])
    expect(fixture.calls.move).toEqual([])
    expect(fixture.calls.swap).toEqual([])
    expect(fixture.calls.previewChange).toEqual([])
  })

  test('ler a fila e as sugestões é fleet.read; sem ela, 403', async () => {
    const reader = createFixture({ permissions: new Set(['fleet.read']) })
    expect((await reader.handle(jsonRequest({ method: 'GET', path: REVIEWS_PATH }))).status).toBe(
      200,
    )
    expect(
      (await reader.handle(jsonRequest({ method: 'GET', path: `${REVIEW_PATH}/swap-suggestions` })))
        .status,
    ).toBe(200)

    const nobody = createFixture({ permissions: new Set([]) })
    expect((await nobody.handle(jsonRequest({ method: 'GET', path: REVIEWS_PATH }))).status).toBe(
      403,
    )
  })

  test('a empresa e o autor vêm do contexto, nunca do corpo', async () => {
    const fixture = createFixture({})
    const smuggled = await fixture.handle(
      jsonRequest({ body: { companyId: crypto.randomUUID() }, method: 'POST', path: RELEASE_PATH }),
    )
    expect(smuggled.status).toBe(400)

    const response = await fixture.handle(jsonRequest({ method: 'POST', path: RELEASE_PATH }))
    expect(response.status).toBe(200)
    expect(fixture.calls.releaseUnplaced[0]).toMatchObject({
      companyId: COMPANY_CONTEXT.companyId,
      layoutId: LAYOUT_ID,
      tripId: TRIP_ID,
      userId: COMPANY_CONTEXT.userId,
    })
    expect(await response.json()).toEqual({ data: { kept: [], reviews: [REVIEW] } })
  })

  test('a lista filtra por status e viagem, com pendente por padrão', async () => {
    const fixture = createFixture({})
    await fixture.handle(jsonRequest({ method: 'GET', path: `${REVIEWS_PATH}?tripId=${TRIP_ID}` }))
    expect(fixture.calls.list[0]).toEqual({
      companyId: COMPANY_CONTEXT.companyId,
      status: 'pending',
      tripId: TRIP_ID,
    })
    const invalid = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${REVIEWS_PATH}?status=lost` }),
    )
    expect(invalid.status).toBe(400)
  })

  test('a prévia é de mover (targetTripId) ou de trocar (outTripDocumentId), nunca dos dois', async () => {
    const fixture = createFixture({})
    const both = await fixture.handle(
      jsonRequest({
        body: { outTripDocumentId: OUT_TRIP_DOCUMENT_ID, targetTripId: TARGET_TRIP_ID },
        method: 'POST',
        path: `${REVIEW_PATH}/move-preview`,
      }),
    )
    expect(both.status).toBe(400)

    const swapPreview = await fixture.handle(
      jsonRequest({
        body: { outTripDocumentId: OUT_TRIP_DOCUMENT_ID },
        method: 'POST',
        path: `${REVIEW_PATH}/move-preview`,
      }),
    )
    expect(swapPreview.status).toBe(200)
    expect(await swapPreview.json()).toEqual({ data: { layoutId: LAYOUT_ID } })
    expect(fixture.calls.previewChange[0]).toMatchObject({
      outTripDocumentId: OUT_TRIP_DOCUMENT_ID,
    })
  })

  test('mover e trocar exigem a planta validada', async () => {
    const fixture = createFixture({})
    const response = await fixture.handle(
      jsonRequest({
        body: { targetTripId: TARGET_TRIP_ID },
        method: 'POST',
        path: `${REVIEW_PATH}/move`,
      }),
    )
    expect(response.status).toBe(400)
    expect(fixture.calls.move).toEqual([])
  })

  test.each([
    { code: 'TRIP_NOT_FOUND', error: new TripNotFoundError(), status: 404 },
    {
      code: 'TRIP_DOCUMENT_REVIEW_NOT_FOUND',
      error: new TripDocumentReviewNotFoundError(),
      status: 404,
    },
    {
      code: 'STATE_TRANSITION_NOT_ALLOWED',
      error: new TripStateTransitionNotAllowedError(TRIP_TRANSITION_BLOCK.tripAlreadyDispatched),
      status: 409,
    },
    { code: 'TRIP_CARGO_LAYOUT_OUTDATED', error: new TripCargoLayoutOutdatedError(), status: 409 },
    {
      code: 'TRIP_DOCUMENT_REVIEW_DOES_NOT_FIT',
      error: new TripDocumentReviewDoesNotFitError(),
      status: 409,
    },
  ])('$code sai como $status', async ({ code, error, status }) => {
    const fixture = createFixture({ error })
    const response = await fixture.handle(
      jsonRequest({
        body: { targetTripId: TARGET_TRIP_ID, validatedLayoutId: LAYOUT_ID },
        method: 'POST',
        path: `${REVIEW_PATH}/move`,
      }),
    )
    expect(response.status).toBe(status)
    expect((await responseApiError(response)).code).toBe(code)
  })
})
