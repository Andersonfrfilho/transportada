/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 RF4: a transferência de tripulação aparece na linha do tempo da viagem — e a **diferença de
 * custo é dinheiro** (`trip.financials`, spec 153 D10): quem lê a linha do tempo por `fleet.read` ou
 * `trip.report-on-behalf` sem essa permissão recebe o evento sem a chave, nunca com `null` no lugar.
 */
import { describe, expect, test } from 'bun:test'

import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import { createTripRoutes } from '../../src/trips/presentation/trip.routes.js'
import { TRIP_ID, TRIPS_PATH } from '../fixtures/trip-http-payload.fixture.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const USER_ID = '00000000-0000-4000-8000-000000000001'

const CREW_TRANSFER_ITEM = {
  actorName: 'Maria Operadora',
  channel: 'backoffice',
  crewTransfer: {
    costDifference: '-540.00',
    mdfeDriverDivergence: true,
    nextCrew: [{ driverId: 'b', name: 'Bruno Lima', position: 1, role: 'driver' }],
    previousCrew: [{ driverId: 'a', name: 'Ana Souza', position: 1, role: 'driver' }],
    reason: 'Motorista passou mal na estrada',
  },
  id: 'transfer-1',
  kind: 'crew_transfer',
  occurredAt: '2026-10-07T12:00:00.000Z',
}

const STATUS_ITEM = {
  id: 'status-1',
  kind: 'trip.status_changed',
  occurredAt: '2026-10-07T11:00:00.000Z',
}

function contextWith(permissions: CompanyContext['permissions']) {
  return {
    identity: {
      companyIdClaim: COMPANY_ID,
      externalIdentityId: '00000000-0000-4000-8000-000000000004',
      issuer: 'https://issuer.test',
      platformAdmin: false,
      serviceAccount: false,
      subject: 'trip-timeline-crew-transfer-contract',
      userId: USER_ID,
    },
    scope: {
      companyId: COMPANY_ID,
      kind: 'company' as const,
      membershipId: '00000000-0000-4000-8000-000000000003',
      permissions,
      roles: ['operator' as const],
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

async function readTimeline(permissions: CompanyContext['permissions']) {
  const readTripTimeline = {
    async execute() {
      return { items: [STATUS_ITEM, CREW_TRANSFER_ITEM], nextCursor: null }
    },
  }
  const routes = createTripRoutes({
    ...(unusedDependencies() as Record<string, unknown>),
    readTripTimeline,
  } as never)
  const route = routes.find(
    (candidate) =>
      candidate.method === 'GET' && candidate.pathname === `${TRIPS_PATH}/:id/timeline`,
  )
  if (route === undefined) throw new Error('route missing')

  const response = await route.execute({
    context: contextWith(permissions),
    correlationId: 'timeline-crew-transfer-contract',
    pathParameters: { id: TRIP_ID },
    request: new Request(`http://localhost${TRIPS_PATH}/${TRIP_ID}/timeline`),
  })
  const body = (await response.json()) as {
    data: { items: readonly Record<string, unknown>[] }
  }
  return { body, status: response.status }
}

describe('a diferença de custo na linha do tempo é dinheiro (spec 249 RF4, spec 153 D10)', () => {
  test('com trip.financials o evento leva a diferença, o retrato e o aviso de MDF-e', async () => {
    const { body, status } = await readTimeline(new Set(['fleet.read', 'trip.financials']))

    expect(status).toBe(200)
    expect(body.data.items[1]).toEqual(CREW_TRANSFER_ITEM)
  })

  test.each([
    ['fleet.read', new Set(['fleet.read'] as const)],
    ['trip.report-on-behalf', new Set(['trip.report-on-behalf'] as const)],
  ])(
    'sem trip.financials (%s) a chave costDifference sai, nunca null',
    async (_label, permissions) => {
      const { body } = await readTimeline(permissions)

      const crewTransfer = body.data.items[1]?.crewTransfer as Record<string, unknown>
      expect(Object.hasOwn(crewTransfer, 'costDifference')).toBe(false)
      expect(Object.keys(crewTransfer).sort()).toEqual([
        'mdfeDriverDivergence',
        'nextCrew',
        'previousCrew',
        'reason',
      ])
      expect(crewTransfer.reason).toBe(CREW_TRANSFER_ITEM.crewTransfer.reason)
      expect(crewTransfer.mdfeDriverDivergence).toBe(true)
    },
  )

  test('o resto da linha do tempo passa intacto, com ou sem a permissão', async () => {
    const { body } = await readTimeline(new Set(['fleet.read']))

    expect(body.data.items[0]).toEqual(STATUS_ITEM)
  })
})
