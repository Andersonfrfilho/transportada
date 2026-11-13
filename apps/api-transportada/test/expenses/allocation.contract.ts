/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.2 (ADR-0116 §2, §3, §5, §6; CA06 a CA09): o serviço puro de rateio. Contrato de tabela: cada caso é uma
 * entrada e a divisão exata, em centavos, que a T4.4 tem que devolver.
 */
import { describe, expect, it } from 'bun:test'

import {
  allocateExpenses,
  DEFAULT_ALLOCATION_SETTINGS,
  type AllocationExpense,
  type AllocationSettings,
  type AllocationTrip,
} from '../../src/expenses/domain/expense-allocation.policy.js'
import { parseMoneyToCents } from '../../src/expenses/domain/expense-money.policy.js'

const trip = (id: string, overrides: Partial<AllocationTrip> = {}): AllocationTrip => ({
  completedOn: '2026-10-10',
  cost: '0.00',
  customerId: 'c1',
  daysCount: 1,
  distanceMeters: 100_000,
  revenue: '1000.00',
  tripId: id,
  vehicleId: 'v1',
  ...overrides,
})

const expense = (
  id: string,
  amount: string,
  overrides: Partial<AllocationExpense> = {},
): AllocationExpense => ({
  amount,
  costGroup: 'administrative',
  expenseId: `e-${id}`,
  name: id,
  occurrenceId: id,
  vehicleId: null,
  ...overrides,
})

const settings = (overrides: Partial<AllocationSettings> = {}): AllocationSettings => ({
  ...DEFAULT_ALLOCATION_SETTINGS,
  ...overrides,
})

function shareOf(
  result: ReturnType<typeof allocateExpenses>,
  occurrenceId: string,
  tripId: string,
): string | undefined {
  return result.shares.find((s) => s.occurrenceId === occurrenceId && s.tripId === tripId)?.amount
}

function totalCents(result: ReturnType<typeof allocateExpenses>, occurrenceId: string): bigint {
  const shares = result.shares
    .filter((s) => s.occurrenceId === occurrenceId)
    .reduce((sum, s) => sum + (parseMoneyToCents(s.amount) ?? 0n), 0n)
  const unallocated = result.unallocated
    .filter((u) => u.occurrenceId === occurrenceId)
    .reduce((sum, u) => sum + (parseMoneyToCents(u.amount) ?? 0n), 0n)
  return shares + unallocated
}

describe('os pesos de cada critério (ADR-0116 §2)', () => {
  const trips = [
    trip('t1', { daysCount: 1, distanceMeters: 100_000, revenue: '1000.00' }),
    trip('t2', { daysCount: 3, distanceMeters: 300_000, revenue: '3000.00' }),
  ]

  for (const [criterion, first, second] of [
    ['per_km', '250.00', '750.00'],
    ['per_trip_day', '250.00', '750.00'],
    ['per_revenue', '250.00', '750.00'],
    ['equal', '500.00', '500.00'],
  ] as const) {
    it(`${criterion} divide 1000,00 em ${first} e ${second}`, () => {
      const result = allocateExpenses({
        expenses: [expense('o1', '1000.00')],
        settings: settings({ administrative: criterion }),
        trips,
      })

      expect(shareOf(result, 'o1', 't1')).toBe(first)
      expect(shareOf(result, 'o1', 't2')).toBe(second)
    })
  }
})

describe('a soma fecha, centavo a centavo (CA06, ADR-0116 §6)', () => {
  it('100,00 em três viagens iguais: o resto vai à primeira da ordem estável', () => {
    const result = allocateExpenses({
      expenses: [expense('o1', '100.00')],
      settings: settings({ administrative: 'equal' }),
      trips: [
        trip('t3', { completedOn: '2026-10-12' }),
        trip('t1', { completedOn: '2026-10-10' }),
        trip('t2', { completedOn: '2026-10-10' }),
      ],
    })

    expect([
      shareOf(result, 'o1', 't1'),
      shareOf(result, 'o1', 't2'),
      shareOf(result, 'o1', 't3'),
    ]).toEqual(['33.34', '33.33', '33.33'])
    expect(totalCents(result, 'o1')).toBe(10_000n)
  })

  it('o resto inteiro vai à viagem de maior peso', () => {
    const result = allocateExpenses({
      expenses: [expense('o1', '100.01')],
      settings: settings({ administrative: 'per_km' }),
      trips: [
        trip('t1', { distanceMeters: 100_000 }),
        trip('t2', { distanceMeters: 100_000 }),
        trip('t3', { distanceMeters: 300_000 }),
      ],
    })

    expect(totalCents(result, 'o1')).toBe(10_001n)
    const t3 = parseMoneyToCents(shareOf(result, 'o1', 't3') ?? '0') ?? 0n
    const t1 = parseMoneyToCents(shareOf(result, 'o1', 't1') ?? '0') ?? 0n
    expect(t3 > t1).toBe(true)
  })

  it('várias contas: cada uma fecha sozinha, sem arrastar centavo para a outra', () => {
    const result = allocateExpenses({
      expenses: [expense('o1', '10.00'), expense('o2', '0.07'), expense('o3', '99.99')],
      settings: settings({ administrative: 'equal' }),
      trips: [trip('t1'), trip('t2'), trip('t3')],
    })

    expect(totalCents(result, 'o1')).toBe(1_000n)
    expect(totalCents(result, 'o2')).toBe(7n)
    expect(totalCents(result, 'o3')).toBe(9_999n)
  })
})

describe('trocar o critério muda a divisão, não o total (CA08)', () => {
  it('a mesma conta, quatro critérios, o mesmo total rateado', () => {
    const trips = [
      trip('t1', { daysCount: 1, distanceMeters: 70_000, revenue: '900.00' }),
      trip('t2', { daysCount: 2, distanceMeters: 130_000, revenue: '2100.00' }),
      trip('t3', { daysCount: 4, distanceMeters: 50_000, revenue: '333.33' }),
    ]
    const divisions = new Set<string>()
    for (const criterion of ['per_km', 'per_trip_day', 'per_revenue', 'equal'] as const) {
      const result = allocateExpenses({
        expenses: [expense('o1', '1234.57')],
        settings: settings({ administrative: criterion }),
        trips,
      })
      expect(totalCents(result, 'o1')).toBe(123_457n)
      divisions.add(result.shares.map((s) => `${s.tripId}:${s.amount}`).join('|'))
    }

    expect(divisions.size).toBe(4)
  })
})

describe('viagem sem o dado do critério (ADR-0116 §2)', () => {
  it('peso zero fica com zero e as outras absorvem a parte', () => {
    const result = allocateExpenses({
      expenses: [expense('o1', '300.00')],
      settings: settings({ administrative: 'per_km' }),
      trips: [trip('t1', { distanceMeters: 0 }), trip('t2', { distanceMeters: 50_000 })],
    })

    expect(shareOf(result, 'o1', 't1') ?? '0.00').toBe('0.00')
    expect(shareOf(result, 'o1', 't2')).toBe('300.00')
  })

  it('todas as viagens com peso zero: a conta inteira vai a não rateado', () => {
    const result = allocateExpenses({
      expenses: [expense('o1', '300.00')],
      settings: settings({ administrative: 'per_km' }),
      trips: [trip('t1', { distanceMeters: 0 }), trip('t2', { distanceMeters: 0 })],
    })

    expect(result.shares.filter((s) => s.occurrenceId === 'o1')).toEqual([])
    expect(result.unallocated).toEqual([
      { amount: '300.00', occurrenceId: 'o1', reason: 'no_trip_weight', vehicleId: null },
    ])
  })

  it('sem nenhuma viagem no período: tudo é não rateado', () => {
    const result = allocateExpenses({
      expenses: [expense('o1', '300.00')],
      settings: settings(),
      trips: [],
    })

    expect(result.shares).toEqual([])
    expect(totalCents(result, 'o1')).toBe(30_000n)
  })
})

describe('conta com veículo só vai às viagens dele (CA09, ADR-0116 §3)', () => {
  const trips = [
    trip('t1', { vehicleId: 'v1' }),
    trip('t2', { vehicleId: 'v2' }),
    trip('t3', { vehicleId: 'v2' }),
  ]

  it('o seguro do v2 não aparece na viagem do v1, e a parte é do rateio do veículo', () => {
    const result = allocateExpenses({
      expenses: [expense('o1', '200.00', { costGroup: 'vehicle_fixed', vehicleId: 'v2' })],
      settings: settings({ vehicle_fixed: 'equal' }),
      trips,
    })

    expect(shareOf(result, 'o1', 't1')).toBeUndefined()
    expect(shareOf(result, 'o1', 't2')).toBe('100.00')
    expect(shareOf(result, 'o1', 't3')).toBe('100.00')
    expect(result.shares.every((s) => s.scope === 'vehicle')).toBe(true)
  })

  it('veículo sem viagem no período: não rateado, com o veículo nomeado', () => {
    const result = allocateExpenses({
      expenses: [expense('o1', '200.00', { costGroup: 'vehicle_fixed', vehicleId: 'v9' })],
      settings: settings({ vehicle_fixed: 'equal' }),
      trips,
    })

    expect(result.shares).toEqual([])
    expect(result.unallocated).toEqual([
      { amount: '200.00', occurrenceId: 'o1', reason: 'vehicle_without_trips', vehicleId: 'v9' },
    ])
  })

  it('conta sem veículo é dividida entre as viagens de todos os veículos, como rateio geral', () => {
    const result = allocateExpenses({
      expenses: [expense('o1', '300.00', { costGroup: 'vehicle_fixed' })],
      settings: settings({ vehicle_fixed: 'equal' }),
      trips,
    })

    expect(result.shares.map((s) => [s.tripId, s.amount, s.scope])).toEqual([
      ['t1', '100.00', 'general'],
      ['t2', '100.00', 'general'],
      ['t3', '100.00', 'general'],
    ])
  })
})

describe('o pagamento de motorista não é somado de novo (CA07, ADR-0116 §5)', () => {
  const driverPayment = (paid: string, included: string): AllocationExpense =>
    expense('o1', paid, {
      costGroup: 'in_trip',
      includedTripsAmount: included,
      payeeDriverId: 'd1',
    })
  const trips = [trip('t1'), trip('t2')]

  it('pagou exatamente as viagens incluídas: nada entra no rateio', () => {
    const result = allocateExpenses({
      expenses: [driverPayment('2800.00', '2800.00')],
      settings: settings(),
      trips,
    })

    expect(result.shares).toEqual([])
    expect(result.unallocated).toEqual([])
    expect(result.excesses).toEqual([])
  })

  it('pagou acima: só o excedente vira conta da empresa, no grupo administrativo', () => {
    const result = allocateExpenses({
      expenses: [driverPayment('3000.00', '2800.00')],
      settings: settings({ administrative: 'equal' }),
      trips,
    })

    expect(result.excesses).toEqual([{ amount: '200.00', occurrenceId: 'o1' }])
    expect(shareOf(result, 'o1', 't1')).toBe('100.00')
    expect(shareOf(result, 'o1', 't2')).toBe('100.00')
    expect(totalCents(result, 'o1')).toBe(20_000n)
  })

  it('pagou abaixo das viagens: sem crédito, o custo da viagem não diminui', () => {
    const result = allocateExpenses({
      expenses: [driverPayment('2500.00', '2800.00')],
      settings: settings(),
      trips,
    })

    expect(result.shares).toEqual([])
    expect(result.excesses).toEqual([])
  })

  it('sem viagem incluída o excedente é o valor inteiro', () => {
    const result = allocateExpenses({
      expenses: [driverPayment('1500.00', '0.00')],
      settings: settings({ administrative: 'equal' }),
      trips,
    })

    expect(result.excesses).toEqual([{ amount: '1500.00', occurrenceId: 'o1' }])
    expect(totalCents(result, 'o1')).toBe(150_000n)
  })
})

describe('bordas do serviço puro (T4.4)', () => {
  it('o valor do banco com quatro casas é aceito quando o centavo é exato', () => {
    const result = allocateExpenses({
      expenses: [expense('o1', '10.5000')],
      settings: settings({ administrative: 'per_revenue' }),
      trips: [trip('t1', { revenue: '1000.0000' }), trip('t2', { revenue: '3000.00' })],
    })

    expect(shareOf(result, 'o1', 't1')).toBe('2.62')
    expect(shareOf(result, 'o1', 't2')).toBe('7.88')
  })

  it('valor de conta ilegível ou com fração de centavo é recusado, nunca vira zero', () => {
    for (const amount of ['abc', '-1.00', '10.555', '10.5050']) {
      expect(() =>
        allocateExpenses({
          expenses: [expense('o1', amount)],
          settings: settings(),
          trips: [trip('t1')],
        }),
      ).toThrow()
    }
  })

  it('excedente sem viagem no período fica em não rateado, e segue listado como excedente', () => {
    const result = allocateExpenses({
      expenses: [
        expense('o1', '900.00', {
          costGroup: 'in_trip',
          includedTripsAmount: '0.00',
          payeeDriverId: 'd1',
        }),
      ],
      settings: settings(),
      trips: [],
    })

    expect(result.excesses).toEqual([{ amount: '900.00', occurrenceId: 'o1' }])
    expect(result.unallocated).toEqual([
      { amount: '900.00', occurrenceId: 'o1', reason: 'no_trip_weight', vehicleId: null },
    ])
  })

  it('o excedente de pagamento com veículo vai ao rateio geral, de todos os veículos', () => {
    const result = allocateExpenses({
      expenses: [
        expense('o1', '300.00', {
          costGroup: 'in_trip',
          includedTripsAmount: '100.00',
          payeeDriverId: 'd1',
          vehicleId: 'v1',
        }),
      ],
      settings: settings({ administrative: 'equal' }),
      trips: [trip('t1', { vehicleId: 'v1' }), trip('t2', { vehicleId: 'v2' })],
    })

    expect(result.shares.map((s) => [s.tripId, s.amount, s.scope])).toEqual([
      ['t1', '100.00', 'general'],
      ['t2', '100.00', 'general'],
    ])
  })

  it('pagamento sem a soma das viagens informada conta como sem viagem incluída', () => {
    const result = allocateExpenses({
      expenses: [expense('o1', '50.00', { costGroup: 'in_trip', payeeDriverId: 'd1' })],
      settings: settings({ administrative: 'equal' }),
      trips: [trip('t1')],
    })

    expect(result.excesses).toEqual([{ amount: '50.00', occurrenceId: 'o1' }])
    expect(shareOf(result, 'o1', 't1')).toBe('50.00')
  })

  it('a ordem de entrada das viagens não muda quem leva o centavo', () => {
    const trips = [trip('t2'), trip('t3'), trip('t1')]
    const forward = allocateExpenses({
      expenses: [expense('o1', '0.02')],
      settings: settings({ administrative: 'equal' }),
      trips,
    })
    const backward = allocateExpenses({
      expenses: [expense('o1', '0.02')],
      settings: settings({ administrative: 'equal' }),
      trips: [...trips].reverse(),
    })

    expect(forward.shares).toEqual(backward.shares)
    expect(forward.shares.map((s) => [s.tripId, s.amount])).toEqual([['t1', '0.02']])
  })

  it('peso fracionário de distância é arredondado ao metro, nunca descarta a viagem', () => {
    const result = allocateExpenses({
      expenses: [expense('o1', '100.00')],
      settings: settings({ administrative: 'per_km' }),
      trips: [trip('t1', { distanceMeters: 1000.4 }), trip('t2', { distanceMeters: 1000 })],
    })

    expect(shareOf(result, 'o1', 't1')).toBe('50.00')
    expect(shareOf(result, 'o1', 't2')).toBe('50.00')
  })
})
