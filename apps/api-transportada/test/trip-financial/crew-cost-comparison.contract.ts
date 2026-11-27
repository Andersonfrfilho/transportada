/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createReadCrewCostComparison } from '../../src/trips/application/read-crew-cost-comparison.use-case.js'
import type { TripValuationContext } from '../../src/trips/application/read-trip-valuation.use-case.js'
import { buildCrewCostComparison } from '../../src/trips/domain/crew-cost-comparison.policy.js'

const ana = {
  driverAmount: null,
  driverId: 'ana',
  driverName: 'Ana',
  paymentModel: 'route_table',
} as const
const ONE_DAY = { dailyAllowanceDays: 1 }

/** Spec 327: gasto × custo — o informado contra a diária que a conta calcularia sozinha. */
describe('a comparação gasto × custo da tripulação (spec 327)', () => {
  test('sem valor informado não há diferença e ninguém conta como informado', () => {
    const comparison = buildCrewCostComparison({ ...ONE_DAY, crew: [ana] })

    expect(comparison).toEqual({
      calculatedAmount: '200.00',
      calculatedHasGaps: false,
      differenceAmount: '0.00',
      informedAmount: '200.00',
      informedHasGaps: false,
      informedPeople: 0,
    })
  })

  test('valor informado maior que a diária dá diferença positiva', () => {
    const comparison = buildCrewCostComparison({
      ...ONE_DAY,
      crew: [{ ...ana, paidAmount: '250.0000' }],
    })

    expect(comparison.calculatedAmount).toBe('200.00')
    expect(comparison.informedAmount).toBe('250.00')
    expect(comparison.differenceAmount).toBe('50.00')
    expect(comparison.informedPeople).toBe(1)
  })

  test('valor informado menor dá diferença negativa, e zero é valor informado', () => {
    const comparison = buildCrewCostComparison({
      ...ONE_DAY,
      crew: [{ ...ana, paidAmount: '0.0000' }],
    })

    expect(comparison.informedAmount).toBe('0.00')
    expect(comparison.differenceAmount).toBe('-200.00')
    expect(comparison.informedPeople).toBe(1)
  })

  test('a lista só traz viagens com valor informado e usa o contexto em lote', async () => {
    const context = { ...ONE_DAY, crew: [{ ...ana, paidAmount: '250.0000' }] }
    const calls: string[][] = []
    const useCase = createReadCrewCostComparison({
      listTripsWithPaidAmount: async () => [
        {
          createdAt: '2026-11-26T10:00:00.000Z',
          crewNames: ['Ana'],
          status: 'draft',
          tripId: 't1',
        },
        {
          createdAt: '2026-11-25T10:00:00.000Z',
          crewNames: ['Bia'],
          status: 'draft',
          tripId: 't2',
        },
      ],
      readValuationContexts: async ({ tripIds }) => {
        calls.push([...tripIds])

        return new Map([['t1', context as unknown as TripValuationContext]])
      },
    })

    const rows = await useCase.execute({ companyId: 'c', from: '2026-11-01', to: '2026-11-30' })

    expect(calls).toEqual([['t1', 't2']])
    expect(rows.truncated).toBe(false)
    expect(rows.items.map((row) => row.tripId)).toEqual(['t1'])
    expect(rows.items[0]?.differenceAmount).toBe('50.00')
  })

  test('sem viagem no período não lê contexto nenhum', async () => {
    const useCase = createReadCrewCostComparison({
      listTripsWithPaidAmount: async () => [],
      readValuationContexts: async () => {
        throw new Error('não deveria ler')
      },
    })

    expect(await useCase.execute({ companyId: 'c', from: '2026-11-01', to: '2026-11-30' })).toEqual(
      { items: [], truncated: false },
    )
  })

  test('mais viagens que o teto cortam a lista e dizem que cortaram', async () => {
    const found = Array.from({ length: 201 }, (_, index) => ({
      createdAt: '2026-11-26T10:00:00.000Z',
      crewNames: ['Ana'],
      status: 'draft',
      tripId: `t${index}`,
    }))
    const useCase = createReadCrewCostComparison({
      listTripsWithPaidAmount: async () => found,
      readValuationContexts: async ({ tripIds }) =>
        new Map(tripIds.map((id) => [id, { crew: [ana] } as unknown as TripValuationContext])),
    })

    const page = await useCase.execute({ companyId: 'c', from: '2026-11-01', to: '2026-11-30' })

    expect(page.items).toHaveLength(200)
    expect(page.truncated).toBe(true)
  })

  test('lacuna no calculado ou no informado marca a diferença como incompleta', () => {
    const noDuration = buildCrewCostComparison({ crew: [ana] })

    expect(noDuration.calculatedHasGaps).toBe(true)
    expect(noDuration.informedHasGaps).toBe(true)
  })
})
