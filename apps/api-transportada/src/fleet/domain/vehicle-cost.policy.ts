/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  divideHalfUp,
  formatScaledDecimal,
  MONEY_SCALE,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'

const MONTHS_PER_YEAR = 12n
const PARCELS_IN_A_PAIR = 2n
const CONSUMPTION_SCALE = 2n
const CONSUMPTION_FACTOR = 10n ** CONSUMPTION_SCALE
const ZERO_MONEY = '0.0000'
const ZERO_CONSUMPTION = '0.00'

export type FleetVehicleCostFields = {
  readonly acquisitionAmount: string
  readonly annualInsuranceAmount: string
  readonly annualVehicleTaxAmount: string
  readonly averageConsumption: string
  readonly monthlyInstallmentAmount: string
  readonly otherCostsPerKilometer: string
  readonly secondaryAverageConsumption?: string
}

export type CostPerKilometerBreakdown = {
  readonly fuel?: string
  readonly otherCosts?: string
  readonly primaryFuel?: string
  readonly secondaryFuel?: string
}

export type DerivedCostPerKilometer = {
  readonly breakdown: CostPerKilometerBreakdown
  readonly total: string
}

type FuelTankInput = {
  readonly averageConsumption: string
  readonly pricePerUnit: string | null
}

type DeriveCostPerKilometerInput = Pick<
  FleetVehicleCostFields,
  'averageConsumption' | 'otherCostsPerKilometer'
> & {
  readonly fuelPricePerUnit: string | null
  readonly secondaryFuel?: FuelTankInput
}

type DeriveMonthlyFixedCostInput = Pick<
  FleetVehicleCostFields,
  'annualInsuranceAmount' | 'annualVehicleTaxAmount' | 'monthlyInstallmentAmount'
>

export function deriveMonthlyFixedCost(input: DeriveMonthlyFixedCostInput): string | null {
  if (
    input.monthlyInstallmentAmount === ZERO_MONEY &&
    input.annualVehicleTaxAmount === ZERO_MONEY &&
    input.annualInsuranceAmount === ZERO_MONEY
  ) {
    return null
  }

  const installment = parseMoney(input.monthlyInstallmentAmount)
  const annualVehicleTax = parseMoney(input.annualVehicleTaxAmount)
  const annualInsurance = parseMoney(input.annualInsuranceAmount)
  const monthlyFixedCost =
    installment + divideHalfUp(annualVehicleTax + annualInsurance, MONTHS_PER_YEAR)

  return formatScaledDecimal(monthlyFixedCost, MONEY_SCALE)
}

/**
 * O R$/km deixou de ser digitado: ele é o preço do combustível dividido pelo consumo, mais a parcela
 * de outros custos por quilômetro. A divisão fecha na quarta casa **antes** da soma, e parcela
 * zerada fica de fora da composição — um `"0.0000"` ali diria que aquele custo é zero, quando o que
 * houve foi não ter sido informado.
 *
 * O veículo de dois tanques tem duas parcelas de combustível, e a que vale é a **média** delas: o
 * quanto ele rodou com cada uma é o que decidiria a proporção, e isso ninguém registra — pedir o
 * rateio ao operador seria pedir um número que ele também estimaria. As duas ficam nomeadas na
 * composição, senão a média aparece como um valor que não é o preço de nenhum dos dois combustíveis.
 */
export function deriveCostPerKilometer(
  input: DeriveCostPerKilometerInput,
): DerivedCostPerKilometer | null {
  const primaryFuel = deriveFuelParcel({
    averageConsumption: input.averageConsumption,
    pricePerUnit: input.fuelPricePerUnit,
  })
  const secondaryFuel =
    input.secondaryFuel === undefined ? null : deriveFuelParcel(input.secondaryFuel)
  const fuel = averageFuelParcels(primaryFuel, secondaryFuel)
  const otherCosts =
    input.otherCostsPerKilometer === ZERO_MONEY ? null : input.otherCostsPerKilometer

  if (fuel === null && otherCosts === null) return null

  const total = parseMoney(fuel ?? ZERO_MONEY) + parseMoney(otherCosts ?? ZERO_MONEY)
  const drinksFromBothTanks = primaryFuel !== null && secondaryFuel !== null

  return {
    breakdown: {
      ...(fuel === null ? {} : { fuel }),
      ...(otherCosts === null ? {} : { otherCosts }),
      ...(drinksFromBothTanks ? { primaryFuel, secondaryFuel } : {}),
    },
    total: formatScaledDecimal(total, MONEY_SCALE),
  }
}

export function hasInformedCosts(fields: FleetVehicleCostFields): boolean {
  return !(
    fields.averageConsumption === ZERO_CONSUMPTION &&
    (fields.secondaryAverageConsumption ?? ZERO_CONSUMPTION) === ZERO_CONSUMPTION &&
    fields.otherCostsPerKilometer === ZERO_MONEY &&
    fields.acquisitionAmount === ZERO_MONEY &&
    fields.monthlyInstallmentAmount === ZERO_MONEY &&
    fields.annualVehicleTaxAmount === ZERO_MONEY &&
    fields.annualInsuranceAmount === ZERO_MONEY
  )
}

/**
 * Uma parcela só não é média de nada: dividir por dois ali cortaria pela metade o custo do veículo
 * de tanque único, e é isso que acontece quando o segundo tanque existe no cadastro mas ainda não
 * tem preço ou consumo — o que se sabe é uma parcela, e ela vale inteira.
 */
function averageFuelParcels(primary: string | null, secondary: string | null): string | null {
  if (primary === null) return secondary
  if (secondary === null) return primary

  const average = divideHalfUp(parseMoney(primary) + parseMoney(secondary), PARCELS_IN_A_PAIR)

  return formatScaledDecimal(average, MONEY_SCALE)
}

function deriveFuelParcel(input: FuelTankInput): string | null {
  if (input.pricePerUnit === null || input.averageConsumption === ZERO_CONSUMPTION) return null

  const consumption = parseScaledDecimal({
    errorCodePrefix: 'FLEET_VEHICLE_COST',
    scale: CONSUMPTION_SCALE,
    value: input.averageConsumption,
  })
  if (consumption === 0n) return null

  const parcel = divideHalfUp(parseMoney(input.pricePerUnit) * CONSUMPTION_FACTOR, consumption)
  if (parcel === 0n) return null

  return formatScaledDecimal(parcel, MONEY_SCALE)
}

function parseMoney(value: string): bigint {
  return parseScaledDecimal({ errorCodePrefix: 'FLEET_VEHICLE_COST', scale: MONEY_SCALE, value })
}
