/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 247 (T7.2, A3): a máscara de centavos do valor pago — a MESMA semântica do painel
 * (`maskAmountInput`, `apps/frontend-transportada`), replicada aqui porque nenhuma app importa código
 * de outra. Só dígito entra, os dois últimos são sempre os centavos e a tela mostra `1.234,56`.
 * Nenhum dígito é descartado em silêncio: o que está na tela é o que vai; no teto a tela avisa.
 * Tudo em `string`/`bigint`, nunca `number`.
 */

const NON_DIGIT = /\D/gu
const LEADING_ZEROS = /^0+/u
const THOUSANDS_BOUNDARY = /\B(?=(\d{3})+(?!\d))/gu
const CENTS_DIGITS = 2
const ZERO_MASKED = '0,00'

/** `DECLARED_AMOUNT_DECIMAL` da API: dez dígitos inteiros e duas casas. */
export const MONEY_MAX_INTEGER_DIGITS = 10
const MONEY_MAX_DIGITS = MONEY_MAX_INTEGER_DIGITS + CENTS_DIGITS

function splitCents(significant: string): { readonly cents: string; readonly integer: string } {
  const padded = significant.padStart(CENTS_DIGITS + 1, '0')
  const integer = padded.slice(0, -CENTS_DIGITS).replace(LEADING_ZEROS, '')
  return { cents: padded.slice(-CENTS_DIGITS), integer: integer === '' ? '0' : integer }
}

/**
 * O texto do campo depois de uma digitação ou colagem. Vazio fica vazio; `0` é um valor (`0,00`).
 * Apagar a partir de `0,00` limpa o campo — sem isso o zero nunca sairia.
 */
export function maskMoneyInput(input: {
  readonly previousText: string
  readonly text: string
}): string {
  const digits = input.text.replace(NON_DIGIT, '')
  if (digits === '') return ''

  const significant = digits.replace(LEADING_ZEROS, '').slice(0, MONEY_MAX_DIGITS)
  const isDeletion = input.text.length < input.previousText.length
  if (significant === '' && isDeletion && input.previousText === ZERO_MASKED) return ''

  const { cents, integer } = splitCents(significant)
  return `${integer.replace(THOUSANDS_BOUNDARY, '.')},${cents}`
}

/** Chegou ao teto de dígitos: a próxima tecla não entra — e a tela diz isso. */
export function isMoneyInputAtLimit(text: string): boolean {
  return text.replace(NON_DIGIT, '').replace(LEADING_ZEROS, '').length >= MONEY_MAX_DIGITS
}

/** O texto que a API aceita (`"1234.56"`) a partir do mascarado; vazio é "não digitado". */
export function unmaskMoneyText(masked: string): string | undefined {
  const digits = masked.replace(NON_DIGIT, '')
  if (digits === '') return undefined

  const { cents, integer } = splitCents(digits.replace(LEADING_ZEROS, ''))
  return `${integer}.${cents}`
}
