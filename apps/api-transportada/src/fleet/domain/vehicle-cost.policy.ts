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
const ZERO_MONEY = '0.0000'
const ZERO_CONSUMPTION = '0.00'

export type FleetVehicleCostFields = {
  readonly acquisitionAmount: string
  readonly annualInsuranceAmount: string
  readonly annualVehicleTaxAmount: string
  readonly averageConsumption: string
  readonly costPerKilometer: string
  readonly monthlyInstallmentAmount: string
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

export function hasInformedCosts(fields: FleetVehicleCostFields): boolean {
  return !(
    fields.averageConsumption === ZERO_CONSUMPTION &&
    fields.costPerKilometer === ZERO_MONEY &&
    fields.acquisitionAmount === ZERO_MONEY &&
    fields.monthlyInstallmentAmount === ZERO_MONEY &&
    fields.annualVehicleTaxAmount === ZERO_MONEY &&
    fields.annualInsuranceAmount === ZERO_MONEY
  )
}

function parseMoney(value: string): bigint {
  return parseScaledDecimal({ errorCodePrefix: 'FLEET_VEHICLE_COST', scale: MONEY_SCALE, value })
}
