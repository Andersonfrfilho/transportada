/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
const MONEY_SCALE = 4n
const PERCENTAGE_SCALE = 6n
const PERCENTAGE_FACTOR = 10n ** PERCENTAGE_SCALE
const HALF_UP_DIVISOR = 2n
const PERCENTAGE_FORMULA = 'invoiceTotalAmount * percentage'
const ROUNDING_MODE = 'half_up'

const MONEY_DECIMAL_PATTERN = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/
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

type FreightRuleSnapshot = {
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

type FreightAdjustment = {
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
    if (
      parseScaledDecimal(minimumAmount, MONEY_SCALE) >
      parseScaledDecimal(maximumAmount, MONEY_SCALE)
    ) {
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
  const baseScaled = parseScaledDecimal(baseAmount, MONEY_SCALE)
  const percentageScaled = parseScaledDecimal(percentage, PERCENTAGE_SCALE)
  const calculatedScaled = divideHalfUp(baseScaled * percentageScaled, PERCENTAGE_FACTOR)

  let totalScaled = calculatedScaled
  const adjustments: FreightAdjustment[] = []

  if (ruleSnapshot.minimumAmount !== null) {
    const minimumScaled = parseScaledDecimal(ruleSnapshot.minimumAmount, MONEY_SCALE)
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
    const maximumScaled = parseScaledDecimal(ruleSnapshot.maximumAmount, MONEY_SCALE)
    if (totalScaled > maximumScaled) {
      adjustments.push({
        amount: formatSignedScaledDecimal(maximumScaled - totalScaled, MONEY_SCALE),
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

function normalizeOptionalMoneyDecimal(value: string | null): string | null {
  if (value === null) return null
  return normalizeDecimal({
    maximumScale: MONEY_SCALE,
    value,
  })
}

function normalizeMoneyDecimal(value: string): string {
  return normalizeDecimal({
    maximumScale: MONEY_SCALE,
    value,
  })
}

function normalizePercentageDecimal(value: string): string {
  const normalized = normalizeDecimal({
    maximumScale: PERCENTAGE_SCALE,
    value,
  })
  const scaled = parseScaledDecimal(normalized, PERCENTAGE_SCALE)
  if (scaled < 0n || scaled > PERCENTAGE_FACTOR) {
    throw new Error('FREIGHT_PERCENTAGE_OUT_OF_RANGE')
  }
  return normalized
}

function normalizeDecimal({
  maximumScale,
  value,
}: {
  readonly maximumScale: bigint
  readonly value: string
}): string {
  if (!MONEY_DECIMAL_PATTERN.test(value)) {
    throw new Error('FREIGHT_INVALID_DECIMAL_FORMAT')
  }

  const [integerPart, fractionalPart = ''] = value.split('.', 2)
  if (BigInt(fractionalPart.length) > maximumScale) {
    throw new Error('FREIGHT_INVALID_DECIMAL_SCALE')
  }

  const normalizedFractionalPart = fractionalPart.padEnd(Number(maximumScale), '0')
  return `${integerPart}.${normalizedFractionalPart}`
}

function parseScaledDecimal(value: string, scale: bigint): bigint {
  const normalized = normalizeDecimal({
    maximumScale: scale,
    value,
  })
  const [integerPart, fractionalPart] = normalized.split('.', 2)
  return BigInt(`${integerPart}${fractionalPart ?? ''}`)
}

function formatScaledDecimal(value: bigint, scale: bigint): string {
  const sign = value < 0n ? '-' : ''
  const absoluteValue = value < 0n ? -value : value
  const stringValue = absoluteValue.toString().padStart(Number(scale) + 1, '0')
  const integerDigits = stringValue.slice(0, -Number(scale)) || '0'
  const fractionalDigits = stringValue.slice(-Number(scale))
  return `${sign}${integerDigits}.${fractionalDigits}`
}

function formatSignedScaledDecimal(value: bigint, scale: bigint): string {
  return formatScaledDecimal(value, scale)
}

function divideHalfUp(dividend: bigint, divisor: bigint): bigint {
  return (dividend + divisor / HALF_UP_DIVISOR) / divisor
}

function parseVersion(value: string): string {
  if (!VERSION_PATTERN.test(value)) {
    throw new Error('FREIGHT_INVALID_RULE_VERSION')
  }
  return value
}
