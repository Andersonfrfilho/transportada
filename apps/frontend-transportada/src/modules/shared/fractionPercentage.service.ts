/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * A API guarda alíquota como **fração** (`0.006500`) e a tela mostra **percentual** (`0,65%`). A
 * conversão é textual, com inteiro escalado: `Number` traria erro binário para dentro de campo
 * fiscal, e guardar o percentual onde se espera a fração multiplicaria a conta por cem.
 */
const FRACTION_DIGITS = 6
const PERCENT_DIGITS = 4
const FRACTION_UNIT = 10n ** BigInt(FRACTION_DIGITS)
const PERCENT_UNIT = 10n ** BigInt(PERCENT_DIGITS)

/** `'0.006500'` → `'0.6500'` (percentual com quatro casas). Entrada malformada devolve `'0.0000'`. */
export function fractionToPercentage(fraction: string): string {
  const scaled = parseScaled(fraction, FRACTION_DIGITS)
  if (scaled === null) return formatScaled(0n, PERCENT_DIGITS)

  /** ×100 e de seis para quatro casas: os dígitos são os mesmos, só a vírgula anda. */
  return formatScaled(scaled, PERCENT_DIGITS)
}

/**
 * `'0,65'` ou `'0.65'` → `'0.006500'` (fração com seis casas). `null` quando o texto não é número
 * não negativo com até quatro casas decimais.
 */
export function percentageToFraction(percentage: string): null | string {
  const scaled = parseScaled(percentage.trim().replace(',', '.'), PERCENT_DIGITS)
  if (scaled === null) return null

  /** O percentual escalado em quatro casas é a fração escalada em seis: mesmos dígitos. */
  return formatScaled(scaled, FRACTION_DIGITS)
}

function parseScaled(value: string, digits: number): bigint | null {
  const match = /^(\d+)(?:\.(\d*))?$/.exec(value)
  if (match === null) return null

  const [, integer = '0', fraction = ''] = match
  if (fraction.length > digits) return null

  return BigInt(integer) * 10n ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0') || '0')
}

function formatScaled(value: bigint, digits: number): string {
  const unit = digits === FRACTION_DIGITS ? FRACTION_UNIT : PERCENT_UNIT
  const integer = value / unit
  const fraction = (value % unit).toString().padStart(digits, '0')

  return `${integer}.${fraction}`
}
