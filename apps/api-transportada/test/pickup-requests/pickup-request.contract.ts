/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { PickupRequestAddress } from '../../src/database/pickup-request.schema.js'
import type {
  NewPickupRequest,
  PickupRequestAuditEntry,
  PickupRequestRecord,
  PickupRequestRepositoryPort,
} from '../../src/pickup-requests/application/pickup-request.port.js'
import {
  createAcceptPickupRequestUseCase,
  createCancelPickupRequestUseCase,
  createCreatePickupRequestUseCase,
  createGetPickupRequestUseCase,
  createRefusePickupRequestUseCase,
  createSchedulePickupRequestUseCase,
  createSweepPickupRequestsUseCase,
} from '../../src/pickup-requests/application/pickup-request.use-case.js'
import {
  canTransitionPickupRequest,
  computePickupRequestExpiry,
  isPickupWindowAcceptable,
} from '../../src/pickup-requests/domain/pickup-request.policy.js'
import { ApiError } from '../../src/shared/api.error.js'
import { createPickupRequestRoutes } from '../../src/pickup-requests/presentation/pickup-request.routes.js'
import {
  API_CLIENT_PICKUP_REQUESTS_PATH,
  API_PICKUP_REQUESTS_PATH,
} from '../../src/shared/api.constant.js'

const COMPANY = '11111111-1111-4111-8111-111111111111'
const OTHER_COMPANY = '22222222-2222-4222-8222-222222222222'
const USER = '33333333-3333-4333-8333-333333333333'
const CONTRACTOR = '55555555-5555-4555-8555-555555555555'
const OTHER_CONTRACTOR = '66666666-6666-4666-8666-666666666666'
const OPEN_TRIP = '77777777-7777-4777-8777-777777777777'
const NOW = new Date('2026-11-16T12:00:00Z')

const ADDRESS: PickupRequestAddress = {
  city: 'Ribeirão Preto',
  cityIbgeCode: '3543402',
  complement: null,
  district: 'Centro',
  number: '100',
  postalCode: '14010000',
  state: 'SP',
  street: 'Rua A',
}

function fakeRepository() {
  const rows = new Map<string, PickupRequestRecord>()
  const audits: PickupRequestAuditEntry[] = []
  let sequence = 0
  const contractorsByTaxId = new Map<string, string>()
  const repository: PickupRequestRepositoryPort = {
    appendAudit: async (entry) => {
      audits.push(entry)
    },
    expireDue: async ({ now }) => {
      const expired: PickupRequestRecord[] = []
      for (const [id, row] of rows) {
        if (row.status === 'requested' && row.expiresAt <= now) {
          const next = { ...row, status: 'expired' as const }
          rows.set(id, next)
          expired.push(next)
        }
      }
      return expired
    },
    find: async ({ companyId, id }) => {
      const row = rows.get(id)
      return row !== undefined && row.companyId === companyId ? row : null
    },
    insert: async (input: NewPickupRequest) => {
      for (const row of rows.values()) {
        if (row.companyId === input.companyId && row.requesterName === input.idempotencyKey)
          return { created: false, record: row }
      }
      sequence += 1
      const id = `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`
      const record: PickupRequestRecord = {
        acceptedTotalAmount: null,
        acceptedWindowEnd: null,
        acceptedWindowStart: null,
        cargoDescription: input.cargoDescription,
        companyId: input.companyId,
        contractorId: input.contractorId,
        createdAt: new Date(NOW.getTime() - 25 * 3600 * 1000),
        decidedAt: null,
        decisionNote: null,
        destination: input.destination,
        expiresAt: input.expiresAt,
        id,
        integrationKeyId: null,
        kind: input.kind,
        note: input.note,
        origin: input.origin,
        quotedTotalAmount: null,
        quoteValidUntil: null,
        requesterEmail: input.requesterEmail,
        requesterName: input.requesterName,
        requesterPhone: input.requesterPhone,
        requesterTaxId: input.requesterTaxId,
        source: input.source,
        staleAlertedAt: null,
        status: 'requested',
        tripId: null,
        tripStopId: null,
        volumes: input.volumes,
        weightKg: input.weightKg,
        windowEnd: input.windowEnd,
        windowStart: input.windowStart,
      }
      rows.set(id, record)
      return { created: true, record }
    },
    resolveContractorByTaxId: async ({ taxId }) => {
      const known = contractorsByTaxId.get(taxId)
      if (known !== undefined) return { contractorId: known, created: false }
      const created = `99999999-9999-4999-8999-${String(contractorsByTaxId.size + 1).padStart(12, '0')}`
      contractorsByTaxId.set(taxId, created)
      return { contractorId: created, created: true }
    },
    isTripOpen: async ({ companyId, tripId }) => companyId === COMPANY && tripId === OPEN_TRIP,
    listForContractor: async ({ contractorIds }) =>
      [...rows.values()].filter(
        (row) => row.contractorId !== null && contractorIds.includes(row.contractorId),
      ),
    listForOffice: async ({ companyId }) =>
      [...rows.values()].filter((row) => row.companyId === companyId),
    listOpenTrips: async () => [{ createdAt: NOW, id: OPEN_TRIP, status: 'draft', stopCount: 2 }],
    listStale: async ({ olderThan }) =>
      [...rows.values()].filter(
        (row) =>
          row.status === 'requested' && row.createdAt < olderThan && row.staleAlertedAt === null,
      ),
    markAlerted: async ({ ids, now }) => {
      for (const id of ids) {
        const row = rows.get(id)
        if (row !== undefined) rows.set(id, { ...row, staleAlertedAt: now })
      }
    },
    transition: async ({ companyId, contractorIds, from, id, patch, to }) => {
      const row = rows.get(id)
      if (row === undefined || row.companyId !== companyId || row.status !== from) return null
      if (
        contractorIds !== undefined &&
        (row.contractorId === null || !contractorIds.includes(row.contractorId))
      )
        return null
      const next: PickupRequestRecord = {
        ...row,
        acceptedTotalAmount: patch.acceptedTotalAmount ?? row.acceptedTotalAmount,
        acceptedWindowEnd: patch.acceptedWindowEnd ?? row.acceptedWindowEnd,
        acceptedWindowStart: patch.acceptedWindowStart ?? row.acceptedWindowStart,
        contractorId: patch.contractorId ?? row.contractorId,
        decisionNote: patch.decisionNote ?? row.decisionNote,
        status: to,
        tripId: patch.tripId ?? row.tripId,
      }
      rows.set(id, next)
      return next
    },
  }
  return { audits, repository, rows }
}

function context(contractorScope = CONTRACTOR, companyId = COMPANY) {
  return {
    companyId,
    kind: 'company',
    membershipId: '44444444-4444-4444-8444-444444444444',
    permissions: new Set(['pickup.request', 'pickup.manage']),
    roles: ['contractor'],
    scope: contractorScope,
    userId: USER,
  } as never
}

function setup(scopeContractor = CONTRACTOR) {
  const fake = fakeRepository()
  const dependencies = {
    clock: () => NOW,
    repository: fake.repository,
    resolveScope: async () => ({ contractorIds: [scopeContractor], taxIds: ['12345678000199'] }),
  }
  return { ...fake, dependencies }
}

const CREATE_INPUT = {
  cargoDescription: 'Caixas de peças',
  correlationId: 'c1',
  destination: ADDRESS,
  idempotencyKey: 'idem-key-0000000001',
  kind: 'pickup' as const,
  note: null,
  origin: ADDRESS,
  requesterEmail: 'cliente@example.com',
  requesterName: 'Cliente',
  requesterPhone: null,
  volumes: 3,
  weightKg: '120.500',
  windowEnd: '2026-11-20',
  windowStart: '2026-11-18',
}

describe('pickup request policy (spec 339)', () => {
  test('cancel and decisions only leave requested; scheduled can go back to accepted', () => {
    expect(canTransitionPickupRequest('requested', 'accepted')).toBe(true)
    expect(canTransitionPickupRequest('requested', 'scheduled')).toBe(false)
    expect(canTransitionPickupRequest('accepted', 'scheduled')).toBe(true)
    expect(canTransitionPickupRequest('scheduled', 'accepted')).toBe(true)
    expect(canTransitionPickupRequest('refused', 'accepted')).toBe(false)
    expect(canTransitionPickupRequest('canceled', 'accepted')).toBe(false)
    expect(canTransitionPickupRequest('expired', 'accepted')).toBe(false)
  })

  test('expires in 7 calendar days', () => {
    expect(computePickupRequestExpiry(NOW).toISOString()).toBe('2026-11-23T12:00:00.000Z')
  })

  test('the window starts today or later and fits 180 days', () => {
    const today = '2026-11-16'
    expect(isPickupWindowAcceptable({ end: '2026-11-17', start: today, today })).toBe(true)
    expect(isPickupWindowAcceptable({ end: '2026-11-17', start: '2026-11-15', today })).toBe(false)
    expect(isPickupWindowAcceptable({ end: '2026-11-17', start: '2026-11-18', today })).toBe(false)
    expect(isPickupWindowAcceptable({ end: '2027-12-01', start: today, today })).toBe(false)
  })
})

describe('pickup request use cases (spec 339)', () => {
  test('create takes the contractor from the session, audits once and rejects a bad window', async () => {
    const { audits, dependencies } = setup()
    const create = createCreatePickupRequestUseCase(dependencies)
    const context_ = { companyId: COMPANY, userId: USER } as never
    const first = await create({ ...CREATE_INPUT, context: context_ })
    expect(first.created).toBe(true)
    expect(first.record.contractorId).toBe(CONTRACTOR)
    expect(first.record.source).toBe('portal')
    expect(first.record.status).toBe('requested')
    expect(audits.map((audit) => audit.action)).toEqual(['pickup-request.created'])

    await expect(
      create({
        ...CREATE_INPUT,
        context: context_,
        windowStart: '2026-11-10',
        windowEnd: '2026-11-12',
      }),
    ).rejects.toMatchObject({ code: 'PICKUP_REQUEST_WINDOW_INVALID', status: 422 })
  })

  test('a contractor cannot cancel another contractor request, and cancel is first-writer-wins', async () => {
    const owner = setup()
    const created = await createCreatePickupRequestUseCase(owner.dependencies)({
      ...CREATE_INPUT,
      context: { companyId: COMPANY, userId: USER } as never,
    })
    const intruder = createCancelPickupRequestUseCase({
      ...owner.dependencies,
      resolveScope: async () => ({ contractorIds: [OTHER_CONTRACTOR], taxIds: ['x'] }),
    })
    await expect(
      intruder({
        context: { companyId: COMPANY, userId: USER } as never,
        correlationId: 'c',
        id: created.record.id,
      }),
    ).rejects.toMatchObject({ code: 'PICKUP_REQUEST_NOT_FOUND', status: 404 })

    const cancel = createCancelPickupRequestUseCase(owner.dependencies)
    const input = {
      context: { companyId: COMPANY, userId: USER } as never,
      correlationId: 'c',
      id: created.record.id,
    }
    expect((await cancel(input)).status).toBe('canceled')
    await expect(cancel(input)).rejects.toMatchObject({
      code: 'PICKUP_REQUEST_INVALID_TRANSITION',
      status: 409,
    })
  })

  test('accept creates only a suggestion; scheduling needs an open trip of the company', async () => {
    const { repository, dependencies } = setup()
    const created = await createCreatePickupRequestUseCase(dependencies)({
      ...CREATE_INPUT,
      context: { companyId: COMPANY, userId: USER } as never,
    })
    const officeContext = { companyId: COMPANY, userId: USER } as never
    const accepted = await createAcceptPickupRequestUseCase({ repository })({
      acceptedTotalAmount: '4493.4600',
      acceptedWindowEnd: null,
      acceptedWindowStart: null,
      context: officeContext,
      correlationId: 'c',
      id: created.record.id,
      note: null,
    })
    expect(accepted.record.status).toBe('accepted')
    expect(accepted.record.tripId).toBeNull()
    expect(accepted.suggestion?.canCreateNewTrip).toBe(true)
    expect(accepted.suggestion?.trips.map((trip) => trip.id)).toEqual([OPEN_TRIP])

    const schedule = createSchedulePickupRequestUseCase({ repository })
    await expect(
      schedule({
        context: officeContext,
        correlationId: 'c',
        id: created.record.id,
        tripId: '88888888-8888-4888-8888-888888888888',
      }),
    ).rejects.toMatchObject({ code: 'PICKUP_REQUEST_TRIP_NOT_AVAILABLE', status: 409 })

    const scheduled = await schedule({
      context: officeContext,
      correlationId: 'c',
      id: created.record.id,
      tripId: OPEN_TRIP,
    })
    expect(scheduled.status).toBe('scheduled')
    expect(scheduled.tripId).toBe(OPEN_TRIP)
  })

  test('an anonymous request gets its client on acceptance, reusing the same document', async () => {
    const { repository } = setup()
    const base = {
      cargoDescription: 'Caixas',
      companyId: COMPANY,
      contractorId: null,
      destination: ADDRESS,
      expiresAt: new Date(NOW.getTime() + 7 * 86_400_000),
      kind: 'pickup' as const,
      note: null,
      origin: ADDRESS,
      quotedTotalAmount: null,
      quoteValidUntil: null,
      requesterEmail: 'a@example.com',
      requesterName: 'Anônimo',
      requesterPhone: null,
      requesterTaxId: '12345678000199',
      source: 'public_quote' as const,
      volumes: 1,
      weightKg: '10.000',
      windowEnd: '2026-11-20',
      windowStart: '2026-11-18',
    }
    const first = await repository.insert({ ...base, idempotencyKey: 'a' })
    const second = await repository.insert({ ...base, idempotencyKey: 'b' })
    const accept = createAcceptPickupRequestUseCase({ repository })
    const office = { companyId: COMPANY, userId: USER } as never
    const one = await accept({
      acceptedTotalAmount: null,
      acceptedWindowEnd: null,
      acceptedWindowStart: null,
      context: office,
      correlationId: 'c',
      id: first.record.id,
      note: null,
    })
    const two = await accept({
      acceptedTotalAmount: null,
      acceptedWindowEnd: null,
      acceptedWindowStart: null,
      context: office,
      correlationId: 'c',
      id: second.record.id,
      note: null,
    })
    expect(one.record.contractorId).not.toBeNull()
    expect(two.record.contractorId).toBe(one.record.contractorId)
  })

  test('a refused request cannot be accepted, and another company sees it as missing', async () => {
    const { repository, dependencies } = setup()
    const created = await createCreatePickupRequestUseCase(dependencies)({
      ...CREATE_INPUT,
      context: { companyId: COMPANY, userId: USER } as never,
    })
    const officeContext = { companyId: COMPANY, userId: USER } as never
    const refused = await createRefusePickupRequestUseCase({ repository })({
      acceptedTotalAmount: null,
      acceptedWindowEnd: null,
      acceptedWindowStart: null,
      context: officeContext,
      correlationId: 'c',
      id: created.record.id,
      note: 'Sem cobertura nessa região',
    })
    expect(refused.status).toBe('refused')
    expect(refused.decisionNote).toBe('Sem cobertura nessa região')
    await expect(
      createAcceptPickupRequestUseCase({ repository })({
        acceptedTotalAmount: null,
        acceptedWindowEnd: null,
        acceptedWindowStart: null,
        context: officeContext,
        correlationId: 'c',
        id: created.record.id,
        note: null,
      }),
    ).rejects.toMatchObject({ code: 'PICKUP_REQUEST_INVALID_TRANSITION' })
    await expect(
      createGetPickupRequestUseCase({ repository })({
        companyId: OTHER_COMPANY,
        id: created.record.id,
      }),
    ).rejects.toMatchObject({ code: 'PICKUP_REQUEST_NOT_FOUND', status: 404 })
  })

  test('the sweep expires overdue requests and alerts a stale one only once', async () => {
    const { dependencies, repository, rows } = setup()
    const create = createCreatePickupRequestUseCase(dependencies)
    const context_ = { companyId: COMPANY, userId: USER } as never
    const stale = await create({ ...CREATE_INPUT, context: context_ })
    const overdue = await create({
      ...CREATE_INPUT,
      context: context_,
      idempotencyKey: 'idem-key-0000000002',
      requesterName: 'idem-key-0000000002',
    })
    const overdueRow = rows.get(overdue.record.id)
    if (overdueRow === undefined) throw new Error('missing row')
    rows.set(overdue.record.id, { ...overdueRow, expiresAt: new Date(NOW.getTime() - 1000) })

    const sweep = createSweepPickupRequestsUseCase({ clock: () => NOW, repository })
    const first = await sweep()
    expect(first.expired.map((row) => row.id)).toEqual([overdue.record.id])
    expect(first.stale.map((row) => row.id)).toEqual([stale.record.id])
    const second = await sweep()
    expect(second.expired).toEqual([])
    expect(second.stale).toEqual([])
  })
})

describe('pickup request routes (spec 339)', () => {
  function routesFor() {
    const { dependencies, repository } = setup()
    return createPickupRequestRoutes({
      accept: createAcceptPickupRequestUseCase({ repository }),
      cancel: createCancelPickupRequestUseCase(dependencies),
      create: createCreatePickupRequestUseCase(dependencies),
      get: createGetPickupRequestUseCase({ repository }),
      listForContractor: async ({ context: ctx }) =>
        repository.listForContractor({
          companyId: ctx.companyId,
          contractorIds: [CONTRACTOR],
          limit: 50,
        }),
      listForOffice: async ({ companyId }) =>
        repository.listForOffice({ companyId, limit: 50, status: undefined }),
      refuse: createRefusePickupRequestUseCase({ repository }),
      schedule: createSchedulePickupRequestUseCase({ repository }),
    })
  }

  async function post(
    path: string,
    body: unknown,
    key: string | null = 'idem-key-0000000009',
    pathParameters: Record<string, string> = {},
  ): Promise<Response> {
    const route = routesFor().find((c) => c.method === 'POST' && c.pathname === path)
    if (route === undefined) throw new Error(`missing POST ${path}`)
    try {
      return await route.execute({
        context: { identity: undefined, scope: context() } as never,
        correlationId: 'c',
        pathParameters,
        request: new Request(`http://api.test${path}`, {
          body: JSON.stringify(body),
          headers: {
            'content-type': 'application/json',
            ...(key === null ? {} : { 'idempotency-key': key }),
          },
          method: 'POST',
        }),
      })
    } catch (error) {
      if (error instanceof ApiError) return new Response(null, { status: error.status })
      throw error
    }
  }

  const BODY = {
    cargoDescription: 'Caixas',
    destination: ADDRESS,
    kind: 'delivery',
    origin: ADDRESS,
    requesterEmail: 'a@example.com',
    requesterName: 'Cliente',
    volumes: 2,
    weightKg: '10',
    windowEnd: '2026-11-25',
    windowStart: '2026-11-20',
  }

  test('the portal view never leaks internal ids, and the contract is strict', async () => {
    const created = await post(API_CLIENT_PICKUP_REQUESTS_PATH, BODY)
    expect(created.status).toBe(201)
    expect(created.headers.get('cache-control')).toBe('no-store')
    const { data } = (await created.json()) as { data: Record<string, unknown> }
    for (const forbidden of [
      'contractorId',
      'tripId',
      'requesterTaxId',
      'decidedByUserId',
      'companyId',
    ])
      expect(forbidden in data).toBe(false)
    expect(data.status).toBe('requested')

    expect(
      (await post(API_CLIENT_PICKUP_REQUESTS_PATH, { ...BODY, companyId: COMPANY })).status,
    ).toBe(400)
    expect(
      (await post(API_CLIENT_PICKUP_REQUESTS_PATH, { ...BODY, requesterEmail: undefined })).status,
    ).toBe(400)
    expect((await post(API_CLIENT_PICKUP_REQUESTS_PATH, BODY, null)).status).toBe(400)
  })

  test('refusing needs a note, and the routes sit under the right permissions', async () => {
    const refuse = await post(`${API_PICKUP_REQUESTS_PATH}/:id/refuse`, {}, null, {
      id: '00000000-0000-4000-8000-000000000001',
    })
    expect(refuse.status).toBe(400)
    const routes = routesFor()
    const permissions = new Map(
      routes.map((r) => [`${r.method} ${r.pathname}`, r.policy?.permission]),
    )
    expect(permissions.get(`POST ${API_CLIENT_PICKUP_REQUESTS_PATH}`)).toBe('pickup.request')
    expect(permissions.get(`POST ${API_PICKUP_REQUESTS_PATH}/:id/accept`)).toBe('pickup.manage')
    expect(permissions.get(`GET ${API_PICKUP_REQUESTS_PATH}`)).toBe('pickup.manage')
  })
})
