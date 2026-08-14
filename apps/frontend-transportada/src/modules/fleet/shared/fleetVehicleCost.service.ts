/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  divideAmount,
  formatAmount,
  isZeroAmount,
  parseTypedAmount,
  sumScaledAmounts,
  toTypedAmount,
} from '../../shared/decimalAmount.service'
import type { VEHICLE_COST_KEYS } from './fleet.constant'
import type { FleetVehicleCostFields, FleetVehicleCostSummary } from './fleet.types'

export type FleetVehicleCostKey = (typeof VEHICLE_COST_KEYS)[number]

const MONTHS_PER_YEAR = 12
const MONEY_SCALE = 4
const MONEY_FORM_SCALE = 2
const CONSUMPTION_SCALE = 2

const MONEY_SCALES = { api: MONEY_SCALE, form: MONEY_FORM_SCALE } as const
const CONSUMPTION_SCALES = { api: CONSUMPTION_SCALE, form: CONSUMPTION_SCALE } as const
/** Custo por km é decimal de quatro casas por natureza — arredondar na tela esconderia dígito. */
const COST_PER_KILOMETER_SCALES = { api: MONEY_SCALE, form: MONEY_SCALE } as const

export const VEHICLE_COST_FIELD_SCALE: Readonly<
  Record<FleetVehicleCostKey, Readonly<{ api: number; form: number }>>
> = {
  acquisitionAmount: MONEY_SCALES,
  annualInsuranceAmount: MONEY_SCALES,
  annualVehicleTaxAmount: MONEY_SCALES,
  averageConsumption: CONSUMPTION_SCALES,
  costPerKilometer: COST_PER_KILOMETER_SCALES,
  monthlyInstallmentAmount: MONEY_SCALES,
}

function toApiAmount(fields: FleetVehicleCostFields, key: FleetVehicleCostKey): string {
  return parseTypedAmount({ scale: VEHICLE_COST_FIELD_SCALE[key].api, value: fields[key] })
}

function toFormAmount(fields: FleetVehicleCostFields, key: FleetVehicleCostKey): string {
  return toTypedAmount({ scale: VEHICLE_COST_FIELD_SCALE[key].form, value: fields[key] })
}

/** Campo em branco vira zero na escala fiscal: é o que a API aceita para custo não informado. */
export function toVehicleCostBody(fields: FleetVehicleCostFields): FleetVehicleCostFields {
  return {
    acquisitionAmount: toApiAmount(fields, 'acquisitionAmount'),
    annualInsuranceAmount: toApiAmount(fields, 'annualInsuranceAmount'),
    annualVehicleTaxAmount: toApiAmount(fields, 'annualVehicleTaxAmount'),
    averageConsumption: toApiAmount(fields, 'averageConsumption'),
    costPerKilometer: toApiAmount(fields, 'costPerKilometer'),
    monthlyInstallmentAmount: toApiAmount(fields, 'monthlyInstallmentAmount'),
  }
}

export function toVehicleCostFormState(fields: FleetVehicleCostFields): FleetVehicleCostFields {
  return {
    acquisitionAmount: toFormAmount(fields, 'acquisitionAmount'),
    annualInsuranceAmount: toFormAmount(fields, 'annualInsuranceAmount'),
    annualVehicleTaxAmount: toFormAmount(fields, 'annualVehicleTaxAmount'),
    averageConsumption: toFormAmount(fields, 'averageConsumption'),
    costPerKilometer: toFormAmount(fields, 'costPerKilometer'),
    monthlyInstallmentAmount: toFormAmount(fields, 'monthlyInstallmentAmount'),
  }
}

/**
 * Prestação + (IPVA + seguro) ÷ 12, a mesma regra do domínio da API. O teste é sobre as três
 * entradas, não sobre o total: centavo que arredonda para zero ainda conta como custo informado.
 */
export function deriveMonthlyFixedCost(fields: FleetVehicleCostFields): null | string {
  const hasNoFixedCost =
    isZeroAmount(fields.monthlyInstallmentAmount) &&
    isZeroAmount(fields.annualVehicleTaxAmount) &&
    isZeroAmount(fields.annualInsuranceAmount)
  if (hasNoFixedCost) return null

  const annualCost = sumScaledAmounts([fields.annualVehicleTaxAmount, fields.annualInsuranceAmount])
  const monthlyCost = divideAmount({
    divisor: MONTHS_PER_YEAR,
    scale: MONEY_SCALE,
    value: annualCost,
  })

  return sumScaledAmounts([fields.monthlyInstallmentAmount, monthlyCost])
}

export function summarizeVehicleCosts(fields: FleetVehicleCostFields): FleetVehicleCostSummary {
  const monthlyFixedCost = deriveMonthlyFixedCost(fields)

  return {
    costPerKilometer: isZeroAmount(fields.costPerKilometer)
      ? null
      : formatAmount(fields.costPerKilometer),
    monthlyFixedCost: monthlyFixedCost === null ? null : formatAmount(monthlyFixedCost),
  }
}

/**
 * O resumo acompanha o que está sendo digitado, e o estado do formulário não é escala de API: campo
 * em branco e valor pela metade (`1,`) são passo normal da digitação, não valor inválido. Sem esta
 * tradução o `summarizeVehicleCosts` recusa a entrada e a tela inteira cai ao abrir o cadastro.
 */
export function summarizeTypedVehicleCosts(
  fields: FleetVehicleCostFields,
): FleetVehicleCostSummary {
  try {
    return summarizeVehicleCosts(toVehicleCostBody(fields))
  } catch {
    return { costPerKilometer: null, monthlyFixedCost: null }
  }
}

export function formatCostReferenceDate(
  input: Readonly<{ locale: string; value: string }>,
): string {
  return new Intl.DateTimeFormat(input.locale, { dateStyle: 'short' }).format(new Date(input.value))
}
