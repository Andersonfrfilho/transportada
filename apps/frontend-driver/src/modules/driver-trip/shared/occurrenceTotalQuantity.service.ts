/* Copyright (c) 2026 Ada Technology. MIT License. */
import { parseScaledDecimal } from './occurrenceAmount.service'
import { QUANTITY_LIMITS, toCanonicalDecimal } from './occurrenceDecimalInput.service'

const NOTE_QUANTITY_PATTERN = /^(\d+)(?:\.(\d{1,4}))?$/u
const TRAILING_ZEROS = /0+$/u
const NON_ZERO_DIGIT = /[1-9]/u

/**
 * O texto que o botão "Total da nota" põe no campo: tudo o que a nota tem do produto, com vírgula e sem
 * zeros à toa (`'2.5000'` → `2,5`). `undefined` quando não há o que devolver ou o campo não o aceitaria
 * (zero, texto inválido, mais de três casas significativas, mais de nove dígitos inteiros).
 */
export function resolveTotalQuantityText(onNote: string): string | undefined {
  const match = NOTE_QUANTITY_PATTERN.exec(onNote)
  if (match === null || !NON_ZERO_DIGIT.test(onNote)) return undefined

  const integer = BigInt(match[1] ?? '0').toString()
  const fraction = (match[2] ?? '').replace(TRAILING_ZEROS, '')
  if (integer.length > QUANTITY_LIMITS.maxIntegerDigits) return undefined
  if (fraction.length > QUANTITY_LIMITS.maxDecimals) return undefined
  return fraction === '' ? integer : `${integer},${fraction}`
}

/** O campo vale o mesmo que a nota (`3`, `3,0` e `3,00` são a mesma quantidade). */
export function isTotalQuantityText(input: {
  readonly onNote: string
  readonly quantityText: string
}): boolean {
  const canonical = toCanonicalDecimal(input.quantityText)
  if (canonical === undefined || NOTE_QUANTITY_PATTERN.exec(input.onNote) === null) return false
  return parseScaledDecimal(canonical) === parseScaledDecimal(input.onNote)
}
