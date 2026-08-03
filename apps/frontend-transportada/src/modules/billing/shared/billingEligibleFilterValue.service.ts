/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Teto de lista da API (`LIST_FILTER_MAX_VALUES`): acima disso a requisição volta 400. */
export const BILLING_ELIGIBLE_LIST_MAX_VALUES = 100
export const BILLING_ELIGIBLE_NAME_MIN_LENGTH = 2

/** `nCT` tem 9 dígitos no leiaute fiscal — o mesmo `^[1-9][0-9]{0,8}$` que a API exige. */
const FISCAL_NUMBER_PATTERN = /^[1-9][0-9]{0,8}$/
/** Traço comum, travessão e "até": o que um operador realmente digita ao pedir uma faixa. */
const RANGE_PATTERN = /^([1-9][0-9]{0,8})\s*(?:-|–|—|até)\s*([1-9][0-9]{0,8})$/
const MONEY_INPUT_PATTERN = /^(\d{1,12})(?:\.(\d{1,2}))?$/
const COMPARABLE_AMOUNT_PATTERN = /^\d{1,12}(?:\.\d{1,4})?$/
const NON_DIGIT_PATTERN = /\D/g
const DOCUMENT_MIN_DIGITS = 11
const DOCUMENT_MAX_DIGITS = 14
const MONEY_SCALE = 2

function unifyDecimalSeparator(raw: string): string {
  const trimmed = raw.trim().replaceAll(' ', '')
  return trimmed.includes(',') ? trimmed.replaceAll('.', '').replace(',', '.') : trimmed
}

export const NUMBER_FILTER_REASONS = {
  INVALID: 'invalid',
  MULTIPLE_RANGES: 'multiple-ranges',
  RANGE_INVERTED: 'range-inverted',
  TOO_MANY_VALUES: 'too-many-values',
} as const

export type NumberFilterReason = (typeof NUMBER_FILTER_REASONS)[keyof typeof NUMBER_FILTER_REASONS]

export type NumberFilterRange = Readonly<{ from: string; to: string }>

export type NumberFilterResult =
  | Readonly<{ ok: false; reason: NumberFilterReason }>
  | Readonly<{ ok: true; range?: NumberFilterRange; values?: readonly string[] }>

function failure(reason: NumberFilterReason): NumberFilterResult {
  return { ok: false, reason }
}

/**
 * Lê `3, 7, 10-40` num campo só. O motivo da recusa é devolvido em vez de virar `undefined`: entrada
 * inválida descartada em silêncio filtrava por nada e a tela mostrava a lista inteira como se fosse
 * o resultado.
 */
export function parseNumberFilterInput(raw: string): NumberFilterResult {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: true }

  const tokens = trimmed.split(',').map((token) => token.trim())
  const values: string[] = []
  const ranges: NumberFilterRange[] = []

  for (const token of tokens) {
    if (FISCAL_NUMBER_PATTERN.test(token)) {
      values.push(token)
      continue
    }
    const match = RANGE_PATTERN.exec(token)
    const from = match?.[1]
    const to = match?.[2]
    if (from === undefined || to === undefined) return failure(NUMBER_FILTER_REASONS.INVALID)
    if (BigInt(from) > BigInt(to)) return failure(NUMBER_FILTER_REASONS.RANGE_INVERTED)
    ranges.push({ from, to })
  }

  if (ranges.length > 1) return failure(NUMBER_FILTER_REASONS.MULTIPLE_RANGES)
  if (values.length > BILLING_ELIGIBLE_LIST_MAX_VALUES) {
    return failure(NUMBER_FILTER_REASONS.TOO_MANY_VALUES)
  }

  const range = ranges[0]
  return {
    ok: true,
    ...(range === undefined ? {} : { range }),
    ...(values.length === 0 ? {} : { values }),
  }
}

export function normalizeDocumentDigits(raw: string): string | undefined {
  const digits = raw.replace(NON_DIGIT_PATTERN, '')
  if (digits.length < DOCUMENT_MIN_DIGITS || digits.length > DOCUMENT_MAX_DIGITS) return undefined
  return digits
}

export function normalizeNameQuery(raw: string): string | undefined {
  const trimmed = raw.trim()
  return trimmed.length >= BILLING_ELIGIBLE_NAME_MIN_LENGTH ? trimmed : undefined
}

/** Comparação local aceita a escala fiscal inteira (4 casas), que a API não aceita como filtro. */
export function toComparableAmount(raw: string): string | undefined {
  const unified = unifyDecimalSeparator(raw)
  return COMPARABLE_AMOUNT_PATTERN.test(unified) ? unified : undefined
}

/** A tela aceita `1.234,56`; a API só aceita `1234.56`. A conversão é textual, sem float. */
export function normalizeMoneyInput(raw: string): string | undefined {
  const match = MONEY_INPUT_PATTERN.exec(unifyDecimalSeparator(raw))
  const integerDigits = match?.[1]
  if (integerDigits === undefined) return undefined
  return `${BigInt(integerDigits).toString()}.${(match?.[2] ?? '').padEnd(MONEY_SCALE, '0')}`
}
