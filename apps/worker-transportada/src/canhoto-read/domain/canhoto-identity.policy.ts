/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 D3 / RF1: lê o Nº e a Série **impressos** no canhoto, ancorados pelo rótulo ("NF-e", "Nº",
 * "SÉRIE"). Diferente de `evaluateCanhotoText` (canhoto-ocr), que procura números já conhecidos, aqui não
 * há lista: por isso a régua é estrita.
 *
 * - Número só com rótulo. "NF-e" (forte) vence "Nº" solto (fraco: pode ser o número da rua num DANFE
 *   inteiro). Dois números diferentes no mesmo nível ⇒ nada. "Nº" de outro documento (pedido, CT-e,
 *   fatura...) não conta.
 * - Número exato: sem distância de edição (um dígito errado geraria alerta falso). Só o rótulo da série
 *   tolera um erro.
 * - Devolve só dígitos; o texto reconhecido nunca sai daqui (ADR-0113 §5.3).
 */
import {
  CANHOTO_IDENTITY_MAX_NUMBER_DIGITS,
  CANHOTO_IDENTITY_MIN_NUMBER_DIGITS,
  CANHOTO_IDENTITY_SERIES_LABEL,
  CANHOTO_IDENTITY_SERIES_LABEL_MAX_DISTANCE,
} from './canhoto-identity.constant.js'
import type { CanhotoIdentity } from './canhoto-identity.types.js'

/** Entre o rótulo e o valor: espaço, ponto, dois-pontos e no máximo uma quebra de linha. */
const GAP = String.raw`[ .:]*\n?[ .:]*`
/** "Nº", "N°", "No", "N.º", "Nro", "Num", "Número" e o "N" cujo "º" o OCR perdeu. */
const NUMBER_LABEL = String.raw`(?:NUMERO|NUM|NRO|NR|N\.?O|N)(?![A-Z])`
/** 000.172.195 / 172,195 (grupos de 3) ou 000172195; nunca colado a outro dígito. */
const NUMBER_VALUE = String.raw`(?<!\d)(\d{1,3}(?:[.,]\d{3}){1,2}|\d+)(?![.,]?\d)`
const INVOICE_LABEL = String.raw`(?<![A-Z0-9])(?:NF ?E|NF|NOTA FISCAL(?: ELETRONICA)?)(?![A-Z0-9])`

const STRONG_NUMBER = new RegExp(
  `${INVOICE_LABEL}${GAP}(?:${NUMBER_LABEL}${GAP})?${NUMBER_VALUE}`,
  'gu',
)
const WEAK_NUMBER = new RegExp(String.raw`(?<![A-Z0-9])${NUMBER_LABEL}${GAP}${NUMBER_VALUE}`, 'gu')
/** O "Nº" que vem logo depois destes rótulos é de outro documento, não da nota. */
const OTHER_DOCUMENT_BEFORE_LABEL =
  /(?:^|[^A-Z0-9])(?:PEDIDO|PED|ORDEM|COMPRA|OC|ROMANEIO|FATURA|DUPLICATA|CT ?E|CONTRATO|LOTE|PROTOCOLO|CEP|CNPJ|CPF|IE|FONE|TEL|TELEFONE|VOLUMES?|DEBITO|CREDITO)[ .:]*$/u
/** Palavra de 4 a 6 caracteres (o "5" do "5ÉRIE", o "1" do "SER1E") seguida da série, de 1 a 3 dígitos. */
const SERIES = new RegExp(String.raw`(?<![A-Z])([A-Z5][A-Z1]{3,5})${GAP}(\d{1,3})(?![.,]?\d)`, 'gu')

function normalizeLine(line: string): string {
  return line
    .normalize('NFKD')
    .replace(/[̀-ͯ]/gu, '')
    .toUpperCase()
    .replace(/°/gu, 'O')
    .replace(/[^A-Z0-9.,:]+/gu, ' ')
    .replace(/ {2,}/gu, ' ')
    .trim()
}

function editDistance(left: string, right: string): number {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0] as number
    row[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = row[rightIndex] as number
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      row[rightIndex] = Math.min(above + 1, (row[rightIndex - 1] as number) + 1, diagonal + cost)
      diagonal = above
    }
  }
  return row[right.length] as number
}

/** Dígitos sem separador e sem zeros à esquerda; `null` se não pode ser número de nota. */
function toInvoiceNumber(printed: string): string | null {
  const digits = printed.replace(/\D/gu, '')
  if (
    digits.length < CANHOTO_IDENTITY_MIN_NUMBER_DIGITS ||
    digits.length > CANHOTO_IDENTITY_MAX_NUMBER_DIGITS
  )
    return null
  const number = digits.replace(/^0+/u, '')
  return number.length > 0 ? number : null
}

function strongNumbers(text: string): ReadonlySet<string> {
  const numbers = new Set<string>()
  for (const match of text.matchAll(STRONG_NUMBER)) {
    const number = toInvoiceNumber(match[1] ?? '')
    if (number !== null) numbers.add(number)
  }
  return numbers
}

function weakNumbers(text: string): ReadonlySet<string> {
  const numbers = new Set<string>()
  for (const match of text.matchAll(WEAK_NUMBER)) {
    const lineStart = text.lastIndexOf('\n', match.index) + 1
    if (OTHER_DOCUMENT_BEFORE_LABEL.test(text.slice(lineStart, match.index))) continue
    const number = toInvoiceNumber(match[1] ?? '')
    if (number !== null) numbers.add(number)
  }
  return numbers
}

function seriesValues(text: string): ReadonlySet<string> {
  const values = new Set<string>()
  for (const match of text.matchAll(SERIES)) {
    const label = match[1] ?? ''
    if (
      editDistance(label, CANHOTO_IDENTITY_SERIES_LABEL) >
      CANHOTO_IDENTITY_SERIES_LABEL_MAX_DISTANCE
    )
      continue
    values.add((match[2] ?? '').replace(/^0+(?=\d)/u, ''))
  }
  return values
}

const single = (values: ReadonlySet<string>): string | null =>
  values.size === 1 ? ([...values][0] as string) : null

export function extractCanhotoIdentity(lines: readonly string[]): CanhotoIdentity | null {
  const text = lines.map(normalizeLine).join('\n')
  const strong = strongNumbers(text)
  const number = strong.size > 0 ? single(strong) : single(weakNumbers(text))
  if (number === null) return null
  return Object.freeze({ number, series: single(seriesValues(text)) })
}
