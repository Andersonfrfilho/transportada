/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Escala fiscal do repositório: dinheiro é `numeric(_, 4)` do backend ao topo da tela. */
export const AMOUNT_MAX_SCALE = 4
export const AMOUNT_DISPLAY_SCALE = 2
export const AMOUNT_ZERO = '0.00'

export const DECIMAL_AMOUNT_ERROR = {
  INVALID_AMOUNT: 'INVALID_AMOUNT',
} as const

const AMOUNT_PATTERN = /^-?\d+(?:\.\d+)?$/
const TYPED_AMOUNT_PATTERN = /^(?:\d+|\d*\.\d+)$/
const WHITESPACE_PATTERN = /\s/g
const GROUP_SEPARATOR_PATTERN = /\./g
const NON_DIGIT_PATTERN = /\D/g
const NON_MEASURE_PATTERN = /[^\d,]/g
const LEADING_ZERO_PATTERN = /^0+/
const TRAILING_SEPARATOR_PATTERN = /\.$/
const GROUP_POSITION_PATTERN = /\B(?=(?:\d{3})+(?!\d))/g
/** Teto de dígitos da digitação: acima disso o campo deixa de ser dinheiro e vira erro de colagem. */
const TYPED_AMOUNT_MAX_DIGITS = 15
/** Parte inteira de `numeric(12, 2)`: peso e volume de veículo não passam de dez dígitos. */
const TYPED_MEASURE_MAX_INTEGER_DIGITS = 10
const MEASURE_DECIMAL_SEPARATOR = ','
const currencyFormatter = new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' })

type ScaledAmount = {
  readonly scale: number
  readonly units: bigint
}

export type ScaledAmountInput = Readonly<{
  scale: number
  value: string
}>

export type DivideAmountInput = ScaledAmountInput &
  Readonly<{
    divisor: number
  }>

export type DivideScaledAmountsInput = Readonly<{
  dividend: string
  divisor: string
  scale: number
}>

/** Zero na escala pedida: o campo em branco vira `'0.0000'`, que é o que a API aceita. */
export function zeroAmount(scale: number): string {
  return toDecimalString(0n, scale)
}

export function isZeroAmount(value: string): boolean {
  return parseScaledAmount(value).units === 0n
}

/**
 * Traduz o que o operador digitou em pt-BR para a escala decimal da API. Com vírgula presente o
 * ponto é separador de milhar; sem vírgula o ponto é o decimal, que é como a própria API responde.
 */
export function parseTypedAmount(input: ScaledAmountInput): string {
  return parseNormalizedTyped(normalizeTypedValue(input.value), input.scale)
}

/**
 * Traduz medida digitada em pt-BR — tara, capacidade — para a escala decimal da API. Diferente do
 * dinheiro, aqui o ponto é **sempre** milhar: quem o pôs foi a máscara, e lê-lo como decimal
 * transformaria os `1.493` kg digitados em 1,493 kg, uma carga mil vezes menor sem nenhum aviso.
 */
export function parseTypedMeasure(input: ScaledAmountInput): string {
  return parseNormalizedTyped(normalizeTypedMeasure(input.value), input.scale)
}

/** Devolve o valor para o campo de digitação; zero volta vazio para não fingir custo informado. */
export function toTypedAmount(input: ScaledAmountInput): string {
  const amount = parseScaledAmount(input.value)
  if (amount.units === 0n) return ''

  return toDecimalString(rescaleHalfUp(amount, input.scale), input.scale).replace('.', ',')
}

/** O mesmo que `toTypedAmount`, com o milhar que a máscara de medida mostra enquanto se digita. */
export function toTypedMeasure(input: ScaledAmountInput): string {
  const typed = toTypedAmount(input)
  if (typed === '') return ''
  const [integerPart = '', fractionPart] = typed.split(MEASURE_DECIMAL_SEPARATOR)
  const grouped = integerPart.replace(GROUP_POSITION_PATTERN, '.')

  return fractionPart === undefined
    ? grouped
    : `${grouped}${MEASURE_DECIMAL_SEPARATOR}${fractionPart}`
}

/**
 * Máscara de digitação em moeda: os dígitos entram pela direita, na escala do campo, e o milhar
 * aparece enquanto se digita. Sem ela `120000` e `12000` são a mesma linha de pixels, e o zero a
 * mais só é descoberto no relatório. É idempotente — reaplicar sobre a saída devolve a saída.
 */
export function maskTypedAmount(input: ScaledAmountInput): string {
  const digits = input.value.replace(NON_DIGIT_PATTERN, '').slice(0, TYPED_AMOUNT_MAX_DIGITS)
  const significant = digits.replace(LEADING_ZERO_PATTERN, '')
  if (significant === '') return ''

  const padded = significant.padStart(input.scale + 1, '0')
  const integerPart = padded.slice(0, padded.length - input.scale)
  const fractionPart = padded.slice(padded.length - input.scale)
  const grouped = integerPart.replace(GROUP_POSITION_PATTERN, '.')

  return input.scale === 0 ? grouped : `${grouped},${fractionPart}`
}

/**
 * Máscara de digitação em medida: os dígitos entram pela **esquerda**, como se escreve peso, e o
 * milhar aparece enquanto se digita. Inverter o sentido, como faz o dinheiro, faria `2007` virar
 * `20,07` — e a tara que o operador sempre digitou em quilos inteiros mudaria de ordem de grandeza
 * sem ele tocar em nada. A vírgula é o único separador que ele escreve; o ponto é sempre nosso.
 */
export function maskTypedMeasure(input: ScaledAmountInput): string {
  const compact = input.value.replace(WHITESPACE_PATTERN, '').replace(NON_MEASURE_PATTERN, '')
  const separatorIndex = input.scale === 0 ? -1 : compact.indexOf(MEASURE_DECIMAL_SEPARATOR)
  const hasSeparator = separatorIndex >= 0
  const typedInteger = hasSeparator ? compact.slice(0, separatorIndex) : compact
  const typedFraction = hasSeparator ? compact.slice(separatorIndex + 1) : ''

  const digits = typedInteger
    .replace(NON_DIGIT_PATTERN, '')
    .replace(LEADING_ZERO_PATTERN, '')
    .slice(0, TYPED_MEASURE_MAX_INTEGER_DIGITS)
  if (digits === '' && !hasSeparator) return ''

  const grouped = (digits === '' ? '0' : digits).replace(GROUP_POSITION_PATTERN, '.')
  if (!hasSeparator) return grouped

  const fraction = typedFraction.replace(NON_DIGIT_PATTERN, '').slice(0, input.scale)

  return `${grouped}${MEASURE_DECIMAL_SEPARATOR}${fraction}`
}

/** Divisão exata na escala pedida, arredondando meio para cima como o domínio da API. */
export function divideAmount(input: DivideAmountInput): string {
  const amount = parseScaledAmount(input.value)
  const units = divideHalfUp(rescaleHalfUp(amount, input.scale), BigInt(input.divisor))

  return toDecimalString(units, input.scale)
}

/**
 * Divisão entre dois decimais na escala pedida, meio para cima — a mesma conta que o domínio da API
 * faz para o R$/km. Divisor zerado devolve `null`: é pergunta sem resposta, não erro de digitação.
 */
export function divideScaledAmounts(input: DivideScaledAmountsInput): null | string {
  const divisor = parseScaledAmount(input.divisor)
  const dividend = parseScaledAmount(input.dividend)
  if (divisor.units === 0n) return null

  const units = divideHalfUp(
    rescaleHalfUp(dividend, input.scale) * 10n ** BigInt(divisor.scale),
    divisor.units,
  )

  return toDecimalString(units, input.scale)
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

function rescaleHalfUp(amount: ScaledAmount, scale: number): bigint {
  if (scale >= amount.scale) return rescale(amount, scale)

  return divideHalfUp(amount.units, 10n ** BigInt(amount.scale - scale))
}

function divideHalfUp(dividend: bigint, divisor: bigint): bigint {
  const isNegative = dividend < 0n
  const absolute = isNegative ? -dividend : dividend
  const quotient = absolute / divisor
  const rounded = (absolute % divisor) * 2n >= divisor ? quotient + 1n : quotient

  return isNegative ? -rounded : rounded
}

function parseNormalizedTyped(normalized: string, scale: number): string {
  if (normalized === '') return zeroAmount(scale)
  if (!TYPED_AMOUNT_PATTERN.test(normalized)) throw invalidAmount()
  const [integerPart = '', fractionPart = ''] = normalized.split('.')
  const typed: ScaledAmount = {
    scale: fractionPart.length,
    units: BigInt(`${integerPart}${fractionPart}`),
  }

  return toDecimalString(rescaleHalfUp(typed, scale), scale)
}

function normalizeTypedValue(value: string): string {
  const compact = value.replace(WHITESPACE_PATTERN, '')
  if (!compact.includes(MEASURE_DECIMAL_SEPARATOR)) return compact

  return compact.replace(GROUP_SEPARATOR_PATTERN, '').replace(MEASURE_DECIMAL_SEPARATOR, '.')
}

/** A vírgula ainda sem casa (`1.493,`) é passo normal da digitação, não valor inválido. */
function normalizeTypedMeasure(value: string): string {
  return value
    .replace(WHITESPACE_PATTERN, '')
    .replace(GROUP_SEPARATOR_PATTERN, '')
    .replace(MEASURE_DECIMAL_SEPARATOR, '.')
    .replace(TRAILING_SEPARATOR_PATTERN, '')
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
