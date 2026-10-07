/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF4: a normalização de cada célula da prévia. Decimal é aritmética inteira (`bigint`): o
 * Excel grava `138.69999999999999` e o peso é `138.700`, ao grama, sem passar por float binário.
 */
import type { SheetCell } from './cargo-preview-workbook.types.js'

export type DecimalReading =
  | { readonly kind: 'invalid' }
  | { readonly kind: 'too_large' }
  | { readonly kind: 'value'; readonly text: string }

export type ReadDecimalParams = {
  readonly cell: SheetCell
  /** Os dígitos inteiros que cabem na coluna de destino, depois do arredondamento. */
  readonly maxIntegerDigits: number
  readonly scale: number
}

const NUMERIC_CELL = /^([-+]?)(\d+)(?:\.(\d+))?(?:[eE]([-+]?\d+))?$/u
/** Texto aceita um separador decimal só — `1.780,62` é milhar e decimal, e adivinhar erra. */
const TEXT_DECIMAL = /^([-+]?)(\d+)(?:[.,](\d+))?$/u
const MAX_EXPONENT = 30
/** O Excel guarda 15 dígitos significativos: decimal mais longo é lixo, e `BigInt` sobre ele custa ms. */
const MAX_DECIMAL_TEXT_LENGTH = 40
const DIACRITICS = /\p{M}/gu
const CONTROL_CHARACTERS = /\p{Cc}/gu
const WHITESPACE_RUN = /\s+/gu
const STATE_CODE = /^[A-Z]{2}$/u
const POSTAL_CODE_SEPARATORS = /[.\-\s]/gu
const POSTAL_CODE = /^\d{7,8}$/u
const POSTAL_CODE_LENGTH = 8
/** `t="d"` do Excel é ISO 8601: a data, e talvez a hora (que o dia do roteiro não usa). */
const ISO_DATE_TIME =
  /^(\d{4}-\d{2}-\d{2})(?:T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/u
const NUMERIC_TEXT = /^\d+(?:\.\d+)?$/u
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30)
/** No sistema 1904 (`workbookPr date1904`) o serial 0 é 01/01/1904, sem o 29/02/1900 fantasma. */
const EXCEL_1904_EPOCH_MS = Date.UTC(1904, 0, 1)
const EXCEL_1904_OFFSET_DAYS = 1462
const DAY_MS = 86_400_000
/** O Excel herdou do Lotus o 29/02/1900, que não existe: o serial 60 é inválido, e antes dele o dia é +1. */
const EXCEL_PHANTOM_LEAP_DAY = 60
const EXCEL_LAST_SERIAL = 2_958_465

function roundHalfUp(input: { digits: bigint; exponent: number; scale: number }): bigint {
  const shift = input.exponent + input.scale
  if (shift >= 0) return input.digits * 10n ** BigInt(shift)
  const divisor = 10n ** BigInt(-shift)
  return (input.digits * 2n + divisor) / (divisor * 2n)
}

function formatScaled(scaled: bigint, scale: number): string {
  const text = scaled.toString().padStart(scale + 1, '0')
  return scale === 0 ? text : `${text.slice(0, -scale)}.${text.slice(-scale)}`
}

/** Decimal não negativo e finito, com `scale` casas, arredondado meio para cima. */
export function readNonNegativeDecimal(params: ReadDecimalParams): DecimalReading {
  const { cell, maxIntegerDigits, scale } = params
  const text = cell.text.trim()
  if (text.length > MAX_DECIMAL_TEXT_LENGTH) return { kind: 'invalid' }
  const match = (cell.isNumeric ? NUMERIC_CELL : TEXT_DECIMAL).exec(text)
  if (match === null) return { kind: 'invalid' }
  const [, sign = '', integer = '', fraction = '', exponentText = '0'] = match
  const exponent = Number(exponentText)
  if (Math.abs(exponent) > MAX_EXPONENT) return { kind: 'invalid' }
  const digits = BigInt(`${integer}${fraction}`)
  if (sign === '-' && digits !== 0n) return { kind: 'invalid' }
  const scaled = roundHalfUp({ digits, exponent: exponent - fraction.length, scale })
  if (scaled >= 10n ** BigInt(maxIntegerDigits + scale)) return { kind: 'too_large' }
  return { kind: 'value', text: formatScaled(scaled, scale) }
}

function readIsoDate(text: string): string | undefined {
  const date = ISO_DATE_TIME.exec(text)?.[1]
  if (date === undefined) return undefined
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date
    ? undefined
    : date
}

function readSerial1904(serial: number): string | undefined {
  if (serial < 0 || serial > EXCEL_LAST_SERIAL - EXCEL_1904_OFFSET_DAYS) return undefined
  return new Date(EXCEL_1904_EPOCH_MS + serial * DAY_MS).toISOString().slice(0, 10)
}

/** Data do roteiro: serial do Excel (sistema 1900 ou 1904, do arquivo) ou ISO `AAAA-MM-DD[Thh:mm…]`. */
export function readExcelDate(input: {
  readonly cell: SheetCell
  readonly isDate1904: boolean
}): string | undefined {
  const text = input.cell.text.trim()
  if (!input.cell.isNumeric) {
    const date = readIsoDate(text)
    if (date !== undefined) return date
  }
  if (!NUMERIC_TEXT.test(text)) return undefined
  const serial = Math.floor(Number(text))
  if (input.isDate1904) return readSerial1904(serial)
  if (serial < 1 || serial === EXCEL_PHANTOM_LEAP_DAY || serial > EXCEL_LAST_SERIAL)
    return undefined
  const days = serial < EXCEL_PHANTOM_LEAP_DAY ? serial + 1 : serial
  return new Date(EXCEL_EPOCH_MS + days * DAY_MS).toISOString().slice(0, 10)
}

/** CEP só dígitos, 8; o número do Excel perde o zero da frente (`1310100` → `01310100`). */
export function readPostalCode(cell: SheetCell): string | undefined {
  const digits = cell.text.trim().replace(POSTAL_CODE_SEPARATORS, '')
  return POSTAL_CODE.test(digits) ? digits.padStart(POSTAL_CODE_LENGTH, '0') : undefined
}

export function normalizeText(text: string): string {
  return text.replace(CONTROL_CHARACTERS, ' ').replace(WHITESPACE_RUN, ' ').trim()
}

/** Cidade e UF como o XML da NF-e e a planilha FR gravam: sem acento, caixa alta. */
export function normalizePlaceName(text: string): string {
  return normalizeText(text).normalize('NFD').replace(DIACRITICS, '').toUpperCase()
}

export function readStateCode(cell: SheetCell): string | undefined {
  const state = normalizePlaceName(cell.text)
  return STATE_CODE.test(state) ? state : undefined
}

/** Código lido de célula numérica (`815358` ou `815358.0`) vira os dígitos, sem a casa decimal. */
export function readCode(cell: SheetCell): string {
  const text = normalizeText(cell.text)
  return cell.isNumeric ? text.replace(/\.0+$/u, '') : text
}
