/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  deriveCostPerKilometer,
  deriveMonthlyFixedCost,
  hasInformedCosts,
} from '../../src/fleet/domain/vehicle-cost.policy'

/**
 * Tabela de arredondamento do R$/km. É **copiada literalmente** para
 * `frontend/test/fleet/vehicleCost.contract.ts`: as duas apps não compartilham código, e a paridade
 * do número que o operador lê na tela só existe se for assertada dos dois lados.
 */
const ROUNDING_CASES = [
  // preço, consumo, outros custos, parcela do combustível, total
  ['5.4800', '12.00', '0.5000', '0.4567', '0.9567'],
  ['6.1230', '3.00', '0.0000', '2.0410', '2.0410'],
  ['5.4802', '4.00', '0.0000', '1.3701', '1.3701'],
  ['5.4801', '4.00', '0.0000', '1.3700', '1.3700'],
  ['1.0000', '3.00', '0.0001', '0.3333', '0.3334'],
] as const

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
        monthlyInstallmentAmount: '0.0000',
        otherCostsPerKilometer: '0.0000',
      }),
    ).toBe(true)
  })

  // O custo por quilômetro deixou de ser digitado: quem informa agora é a parcela de outros custos
  test('reads the other costs per kilometer where it used to read the cost per kilometer', () => {
    expect(
      hasInformedCosts({
        acquisitionAmount: '0.0000',
        annualInsuranceAmount: '0.0000',
        annualVehicleTaxAmount: '0.0000',
        averageConsumption: '0.00',
        monthlyInstallmentAmount: '0.0000',
        otherCostsPerKilometer: '0.5000',
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
        monthlyInstallmentAmount: '0.0000',
        otherCostsPerKilometer: '0.0000',
      }),
    ).toBe(false)
  })

  test.each(ROUNDING_CASES)(
    'derives %s per unit over %s of consumption plus %s of other costs as %s, totalling %s',
    (fuelPricePerUnit, averageConsumption, otherCostsPerKilometer, fuel, total) => {
      const derived = deriveCostPerKilometer({
        averageConsumption,
        fuelPricePerUnit,
        otherCostsPerKilometer,
      })

      expect(derived?.total).toBe(total)
      expect(derived?.breakdown.fuel).toBe(fuel)
    },
  )

  // A divisão fecha na quarta casa antes de somar — arredondar o total esconderia a parcela
  test('rounds the division before adding the other costs', () => {
    const derived = deriveCostPerKilometer({
      averageConsumption: '3.00',
      fuelPricePerUnit: '1.0000',
      otherCostsPerKilometer: '0.0001',
    })

    expect(derived).toEqual({
      breakdown: { fuel: '0.3333', otherCosts: '0.0001' },
      total: '0.3334',
    })
  })

  // Um "0.0000" na composição diria que a manutenção custa zero; a ausência é a informação
  test('leaves a zero parcel out of the breakdown instead of writing it as zero', () => {
    const derived = deriveCostPerKilometer({
      averageConsumption: '12.00',
      fuelPricePerUnit: '5.4800',
      otherCostsPerKilometer: '0.0000',
    })

    expect(derived).toEqual({ breakdown: { fuel: '0.4567' }, total: '0.4567' })
    expect(derived?.breakdown).not.toHaveProperty('otherCosts')
  })

  test('answers only the other costs parcel when the consumption is zero', () => {
    const derived = deriveCostPerKilometer({
      averageConsumption: '0.00',
      fuelPricePerUnit: '5.4800',
      otherCostsPerKilometer: '0.5000',
    })

    expect(derived).toEqual({ breakdown: { otherCosts: '0.5000' }, total: '0.5000' })
    expect(derived?.breakdown).not.toHaveProperty('fuel')
  })

  test('answers only the other costs parcel when the fuel has no price at all', () => {
    const derived = deriveCostPerKilometer({
      averageConsumption: '12.00',
      fuelPricePerUnit: null,
      otherCostsPerKilometer: '0.5000',
    })

    expect(derived).toEqual({ breakdown: { otherCosts: '0.5000' }, total: '0.5000' })
  })

  test('returns null when there is neither a fuel parcel nor an other costs parcel', () => {
    expect(
      deriveCostPerKilometer({
        averageConsumption: '12.00',
        fuelPricePerUnit: null,
        otherCostsPerKilometer: '0.0000',
      }),
    ).toBeNull()

    expect(
      deriveCostPerKilometer({
        averageConsumption: '0.00',
        fuelPricePerUnit: '5.4800',
        otherCostsPerKilometer: '0.0000',
      }),
    ).toBeNull()
  })
})
