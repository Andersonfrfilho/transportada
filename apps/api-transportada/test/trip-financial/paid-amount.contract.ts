/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { buildCrewCostParcels } from '../../src/trips/domain/trip-crew-cost.policy.js'
import { buildTripDriverCost } from '../../src/trips/domain/trip-driver-cost.policy.js'
import { buildTripHelperCost } from '../../src/trips/domain/trip-helper-cost.policy.js'
import { VALUATION_GAPS } from '../../src/trips/domain/trip-valuation.policy.js'

const HOUR = 3600
const ana = {
  driverAmount: null,
  driverId: 'ana',
  driverName: 'Ana',
  paymentModel: 'route_table',
} as const

/** Spec 327: o valor combinado vence a diária × dias; sem valor, a conta é a de sempre. */
describe('o valor pago informado na criação da viagem (spec 327)', () => {
  test('motorista sem valor informado mantém a diária estimada de sempre', () => {
    const parcel = buildTripDriverCost({
      companyDailyAmount: null,
      crew: [ana],
      days: { of: 'estimated', value: 1 },
    })

    expect(parcel.amount).toBe('200.0000')
    expect(parcel.source).toBe('estimated')
  })

  test('motorista com valor informado paga esse valor e a parcela é medida', () => {
    const parcel = buildTripDriverCost({
      companyDailyAmount: null,
      crew: [{ ...ana, paidAmount: '250.0000' }],
      days: { of: 'estimated', value: 3 },
    })

    expect(parcel.amount).toBe('250.0000')
    expect(parcel.source).toBe('measured')
    expect(parcel.basis).toEqual({
      crew: [
        {
          dailyAmount: '250.0000',
          driverId: 'ana',
          driverName: 'Ana',
          paymentModel: 'route_table',
          rateOrigin: 'informed',
          subtotal: '250.0000',
        },
      ],
      days: 3,
      daysOrigin: 'estimated',
      of: 'driver',
    })
  })

  test('zero informado é valor (viagem sem pagamento), não ausência', () => {
    const parcel = buildTripDriverCost({
      companyDailyAmount: null,
      crew: [{ ...ana, paidAmount: '0.0000' }],
      days: { of: 'estimated', value: 2 },
    })

    expect(parcel.amount).toBe('0.0000')
    expect(parcel.source).toBe('measured')
  })

  test('com valor para todos, a duração desconhecida deixa de ser lacuna', () => {
    const informed = buildTripDriverCost({
      companyDailyAmount: null,
      crew: [{ ...ana, paidAmount: '180.0000' }],
      days: { of: 'unknown' },
    })
    const mixed = buildTripDriverCost({
      companyDailyAmount: null,
      crew: [
        { ...ana, paidAmount: '180.0000' },
        { ...ana, driverId: 'bia' },
      ],
      days: { of: 'unknown' },
    })

    expect(informed.amount).toBe('180.0000')
    expect(informed.gap).toBeNull()
    expect(mixed.gap).toBe(VALUATION_GAPS.noPlannedDuration)
  })

  test('um motorista informado e outro não: soma o combinado com a diária do outro', () => {
    const parcel = buildTripDriverCost({
      companyDailyAmount: null,
      crew: [
        { ...ana, paidAmount: '300.0000' },
        { ...ana, driverId: 'bia' },
      ],
      days: { of: 'informed', value: 2 },
    })

    expect(parcel.amount).toBe('700.0000')
  })

  test('ajudante com valor informado paga esse valor, mesmo sem diária nem jornada', () => {
    const parcel = buildTripHelperCost({
      companyDailyRate: null,
      helpers: [{ driverId: 'h1', ownDailyRate: null, paidAmount: '90.0000' }],
      journeyIncludesReturn: null,
      journeySeconds: null,
    })

    expect(parcel.amount).toBe('90.0000')
    expect(parcel.gap).toBeNull()
    expect(parcel.source).toBe('measured')
    expect(parcel.basis).toEqual({
      crew: [
        { dailyAmount: '90.0000', driverId: 'h1', rateOrigin: 'informed', subtotal: '90.0000' },
      ],
      days: 1,
      of: 'helper',
    })
  })

  test('ajudante sem valor informado segue a regra da 149 (diária própria ou geral × dias)', () => {
    const parcel = buildTripHelperCost({
      companyDailyRate: '120.0000',
      helpers: [
        { driverId: 'h1', ownDailyRate: null, paidAmount: '90.0000' },
        { driverId: 'h2', ownDailyRate: null },
      ],
      journeyIncludesReturn: true,
      journeySeconds: 30 * HOUR,
    })

    expect(parcel.amount).toBe('330.0000')
  })

  test('as duas parcelas da tripulação aceitam o valor pela mesma função da avaliação', () => {
    const [driver, helper] = buildCrewCostParcels({
      crew: [{ ...ana, paidAmount: '250.0000' }],
      dailyAllowanceDays: 1,
      helperCrew: [{ driverId: 'h1', ownDailyRate: null, paidAmount: '100.0000' }],
    })

    expect(driver?.amount).toBe('250.0000')
    expect(helper?.amount).toBe('100.0000')
  })
})
