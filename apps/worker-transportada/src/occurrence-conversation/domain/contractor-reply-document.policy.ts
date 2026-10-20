/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 276 T2: the boleto check of the contractor reply. A PDF only counts as the boleto when its text layer
 * carries a payment line whose check digits close (FEBRABAN) **and** that names the note of the occurrence —
 * its number printed in the document, or the amount of the line equal to the note total. Anything else (a
 * scanned image without text, the note PDF itself, a receipt) is not confirmed and goes to the operator: the
 * check only avoids the false positive, it never refuses a document on its own.
 *
 * Pure: no I/O, no clock. The text is what the document generator wrote (no OCR), read before this runs.
 *
 * ⚠️ Value copy in the API and in the worker (no app imports another), held together by the parity
 * contract in the worker (`test/occurrence-conversation/contractor-reply-parity.contract.ts`).
 */

/** A bank boleto line has 47 digits; a collection slip (utility, tax) has 48 and starts with 8. */
const BANK_LINE_LENGTH = 47
const COLLECTION_LINE_LENGTH = 48
/** Bounds the scan of a hostile text layer; a real boleto prints the line on its first page. */
const MAX_SCANNED_TEXT_LENGTH = 200_000

export type BoletoNoteReference = {
  /** The note number as imported (`nfe_documents.number`). */
  readonly number: string
  /** The note total as stored (`nfe_documents.total_value`, decimal text). */
  readonly totalValue: string
}

export type BoletoDocumentCheck =
  | { readonly confirmed: true; readonly matchedBy: 'amount' | 'number' }
  | { readonly confirmed: false; readonly missing: 'note_reference' | 'payment_line' }

function digitsOf(value: string): number[] {
  return [...value].map(Number)
}

/** FEBRABAN modulo 10: weights 2, 1, 2, 1… from the right, each product's digits summed. */
function modulo10(digits: readonly number[]): number {
  let sum = 0
  let weight = 2
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    const product = (digits[index] ?? 0) * weight
    sum += Math.floor(product / 10) + (product % 10)
    weight = weight === 2 ? 1 : 2
  }
  return (10 - (sum % 10)) % 10
}

function modulo11Sum(digits: readonly number[]): number {
  let sum = 0
  let weight = 2
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    sum += (digits[index] ?? 0) * weight
    weight = weight === 9 ? 2 : weight + 1
  }
  return sum % 11
}

/** The general digit of the bank barcode: 0, 10 and 11 become 1. */
function bankBarcodeDigit(digits: readonly number[]): number {
  const digit = 11 - modulo11Sum(digits)
  return digit === 0 || digit >= 10 ? 1 : digit
}

/** The block digit of a collection slip in modulo 11: 10 and 11 become 0. */
function collectionModulo11(digits: readonly number[]): number {
  const digit = 11 - modulo11Sum(digits)
  return digit >= 10 ? 0 : digit
}

function isValidBankLine(line: string): boolean {
  const digits = digitsOf(line)
  const fields: readonly (readonly [number, number])[] = [
    [0, 9],
    [10, 20],
    [21, 31],
  ]
  for (const [start, end] of fields) {
    if (modulo10(digits.slice(start, end)) !== digits[end]) return false
  }
  const barcode = [
    ...digits.slice(0, 4),
    ...digits.slice(33, 47),
    ...digits.slice(4, 9),
    ...digits.slice(10, 20),
    ...digits.slice(21, 31),
  ]
  return bankBarcodeDigit(barcode) === digits[32]
}

function isValidCollectionLine(line: string): boolean {
  const digits = digitsOf(line)
  if (digits[0] !== 8) return false
  const valueKind = digits[2]
  const blockDigit =
    valueKind === 6 || valueKind === 7
      ? modulo10
      : valueKind === 8 || valueKind === 9
        ? collectionModulo11
        : undefined
  if (blockDigit === undefined) return false
  for (let block = 0; block < 4; block += 1) {
    const start = block * 12
    if (blockDigit(digits.slice(start, start + 11)) !== digits[start + 11]) return false
  }
  return true
}

/** True when the digits (separators already removed) are a boleto line whose check digits close. */
export function isValidBoletoPaymentLine(line: string): boolean {
  if (!/^\d+$/.test(line)) return false
  if (line.length === BANK_LINE_LENGTH) return isValidBankLine(line)
  if (line.length === COLLECTION_LINE_LENGTH) return isValidCollectionLine(line)
  return false
}

/**
 * The lines found in the text. The generator splits the line in groups ("34191.79001 01043.510047 …"), and
 * the bank code may sit right before it ("341-7"): every run of consecutive digit groups that adds up to 47
 * or 48 digits is tried.
 */
export function findBoletoPaymentLines(text: string): readonly string[] {
  const groups = text.slice(0, MAX_SCANNED_TEXT_LENGTH).match(/\d+/g) ?? []
  const lines = new Set<string>()
  for (let first = 0; first < groups.length; first += 1) {
    let candidate = ''
    for (let last = first; last < groups.length; last += 1) {
      candidate += groups[last] ?? ''
      if (candidate.length > COLLECTION_LINE_LENGTH) break
      if (
        (candidate.length === BANK_LINE_LENGTH || candidate.length === COLLECTION_LINE_LENGTH) &&
        isValidBoletoPaymentLine(candidate)
      ) {
        lines.add(candidate)
      }
    }
  }
  return [...lines]
}

/** Cents of a decimal text, rounded half up ("6561.7850" → 656179n); not a number is `null`. */
export function decimalTextToCents(value: string): bigint | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim())
  if (match === null) return null
  const fraction = (match[2] ?? '').padEnd(3, '0')
  const cents = BigInt(match[1] ?? '0') * 100n + BigInt(fraction.slice(0, 2))
  return Number(fraction[2]) >= 5 ? cents + 1n : cents
}

/** The amount printed in a bank line, in cents; `null` when the line carries no amount. */
function bankLineAmountCents(line: string): bigint | null {
  if (line.length !== BANK_LINE_LENGTH) return null
  const cents = BigInt(line.slice(37, 47))
  return cents === 0n ? null : cents
}

function significantDigits(value: string): string {
  return value.replace(/\D/g, '').replace(/^0+/, '')
}

/** The note number as a whole token of the text ("912453", "912.453", "000912453"), never inside a longer one. */
function mentionsNoteNumber(text: string, noteNumber: string): boolean {
  const expected = significantDigits(noteNumber)
  if (expected === '') return false
  const tokens = text.slice(0, MAX_SCANNED_TEXT_LENGTH).match(/\d[\d.]*/g) ?? []
  return tokens.some((token) => significantDigits(token) === expected)
}

export function checkBoletoDocument(input: {
  readonly note: BoletoNoteReference | null
  readonly text: string
}): BoletoDocumentCheck {
  const lines = findBoletoPaymentLines(input.text)
  if (lines.length === 0) return { confirmed: false, missing: 'payment_line' }
  if (input.note === null) return { confirmed: false, missing: 'note_reference' }

  if (mentionsNoteNumber(input.text, input.note.number)) {
    return { confirmed: true, matchedBy: 'number' }
  }
  const noteCents = decimalTextToCents(input.note.totalValue)
  if (noteCents !== null && lines.some((line) => bankLineAmountCents(line) === noteCents)) {
    return { confirmed: true, matchedBy: 'amount' }
  }
  return { confirmed: false, missing: 'note_reference' }
}
