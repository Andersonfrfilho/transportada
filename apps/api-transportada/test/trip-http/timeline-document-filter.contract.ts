/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 227 T5.1 (D7): `GET /trips/:id/timeline?documentId=` filtra por nota no servidor. A fronteira
 * valida o UUID (400), recusa chave repetida e entrega o filtro ao caso de uso junto com o cursor.
 */
import { describe, expect, test } from 'bun:test'

import type {
  AuthenticatedContext,
  CompanyContext,
} from '../../src/identity/domain/tenant-context.js'
import { encodeTripTimelineCursor } from '../../src/trips/infrastructure/trip-timeline.query.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'
import { TRIP_ID, TRIPS_PATH } from '../fixtures/trip-http-payload.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const USER_ID = '00000000-0000-4000-8000-000000000001'
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000d1'
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
      subject: 'trip-timeline-document-filter-contract',
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

function recordingRoute(calls: object[]) {
  return findTimelineRoute({
    async execute(input) {
      calls.push(input as object)
      return { items: [], nextCursor: null }
    },
  })
}

function callTimeline(route: ReturnType<typeof findTimelineRoute>, query: string) {
  return route.execute({
    context: companyContext(new Set(['fleet.read'])),
    correlationId: 'timeline-document-filter-contract',
    pathParameters: { id: TRIP_ID },
    request: new Request(`http://localhost${PATH}${query}`),
  })
}

describe('GET /trips/:id/timeline?documentId= (spec 227 T5.1)', () => {
  test('sem o filtro, a chave documentId nem chega ao caso de uso', async () => {
    const calls: object[] = []
    await callTimeline(recordingRoute(calls), '')
    expect(calls.map((call) => 'documentId' in call)).toEqual([false])
  })

  test('com o filtro, o UUID chega ao caso de uso junto com cursor e limit', async () => {
    const calls: object[] = []
    const cursor = {
      id: '00000000-0000-4000-8000-000000000123',
      kindPriority: 3,
      occurredAt: '2026-09-18T12:00:00.000000Z',
    }
    const response = await callTimeline(
      recordingRoute(calls),
      `?documentId=${DOCUMENT_ID}&cursor=${encodeTripTimelineCursor(cursor)}&limit=37`,
    )

    expect(response.status).toBe(200)
    expect(calls).toEqual([
      {
        canReadEventLocation: false,
        context: companyContext(new Set(['fleet.read'])).scope,
        cursor,
        documentId: DOCUMENT_ID,
        limit: 37,
        tripId: TRIP_ID,
      },
    ])
  })

  test('400 para valor que não é UUID, vazio ou repetido — e o caso de uso não roda', async () => {
    const calls: object[] = []
    const route = recordingRoute(calls)

    for (const query of [
      '?documentId=not-a-uuid',
      '?documentId=',
      `?documentId=${DOCUMENT_ID}&documentId=${DOCUMENT_ID}`,
      "?documentId='; drop table trips; --",
    ]) {
      await expect(callTimeline(route, query)).rejects.toMatchObject({ status: 400 })
    }
    expect(calls).toEqual([])
  })
})
