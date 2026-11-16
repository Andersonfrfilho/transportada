/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T4.6 (RF18, ADR-0116 §4): os filtros escolhem o que aparece e soma; **nunca** mudam o rateio. A margem de uma
 * viagem é a mesma com ou sem filtro, e o que sobra na tela continua fechando conta.
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
  VEHICLE_1,
  VEHICLE_2,
} from '../fixtures/expense-result-in-memory.fixture.js'

const PERIOD = { from: '2026-10-01', to: '2026-10-31' } as const
const CATEGORY_RENT = 'category-rent'
const CATEGORY_INSURANCE = 'category-insurance'
const DRIVER_1 = '00000000-0000-4000-8000-00000000d001'
const cents = (value: string): bigint => {
  const negative = value.startsWith('-')
  const parsed = parseMoneyToCents(negative ? value.slice(1) : value) ?? 0n
  return negative ? -parsed : parsed
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
    anOccurrence({
      categoryId: CATEGORY_RENT,
      costGroup: 'administrative',
      expectedAmount: '1000.01',
      occurrenceId: 'rent',
    }),
    anOccurrence({
      categoryId: CATEGORY_INSURANCE,
      costGroup: 'vehicle_fixed',
      expectedAmount: '400.00',
      occurrenceId: 'insurance-v2',
      vehicleId: VEHICLE_2,
    }),
    anOccurrence({
      categoryId: CATEGORY_INSURANCE,
      costGroup: 'vehicle_fixed',
      expectedAmount: '90.00',
      occurrenceId: 'insurance-v1',
      vehicleId: VEHICLE_1,
    }),
    anOccurrence({
      categoryId: 'category-driver',
      costGroup: 'in_trip',
      expectedAmount: '120.00',
      includedTripsAmount: '100.00',
      occurrenceId: 'driver-pay',
      payeeDriverId: DRIVER_1,
    }),
  )
  return createGetExpenseResultUseCase(ports)
}

const run = (filters?: Parameters<ReturnType<typeof seed>['execute']>[0]['filters']) =>
  seed().execute({
    companyId: RESULT_COMPANY_A,
    ...(filters === undefined ? {} : { filters }),
    ...PERIOD,
  })

describe('filtros do resultado (spec 325 RF18)', () => {
  it('sem filtro o resultado não ganha o campo filters', async () => {
    expect('filters' in (await run())).toBe(false)
    expect('filters' in (await run({}))).toBe(false)
  })

  it('o filtro de veículo mostra só as viagens dele, com a mesma margem de antes (o rateio não muda)', async () => {
    const all = await run()
    const filtered = await run({ vehicleId: VEHICLE_2 })

    expect(filtered.byTrip.map((l) => l.id).sort()).toEqual(['t2', 't3'])
    expect(filtered.byVehicle.map((l) => l.id)).toEqual([VEHICLE_2])
    for (const line of filtered.byTrip) {
      expect(line).toEqual(all.byTrip.find((l) => l.id === line.id)!)
    }
    expect(filtered.filters).toEqual({ vehicleId: VEHICLE_2 })
  })

  it('o filtro de cliente mostra só as viagens do cliente e as linhas dele', async () => {
    const all = await run()
    const filtered = await run({ customerId: CUSTOMER_1 })

    expect(filtered.byTrip.map((l) => l.id).sort()).toEqual(['t1', 't3'])
    expect(filtered.byCustomer).toEqual(all.byCustomer.filter((l) => l.id === CUSTOMER_1))
    expect(filtered.totals.revenue).toBe('1500.00')
    expect(filtered.totals.tripCost).toBe('400.00')
  })

  it('o filtro de categoria restringe as contas: o total é só o dessa categoria, rateado como sempre', async () => {
    const all = await run()
    const filtered = await run({ categoryId: CATEGORY_INSURANCE })

    expect(filtered.totals.expensesTotal).toBe('490.00')
    // As viagens continuam todas; só as contas mudam.
    expect(filtered.byTrip.map((l) => l.id).sort()).toEqual(['t1', 't2', 't3'])
    for (const line of filtered.byTrip) {
      expect(cents(line.generalShare)).toBe(0n)
      expect(line.vehicleShare).toBe(all.byTrip.find((l) => l.id === line.id)!.vehicleShare)
    }
  })

  it('o filtro de motorista deixa só as contas dele (o excedente do pagamento)', async () => {
    const filtered = await run({ payeeDriverId: DRIVER_1 })

    expect(filtered.totals.expensesTotal).toBe('20.00')
    expect(filtered.excesses?.map((e) => e.occurrenceId)).toEqual(['driver-pay'])
    expect(filtered.unallocatedTotal).toBe('0.00')
  })

  it('os filtros se combinam (veículo + categoria)', async () => {
    const filtered = await run({ categoryId: CATEGORY_INSURANCE, vehicleId: VEHICLE_1 })

    expect(filtered.byTrip.map((l) => l.id)).toEqual(['t1'])
    expect(filtered.totals.expensesTotal).toBe('90.00')
    expect(filtered.byTrip[0]?.vehicleShare).toBe('90.00')
  })

  it('o que sobra fecha: margens − não rateado = lucro, com qualquer filtro', async () => {
    const cases = [
      {},
      { vehicleId: VEHICLE_1 },
      { customerId: CUSTOMER_2 },
      { categoryId: CATEGORY_RENT },
      { payeeDriverId: DRIVER_1 },
      { customerId: CUSTOMER_1, vehicleId: VEHICLE_2 },
    ]
    for (const filters of cases) {
      const result = await run(filters)
      const margins = result.byTrip.reduce((sum, line) => sum + cents(line.margin), 0n)

      expect(margins - cents(result.unallocatedTotal)).toBe(cents(result.totals.profit))
      for (const grouping of [result.byVehicle, result.byCustomer]) {
        expect(grouping.reduce((sum, line) => sum + cents(line.margin), 0n)).toBe(margins)
      }
    }
  })

  it('sem filtro o total de contas é a soma das viagens e do não rateado', async () => {
    const all = await run()
    expect(all.totals.expensesTotal).toBe('1510.01')
    expect(cents(all.totals.expensesTotal)).toBe(
      all.byTrip.reduce((sum, l) => sum + cents(l.vehicleShare) + cents(l.generalShare), 0n) +
        cents(all.unallocatedTotal),
    )
  })

  it('cliente que não tem viagem no período devolve resultado vazio, não erro', async () => {
    const result = await run({ customerId: 'sem-cliente' })

    expect(result.byTrip).toEqual([])
    expect(result.totals.profit).toBe('0.00')
  })
})
