/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Escala fiscal do repositório: dinheiro é `numeric(_, 4)` do backend ao topo da tela. */
export const AMOUNT_MAX_SCALE = 4
export const AMOUNT_DISPLAY_SCALE = 2
export const AMOUNT_ZERO = '0.00'

export const DECIMAL_AMOUNT_ERROR = {
  INVALID_AMOUNT: 'INVALID_AMOUNT',
} as const

const AMOUNT_PATTERN = /^-?\d+(?:\.\d+)?$/
const currencyFormatter = new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' })

type ScaledAmount = {
  readonly scale: number
  readonly units: bigint
}

/** Soma exata da seleção: os valores viram inteiros na escala mais larga e voltam a string. */
export function sumScaledAmounts(values: readonly string[]): string {
  const parsed = values.map(parseScaledAmount)
  const scale = parsed.reduce(
    (widest, amount) => Math.max(widest, amount.scale),
    AMOUNT_DISPLAY_SCALE,
  )
  const total = parsed.reduce((sum, amount) => sum + rescale(amount, scale), 0n)

  return toDecimalString(total, scale)
}

/** Ordenação por valor: `'9.0000'` vem antes de `'43.1316'`, o que a comparação de string inverteria. */
export function compareScaledAmounts(left: string, right: string): number {
  const parsedLeft = parseScaledAmount(left)
  const parsedRight = parseScaledAmount(right)
  const scale = Math.max(parsedLeft.scale, parsedRight.scale)
  const difference = rescale(parsedLeft, scale) - rescale(parsedRight, scale)

  if (difference === 0n) return 0
  return difference > 0n ? 1 : -1
}

/** Formata na borda de exibição — `Intl` recebe a string, então nada passa por binário. */
export function formatAmount(value: string): string {
  const amount = parseScaledAmount(value)

  return currencyFormatter.format(toNumericLiteral(toDecimalString(amount.units, amount.scale)))
}

/** `Intl.NumberFormat` aceita string decimal em runtime; o tipo do TS é mais estreito que a spec. */
function toNumericLiteral(value: string): `${number}` {
  return value as `${number}`
}

function parseScaledAmount(value: string): ScaledAmount {
  if (!AMOUNT_PATTERN.test(value)) throw invalidAmount()
  const [integerPart = '', fractionPart = ''] = value.replace('-', '').split('.')
  if (fractionPart.length > AMOUNT_MAX_SCALE) throw invalidAmount()
  const digits = `${integerPart}${fractionPart}`
  const units = BigInt(digits)

  return { scale: fractionPart.length, units: value.startsWith('-') ? -units : units }
}

function rescale(amount: ScaledAmount, scale: number): bigint {
  return amount.units * 10n ** BigInt(scale - amount.scale)
}

function toDecimalString(units: bigint, scale: number): string {
  const isNegative = units < 0n
  const digits = (isNegative ? -units : units).toString().padStart(scale + 1, '0')
  const integerPart = digits.slice(0, digits.length - scale)
  const fractionPart = digits.slice(digits.length - scale)
  const sign = isNegative ? '-' : ''

  return scale === 0 ? `${sign}${integerPart}` : `${sign}${integerPart}.${fractionPart}`
}

function invalidAmount(): Error {
  return new Error(DECIMAL_AMOUNT_ERROR.INVALID_AMOUNT)
}
