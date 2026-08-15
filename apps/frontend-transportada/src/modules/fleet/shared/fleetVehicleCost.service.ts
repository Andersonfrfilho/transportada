/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  divideAmount,
  divideScaledAmounts,
  formatAmount,
  isZeroAmount,
  parseTypedAmount,
  sumScaledAmounts,
  toTypedAmount,
} from '../../shared/decimalAmount.service'
import { FUEL_UNIT_BY_PRODUCT, type FuelProduct } from '../../shared/fuel.constant'
import type { VEHICLE_COST_KEYS } from './fleet.constant'
import type {
  FleetVehicleCostBreakdown,
  FleetVehicleCostFields,
  FleetVehicleCostSummary,
  FleetVehicleFuelPrice,
} from './fleet.types'

export type FleetVehicleCostKey = (typeof VEHICLE_COST_KEYS)[number]

export type DerivedCostPerKilometer = Readonly<{
  breakdown: FleetVehicleCostBreakdown
  total: string
}>

type CostPerKilometerFields = Pick<
  FleetVehicleCostFields,
  'averageConsumption' | 'otherCostsPerKilometer'
>

type DeriveCostPerKilometerInput = Readonly<{
  fields: CostPerKilometerFields
  fuelPricePerUnit: null | string
}>

type SummarizeVehicleCostsInput = Readonly<{
  fields: FleetVehicleCostFields
  fuelPricePerUnit: null | string
}>

const MONTHS_PER_YEAR = 12
const MONEY_SCALE = 4
const MONEY_FORM_SCALE = 2
const CONSUMPTION_SCALE = 2
const ZERO_MONEY = '0.0000'

const MONEY_SCALES = { api: MONEY_SCALE, form: MONEY_FORM_SCALE } as const
const CONSUMPTION_SCALES = { api: CONSUMPTION_SCALE, form: CONSUMPTION_SCALE } as const
/** Outros custos por km é decimal de quatro casas por natureza — arredondar na tela esconde dígito. */
const COST_PER_KILOMETER_SCALES = { api: MONEY_SCALE, form: MONEY_SCALE } as const

const EMPTY_SUMMARY: FleetVehicleCostSummary = {
  costPerKilometer: null,
  fuelCostPerKilometer: null,
  monthlyFixedCost: null,
  otherCostsPerKilometer: null,
}

/** O preço da referência tem quatro casas, e a quarta é a que muda o R$/km ao dividir. */
const fuelPriceFormatter = new Intl.NumberFormat('pt-BR', {
  currency: 'BRL',
  maximumFractionDigits: MONEY_SCALE,
  minimumFractionDigits: MONEY_SCALE,
  style: 'currency',
})

export const VEHICLE_COST_FIELD_SCALE: Readonly<
  Record<FleetVehicleCostKey, Readonly<{ api: number; form: number }>>
> = {
  acquisitionAmount: MONEY_SCALES,
  annualInsuranceAmount: MONEY_SCALES,
  annualVehicleTaxAmount: MONEY_SCALES,
  averageConsumption: CONSUMPTION_SCALES,
  monthlyInstallmentAmount: MONEY_SCALES,
  otherCostsPerKilometer: COST_PER_KILOMETER_SCALES,
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
    monthlyInstallmentAmount: toApiAmount(fields, 'monthlyInstallmentAmount'),
    otherCostsPerKilometer: toApiAmount(fields, 'otherCostsPerKilometer'),
  }
}

export function toVehicleCostFormState(fields: FleetVehicleCostFields): FleetVehicleCostFields {
  return {
    acquisitionAmount: toFormAmount(fields, 'acquisitionAmount'),
    annualInsuranceAmount: toFormAmount(fields, 'annualInsuranceAmount'),
    annualVehicleTaxAmount: toFormAmount(fields, 'annualVehicleTaxAmount'),
    averageConsumption: toFormAmount(fields, 'averageConsumption'),
    monthlyInstallmentAmount: toFormAmount(fields, 'monthlyInstallmentAmount'),
    otherCostsPerKilometer: toFormAmount(fields, 'otherCostsPerKilometer'),
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

/**
 * Espelho de `deriveCostPerKilometer` do domínio da API: preço do combustível ÷ consumo, mais a
 * parcela de outros custos. A divisão fecha na quarta casa **antes** da soma — inverter a ordem
 * muda o último dígito, e é esse dígito que o operador confere contra a planilha dele. Parcela
 * zerada fica de fora da composição: `'0.0000'` ali diria custo zero, e o que houve foi não informar.
 */
export function deriveCostPerKilometer(
  input: DeriveCostPerKilometerInput,
): DerivedCostPerKilometer | null {
  const fuel = deriveFuelParcel(input)
  const otherCosts = isZeroAmount(input.fields.otherCostsPerKilometer)
    ? null
    : input.fields.otherCostsPerKilometer

  if (fuel === null && otherCosts === null) return null

  return {
    breakdown: {
      ...(fuel === null ? {} : { fuel }),
      ...(otherCosts === null ? {} : { otherCosts }),
    },
    total: sumScaledAmounts([fuel ?? ZERO_MONEY, otherCosts ?? ZERO_MONEY]),
  }
}

/** Os rótulos do consumo e do preço saem da unidade do produto — o GNV anda em metro cúbico. */
export function resolveFuelLabelKeys(
  product: FuelProduct,
): Readonly<{ averageConsumption: string; fuelPricePerUnit: string }> {
  const unit = FUEL_UNIT_BY_PRODUCT[product]

  return {
    averageConsumption: `consumptionByUnit.${unit}`,
    fuelPricePerUnit: `fuelPriceByUnit.${unit}`,
  }
}

/**
 * O preço veio da API para o combustível **salvo**. Trocar o combustível na tela sem salvar deixaria
 * o R$/km sendo calculado com o preço do produto anterior — número certo para a pergunta errada.
 */
export function resolveFormFuelPrice(
  input: Readonly<{
    selectedFuelType: FuelProduct
    vehicle:
      | Readonly<{ fuelPrice: FleetVehicleFuelPrice | null; fuelType: FuelProduct }>
      | undefined
  }>,
): FleetVehicleFuelPrice | null {
  if (input.vehicle === undefined) return null

  return input.vehicle.fuelType === input.selectedFuelType ? input.vehicle.fuelPrice : null
}

export function formatFuelPricePerUnit(value: string): string {
  return fuelPriceFormatter.format(toNumericLiteral(value))
}

export function summarizeVehicleCosts(input: SummarizeVehicleCostsInput): FleetVehicleCostSummary {
  const monthlyFixedCost = deriveMonthlyFixedCost(input.fields)
  const costPerKilometer = deriveCostPerKilometer(input)

  return {
    costPerKilometer: costPerKilometer === null ? null : formatAmount(costPerKilometer.total),
    fuelCostPerKilometer: formatParcel(costPerKilometer?.breakdown.fuel),
    monthlyFixedCost: monthlyFixedCost === null ? null : formatAmount(monthlyFixedCost),
    otherCostsPerKilometer: formatParcel(costPerKilometer?.breakdown.otherCosts),
  }
}

/**
 * O resumo acompanha o que está sendo digitado, e o estado do formulário não é escala de API: campo
 * em branco e valor pela metade (`1,`) são passo normal da digitação, não valor inválido. Sem esta
 * tradução o `summarizeVehicleCosts` recusa a entrada e a tela inteira cai ao abrir o cadastro.
 */
export function summarizeTypedVehicleCosts(
  input: SummarizeVehicleCostsInput,
): FleetVehicleCostSummary {
  try {
    return summarizeVehicleCosts({
      fields: toVehicleCostBody(input.fields),
      fuelPricePerUnit: input.fuelPricePerUnit,
    })
  } catch {
    return EMPTY_SUMMARY
  }
}

function deriveFuelParcel(input: DeriveCostPerKilometerInput): null | string {
  if (input.fuelPricePerUnit === null) return null

  const parcel = divideScaledAmounts({
    dividend: input.fuelPricePerUnit,
    divisor: input.fields.averageConsumption,
    scale: MONEY_SCALE,
  })

  return parcel === null || isZeroAmount(parcel) ? null : parcel
}

function formatParcel(value: string | undefined): null | string {
  return value === undefined ? null : formatAmount(value)
}

/** `Intl.NumberFormat` aceita string decimal em runtime; o tipo do TS é mais estreito que a spec. */
function toNumericLiteral(value: string): `${number}` {
  return value as `${number}`
}

export function formatCostReferenceDate(
  input: Readonly<{ locale: string; value: string }>,
): string {
  return new Intl.DateTimeFormat(input.locale, { dateStyle: 'short' }).format(new Date(input.value))
}
