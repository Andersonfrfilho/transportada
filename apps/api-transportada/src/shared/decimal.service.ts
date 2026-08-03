/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
const DECIMAL_PATTERN = /^(0|[1-9][0-9]*)(\.[0-9]+)?$/
const HALF_UP_DIVISOR = 2n

export const MONEY_SCALE = 4n
/** SEFAZ accepts two decimal places in every monetary field of the CT-e layout. */
export const FISCAL_MONEY_SCALE = 2n
export const PERCENTAGE_SCALE = 6n
export const PERCENTAGE_FACTOR = 10n ** PERCENTAGE_SCALE

type NormalizeDecimalParams = {
  readonly errorCodePrefix: string
  readonly maximumScale: bigint
  readonly value: string
}

type ParseScaledDecimalParams = {
  readonly errorCodePrefix: string
  readonly scale: bigint
  readonly value: string
}

type RescaleHalfUpParams = {
  readonly fromScale: bigint
  readonly toScale: bigint
  readonly value: bigint
}

export function normalizeDecimal({
  errorCodePrefix,
  maximumScale,
  value,
}: NormalizeDecimalParams): string {
  if (!DECIMAL_PATTERN.test(value)) {
    throw new Error(`${errorCodePrefix}_INVALID_DECIMAL_FORMAT`)
  }

  const [integerPart, fractionalPart = ''] = value.split('.', 2)
  if (BigInt(fractionalPart.length) > maximumScale) {
    throw new Error(`${errorCodePrefix}_INVALID_DECIMAL_SCALE`)
  }

  return `${integerPart}.${fractionalPart.padEnd(Number(maximumScale), '0')}`
}

export function parseScaledDecimal({
  errorCodePrefix,
  scale,
  value,
}: ParseScaledDecimalParams): bigint {
  const normalized = normalizeDecimal({ errorCodePrefix, maximumScale: scale, value })
  const [integerPart, fractionalPart] = normalized.split('.', 2)
  return BigInt(`${integerPart}${fractionalPart ?? ''}`)
}

export function formatScaledDecimal(value: bigint, scale: bigint): string {
  const sign = value < 0n ? '-' : ''
  const absoluteValue = value < 0n ? -value : value
  const digits = absoluteValue.toString().padStart(Number(scale) + 1, '0')
  return `${sign}${digits.slice(0, -Number(scale)) || '0'}.${digits.slice(-Number(scale))}`
}

export function isDecimalString(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL_PATTERN.test(value)
}

/** O driver do Postgres come as casas zeradas de `numeric`; a resposta HTTP sempre fecha em centavos. */
export function formatFiscalMoney(value: string): string {
  const [integerPart = '0', fractionalPart = ''] = value.split('.', 2)
  return formatScaledDecimal(
    rescaleHalfUp({
      fromScale: BigInt(fractionalPart.length),
      toScale: FISCAL_MONEY_SCALE,
      value: BigInt(`${integerPart}${fractionalPart}`),
    }),
    FISCAL_MONEY_SCALE,
  )
}

export function divideHalfUp(dividend: bigint, divisor: bigint): bigint {
  const half = divisor / HALF_UP_DIVISOR
  return dividend < 0n ? (dividend - half) / divisor : (dividend + half) / divisor
}

export function applyRate({
  amountScaled,
  rateScaled,
}: {
  readonly amountScaled: bigint
  readonly rateScaled: bigint
}): bigint {
  return divideHalfUp(amountScaled * rateScaled, PERCENTAGE_FACTOR)
}

export function rescaleHalfUp({ fromScale, toScale, value }: RescaleHalfUpParams): bigint {
  if (toScale >= fromScale) return value * 10n ** (toScale - fromScale)
  return divideHalfUp(value, 10n ** (fromScale - toScale))
}
