/* Copyright (c) 2026 Ada Technology. MIT License. */

const PERCENT_PATTERN = /^\d+(?:\.\d+)?$/
/** Duas casas no percentual: `4,5` e `4,53` aparecem, `4,5271` não tem leitor. */
const PERCENT_DECIMALS = 2n
const PERCENT_UNITS = 10n ** PERCENT_DECIMALS

/**
 * A alíquota exibida é derivada dos dois valores congelados na nota — nunca lida do perfil, que pode
 * ter mudado depois da emissão e faria o rótulo contar uma história diferente do número ao lado.
 */
export function deriveIssRatePercent(input: {
  readonly issAmount: string
  readonly serviceAmount: string
}): null | string {
  const iss = toUnits(input.issAmount)
  const service = toUnits(input.serviceAmount)
  if (iss === null || service === null || service === 0n) return null

  const scaled = roundedDivision(iss * 100n * PERCENT_UNITS, service)

  return formatPercent(scaled)
}

/** Os dois valores vêm na mesma escala fiscal, então a razão dispensa normalizar escala. */
function toUnits(value: string): bigint | null {
  if (!PERCENT_PATTERN.test(value)) return null
  const [integerPart = '', fractionPart = ''] = value.split('.')

  return BigInt(`${integerPart}${fractionPart.padEnd(4, '0').slice(0, 4)}`)
}

function roundedDivision(dividend: bigint, divisor: bigint): bigint {
  return (dividend * 2n + divisor) / (divisor * 2n)
}

function formatPercent(scaled: bigint): string {
  const integerPart = scaled / PERCENT_UNITS
  const fractionPart = (scaled % PERCENT_UNITS).toString().padStart(2, '0').replace(/0+$/, '')

  return fractionPart.length === 0 ? `${integerPart}` : `${integerPart},${fractionPart}`
}
