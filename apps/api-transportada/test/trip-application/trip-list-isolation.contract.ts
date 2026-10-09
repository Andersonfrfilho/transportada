/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 259 T2.4 (RF5, code-standart §15): custo e ocupação são refinamento da linha de `/trips`. Cada
 * bloco falha sozinho, com aviso só de ids e código, e a página sai sem ele — nunca pior do que era.
 */
import { describe, expect, test } from 'bun:test'

import type { TripListFinancials } from '../../src/trips/application/read-trip-list-financials.use-case.js'
import type { TripAmounts } from '../../src/trips/application/read-trip-revenue-totals.use-case.js'
import type { TripRepositoryPort } from '../../src/trips/application/trip.port.js'
import { createTripUseCase } from '../../src/trips/application/trip.use-case.js'
import type { TripListOccupancy } from '../../src/trips/domain/trip-list-occupancy.policy.js'
import { TRIP } from '../fixtures/trip-http-payload.fixture.js'

const COMPANY_ID = 'empresa-1'
const SECOND_TRIP = { ...TRIP, id: '00000000-0000-4000-8000-000000000a12' }

const AMOUNTS: TripAmounts = {
  documentsTotal: '1000.0000',
  revenueSource: 'estimated',
  revenueTotal: '100.0000',
}
const FINANCIALS: TripListFinancials = {
  costTotal: '70.0000',
  hasGaps: true,
  marginPercentage: '30.0000',
  marginTotal: '30.0000',
}
const OCCUPANCY: TripListOccupancy = {
  capacityUnknownReason: null,
  volume: { documentsWithoutVolume: 0, occupancyRatio: '0.5000', source: 'measured' },
  weight: { documentsWithoutWeight: 0, payloadRatio: '0.2500', source: 'declared' },
}

type Warning = { readonly message: string; readonly metadata: unknown }

function listWith(input: {
  readonly financials?: () => Promise<ReadonlyMap<string, TripListFinancials>>
  readonly occupancies?: () => Promise<ReadonlyMap<string, TripListOccupancy | null>>
  readonly amounts?: () => Promise<ReadonlyMap<string, TripAmounts>>
}) {
  const warnings: Warning[] = []
  const repository = {
    list: () => Promise.resolve({ items: [TRIP, SECOND_TRIP], nextCursor: null }),
  } as unknown as TripRepositoryPort
  const useCase = createTripUseCase({
    amounts: {
      read:
        input.amounts ??
        (() =>
          Promise.resolve(
            new Map([
              [TRIP.id, AMOUNTS],
              [SECOND_TRIP.id, AMOUNTS],
            ]),
          )),
    },
    financials: {
      read: input.financials ?? (() => Promise.resolve(new Map([[TRIP.id, FINANCIALS]]))),
    },
    locations: { purgeByTrip: () => Promise.resolve() },
    logger: { warn: (message, metadata) => warnings.push({ message, metadata }) },
    occupancies: {
      read:
        input.occupancies ??
        (() =>
          Promise.resolve(
            new Map<string, TripListOccupancy | null>([
              [TRIP.id, OCCUPANCY],
              [SECOND_TRIP.id, null],
            ]),
          )),
    },
    repository,
  })

  return {
    page: useCase.list({
      context: { companyId: COMPANY_ID, userId: 'usuario-1' },
      cursor: null,
      includeFinancials: true,
      limit: 20,
    }),
    warnings,
  }
}

describe('a lista segue quando custo ou ocupação falham (spec 259 T2.4)', () => {
  test('tudo certo: custo na viagem que o devolveu, ocupação onde existe, null sem veículo', async () => {
    const { page, warnings } = listWith({})
    const [first, second] = (await page).items

    expect(first?.amounts).toEqual({ ...AMOUNTS, ...FINANCIALS })
    expect(first?.occupancy).toEqual(OCCUPANCY)
    expect(second?.amounts).toEqual(AMOUNTS)
    expect(second?.occupancy).toBeNull()
    expect(warnings).toEqual([])
  })

  test('a ocupação cai: a página sai com receita e custo, sem occupancy, e avisa só ids e código', async () => {
    const { page, warnings } = listWith({
      occupancies: () => Promise.reject(new RangeError('placa ABC1D23 do cliente Fulano')),
    })
    const [first, second] = (await page).items

    expect(first?.amounts).toEqual({ ...AMOUNTS, ...FINANCIALS })
    expect(Object.hasOwn(first ?? {}, 'occupancy')).toBe(false)
    expect(Object.hasOwn(second ?? {}, 'occupancy')).toBe(false)
    expect(warnings).toEqual([
      {
        message: 'trip.list.occupancy_block_failed',
        metadata: {
          companyId: COMPANY_ID,
          errorName: 'RangeError',
          tripIds: [TRIP.id, SECOND_TRIP.id],
        },
      },
    ])
    expect(JSON.stringify(warnings)).not.toContain('Fulano')
  })

  test('o custo cai: a receita fica, os campos de custo não aparecem, e a ocupação segue', async () => {
    const { page, warnings } = listWith({
      financials: () => Promise.reject(new Error('timeout')),
    })
    const [first] = (await page).items

    expect(first?.amounts).toEqual(AMOUNTS)
    expect(first?.occupancy).toEqual(OCCUPANCY)
    expect(warnings.map((warning) => warning.message)).toEqual([
      'trip.list.financials_block_failed',
    ])
  })

  test('as duas caem: a lista de hoje, inteira', async () => {
    const { page, warnings } = listWith({
      financials: () => Promise.reject(new Error('a')),
      occupancies: () => Promise.reject(new Error('b')),
    })
    const [first] = (await page).items

    expect(first?.amounts).toEqual(AMOUNTS)
    expect(Object.hasOwn(first ?? {}, 'occupancy')).toBe(false)
    expect(warnings).toHaveLength(2)
  })

  test('a receita segue propagando a falha, como sempre fez', async () => {
    const { page } = listWith({ amounts: () => Promise.reject(new Error('receita')) })

    await expect(page).rejects.toThrow('receita')
  })
})
