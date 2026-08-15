/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  deriveMonthlyFixedCost,
  hasInformedCosts,
} from '../../src/fleet/domain/vehicle-cost.policy'

describe('vehicle cost policy contract', () => {
  test('derives the monthly fixed cost as installment plus tax and insurance over twelve months', () => {
    const monthlyFixedCost = deriveMonthlyFixedCost({
      annualInsuranceAmount: '2400.0000',
      annualVehicleTaxAmount: '1200.0000',
      monthlyInstallmentAmount: '1500.0000',
    })

    expect(monthlyFixedCost).toBe('1800.0000')
  })

  test('rounds the yearly share half up without any floating point arithmetic', () => {
    const monthlyFixedCost = deriveMonthlyFixedCost({
      annualInsuranceAmount: '0.0000',
      annualVehicleTaxAmount: '1000.0000',
      monthlyInstallmentAmount: '0.0000',
    })

    expect(monthlyFixedCost).toBe('83.3333')
  })

  test('returns null when installment, tax and insurance are all zero', () => {
    const monthlyFixedCost = deriveMonthlyFixedCost({
      annualInsuranceAmount: '0.0000',
      annualVehicleTaxAmount: '0.0000',
      monthlyInstallmentAmount: '0.0000',
    })

    expect(monthlyFixedCost).toBeNull()
  })

  test('reports informed costs when any of the six cost fields is non-zero', () => {
    expect(
      hasInformedCosts({
        acquisitionAmount: '0.0000',
        annualInsuranceAmount: '0.0000',
        annualVehicleTaxAmount: '0.0000',
        averageConsumption: '3.50',
        costPerKilometer: '0.0000',
        monthlyInstallmentAmount: '0.0000',
      }),
    ).toBe(true)
  })

  test('reports no informed costs when every one of the six cost fields is zero', () => {
    expect(
      hasInformedCosts({
        acquisitionAmount: '0.0000',
        annualInsuranceAmount: '0.0000',
        annualVehicleTaxAmount: '0.0000',
        averageConsumption: '0.00',
        costPerKilometer: '0.0000',
        monthlyInstallmentAmount: '0.0000',
      }),
    ).toBe(false)
  })
})
