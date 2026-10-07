/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 247 (T5.3): o que o motorista digita vira o texto que o servidor aceita — sempre `string`,
 * nunca `number` (dinheiro e quantidade em ponto flutuante perdem o centavo). O teclado do celular
 * traz vírgula ou ponto: os dois valem como separador decimal, e o texto sai com ponto.
 */

const DECIMAL_INPUT = /^(\d*)(?:[.,](\d*))?$/u
const NON_DECIMAL_CHARACTER = /[^\d.,]/gu
const SEPARATOR = /[.,]/u
const EVERY_SEPARATOR = /[.,]/gu
const REFERENCE_NUMBER_FORBIDDEN = /[^A-Za-z0-9 ./-]/gu

/** A quantidade devolvida é `numeric(12,3)`: nove dígitos inteiros e três casas. */
export const QUANTITY_LIMITS = { maxDecimals: 3, maxIntegerDigits: 9 } as const

/** `OCCURRENCE_REFERENCE_NUMBER_PATTERN` da API: até 30 caracteres. */
export const REFERENCE_NUMBER_MAX_LENGTH = 30

/**
 * Quantidade: só dígitos e **um** separador — `.` vale como `,` e o campo mostra a vírgula. Dígito
 * além do permitido NÃO é cortado: fica como digitado e a tela marca o campo (`quantityProblem`).
 */
export function sanitizeQuantityInput(text: string): string {
  const cleaned = text.replace(NON_DECIMAL_CHARACTER, '')
  const separatorIndex = cleaned.search(SEPARATOR)
  if (separatorIndex < 0) return cleaned
  const integer = cleaned.slice(0, separatorIndex)
  const decimals = cleaned.slice(separatorIndex + 1).replace(EVERY_SEPARATOR, '')
  return `${integer},${decimals}`
}

/**
 * O texto digitado no texto canônico: `"1,5"` → `"1.5"`, `"007"` → `"7"`, `",5"` → `"0.5"`.
 * Vazio, ou só o separador, é "não digitado" (`undefined`) — e `"0"` é um valor, não vazio.
 */
export function toCanonicalDecimal(text: string): string | undefined {
  const match = DECIMAL_INPUT.exec(text.trim())
  if (match === null) return undefined
  const integerDigits = match[1] ?? ''
  const decimalDigits = match[2] ?? ''
  if (integerDigits === '' && decimalDigits === '') return undefined

  const integer = BigInt(integerDigits === '' ? '0' : integerDigits).toString()
  return decimalDigits === '' ? integer : `${integer}.${decimalDigits}`
}

/** Número do documento do cliente: o que o padrão da API recusa nem entra no campo. */
export function sanitizeReferenceNumberInput(text: string): string {
  return text.replace(REFERENCE_NUMBER_FORBIDDEN, '').slice(0, REFERENCE_NUMBER_MAX_LENGTH)
}

/** Vazio (depois de aparar) é "não informado" — a API também lê assim. */
export function toReferenceNumber(text: string): string | undefined {
  const trimmed = sanitizeReferenceNumberInput(text).trim()
  return trimmed === '' ? undefined : trimmed
}
