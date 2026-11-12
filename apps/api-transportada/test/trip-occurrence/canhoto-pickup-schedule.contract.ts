/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T3 (D4c, D7, RF4, RF5, CA03b): o encaixe da coleta de canhoto pelo escritório.
 *
 * - A regra pura do encaixe: só coleta aberta, nunca na viagem de origem nem em viagem finalizada, e com o endereço da
 *   entrega; encaixar de novo na mesma viagem não muda nada, noutra move.
 * - As rotas: `trip.report-on-behalf` nas três, corpo e query fechados.
 * - O caso de uso recongela a rota das viagens que mudaram de parada, e a falha do congelamento não derruba a escrita.
 * - CA03b por construção: nenhum leitor de carga, contagem, score ou portal (T0 §8–9) lê a tabela da coleta.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import type {
  CanhotoPickupSchedulePort,
  CanhotoPickupView,
} from '../../src/trips/application/canhoto-pickup-schedule.port.js'
import { createCanhotoPickupScheduleUseCase } from '../../src/trips/application/canhoto-pickup-schedule.use-case.js'
import { CanhotoPickupScheduleRefusedError } from '../../src/trips/domain/canhoto-pickup.error.js'
import {
  decideCanhotoPickupSchedule,
  isTripOpenForCanhotoPickup,
} from '../../src/trips/domain/canhoto-pickup.policy.js'
import {
  CANHOTO_PICKUPS_PATH,
  CANHOTO_PICKUP_SCHEDULE_PATH,
  CANHOTO_PICKUP_UNSCHEDULE_PATH,
  createCanhotoPickupRoutes,
} from '../../src/trips/presentation/canhoto-pickup.routes.js'

const ORIGIN_TRIP = '11111111-1111-4111-8111-111111111111'
const TARGET_TRIP = '22222222-2222-4222-8222-222222222222'
const OTHER_TRIP = '33333333-3333-4333-8333-333333333333'
const PICKUP_ID = '44444444-4444-4444-8444-444444444444'

const BASE = {
  hasOriginAddress: true,
  originTripId: ORIGIN_TRIP,
  pickupStatus: 'pending',
  pickupTripId: null,
  targetTripId: TARGET_TRIP,
  targetTripStatus: 'on_delivery_route',
} as const

describe('a regra do encaixe da coleta (spec 321 T3)', () => {
  test('a coleta pending entra em viagem não finalizada de qualquer estado', () => {
    for (const status of [
      'awaiting_crew',
      'draft',
      'route_planned',
      'separating',
      'loading',
      'dispatched',
      'in_transit',
      'on_delivery_route',
    ]) {
      expect(isTripOpenForCanhotoPickup(status)).toBe(true)
      expect(decideCanhotoPickupSchedule({ ...BASE, targetTripStatus: status })).toEqual({
        detachFromTripId: null,
        kind: 'schedule',
      })
    }
  })

  test('recusa viagem finalizada, a viagem de origem, coleta fechada e entrega sem parada', () => {
    for (const status of ['completed', 'cancelled']) {
      expect(decideCanhotoPickupSchedule({ ...BASE, targetTripStatus: status })).toEqual({
        kind: 'refuse',
        reason: 'trip_closed',
      })
    }
    expect(decideCanhotoPickupSchedule({ ...BASE, targetTripId: ORIGIN_TRIP })).toEqual({
      kind: 'refuse',
      reason: 'origin_trip',
    })
    for (const pickupStatus of ['collected', 'cancelled'] as const) {
      expect(decideCanhotoPickupSchedule({ ...BASE, pickupStatus })).toEqual({
        kind: 'refuse',
        reason: 'closed_pickup',
      })
    }
    expect(decideCanhotoPickupSchedule({ ...BASE, hasOriginAddress: false })).toEqual({
      kind: 'refuse',
      reason: 'without_origin_address',
    })
  })

  test('a mesma viagem não muda nada; outra viagem move a coleta', () => {
    expect(
      decideCanhotoPickupSchedule({
        ...BASE,
        pickupStatus: 'scheduled',
        pickupTripId: TARGET_TRIP,
      }),
    ).toEqual({ kind: 'unchanged' })
    expect(
      decideCanhotoPickupSchedule({
        ...BASE,
        pickupStatus: 'scheduled',
        pickupTripId: OTHER_TRIP,
      }),
    ).toEqual({ detachFromTripId: OTHER_TRIP, kind: 'schedule' })
  })

  test('cada recusa tem código e status estáveis', () => {
    const errors = (
      ['closed_pickup', 'origin_trip', 'trip_closed', 'without_origin_address'] as const
    ).map((reason) => {
      const error = new CanhotoPickupScheduleRefusedError(reason)
      return [reason, error.code, error.status]
    })
    expect(errors).toEqual([
      ['closed_pickup', 'CANHOTO_PICKUP_CLOSED', 409],
      ['origin_trip', 'CANHOTO_PICKUP_ORIGIN_TRIP', 422],
      ['trip_closed', 'CANHOTO_PICKUP_TRIP_CLOSED', 409],
      ['without_origin_address', 'CANHOTO_PICKUP_WITHOUT_ADDRESS', 422],
    ])
  })
})

const VIEW: CanhotoPickupView = {
  createdAt: '2026-11-10T12:00:00.000Z',
  documentNumber: '123',
  id: PICKUP_ID,
  nfeDocumentId: null,
  occurrenceId: '55555555-5555-4555-8555-555555555555',
  originStopLabel: 'Centro, 100',
  originTripDocumentId: '66666666-6666-4666-8666-666666666666',
  originTripId: ORIGIN_TRIP,
  pickupStopId: null,
  pickupTripId: TARGET_TRIP,
  status: 'scheduled',
}

function fakePort(tripsToRefreeze: readonly string[]): CanhotoPickupSchedulePort & {
  readonly calls: unknown[]
} {
  const calls: unknown[] = []
  return {
    calls,
    list: async (params) => {
      calls.push({ list: params })
      return [VIEW]
    },
    schedule: async (params) => {
      calls.push({ schedule: params })
      return { pickup: VIEW, tripsToRefreeze }
    },
    unschedule: async (params) => {
      calls.push({ unschedule: params })
      return { pickup: { ...VIEW, pickupTripId: null, status: 'pending' }, tripsToRefreeze }
    },
  }
}

const ACTOR = { actorUserId: 'user', companyId: 'company', correlationId: 'corr' }

describe('o caso de uso do encaixe (spec 321 T3)', () => {
  test('recongela, depois do commit, só as viagens que mudaram de parada', async () => {
    const frozen: string[] = []
    const useCase = createCanhotoPickupScheduleUseCase({
      repository: fakePort([TARGET_TRIP, OTHER_TRIP]),
      routeFreezer: {
        freeze: async ({ tripId }: { tripId: string }) => {
          frozen.push(tripId)
          return {} as never
        },
      } as never,
    })
    await useCase.schedule({ ...ACTOR, pickupId: PICKUP_ID, tripId: TARGET_TRIP })
    expect(frozen).toEqual([TARGET_TRIP, OTHER_TRIP])
  })

  test('a falha do congelamento só avisa: a coleta já está encaixada', async () => {
    const warnings: unknown[] = []
    const useCase = createCanhotoPickupScheduleUseCase({
      logger: { warn: (message, metadata) => warnings.push({ message, metadata }) },
      repository: fakePort([TARGET_TRIP]),
      routeFreezer: {
        freeze: async () => {
          throw new Error('osrm down')
        },
      } as never,
    })
    const pickup = await useCase.unschedule({ ...ACTOR, pickupId: PICKUP_ID })
    expect(pickup.status).toBe('pending')
    expect(warnings).toHaveLength(1)
  })
})

type Route = ReturnType<typeof createCanhotoPickupRoutes>[number]

function routes(port = fakePort([])) {
  const all = createCanhotoPickupRoutes({
    canhotoPickups: createCanhotoPickupScheduleUseCase({ repository: port }),
  })
  const byKey = (method: string, pathname: string): Route => {
    const found = all.find((route) => route.method === method && route.pathname === pathname)
    if (found === undefined) throw new Error(`route ${method} ${pathname} missing`)
    return found
  }
  return { all, byKey, port }
}

const CONTEXT = { scope: { companyId: 'company-from-token', userId: 'user-from-token' } } as never

async function errorOf(promise: Promise<unknown>): Promise<{ code?: unknown; status?: unknown }> {
  try {
    await promise
  } catch (error) {
    return error as { code?: unknown; status?: unknown }
  }
  throw new Error('expected an error')
}

describe('as rotas do encaixe (spec 321 T3)', () => {
  test('as três são do escritório (trip.report-on-behalf), nunca do separador', () => {
    const { all } = routes()
    expect(all.map((route) => [route.method, route.pathname, route.policy])).toEqual([
      ['GET', CANHOTO_PICKUPS_PATH, { permission: 'trip.report-on-behalf', scope: 'company' }],
      [
        'POST',
        CANHOTO_PICKUP_SCHEDULE_PATH,
        { permission: 'trip.report-on-behalf', scope: 'company' },
      ],
      [
        'POST',
        CANHOTO_PICKUP_UNSCHEDULE_PATH,
        { permission: 'trip.report-on-behalf', scope: 'company' },
      ],
    ])
  })

  test('a lista lê status repetidos e a empresa do token', async () => {
    const { byKey, port } = routes()
    const route = byKey('GET', CANHOTO_PICKUPS_PATH)
    const response = await route.execute({
      context: CONTEXT,
      correlationId: 'c',
      pathParameters: {},
      request: new Request(
        `http://api${CANHOTO_PICKUPS_PATH}?status=pending&status=scheduled&status=pending`,
      ),
    })
    expect(response.status).toBe(200)
    expect(port.calls).toEqual([
      {
        list: {
          companyId: 'company-from-token',
          limit: 100,
          statuses: ['pending', 'scheduled'],
        },
      },
    ])
  })

  test('a lista recusa status desconhecido, parâmetro desconhecido e limite fora da faixa', async () => {
    const route = routes().byKey('GET', CANHOTO_PICKUPS_PATH)
    for (const query of ['status=open', 'companyId=x', 'limit=0', 'limit=201', 'tripId=abc']) {
      const error = await errorOf(
        route.execute({
          context: CONTEXT,
          correlationId: 'c',
          pathParameters: {},
          request: new Request(`http://api${CANHOTO_PICKUPS_PATH}?${query}`),
        }),
      )
      expect(error.status).toBe(400)
    }
  })

  test('encaixar exige só o tripId, e o ator e a empresa vêm do token', async () => {
    const { byKey, port } = routes()
    const route = byKey('POST', CANHOTO_PICKUP_SCHEDULE_PATH)
    const request = (body: unknown) =>
      new Request(`http://api/trip-canhoto-pickups/${PICKUP_ID}/schedule`, {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      })
    const execute = (body: unknown) =>
      route.execute({
        context: CONTEXT,
        correlationId: 'corr',
        pathParameters: { pickupId: PICKUP_ID },
        request: request(body),
      })

    for (const body of [{}, { tripId: 'abc' }, { companyId: 'x', tripId: TARGET_TRIP }]) {
      expect((await errorOf(execute(body))).status).toBe(400)
    }
    expect((await execute({ tripId: TARGET_TRIP })).status).toBe(200)
    expect(port.calls).toEqual([
      {
        schedule: {
          actorUserId: 'user-from-token',
          companyId: 'company-from-token',
          correlationId: 'corr',
          pickupId: PICKUP_ID,
          tripId: TARGET_TRIP,
        },
      },
    ])
  })
})

/**
 * CA03b / D4c: a viagem nova não soma peso, volume, dimensão, ocupação, planta nem excesso de peso da coleta, porque
 * nenhum desses leitores lê a tabela da coleta. Leitor novo que passe a ler a coleta tem de decidir isto por escrito
 * (o tipo com `counts_cargo_on_pickup_trip = true` segue recusado no cadastro).
 */
describe('a carga da viagem nova não vê a coleta (CA03b)', () => {
  const READERS = [
    'src/trips/infrastructure/drizzle-trip.repository.ts',
    'src/trips/infrastructure/trip-list-occupancy.query.ts',
    'src/trips/infrastructure/trip-cargo-layout-input.support.ts',
    'src/trips/infrastructure/trip-cargo-preview.query.ts',
    'src/trips/infrastructure/trip-cargo-weight.support.ts',
    'src/trips/application/preview-trip-cargo.use-case.ts',
    'src/trips/infrastructure/drizzle-trip-document-review.repository.ts',
    'src/trips/infrastructure/trip-occurrence-feed.query.ts',
    'src/trips/infrastructure/trip-valuation.query.ts',
    'src/contractor-portal/infrastructure/contractor-delivery.query.ts',
    'src/trips/infrastructure/drizzle-trip-report.repository.ts',
    'src/fleet/infrastructure/drizzle-driver-score.repository.ts',
  ]

  test.each(READERS)('%s não lê a tabela da coleta', (path) => {
    const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
    expect(source).not.toInclude('tripCanhotoPickups')
    expect(source).not.toInclude('trip_canhoto_pickups')
  })
})
