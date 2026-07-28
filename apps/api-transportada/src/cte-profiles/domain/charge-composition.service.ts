/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteChargeCalculationType } from '../../database/cte-emission-profile.schema.js'
import {
  type FreightAdjustment,
  type FreightRuleSnapshot,
  calculatePercentageFreight,
  parseMoney,
} from '../../freight-calculations/domain/freight-calculation-engine.service.js'
import {
  FISCAL_MONEY_SCALE,
  MONEY_SCALE,
  PERCENTAGE_FACTOR,
  PERCENTAGE_SCALE,
  applyRate,
  formatScaledDecimal,
  parseScaledDecimal,
  rescaleHalfUp,
} from '../../shared/decimal.service.js'
import {
  CteChargeInvalidComponentError,
  CteChargeInvalidLabelError,
  CteChargeRateOutOfRangeError,
} from './cte-profile.error.js'

const ERROR_CODE_PREFIX = 'CTE_CHARGE'
const MAIN_COMPONENT_TYPE = 'main'

/** D2b: cargo percentages price on vCarga, freight percentages on the adjusted main, fixed last. */
const CALCULATION_TYPE_ORDER = {
  fixed_amount: 2,
  percentage_of_cargo: 0,
  percentage_of_freight: 1,
} as const satisfies Record<CteChargeCalculationType, number>

export type ChargeComponentDefinition = {
  readonly amount: string | null
  readonly calculationType: CteChargeCalculationType
  readonly label: string
  readonly ordinal: bigint
  readonly rate: string | null
  readonly validFrom: string
  readonly validUntil: string | null
}

export type ComposedChargeComponent = {
  readonly amount: string
  readonly calculationType: CteChargeCalculationType | typeof MAIN_COMPONENT_TYPE
  readonly label: string
}

/** Persistable view of a component: the main charge is priced as a cargo percentage. */
export type ChargeComponentPricing = {
  readonly amount: string
  readonly baseAmount: string
  readonly calculationType: CteChargeCalculationType
  readonly label: string
  readonly rate: string | null
}

export type ComposeChargeParams = {
  readonly cargoAmount: string
  readonly components: readonly ChargeComponentDefinition[]
  readonly mainComponentLabel: string
  readonly referenceDate: string
  readonly ruleSnapshot: FreightRuleSnapshot
}

export type ComposedCharge = {
  readonly adjustments: readonly FreightAdjustment[]
  readonly cargoAmount: string
  readonly components: readonly ComposedChargeComponent[]
  readonly mainAmount: string
  readonly pricing: readonly ChargeComponentPricing[]
  readonly totalAmount: string
}

export type FiscalCharge = {
  readonly components: readonly ComposedChargeComponent[]
  readonly totalAmount: string
}

export function composeCharge({
  cargoAmount,
  components,
  mainComponentLabel,
  referenceDate,
  ruleSnapshot,
}: ComposeChargeParams): ComposedCharge {
  const mainLabel = assertLabel(mainComponentLabel)
  const freight = calculatePercentageFreight({
    invoice: { id: '', issuedAt: referenceDate, totalAmount: cargoAmount },
    ruleSnapshot,
  })
  const cargoScaled = parseMoney(freight.baseAmount)
  const mainScaled = parseMoney(freight.totalAmount)

  const composedComponents: ComposedChargeComponent[] = [
    { amount: freight.totalAmount, calculationType: MAIN_COMPONENT_TYPE, label: mainLabel },
  ]
  const pricing: ChargeComponentPricing[] = [
    {
      amount: freight.totalAmount,
      baseAmount: freight.baseAmount,
      calculationType: 'percentage_of_cargo',
      label: mainLabel,
      rate: ruleSnapshot.percentage,
    },
  ]
  let totalScaled = mainScaled

  for (const component of selectComponentsInForce({ components, referenceDate })) {
    const amountScaled = priceComponent({ cargoScaled, component, mainScaled })
    const amount = formatScaledDecimal(amountScaled, MONEY_SCALE)
    const label = assertLabel(component.label)
    composedComponents.push({ amount, calculationType: component.calculationType, label })
    pricing.push({
      amount,
      baseAmount: resolveComponentBaseAmount({ amount, component, freight }),
      calculationType: component.calculationType,
      label,
      rate: component.rate,
    })
    totalScaled += amountScaled
  }

  return {
    adjustments: freight.adjustments,
    cargoAmount: freight.baseAmount,
    components: composedComponents,
    mainAmount: freight.totalAmount,
    pricing,
    totalAmount: formatScaledDecimal(totalScaled, MONEY_SCALE),
  }
}

function resolveComponentBaseAmount({
  amount,
  component,
  freight,
}: {
  readonly amount: string
  readonly component: ChargeComponentDefinition
  readonly freight: { readonly baseAmount: string; readonly totalAmount: string }
}): string {
  if (component.calculationType === 'percentage_of_cargo') return freight.baseAmount
  if (component.calculationType === 'percentage_of_freight') return freight.totalAmount

  return amount
}

/**
 * SEFAZ rejects a CT-e whose vTPrest differs from the sum of its Comp elements, so the
 * fiscal total is the sum of the rounded parts and never the rounding of the exact total.
 */
export function roundChargeToFiscalScale(charge: ComposedCharge): FiscalCharge {
  let totalScaled = 0n
  const components = charge.components.map((component) => {
    const roundedScaled = rescaleHalfUp({
      fromScale: MONEY_SCALE,
      toScale: FISCAL_MONEY_SCALE,
      value: parseMoney(component.amount),
    })
    totalScaled += roundedScaled

    return {
      amount: formatScaledDecimal(roundedScaled, FISCAL_MONEY_SCALE),
      calculationType: component.calculationType,
      label: component.label,
    }
  })

  return {
    components,
    totalAmount: formatScaledDecimal(totalScaled, FISCAL_MONEY_SCALE),
  }
}

function selectComponentsInForce({
  components,
  referenceDate,
}: {
  readonly components: readonly ChargeComponentDefinition[]
  readonly referenceDate: string
}): readonly ChargeComponentDefinition[] {
  const reference = Date.parse(referenceDate)

  return components
    .filter((component) => {
      if (Date.parse(component.validFrom) > reference) return false
      return component.validUntil === null || Date.parse(component.validUntil) >= reference
    })
    .toSorted(compareComponents)
}

function compareComponents(
  left: ChargeComponentDefinition,
  right: ChargeComponentDefinition,
): number {
  const byType =
    CALCULATION_TYPE_ORDER[left.calculationType] - CALCULATION_TYPE_ORDER[right.calculationType]
  if (byType !== 0) return byType
  if (left.ordinal === right.ordinal) return 0
  return left.ordinal < right.ordinal ? -1 : 1
}

function priceComponent({
  cargoScaled,
  component,
  mainScaled,
}: {
  readonly cargoScaled: bigint
  readonly component: ChargeComponentDefinition
  readonly mainScaled: bigint
}): bigint {
  if (component.calculationType === 'fixed_amount') {
    if (component.amount === null || component.rate !== null) {
      throw new CteChargeInvalidComponentError()
    }
    return parseChargeMoney(component.amount)
  }

  if (component.rate === null || component.amount !== null) {
    throw new CteChargeInvalidComponentError()
  }

  const rateScaled = parseScaledDecimal({
    errorCodePrefix: ERROR_CODE_PREFIX,
    scale: PERCENTAGE_SCALE,
    value: component.rate,
  })
  if (rateScaled > PERCENTAGE_FACTOR) throw new CteChargeRateOutOfRangeError()

  return applyRate({
    amountScaled: component.calculationType === 'percentage_of_cargo' ? cargoScaled : mainScaled,
    rateScaled,
  })
}

function parseChargeMoney(value: string): bigint {
  return parseScaledDecimal({
    errorCodePrefix: ERROR_CODE_PREFIX,
    scale: MONEY_SCALE,
    value,
  })
}

function assertLabel(value: string): string {
  const label = value.trim()
  if (label.length === 0) throw new CteChargeInvalidLabelError()
  return label
}
