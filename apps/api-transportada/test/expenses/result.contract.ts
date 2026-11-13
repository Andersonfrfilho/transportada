/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.2 (ADR-0116 §3, §4, §6, §7; CA06, CA07, CA10): o resultado do período, calculado na leitura. O lucro é
 * faturamento − custo das viagens − contas, e a soma das margens por viagem, por veículo e por cliente fecha com ele.
 */
import { describe, expect, it } from 'bun:test'

import { createGetExpenseResultUseCase } from '../../src/expenses/application/expense-result.use-case.js'
import { parseMoneyToCents } from '../../src/expenses/domain/expense-money.policy.js'
import {
  aTrip,
  anOccurrence,
  buildInMemoryExpenseResult,
  CUSTOMER_1,
  CUSTOMER_2,
  RESULT_COMPANY_A,
  RESULT_COMPANY_B,
  VEHICLE_1,
  VEHICLE_2,
} from '../fixtures/expense-result-in-memory.fixture.js'

const PERIOD = { from: '2026-10-01', to: '2026-10-31' } as const
const cents = (value: string): bigint => parseMoneyToCents(value) ?? 0n

function sumCents(values: readonly string[]): bigint {
  return values.reduce((sum, value) => sum + cents(value), 0n)
}

function seed() {
  const ports = buildInMemoryExpenseResult()
  ports.tripRows.push(
    aTrip({
      cost: '300.00',
      customerId: CUSTOMER_1,
      revenue: '1000.00',
      tripId: 't1',
      vehicleId: VEHICLE_1,
    }),
    aTrip({
      cost: '500.00',
      customerId: CUSTOMER_2,
      revenue: '3000.00',
      tripId: 't2',
      vehicleId: VEHICLE_2,
    }),
    aTrip({
      cost: '100.00',
      customerId: CUSTOMER_1,
      revenue: '500.00',
      tripId: 't3',
      vehicleId: VEHICLE_2,
    }),
  )
  ports.occurrenceRows.push(
    anOccurrence({ costGroup: 'administrative', expectedAmount: '1000.01', occurrenceId: 'rent' }),
    anOccurrence({
      costGroup: 'vehicle_fixed',
      expectedAmount: '400.00',
      occurrenceId: 'insurance-v2',
      vehicleId: VEHICLE_2,
    }),
  )
  return ports
}

describe('o lucro fecha com as margens (CA06)', () => {
  it('lucro = faturamento − custo das viagens − contas, e a margem por viagem soma o mesmo', async () => {
    const result = await createGetExpenseResultUseCase(seed()).execute({
      companyId: RESULT_COMPANY_A,
      ...PERIOD,
    })

    expect(result.totals.revenue).toBe('4500.00')
    expect(result.totals.tripCost).toBe('900.00')
    expect(result.totals.expensesTotal).toBe('1400.01')
    expect(result.totals.profit).toBe('2199.99')
    expect(sumCents(result.byTrip.map((l) => l.margin)) - cents(result.unallocatedTotal)).toBe(
      cents(result.totals.profit),
    )
  })

  it('por veículo e por cliente a soma também fecha com o lucro (diferença só do não rateado)', async () => {
    const result = await createGetExpenseResultUseCase(seed()).execute({
      companyId: RESULT_COMPANY_A,
      ...PERIOD,
    })
    const profit = cents(result.totals.profit)
    const unallocated = cents(result.unallocatedTotal)

    expect(sumCents(result.byVehicle.map((l) => l.margin)) - unallocated).toBe(profit)
    expect(sumCents(result.byCustomer.map((l) => l.margin)) - unallocated).toBe(profit)
    expect(
      sumCents(result.byTrip.map((l) => l.vehicleShare)) +
        sumCents(result.byTrip.map((l) => l.generalShare)),
    ).toBe(cents(result.totals.expensesTotal) - unallocated)
  })

  it('o rateio do veículo e o geral saem em colunas separadas', async () => {
    const result = await createGetExpenseResultUseCase(seed()).execute({
      companyId: RESULT_COMPANY_A,
      ...PERIOD,
    })
    const t1 = result.byTrip.find((l) => l.id === 't1')

    expect(t1?.vehicleShare).toBe('0.00')
    expect(cents(t1?.generalShare ?? '0')).toBeGreaterThan(0n)
    expect(cents(result.byTrip.find((l) => l.id === 't2')?.vehicleShare ?? '0')).toBeGreaterThan(0n)
  })

  it('conta de veículo sem viagem no período sai em não rateado e o lucro ainda desconta', async () => {
    const ports = seed()
    ports.occurrenceRows.push(
      anOccurrence({
        costGroup: 'vehicle_fixed',
        expectedAmount: '250.00',
        occurrenceId: 'ghost',
        vehicleId: 'v9',
      }),
    )

    const result = await createGetExpenseResultUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      ...PERIOD,
    })

    expect(result.unallocatedTotal).toBe('250.00')
    expect(result.totals.profit).toBe('1949.99')
  })
})

describe('o valor da conta e quem entra (ADR-0116 §3)', () => {
  it('conta baixada vale o pago, não o previsto', async () => {
    const ports = buildInMemoryExpenseResult()
    ports.tripRows.push(aTrip({ revenue: '1000.00', tripId: 't1' }))
    ports.occurrenceRows.push(
      anOccurrence({
        expectedAmount: '100.00',
        occurrenceId: 'o1',
        paidAmount: '120.00',
        status: 'paid',
      }),
    )

    const result = await createGetExpenseResultUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      ...PERIOD,
    })

    expect(result.totals.expensesTotal).toBe('120.00')
    expect(result.totals.profit).toBe('880.00')
  })

  it('conta cancelada não entra', async () => {
    const ports = buildInMemoryExpenseResult()
    ports.tripRows.push(aTrip({ revenue: '1000.00', tripId: 't1' }))
    ports.occurrenceRows.push(
      anOccurrence({ expectedAmount: '100.00', occurrenceId: 'o1', status: 'canceled' }),
    )

    const result = await createGetExpenseResultUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      ...PERIOD,
    })

    expect(result.totals.expensesTotal).toBe('0.00')
    expect(result.totals.profit).toBe('1000.00')
  })

  it('só entram as viagens concluídas no período pedido', async () => {
    const ports = seed()
    ports.tripRows.push(aTrip({ completedOn: '2026-09-30', revenue: '9999.00', tripId: 'old' }))

    const result = await createGetExpenseResultUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      ...PERIOD,
    })

    expect(result.byTrip.map((l) => l.id).sort()).toEqual(['t1', 't2', 't3'])
    expect(result.totals.revenue).toBe('4500.00')
  })
})

describe('pagamento de motorista não altera custo nem lucro (CA07)', () => {
  it('com as viagens incluídas, o resultado é o mesmo de antes de existir o pagamento', async () => {
    const without = seed()
    const withPayment = seed()
    withPayment.occurrenceRows.push(
      anOccurrence({
        costGroup: 'in_trip',
        expectedAmount: '800.00',
        includedTripsAmount: '800.00',
        occurrenceId: 'driver-pay',
        payeeDriverId: 'd1',
      }),
    )

    const before = await createGetExpenseResultUseCase(without).execute({
      companyId: RESULT_COMPANY_A,
      ...PERIOD,
    })
    const after = await createGetExpenseResultUseCase(withPayment).execute({
      companyId: RESULT_COMPANY_A,
      ...PERIOD,
    })

    expect(after.totals).toEqual(before.totals)
    expect(after.byTrip).toEqual(before.byTrip)
  })

  it('o excedente do pagamento reduz o lucro uma única vez', async () => {
    const ports = seed()
    ports.occurrenceRows.push(
      anOccurrence({
        costGroup: 'in_trip',
        expectedAmount: '1000.00',
        includedTripsAmount: '800.00',
        occurrenceId: 'driver-pay',
        payeeDriverId: 'd1',
      }),
    )

    const result = await createGetExpenseResultUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      ...PERIOD,
    })

    expect(result.totals.expensesTotal).toBe('1600.01')
    expect(result.totals.profit).toBe('1999.99')
  })
})

describe('isolamento por empresa (CA10)', () => {
  it('a empresa A não vê viagem nem conta da B, nem no total nem nas linhas', async () => {
    const ports = seed()
    ports.tripRows.push(
      aTrip({ companyId: RESULT_COMPANY_B, revenue: '77777.00', tripId: 'b-trip' }),
    )
    ports.occurrenceRows.push(
      anOccurrence({
        companyId: RESULT_COMPANY_B,
        expectedAmount: '55555.00',
        occurrenceId: 'b-rent',
      }),
    )

    const result = await createGetExpenseResultUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      ...PERIOD,
    })

    expect(result.byTrip.map((l) => l.id)).not.toContain('b-trip')
    expect(result.totals.revenue).toBe('4500.00')
    expect(result.totals.expensesTotal).toBe('1400.01')
    expect(ports.reads.every((r) => r.companyId === RESULT_COMPANY_A)).toBe(true)
  })
})

describe('o critério da empresa vale na leitura (ADR-0116 §2, §4)', () => {
  it('a mesma conta muda de divisão com o critério, e o total rateado não muda (CA08)', async () => {
    const run = async (criterion?: 'equal' | 'per_revenue') => {
      const ports = seed()
      if (criterion !== undefined)
        ports.settingsRows.set(RESULT_COMPANY_A, { administrative: criterion })
      return createGetExpenseResultUseCase(ports).execute({
        companyId: RESULT_COMPANY_A,
        ...PERIOD,
      })
    }

    const byRevenue = await run('per_revenue')
    const equal = await run('equal')

    expect(byRevenue.totals).toEqual(equal.totals)
    expect(byRevenue.byTrip.map((l) => l.generalShare)).not.toEqual(
      equal.byTrip.map((l) => l.generalShare),
    )
  })

  it('sem configuração, o administrativo usa o faturamento (padrão do RF11)', async () => {
    const result = await createGetExpenseResultUseCase(seed()).execute({
      companyId: RESULT_COMPANY_A,
      ...PERIOD,
    })
    const t2 = result.byTrip.find((l) => l.id === 't2')
    const t1 = result.byTrip.find((l) => l.id === 't1')

    // t2 faturou 3x o t1: a parte geral dele é maior.
    expect(cents(t2?.generalShare ?? '0')).toBeGreaterThan(cents(t1?.generalShare ?? '0'))
  })
})
