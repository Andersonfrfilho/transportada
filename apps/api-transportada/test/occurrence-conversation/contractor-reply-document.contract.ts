/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 * ⚠️ The same file, byte for byte, lives in the API and in the worker (no app imports another): the
 * parity contract of the worker (`contractor-reply-parity.contract.ts`) holds both copies equal.
 *
 * Spec 276 T2: the boleto check — a valid FEBRABAN line that names the note, or the operator decides.
 */
import { describe, expect, test } from 'bun:test'

import {
  checkBoletoDocument,
  decimalTextToCents,
  findBoletoPaymentLines,
  isValidBoletoPaymentLine,
} from '../../src/occurrence-conversation/domain/contractor-reply-document.policy.js'

/** Bank line of R$ 6.561,78 (amount in the last ten digits), printed in groups the way the bank prints it. */
const BANK_LINE = '34191790011043510047391020150008696610000656178'
const PRINTED_BANK_LINE = '34191.79001 10435.100473 91020.150008 6 96610000656178'
/** Bank line without amount (the payer types it at the counter). */
const BANK_LINE_WITHOUT_AMOUNT = '23793381286000012345967000000009898000000000000'
/** Collection slips: modulo 10 (third digit 6) and modulo 11 (third digit 8). */
const COLLECTION_LINE_MODULO_10 = '816400000120345000000009000000000000000000000000'
const COLLECTION_LINE_MODULO_11 = '818600000129345111111110111111111112111111111112'

const NOTE = { number: '912453', totalValue: '6561.7800' }

function changeDigit(line: string, index: number): string {
  const digit = Number(line[index])
  return `${line.slice(0, index)}${(digit + 1) % 10}${line.slice(index + 1)}`
}

describe('boleto payment line (spec 276 T2)', () => {
  test.each([
    ['bank line', BANK_LINE],
    ['bank line without amount', BANK_LINE_WITHOUT_AMOUNT],
    ['collection slip in modulo 10', COLLECTION_LINE_MODULO_10],
    ['collection slip in modulo 11', COLLECTION_LINE_MODULO_11],
  ])('a %s whose check digits close is valid', (_label, line) => {
    expect(isValidBoletoPaymentLine(line)).toBe(true)
  })

  test.each([
    ['the first field', 3],
    ['the second field', 14],
    ['the third field', 25],
    ['the general digit', 32],
    ['the amount', 45],
  ])('one digit changed in %s breaks the bank line', (_label, index) => {
    expect(isValidBoletoPaymentLine(changeDigit(BANK_LINE, index))).toBe(false)
  })

  test('one digit changed in a block breaks the collection slip', () => {
    expect(isValidBoletoPaymentLine(changeDigit(COLLECTION_LINE_MODULO_10, 5))).toBe(false)
    expect(isValidBoletoPaymentLine(changeDigit(COLLECTION_LINE_MODULO_11, 30))).toBe(false)
  })

  test.each([
    ['too short', BANK_LINE.slice(0, 46)],
    ['an access key of 44 digits', '35261012345678000199550010009124531000000017'],
    ['not only digits', `${BANK_LINE.slice(0, 46)}x`],
    ['48 digits not starting with 8', `1${BANK_LINE}`],
  ])('%s is never a line', (_label, line) => {
    expect(isValidBoletoPaymentLine(line)).toBe(false)
  })

  test('the line is found in the printed groups, with the bank code right before it', () => {
    const text = `Banco Itaú 341-7 ${PRINTED_BANK_LINE}\nLocal de pagamento`

    expect(findBoletoPaymentLines(text)).toEqual([BANK_LINE])
  })

  test('a text without a valid line finds none', () => {
    const text = `Linha: ${changeDigit(BANK_LINE, 10)} Pedido 912453 valor 6.561,78`

    expect(findBoletoPaymentLines(text)).toEqual([])
  })
})

describe('note amount in cents (spec 276 T2)', () => {
  test.each([
    ['6561.7800', 656178n],
    ['6561.78', 656178n],
    ['6561.7850', 656179n],
    ['6561.7849', 656178n],
    ['10', 1000n],
    ['0.0050', 1n],
  ])('%s is %p cents', (value, cents) => {
    expect(decimalTextToCents(value)).toBe(cents)
  })

  test('a text that is not a decimal is no amount', () => {
    expect(decimalTextToCents('6.561,78')).toBeNull()
  })
})

describe('boleto document check (spec 276 T2)', () => {
  test('the boleto that prints the note number is confirmed by the number', () => {
    const text = `${PRINTED_BANK_LINE}\nNº do documento 912453\nPagador TINTI SUPER ATACADO`

    expect(checkBoletoDocument({ note: NOTE, text })).toEqual({
      confirmed: true,
      matchedBy: 'number',
    })
  })

  test('the number printed with a thousand dot or leading zeros still names the note', () => {
    for (const printed of ['912.453', '000912453']) {
      const text = `${PRINTED_BANK_LINE} Documento ${printed}`
      expect(checkBoletoDocument({ note: NOTE, text }).confirmed).toBe(true)
    }
  })

  test('without the number, the amount of the line equal to the note total confirms it', () => {
    expect(checkBoletoDocument({ note: NOTE, text: PRINTED_BANK_LINE })).toEqual({
      confirmed: true,
      matchedBy: 'amount',
    })
  })

  test('a valid line of another amount and without the number is not this note', () => {
    expect(
      checkBoletoDocument({ note: { ...NOTE, totalValue: '6561.79' }, text: PRINTED_BANK_LINE }),
    ).toEqual({ confirmed: false, missing: 'note_reference' })
  })

  test('the number inside a longer number does not name the note', () => {
    const text = `${BANK_LINE_WITHOUT_AMOUNT} Pedido 19124531`

    expect(checkBoletoDocument({ note: NOTE, text })).toEqual({
      confirmed: false,
      missing: 'note_reference',
    })
  })

  test('the note PDF itself (number and amount, no payment line) is not the boleto', () => {
    const text = 'DANFE Nº 912.453 Série 1 Valor total da nota 6.561,78 Chave de acesso'

    expect(checkBoletoDocument({ note: NOTE, text })).toEqual({
      confirmed: false,
      missing: 'payment_line',
    })
  })

  test('a scanned PDF without text layer is not confirmed', () => {
    expect(checkBoletoDocument({ note: NOTE, text: '' })).toEqual({
      confirmed: false,
      missing: 'payment_line',
    })
  })

  test('with no note to compare, a valid line alone is not enough', () => {
    expect(checkBoletoDocument({ note: null, text: PRINTED_BANK_LINE })).toEqual({
      confirmed: false,
      missing: 'note_reference',
    })
  })
})
