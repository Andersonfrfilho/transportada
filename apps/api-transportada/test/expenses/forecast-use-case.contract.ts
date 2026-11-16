/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T6.3 (RF21 a RF23, CA12, CA13, CA10): o caso de uso junta o resultado dos meses fechados, o calendário da
 * empresa e o limite configurável para a previsão e a lista de fora do padrão.
 */
import { describe, expect, it } from 'bun:test'

import {
  createGetExpenseForecastUseCase,
  createGetOutOfPatternSettingsUseCase,
  createUpdateOutOfPatternSettingsUseCase,
} from '../../src/expenses/application/expense-forecast.use-case.js'
import {
  aTrip,
  anOccurrence,
  CUSTOMER_1,
  RESULT_COMPANY_A,
  RESULT_COMPANY_B,
  VEHICLE_1,
} from '../fixtures/expense-result-in-memory.fixture.js'
import { buildInMemoryExpenseForecast } from '../fixtures/expense-forecast-in-memory.fixture.js'

/** Mês corrente da consulta; os fechados são 2026-05 a 2026-10 e o previsto é 2026-12. */
const MONTH = '2026-11'
const CLOSED = ['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05'] as const

function seedTrips(
  ports: ReturnType<typeof buildInMemoryExpenseForecast>,
  months: readonly string[],
  overrides: { cost?: string; revenue?: string } = {},
): void {
  for (const month of months) {
    ports.base.tripRows.push(
      aTrip({
        completedOn: `${month}-10`,
        cost: overrides.cost ?? '400.00',
        customerId: CUSTOMER_1,
        revenue: overrides.revenue ?? '1000.00',
        tripId: `trip-${month}`,
        vehicleId: VEHICLE_1,
      }),
    )
  }
}

function seedOccurrence(
  ports: ReturnType<typeof buildInMemoryExpenseForecast>,
  month: string,
  overrides: Parameters<typeof anOccurrence>[0] & { companyId?: string },
): void {
  ports.forecastOccurrences.push({ ...anOccurrence(overrides), competence: month })
}

describe('previsão do próximo mês (spec 325 T6.3, RF21/RF22, CA12)', () => {
  it('com menos de 3 meses de dado não há previsão, só o aviso', async () => {
    const ports = buildInMemoryExpenseForecast()
    seedTrips(ports, ['2026-10', '2026-09'])

    const result = await createGetExpenseForecastUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      month: MONTH,
    })

    expect(result.month).toBe(MONTH)
    expect(result.nextMonth).toBe('2026-12')
    expect(result.forecast.status).toBe('unavailable')
    expect(result.forecast.warning).toBe('few_data')
    expect(result.forecast.forecast).toBeNull()
    expect(result.forecast.monthsOfData).toBe(2)
  })

  it('com 6 meses prevê pela média por dia útil, soma as contas do mês previsto e a faixa contém o previsto', async () => {
    const ports = buildInMemoryExpenseForecast()
    seedTrips(ports, CLOSED)
    for (const month of CLOSED) ports.businessDays.set(month, 20)
    ports.businessDays.set('2026-12', 22)
    seedOccurrence(ports, '2026-12', {
      costGroup: 'administrative',
      expectedAmount: '200.00',
      occurrenceId: 'rent-dec',
    })

    const result = await createGetExpenseForecastUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      month: MONTH,
    })

    expect(result.forecast.status).toBe('ok')
    expect(result.forecast.warning).toBeNull()
    expect(result.forecast.monthsOfData).toBe(6)
    expect(result.nextMonthBusinessDays).toBe(22)
    expect(result.recurringExpenses).toBe('200.00')
    // 1000/20 = 50 por dia útil × 22; custo das viagens 20 × 22 = 440 + 200 de conta.
    expect(result.forecast.forecast?.revenue.expected).toBe('1100.00')
    expect(result.forecast.forecast?.cost.expected).toBe('640.00')
    expect(result.forecast.forecast?.profit.expected).toBe('460.00')
    const profit = result.forecast.forecast?.profit
    expect(Number(profit?.min)).toBeLessThanOrEqual(Number(profit?.expected))
    expect(Number(profit?.max)).toBeGreaterThanOrEqual(Number(profit?.expected))
  })

  it('3 a 5 meses mostram a previsão com o aviso', async () => {
    const ports = buildInMemoryExpenseForecast()
    seedTrips(ports, ['2026-10', '2026-09', '2026-08'])

    const result = await createGetExpenseForecastUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      month: MONTH,
    })

    expect(result.forecast.status).toBe('limited')
    expect(result.forecast.warning).toBe('few_data')
    expect(result.forecast.forecast).not.toBeNull()
  })

  it('pagamento de motorista (in_trip) já está no custo das viagens e não entra nas contas do mês previsto', async () => {
    const ports = buildInMemoryExpenseForecast()
    seedTrips(ports, CLOSED)
    seedOccurrence(ports, '2026-12', {
      costGroup: 'in_trip',
      expectedAmount: '900.00',
      occurrenceId: 'driver-dec',
    })
    seedOccurrence(ports, '2026-12', {
      costGroup: 'administrative',
      expectedAmount: '50.00',
      occurrenceId: 'canceled-dec',
      status: 'canceled',
    })

    const result = await createGetExpenseForecastUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      month: MONTH,
    })

    expect(result.recurringExpenses).toBe('0.00')
  })

  it('só lê a empresa do contexto (CA10)', async () => {
    const ports = buildInMemoryExpenseForecast()
    seedTrips(ports, CLOSED)
    ports.base.tripRows.push(
      aTrip({
        companyId: RESULT_COMPANY_B,
        completedOn: '2026-10-10',
        revenue: '99999.00',
        tripId: 'b',
      }),
    )

    const result = await createGetExpenseForecastUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      month: MONTH,
    })

    expect(result.forecast.forecast?.revenue.expected).not.toBe('99999.00')
    expect(ports.reads.every((read) => read.companyId === RESULT_COMPANY_A)).toBe(true)
    expect(ports.base.reads.every((read) => read.companyId === RESULT_COMPANY_A)).toBe(true)
  })
})

describe('fora do padrão (spec 325 T6.3, RF23, CA13)', () => {
  function seedRent(ports: ReturnType<typeof buildInMemoryExpenseForecast>, current: string): void {
    for (const month of ['2026-10', '2026-09', '2026-08']) {
      seedOccurrence(ports, month, {
        categoryId: 'cat-rent',
        expectedAmount: '1000.00',
        expenseId: 'rent',
        name: 'Aluguel do galpão',
        occurrenceId: `rent-${month}`,
      })
    }
    seedOccurrence(ports, MONTH, {
      categoryId: 'cat-rent',
      expectedAmount: current,
      expenseId: 'rent',
      name: 'Aluguel do galpão',
      occurrenceId: `rent-${MONTH}`,
    })
    ports.categoryNames.set('cat-rent', 'Aluguel')
  }

  it('conta e categoria acima do limite padrão de 10% aparecem com os dois valores e a diferença', async () => {
    const ports = buildInMemoryExpenseForecast()
    seedRent(ports, '1200.00')

    const result = await createGetExpenseForecastUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      month: MONTH,
    })

    expect(result.thresholdPercent).toBe(10)
    expect(result.outOfPattern).toEqual([
      {
        average: '1000.00',
        current: '1200.00',
        difference: '200.00',
        direction: 'above',
        key: 'rent',
        kind: 'expense',
        label: 'Aluguel do galpão',
      },
      {
        average: '1000.00',
        current: '1200.00',
        difference: '200.00',
        direction: 'above',
        key: 'cat-rent',
        kind: 'category',
        label: 'Aluguel',
      },
    ])
  })

  it('exatamente no limite não alerta, e o limite da empresa troca o resultado', async () => {
    const ports = buildInMemoryExpenseForecast()
    seedRent(ports, '1100.00')

    const atLimit = await createGetExpenseForecastUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      month: MONTH,
    })
    expect(atLimit.outOfPattern).toEqual([])

    ports.thresholds.set(RESULT_COMPANY_A, 5)
    const stricter = await createGetExpenseForecastUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      month: MONTH,
    })
    expect(stricter.thresholdPercent).toBe(5)
    expect(stricter.outOfPattern.map((alert) => alert.kind)).toEqual(['expense', 'category'])
  })

  it('o limite de outra empresa não vale', async () => {
    const ports = buildInMemoryExpenseForecast()
    seedRent(ports, '1200.00')
    ports.thresholds.set(RESULT_COMPANY_B, 50)

    const result = await createGetExpenseForecastUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      month: MONTH,
    })

    expect(result.thresholdPercent).toBe(10)
    expect(result.outOfPattern).toHaveLength(2)
  })

  it('conta com menos de 3 meses de histórico e pagamento de motorista não alertam', async () => {
    const ports = buildInMemoryExpenseForecast()
    seedOccurrence(ports, '2026-10', {
      expectedAmount: '100.00',
      expenseId: 'new',
      occurrenceId: 'n1',
    })
    seedOccurrence(ports, MONTH, { expectedAmount: '900.00', expenseId: 'new', occurrenceId: 'n2' })
    for (const month of ['2026-10', '2026-09', '2026-08']) {
      seedOccurrence(ports, month, {
        costGroup: 'in_trip',
        expectedAmount: '100.00',
        expenseId: 'driver',
        occurrenceId: `d-${month}`,
      })
    }
    seedOccurrence(ports, MONTH, {
      costGroup: 'in_trip',
      expectedAmount: '900.00',
      expenseId: 'driver',
      occurrenceId: 'd-now',
    })

    const result = await createGetExpenseForecastUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      month: MONTH,
    })

    expect(result.outOfPattern).toEqual([])
  })

  it('custo por km do veículo fora do padrão aparece com a placa; mês sem viagem é ausência, não zero', async () => {
    const ports = buildInMemoryExpenseForecast()
    // 100 km por viagem: R$ 1,00 por km nos três meses fechados, R$ 1,50 no corrente.
    seedTrips(ports, ['2026-10', '2026-09', '2026-08'], { cost: '100.00' })
    seedTrips(ports, [MONTH], { cost: '150.00' })
    ports.plates.set(VEHICLE_1, 'ABC1D23')

    const result = await createGetExpenseForecastUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      month: MONTH,
    })

    expect(result.outOfPattern).toEqual([
      {
        average: '1.00',
        current: '1.50',
        difference: '0.50',
        direction: 'above',
        key: VEHICLE_1,
        kind: 'vehicle_cost_per_km',
        label: 'ABC1D23',
      },
    ])
  })

  it('veículo que ficou sem viagem num dos meses não vira zero e não alerta', async () => {
    const ports = buildInMemoryExpenseForecast()
    seedTrips(ports, ['2026-10', '2026-08'], { cost: '100.00' })
    seedTrips(ports, [MONTH], { cost: '150.00' })

    const result = await createGetExpenseForecastUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      month: MONTH,
    })

    // Só 2 meses com custo por km: sem padrão (CA13: nada abaixo de 3 meses).
    expect(result.outOfPattern).toEqual([])
  })
})

describe('limite do fora do padrão por empresa (spec 325 T6.3, RF23)', () => {
  it('sem linha vale 10 e a troca grava o valor da empresa', async () => {
    const ports = buildInMemoryExpenseForecast()

    expect(
      await createGetOutOfPatternSettingsUseCase(ports).execute({ companyId: RESULT_COMPANY_A }),
    ).toBe(10)

    const saved = await createUpdateOutOfPatternSettingsUseCase(ports).execute({
      companyId: RESULT_COMPANY_A,
      correlationId: 'c1',
      thresholdPercent: 12.5,
      updatedBy: 'user-1',
    })

    expect(saved).toBe(12.5)
    expect(ports.thresholds.get(RESULT_COMPANY_A)).toBe(12.5)
    expect(ports.thresholds.has(RESULT_COMPANY_B)).toBe(false)
  })
})
