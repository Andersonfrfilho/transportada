/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  MONEY_SCALE,
  PERCENTAGE_FACTOR,
  PERCENTAGE_SCALE,
  applyRate,
  formatScaledDecimal,
  normalizeDecimal,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'

const ERROR_CODE_PREFIX = 'FREIGHT'
const PERCENTAGE_FORMULA = 'invoiceTotalAmount * percentage'
const ROUNDING_MODE = 'half_up'

const VERSION_PATTERN = /^(0|[1-9][0-9]*)$/

type FreightRuleSnapshotInput = {
  readonly freightRuleId: string
  readonly freightRuleVersionId: string
  readonly ruleVersion: string
  readonly type: 'percentage_of_invoice_total'
  readonly validFrom: string
  readonly validUntil: string | null
  readonly percentage: string
  readonly minimumAmount: string | null
  readonly maximumAmount: string | null
}

export type FreightRuleSnapshot = {
  readonly freightRuleId: string
  readonly freightRuleVersionId: string
  readonly ruleVersion: string
  readonly type: 'percentage_of_invoice_total'
  readonly validFrom: string
  readonly validUntil: string | null
  readonly percentage: string
  readonly minimumAmount: string | null
  readonly maximumAmount: string | null
}

type FreightInvoiceInput = {
  readonly id: string
  readonly issuedAt: string
  readonly totalAmount: string
}

export type FreightAdjustment = {
  readonly amount: string
  readonly description: string
  readonly type: 'minimum_amount' | 'maximum_amount'
}

type CalculatePercentageFreightParams = {
  readonly invoice: FreightInvoiceInput
  readonly ruleSnapshot: FreightRuleSnapshot
}

type CalculatePercentageFreightResult = {
  readonly adjustments: readonly FreightAdjustment[]
  readonly baseAmount: string
  readonly calculatedAmount: string
  readonly calculationDetails: {
    readonly formula: string
    readonly roundingMode: 'half_up'
    readonly scale: 4
  }
  readonly maximumAmount: string | null
  readonly minimumAmount: string | null
  readonly percentage: string
  readonly ruleSnapshot: FreightRuleSnapshot
  readonly totalAmount: string
}

export function createFreightRuleSnapshot(input: FreightRuleSnapshotInput): FreightRuleSnapshot {
  const version = parseVersion(input.ruleVersion)
  const percentage = normalizePercentageDecimal(input.percentage)
  const minimumAmount = normalizeOptionalMoneyDecimal(input.minimumAmount)
  const maximumAmount = normalizeOptionalMoneyDecimal(input.maximumAmount)

  if (minimumAmount !== null && maximumAmount !== null) {
    if (parseMoney(minimumAmount) > parseMoney(maximumAmount)) {
      throw new Error('FREIGHT_MINIMUM_EXCEEDS_MAXIMUM')
    }
  }

  return {
    freightRuleId: input.freightRuleId,
    freightRuleVersionId: input.freightRuleVersionId,
    maximumAmount,
    minimumAmount,
    percentage,
    ruleVersion: version,
    type: input.type,
    validFrom: input.validFrom,
    validUntil: input.validUntil,
  }
}

export function calculatePercentageFreight({
  invoice,
  ruleSnapshot,
}: CalculatePercentageFreightParams): CalculatePercentageFreightResult {
  const baseAmount = normalizeMoneyDecimal(invoice.totalAmount)
  const percentage = ruleSnapshot.percentage
  const calculatedScaled = applyRate({
    amountScaled: parseMoney(baseAmount),
    rateScaled: parsePercentage(percentage),
  })

  let totalScaled = calculatedScaled
  const adjustments: FreightAdjustment[] = []

  if (ruleSnapshot.minimumAmount !== null) {
    const minimumScaled = parseMoney(ruleSnapshot.minimumAmount)
    if (totalScaled < minimumScaled) {
      adjustments.push({
        amount: formatScaledDecimal(minimumScaled - totalScaled, MONEY_SCALE),
        description: 'Minimum freight amount applied',
        type: 'minimum_amount',
      })
      totalScaled = minimumScaled
    }
  }

  if (ruleSnapshot.maximumAmount !== null) {
    const maximumScaled = parseMoney(ruleSnapshot.maximumAmount)
    if (totalScaled > maximumScaled) {
      adjustments.push({
        amount: formatScaledDecimal(maximumScaled - totalScaled, MONEY_SCALE),
        description: 'Maximum freight amount applied',
        type: 'maximum_amount',
      })
      totalScaled = maximumScaled
    }
  }

  return {
    adjustments,
    baseAmount,
    calculatedAmount: formatScaledDecimal(calculatedScaled, MONEY_SCALE),
    calculationDetails: {
      formula: PERCENTAGE_FORMULA,
      roundingMode: ROUNDING_MODE,
      scale: 4,
    },
    maximumAmount: ruleSnapshot.maximumAmount,
    minimumAmount: ruleSnapshot.minimumAmount,
    percentage,
    ruleSnapshot,
    totalAmount: formatScaledDecimal(totalScaled, MONEY_SCALE),
  }
}

export function parseMoney(value: string): bigint {
  return parseScaledDecimal({
    errorCodePrefix: ERROR_CODE_PREFIX,
    scale: MONEY_SCALE,
    value,
  })
}

function parsePercentage(value: string): bigint {
  return parseScaledDecimal({
    errorCodePrefix: ERROR_CODE_PREFIX,
    scale: PERCENTAGE_SCALE,
    value,
  })
}

function normalizeOptionalMoneyDecimal(value: string | null): string | null {
  if (value === null) return null
  return normalizeMoneyDecimal(value)
}

function normalizeMoneyDecimal(value: string): string {
  return normalizeDecimal({
    errorCodePrefix: ERROR_CODE_PREFIX,
    maximumScale: MONEY_SCALE,
    value,
  })
}

function normalizePercentageDecimal(value: string): string {
  const normalized = normalizeDecimal({
    errorCodePrefix: ERROR_CODE_PREFIX,
    maximumScale: PERCENTAGE_SCALE,
    value,
  })
  if (parsePercentage(normalized) > PERCENTAGE_FACTOR) {
    throw new Error('FREIGHT_PERCENTAGE_OUT_OF_RANGE')
  }
  return normalized
}

function parseVersion(value: string): string {
  if (!VERSION_PATTERN.test(value)) {
    throw new Error('FREIGHT_INVALID_RULE_VERSION')
  }
  return value
}
