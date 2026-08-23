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

/**
 * O veículo de dois tanques. Também **copiada literalmente** para o contrato do frontend, pelo mesmo
 * motivo: a média é o número que o operador confere, e ela é a que mais parece errada quando erra.
 */
const TWO_TANK_CASES = [
  // preço e consumo do primário, preço e consumo do secundário, parcela primária, secundária, média
  ['5.4800', '12.00', '4.2000', '8.00', '0.4567', '0.5250', '0.4909'],
  ['6.1230', '3.00', '0.7500', '2.00', '2.0410', '0.3750', '1.2080'],
  ['5.4801', '4.00', '5.4802', '4.00', '1.3700', '1.3701', '1.3701'],
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

  test.each(TWO_TANK_CASES)(
    'averages %s over %s with %s over %s as %s and %s, giving %s',
    (
      fuelPricePerUnit,
      averageConsumption,
      secondaryPricePerUnit,
      secondaryConsumption,
      primaryFuel,
      secondaryFuel,
      fuel,
    ) => {
      const derived = deriveCostPerKilometer({
        averageConsumption,
        fuelPricePerUnit,
        otherCostsPerKilometer: '0.0000',
        secondaryFuel: {
          averageConsumption: secondaryConsumption,
          pricePerUnit: secondaryPricePerUnit,
        },
      })

      expect(derived).toEqual({ breakdown: { fuel, primaryFuel, secondaryFuel }, total: fuel })
    },
  )

  // A média é o que entra na soma; as duas parcelas ficam ao lado para o número ter de onde vir
  test('names both tanks in the breakdown and adds only the average to the other costs', () => {
    const derived = deriveCostPerKilometer({
      averageConsumption: '12.00',
      fuelPricePerUnit: '5.4800',
      otherCostsPerKilometer: '0.5000',
      secondaryFuel: { averageConsumption: '8.00', pricePerUnit: '4.2000' },
    })

    expect(derived).toEqual({
      breakdown: {
        fuel: '0.4909',
        otherCosts: '0.5000',
        primaryFuel: '0.4567',
        secondaryFuel: '0.5250',
      },
      total: '0.9909',
    })
  })

  // Sem segundo tanque a conta é a de sempre: dividir por dois cortaria o custo do veículo ao meio
  test('keeps the single tank arithmetic when there is no second tank at all', () => {
    const derived = deriveCostPerKilometer({
      averageConsumption: '12.00',
      fuelPricePerUnit: '5.4800',
      otherCostsPerKilometer: '0.0000',
    })

    expect(derived).toEqual({ breakdown: { fuel: '0.4567' }, total: '0.4567' })
  })

  /**
   * O tanque secundário está no cadastro, mas ainda não há o que dividir: a energia sem tarifa e o
   * consumo em branco são o estado normal de uma ficha recém-preenchida. Meia parcela ali faria o
   * veículo parecer metade do preço enquanto ninguém completa o cadastro.
   */
  test.each([
    ['no price', { averageConsumption: '8.00', pricePerUnit: null }],
    ['no consumption', { averageConsumption: '0.00', pricePerUnit: '4.2000' }],
  ])('leaves the average out when the second tank has %s', (_case, secondaryFuel) => {
    const derived = deriveCostPerKilometer({
      averageConsumption: '12.00',
      fuelPricePerUnit: '5.4800',
      otherCostsPerKilometer: '0.0000',
      secondaryFuel,
    })

    expect(derived).toEqual({ breakdown: { fuel: '0.4567' }, total: '0.4567' })
    expect(derived?.breakdown).not.toHaveProperty('primaryFuel')
    expect(derived?.breakdown).not.toHaveProperty('secondaryFuel')
  })

  // O híbrido sem preço de diesel ainda anda com o segundo tanque, e é ele que responde sozinho
  test('answers with the second tank alone when the first one has no parcel', () => {
    const derived = deriveCostPerKilometer({
      averageConsumption: '12.00',
      fuelPricePerUnit: null,
      otherCostsPerKilometer: '0.0000',
      secondaryFuel: { averageConsumption: '8.00', pricePerUnit: '4.2000' },
    })

    expect(derived).toEqual({ breakdown: { fuel: '0.5250' }, total: '0.5250' })
  })

  test('returns null when neither tank has a parcel and there are no other costs', () => {
    expect(
      deriveCostPerKilometer({
        averageConsumption: '12.00',
        fuelPricePerUnit: null,
        otherCostsPerKilometer: '0.0000',
        secondaryFuel: { averageConsumption: '8.00', pricePerUnit: null },
      }),
    ).toBeNull()
  })

  // O consumo do segundo tanque é custo informado; sem ele a ficha ficaria com a data de custo vazia
  test('reports informed costs when only the second tank consumption is filled', () => {
    expect(
      hasInformedCosts({
        acquisitionAmount: '0.0000',
        annualInsuranceAmount: '0.0000',
        annualVehicleTaxAmount: '0.0000',
        averageConsumption: '0.00',
        monthlyInstallmentAmount: '0.0000',
        otherCostsPerKilometer: '0.0000',
        secondaryAverageConsumption: '8.00',
      }),
    ).toBe(true)
  })
})
