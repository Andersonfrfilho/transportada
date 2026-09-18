/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 158 T6: contrato de `GET /trips/:id/timeline` chamando `route.execute` direto, no molde de
 * `test/trip-field-office/finance-read.contract.ts` — sem o router/request-handler inteiro, porque
 * o que este contrato prova é a fronteira da rota (parse + policy), não o pipeline HTTP completo.
 */
import { describe, expect, test } from 'bun:test'

import { AuthorizationService } from '../../src/identity/application/authorization.service.js'
import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'
import { encodeTripTimelineCursor } from '../../src/trips/infrastructure/trip-timeline.query.js'
import { TRIP_ID, TRIPS_PATH } from '../fixtures/trip-http-payload.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const USER_ID = '00000000-0000-4000-8000-000000000001'
const PATH = `${TRIPS_PATH}/${TRIP_ID}/timeline`

function companyContext(
  permissions: CompanyContext['permissions'],
): AuthenticatedContext<CompanyContext> {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: '00000000-0000-4000-8000-000000000004',
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'trip-timeline-contract',
      userId: USER_ID,
    },
    scope: {
      companyId: COMPANY_ID,
      kind: 'company',
      membershipId: '00000000-0000-4000-8000-000000000003',
      permissions,
      roles: ['operator'],
      userId: USER_ID,
    },
  }
}

const COMPANY_CONTEXT_SCOPE = companyContext(new Set(['fleet.read'])).scope

function unusedDependencies(): unknown {
  const handler: ProxyHandler<() => unknown> = {
    apply: () => unusedDependencies(),
    get: () => unusedDependencies(),
  }
  return new Proxy(() => unusedDependencies(), handler)
}

function findTimelineRoute(readTripTimeline: { execute(input: unknown): Promise<unknown> }) {
  const dependencies = { ...(unusedDependencies() as Record<string, unknown>), readTripTimeline }
  const routes = createTripRoutes(dependencies as never)
  const route = routes.find(
    (candidate) =>
      candidate.method === 'GET' && candidate.pathname === `${TRIPS_PATH}/:id/timeline`,
  )
  if (route === undefined) throw new Error('route missing')
  return route
}

describe('GET /trips/:id/timeline (spec 158 T6)', () => {
  test('200 com o envelope { items, nextCursor }, companyId do contexto e limit padrão 100', async () => {
    const calls: unknown[] = []
    const route = findTimelineRoute({
      async execute(input) {
        calls.push(input)
        return { items: [{ id: 'timeline-item' }], nextCursor: 'opaque-cursor' }
      },
    })

    const response = await route.execute({
      context: companyContext(new Set(['fleet.read'])),
      correlationId: 'timeline-contract',
      pathParameters: { id: TRIP_ID },
      request: new Request(`http://localhost${PATH}`),
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      data: { items: unknown[]; nextCursor: string | null }
    }
    expect(body.data).toEqual({ items: [{ id: 'timeline-item' }], nextCursor: 'opaque-cursor' })
    expect(calls).toEqual([
      { context: COMPANY_CONTEXT_SCOPE, cursor: null, limit: 100, tripId: TRIP_ID },
    ])
  })

  test('cursor válido e limit explícito chegam ao caso de uso', async () => {
    const calls: unknown[] = []
    const cursor = {
      id: '00000000-0000-4000-8000-000000000123',
      kindPriority: 3,
      occurredAt: new Date('2026-09-18T12:00:00.000Z'),
    }
    const encodedCursor = encodeTripTimelineCursor(cursor)
    const route = findTimelineRoute({
      async execute(input) {
        calls.push(input)
        return { items: [], nextCursor: null }
      },
    })

    const response = await route.execute({
      context: companyContext(new Set(['fleet.read'])),
      correlationId: 'timeline-contract',
      pathParameters: { id: TRIP_ID },
      request: new Request(`http://localhost${PATH}?cursor=${encodedCursor}&limit=37`),
    })

    expect(response.status).toBe(200)
    expect(calls).toEqual([{ context: COMPANY_CONTEXT_SCOPE, cursor, limit: 37, tripId: TRIP_ID }])
  })

  test('400 TRIP_TIMELINE_CURSOR_INVALID para cursor malformado', async () => {
    const route = findTimelineRoute({
      async execute() {
        return { items: [], nextCursor: null }
      },
    })

    await expect(
      route.execute({
        context: companyContext(new Set(['fleet.read'])),
        correlationId: 'timeline-contract',
        pathParameters: { id: TRIP_ID },
        request: new Request(`http://localhost${PATH}?cursor=not-a-valid-cursor`),
      }),
    ).rejects.toMatchObject({ code: 'TRIP_TIMELINE_CURSOR_INVALID', status: 400 })
  })

  test('400 para limit fora de 1..200 (0 e 201)', async () => {
    const route = findTimelineRoute({
      async execute() {
        return { items: [], nextCursor: null }
      },
    })

    for (const limit of [0, 201]) {
      await expect(
        route.execute({
          context: companyContext(new Set(['fleet.read'])),
          correlationId: 'timeline-contract',
          pathParameters: { id: TRIP_ID },
          request: new Request(`http://localhost${PATH}?limit=${limit}`),
        }),
      ).rejects.toMatchObject({ status: 400 })
    }
  })

  test('404 TRIP_NOT_FOUND quando o caso de uso recusa a viagem de outra empresa', async () => {
    const { TripNotFoundError } = await import('../../src/trips/domain/trip.error.js')
    const route = findTimelineRoute({
      async execute() {
        throw new TripNotFoundError()
      },
    })

    await expect(
      route.execute({
        context: companyContext(new Set(['fleet.read'])),
        correlationId: 'timeline-contract',
        pathParameters: { id: TRIP_ID },
        request: new Request(`http://localhost${PATH}`),
      }),
    ).rejects.toMatchObject({ code: 'TRIP_NOT_FOUND', status: 404 })
  })

  test('a política é anyPermission(fleet.read, trip.report-on-behalf) — sem nenhuma, 403', () => {
    const route = findTimelineRoute({
      async execute() {
        return { items: [], nextCursor: null }
      },
    })
    const authorization = new AuthorizationService()

    expect(() =>
      authorization.authorize(companyContext(new Set(['trip.manage'])), route.policy),
    ).toThrow()
    expect(() =>
      authorization.authorize(companyContext(new Set(['fleet.read'])), route.policy),
    ).not.toThrow()
    expect(() =>
      authorization.authorize(companyContext(new Set(['trip.report-on-behalf'])), route.policy),
    ).not.toThrow()
  })
})
