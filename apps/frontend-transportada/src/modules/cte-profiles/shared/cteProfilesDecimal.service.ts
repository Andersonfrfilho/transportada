/* Copyright (c) 2026 Ada Technology. MIT License. */
import { CTE_PROFILES_ERROR, ZERO_RATE } from './cteProfiles.constant'

const RATE_SCALE = 6
const MONEY_SCALE = 4
const PERCENT_SHIFT = 2
const DIGITS_PATTERN = /^\d+(?:\.\d+)?$/
const MAX_RATE_FRACTION = '1.000000'

type ParsedDecimal = Readonly<{ digits: string; scale: number }>

function parseTypedDecimal(value: string): null | ParsedDecimal {
  const trimmed = value.trim()
  const normalized = trimmed.includes(',') ? trimmed.replaceAll('.', '').replace(',', '.') : trimmed
  if (!DIGITS_PATTERN.test(normalized)) return null
  const [integerPart = '', fractionPart = ''] = normalized.split('.')
  return { digits: `${integerPart}${fractionPart}`, scale: fractionPart.length }
}

function toFixedString(parsed: ParsedDecimal, scale: number): null | string {
  let digits = parsed.digits
  if (parsed.scale > scale) {
    const droppedLength = parsed.scale - scale
    const dropped = digits.slice(digits.length - droppedLength)
    if (/[1-9]/.test(dropped)) return null
    digits = digits.slice(0, digits.length - droppedLength)
  } else {
    digits = digits.padEnd(digits.length + (scale - parsed.scale), '0')
  }
  const padded = digits.padStart(scale + 1, '0')
  const integerPart = padded.slice(0, padded.length - scale).replace(/^0+(?=\d)/, '')
  return scale === 0 ? integerPart : `${integerPart}.${padded.slice(padded.length - scale)}`
}

function isAboveMaximumRate(fraction: string): boolean {
  if (fraction.length !== MAX_RATE_FRACTION.length) {
    return fraction.length > MAX_RATE_FRACTION.length
  }
  return fraction > MAX_RATE_FRACTION
}

function rateError(): Error {
  return new Error(CTE_PROFILES_ERROR.INVALID_RATE)
}

export function toRateFraction(value: string): string {
  if (value.trim() === '') return ZERO_RATE
  const parsed = parseTypedDecimal(value)
  if (parsed === null) throw rateError()
  const fraction = toFixedString(
    { digits: parsed.digits, scale: parsed.scale + PERCENT_SHIFT },
    RATE_SCALE,
  )
  if (fraction === null || isAboveMaximumRate(fraction)) throw rateError()
  return fraction
}

export function fromRateFraction(value: string): string {
  const parsed = parseTypedDecimal(value)
  if (parsed === null || parsed.scale < PERCENT_SHIFT) return ''
  const percent = toFixedString(
    { digits: parsed.digits, scale: parsed.scale - PERCENT_SHIFT },
    MONEY_SCALE,
  )
  if (percent === null) return ''
  const [integerPart = '0', fractionPart = ''] = percent.split('.')
  const trimmedFraction = fractionPart.replace(/0+$/, '')
  return trimmedFraction === '' ? integerPart : `${integerPart},${trimmedFraction}`
}

export function toMoneyDecimal(value: string): null | string {
  if (value.trim() === '') return null
  const parsed = parseTypedDecimal(value)
  if (parsed === null) throw new Error(CTE_PROFILES_ERROR.INVALID_AMOUNT)
  const amount = toFixedString(parsed, MONEY_SCALE)
  if (amount === null) throw new Error(CTE_PROFILES_ERROR.INVALID_AMOUNT)
  return amount
}

export function fromMoneyDecimal(value: null | string): string {
  if (value === null) return ''
  const parsed = parseTypedDecimal(value)
  if (parsed === null) return ''
  const amount = toFixedString(parsed, 2)
  if (amount === null) return value.replace('.', ',')
  return amount.replace('.', ',')
}
