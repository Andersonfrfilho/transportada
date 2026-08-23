/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  loadFutureModule,
  VEHICLE_BODY,
  VEHICLE_COST_BREAKDOWN,
  VEHICLE_COST_DRAFT,
  VEHICLE_COST_PER_KILOMETER,
  VEHICLE_FUEL_PRICE,
  VEHICLE_MONTHLY_FIXED_COST,
  type FleetVehicleCostFieldsContract,
} from './fleet.fixture'

const COST_SERVICE_PATH = '../../src/modules/fleet/shared/fleetVehicleCost.service'
const FORM_SERVICE_PATH = '../../src/modules/fleet/shared/fleetForm.service'
const MONEY_SCALE = 4
const CONSUMPTION_SCALE = 2

/** O contrato é "moeda em pt-BR", não o espaço que o `Intl` escolhe entre símbolo e número. */
const currencyFormatter = new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' })

/**
 * A mesma tabela de T006, agora sobre o espelho da tela: preço, consumo, outros custos, parcela do
 * combustível e total. A divisão fecha na quarta casa **antes** da soma — inverter a ordem muda o
 * último dígito, e é esse dígito que o operador confere contra a planilha dele.
 */
const ROUNDING_CASES = [
  ['5.4800', '12.00', '0.5000', '0.4567', '0.9567'],
  ['6.1230', '3.00', '0.0000', '2.0410', '2.0410'],
  ['5.4802', '4.00', '0.0000', '1.3701', '1.3701'],
  ['5.4801', '4.00', '0.0000', '1.3700', '1.3700'],
  ['1.0000', '3.00', '0.0001', '0.3333', '0.3334'],
] as const

function derivationInput(input: {
  readonly averageConsumption: string
  readonly otherCostsPerKilometer: string
}): DeriveCostPerKilometerInputContract {
  return {
    fields: {
      averageConsumption: input.averageConsumption,
      otherCostsPerKilometer: input.otherCostsPerKilometer,
    },
    fuelPricePerUnit: null,
  }
}

describe('fleet vehicle cost per kilometer contract', () => {
  test('derives the cost per kilometer by the same rounding the api applies', async () => {
    const { deriveCostPerKilometer } = await loadFutureModule<FleetCostModule>(COST_SERVICE_PATH)

    for (const [fuelPricePerUnit, averageConsumption, otherCosts, fuel, total] of ROUNDING_CASES) {
      const derived = deriveCostPerKilometer({
        ...derivationInput({ averageConsumption, otherCostsPerKilometer: otherCosts }),
        fuelPricePerUnit,
      })

      expect(derived?.total).toBe(total)
      expect(derived?.breakdown.fuel).toBe(fuel)
    }
  })

  test('leaves the zero parcel out of the composition instead of writing it as zero', async () => {
    const { deriveCostPerKilometer } = await loadFutureModule<FleetCostModule>(COST_SERVICE_PATH)

    const withoutOtherCosts = deriveCostPerKilometer({
      ...derivationInput({ averageConsumption: '3.00', otherCostsPerKilometer: '0.0000' }),
      fuelPricePerUnit: '6.1230',
    })
    expect(withoutOtherCosts?.breakdown).toEqual({ fuel: '2.0410' })

    // Sem preço coletado a tela ainda tem o que mostrar: a parcela que o operador digitou
    const withoutFuel = deriveCostPerKilometer(
      derivationInput({ averageConsumption: '2.50', otherCostsPerKilometer: '0.5000' }),
    )
    expect(withoutFuel).toEqual({ breakdown: { otherCosts: '0.5000' }, total: '0.5000' })
  })

  test('has nothing to derive when neither parcel exists', async () => {
    const { deriveCostPerKilometer } = await loadFutureModule<FleetCostModule>(COST_SERVICE_PATH)

    expect(
      deriveCostPerKilometer(
        derivationInput({ averageConsumption: '2.50', otherCostsPerKilometer: '0.0000' }),
      ),
    ).toBe(null)
    // Preço sem consumo não divide: o veículo ainda não sabe quanto anda com um litro
    expect(
      deriveCostPerKilometer({
        ...derivationInput({ averageConsumption: '0.00', otherCostsPerKilometer: '0.0000' }),
        fuelPricePerUnit: VEHICLE_FUEL_PRICE.pricePerUnit,
      }),
    ).toBe(null)
  })

  test('keeps the other-costs field in the four-decimal scale on both sides', async () => {
    const { VEHICLE_COST_FIELD_SCALE } = await loadFutureModule<FleetCostModule>(COST_SERVICE_PATH)

    expect(VEHICLE_COST_FIELD_SCALE['otherCostsPerKilometer']).toEqual({
      api: MONEY_SCALE,
      form: MONEY_SCALE,
    })
    expect(VEHICLE_COST_FIELD_SCALE['averageConsumption']).toEqual({
      api: CONSUMPTION_SCALE,
      form: CONSUMPTION_SCALE,
    })
    // O total deixou de ser campo: escala de campo para ele seria promessa de edição
    expect(VEHICLE_COST_FIELD_SCALE['costPerKilometer']).toBeUndefined()
  })

  test('summarizes the composition, not only the total', async () => {
    const { summarizeVehicleCosts } = await loadFutureModule<FleetCostModule>(COST_SERVICE_PATH)

    expect(
      summarizeVehicleCosts({
        fields: VEHICLE_BODY,
        fuelPricePerUnit: VEHICLE_FUEL_PRICE.pricePerUnit,
        secondaryFuelPricePerUnit: null,
      }),
    ).toEqual({
      costPerKilometer: currencyFormatter.format(Number(VEHICLE_COST_PER_KILOMETER)),
      fuelCostPerKilometer: currencyFormatter.format(Number(VEHICLE_COST_BREAKDOWN.fuel)),
      monthlyFixedCost: currencyFormatter.format(Number(VEHICLE_MONTHLY_FIXED_COST)),
      otherCostsPerKilometer: currencyFormatter.format(Number(VEHICLE_COST_BREAKDOWN.otherCosts)),
      // Um tanque só: as parcelas ficam de fora, porque a média não é média de nada
      primaryFuelCostPerKilometer: null,
      secondaryFuelCostPerKilometer: null,
    })
    expect(
      summarizeVehicleCosts({
        fields: VEHICLE_COST_DRAFT,
        fuelPricePerUnit: null,
        secondaryFuelPricePerUnit: null,
      }),
    ).toEqual({
      costPerKilometer: null,
      fuelCostPerKilometer: null,
      monthlyFixedCost: null,
      otherCostsPerKilometer: null,
      primaryFuelCostPerKilometer: null,
      secondaryFuelCostPerKilometer: null,
    })
  })

  test('prints the fuel price with the four decimals the reference carries', async () => {
    const { formatFuelPricePerUnit } = await loadFutureModule<FleetCostModule>(COST_SERVICE_PATH)

    // R$ 5,48 e R$ 5,4802 dividem por consumo em números diferentes: o preço não arredonda na tela
    expect(formatFuelPricePerUnit(VEHICLE_FUEL_PRICE.pricePerUnit).replace(/\s/gu, ' ')).toBe(
      'R$ 5,4800',
    )
  })

  /**
   * O cadastro abre com os campos de custo em branco, e branco não é escala de API: somar o estado
   * cru derrubava a tela inteira em `INVALID_AMOUNT` no clique de "Novo veículo".
   */
  test('summarizes a form still being typed without throwing', async () => {
    const { summarizeTypedVehicleCosts } =
      await loadFutureModule<FleetCostModule>(COST_SERVICE_PATH)
    const { EMPTY_VEHICLE_FORM } = await loadFutureModule<FleetFormModule>(FORM_SERVICE_PATH)
    const empty = {
      costPerKilometer: null,
      fuelCostPerKilometer: null,
      monthlyFixedCost: null,
      otherCostsPerKilometer: null,
      primaryFuelCostPerKilometer: null,
      secondaryFuelCostPerKilometer: null,
    }

    expect(
      summarizeTypedVehicleCosts({
        fields: EMPTY_VEHICLE_FORM,
        fuelPricePerUnit: null,
        secondaryFuelPricePerUnit: null,
      }),
    ).toEqual(empty)
    expect(
      summarizeTypedVehicleCosts({
        fields: { ...EMPTY_VEHICLE_FORM, otherCostsPerKilometer: '1,' },
        fuelPricePerUnit: null,
        secondaryFuelPricePerUnit: null,
      }),
    ).toEqual(empty)
    // Meio preço também não derruba: o valor chega da consulta, mas o consumo ainda está pela metade
    expect(
      summarizeTypedVehicleCosts({
        fields: { ...EMPTY_VEHICLE_FORM, averageConsumption: '2,' },
        fuelPricePerUnit: VEHICLE_FUEL_PRICE.pricePerUnit,
        secondaryFuelPricePerUnit: null,
      }),
    ).toEqual(empty)

    const filled = summarizeTypedVehicleCosts({
      fields: {
        ...EMPTY_VEHICLE_FORM,
        annualInsuranceAmount: '3.600,00',
        annualVehicleTaxAmount: '1.200,00',
        averageConsumption: '2,50',
        monthlyInstallmentAmount: '2.000,00',
        otherCostsPerKilometer: '0,5000',
      },
      fuelPricePerUnit: VEHICLE_FUEL_PRICE.pricePerUnit,
      secondaryFuelPricePerUnit: null,
    })

    // O separador que o `Intl` põe depois de "R$" é espaço não separável, não espaço comum
    expect(filled.monthlyFixedCost?.replace(/\s/gu, ' ')).toBe('R$ 2.400,00')
    expect(filled.costPerKilometer?.replace(/\s/gu, ' ')).toBe('R$ 2,69')
    expect(filled.fuelCostPerKilometer?.replace(/\s/gu, ' ')).toBe('R$ 2,19')
  })
})

type DeriveCostPerKilometerInputContract = Readonly<{
  fields: Readonly<{ averageConsumption: string; otherCostsPerKilometer: string }>
  fuelPricePerUnit: null | string
}>

type DerivedCostPerKilometerContract = Readonly<{
  breakdown: Readonly<{ fuel?: string; otherCosts?: string }>
  total: string
}>

type FleetVehicleCostSummaryContract = Readonly<{
  costPerKilometer: null | string
  fuelCostPerKilometer: null | string
  monthlyFixedCost: null | string
  otherCostsPerKilometer: null | string
  primaryFuelCostPerKilometer: null | string
  secondaryFuelCostPerKilometer: null | string
}>

type FleetVehicleFormStateContract = Record<string, string>

type FleetCostModule = {
  readonly VEHICLE_COST_FIELD_SCALE: Readonly<
    Record<string, Readonly<{ api: number; form: number }> | undefined>
  >
  readonly deriveCostPerKilometer: (
    input: DeriveCostPerKilometerInputContract,
  ) => DerivedCostPerKilometerContract | null
  readonly formatFuelPricePerUnit: (value: string) => string
  readonly summarizeTypedVehicleCosts: (input: {
    readonly fields: FleetVehicleFormStateContract
    readonly fuelPricePerUnit: null | string
    readonly secondaryFuelPricePerUnit: null | string
  }) => FleetVehicleCostSummaryContract
  readonly summarizeVehicleCosts: (input: {
    readonly fields: FleetVehicleCostFieldsContract
    readonly fuelPricePerUnit: null | string
    readonly secondaryFuelPricePerUnit: null | string
  }) => FleetVehicleCostSummaryContract
}

type FleetFormModule = {
  readonly EMPTY_VEHICLE_FORM: FleetVehicleFormStateContract
}
