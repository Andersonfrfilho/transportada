/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Casa o texto lido com as notas abertas de quem mandou a foto (ADR 0113 §5): o número da nota é a prova
 * principal; as marcas do canhoto são a secundária. Exato primeiro; sem exato, distância 1 para 5+ dígitos.
 */
import {
  CANHOTO_OCR_MARKERS,
  CANHOTO_OCR_MIN_DIGITS,
  CANHOTO_OCR_NEAR_MAX_DISTANCE,
  CANHOTO_OCR_NEAR_MIN_DIGITS,
} from './canhoto-ocr.constant.js'
import type {
  CanhotoOcrCandidate,
  CanhotoOcrMatchKind,
  CanhotoOcrResult,
} from './canhoto-ocr.types.js'

export function normalizeOcrText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, ' ')
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

/** Menor distância de edição de `needle` contra qualquer trecho de `haystack` (busca aproximada). */
function approximateDistance(haystack: string, needle: string): number {
  let previous = new Array<number>(haystack.length + 1).fill(0)
  for (let row = 1; row <= needle.length; row += 1) {
    const current = new Array<number>(haystack.length + 1)
    current[0] = row
    for (let column = 1; column <= haystack.length; column += 1) {
      const cost = needle[row - 1] === haystack[column - 1] ? 0 : 1
      current[column] = Math.min(
        (previous[column] ?? 0) + 1,
        (current[column - 1] ?? 0) + 1,
        (previous[column - 1] ?? 0) + cost,
      )
    }
    previous = current
  }
  return Math.min(...previous)
}

export function countMarkers(text: string): number {
  const haystack = normalizeOcrText(text)
  return Object.values(CANHOTO_OCR_MARKERS).filter((variants) =>
    variants.some(
      (variant) => approximateDistance(haystack, variant) <= Math.floor(variant.length / 6),
    ),
  ).length
}

export const stripLeadingZeros = (value: string): string => value.replace(/^0+/u, '')

/** Sequências de dígitos, com ponto e espaço simples como separador, sem zeros à esquerda. */
export function extractDigitRuns(text: string): ReadonlySet<string> {
  const runs = new Set<string>()
  for (const pattern of [/\d[\d.]*\d|\d/gu, /\d[\d. ]*\d|\d/gu]) {
    for (const match of text.matchAll(pattern)) {
      const value = stripLeadingZeros(match[0].replace(/\D/gu, ''))
      if (value.length >= CANHOTO_OCR_MIN_DIGITS) runs.add(value)
    }
  }
  return runs
}

function isNear(run: string, number: string): boolean {
  return (
    Math.abs(run.length - number.length) <= CANHOTO_OCR_NEAR_MAX_DISTANCE &&
    editDistance(run, number) <= CANHOTO_OCR_NEAR_MAX_DISTANCE
  )
}

function documentsByNumber(
  candidates: readonly CanhotoOcrCandidate[],
): ReadonlyMap<string, readonly string[]> {
  const grouped = new Map<string, string[]>()
  for (const candidate of candidates) {
    const number = stripLeadingZeros(candidate.number)
    grouped.set(number, [...(grouped.get(number) ?? []), candidate.documentId])
  }
  return grouped
}

function toVerdict(
  grouped: ReadonlyMap<string, readonly string[]>,
  numbers: readonly string[],
  match: CanhotoOcrMatchKind,
): Pick<CanhotoOcrResult, 'ambiguous' | 'candidates'> {
  const documentIds = numbers.flatMap((number) => grouped.get(number) ?? [])
  return {
    ambiguous: documentIds.length > 1,
    candidates: documentIds.map((documentId) => ({ documentId, match })),
  }
}

export function evaluateCanhotoText(
  params: Readonly<{ candidates: readonly CanhotoOcrCandidate[]; lines: readonly string[] }>,
): CanhotoOcrResult {
  const markers = countMarkers(params.lines.join(' '))
  const runs = extractDigitRuns(params.lines.join(' '))
  const grouped = documentsByNumber(params.candidates)
  const numbers = [...grouped.keys()]

  const exact = numbers.filter((number) => runs.has(number))
  if (exact.length > 0) return { markers, ...toVerdict(grouped, exact, 'exact') }

  const near = numbers.filter(
    (number) =>
      number.length >= CANHOTO_OCR_NEAR_MIN_DIGITS && [...runs].some((run) => isNear(run, number)),
  )
  if (near.length > 0) return { markers, ...toVerdict(grouped, near, 'near') }
  return { ambiguous: false, candidates: [], markers }
}
