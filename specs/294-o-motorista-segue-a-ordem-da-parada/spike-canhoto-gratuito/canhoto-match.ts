/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Protótipo do spike T4.8b (spec 294) — descartável, fora das apps. Ver ../spike-canhoto-gratuito.md.
 * Nunca imprime texto reconhecido nem número de nota; grava só contagens e acertos por índice opaco.
 */
// Regras compartilhadas por A e C: marcas do canhoto, número da NF e casamento com as notas candidatas.
export const CANHOTO_MARKERS: Record<string, string[]> = {
  receivedFrom: ['RECEBEMOS DE'],
  receiptDate: ['DATA DE RECEBIMENTO'],
  signature: ['ASSINATURA DO RECEBEDOR', 'IDENTIFICACAO E ASSINATURA'],
  productsListed: ['PRODUTOS CONSTANTES', 'CONSTANTES DA NOTA'],
  nfeSeries: ['SERIE'],
}

export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, ' ')
}

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

export function foundMarkers(text: string): string[] {
  const haystack = normalize(text)
  return Object.entries(CANHOTO_MARKERS)
    .filter(([, variants]) =>
      variants.some((v) => approximateDistance(haystack, v) <= Math.floor(v.length / 6)),
    )
    .map(([name]) => name)
}

const stripZeros = (value: string): string => value.replace(/^0+/u, '')

/** Sequências de dígitos (pontos e espaços simples como separador), sem zeros à esquerda. */
export function digitRuns(text: string): Set<string> {
  const runs = new Set<string>()
  for (const pattern of [/\d[\d.]*\d|\d/gu, /\d[\d. ]*\d|\d/gu]) {
    for (const match of text.matchAll(pattern)) {
      const value = stripZeros(match[0].replace(/\D/gu, ''))
      if (value.length >= 3) runs.add(value)
    }
  }
  return runs
}

/** Número impresso perto de "NF-e"/"Nº"/"SÉRIE" (linha da marca e as duas seguintes). */
export function extractNfNumber(lines: string[]): string | undefined {
  for (let i = 0; i < lines.length; i += 1) {
    const upper = normalize(lines[i] ?? '')
    if (!/\bNF ?E\b|\bN[O0]\b|\bNUMERO\b|\bSERIE\b/u.test(upper) && !/N[º°]/u.test(lines[i] ?? ''))
      continue
    const context = [lines[i], lines[i + 1], lines[i + 2]].join(' ')
    for (const match of context.matchAll(/\d[\d.]*\d/gu)) {
      const value = stripZeros(match[0].replace(/\D/gu, ''))
      if (value.length >= 4 && value.length <= 9) return value
    }
  }
  return undefined
}

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0] as number
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j] as number
      row[j] = Math.min(
        (row[j] as number) + 1,
        (row[j - 1] as number) + 1,
        previous + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      previous = current
    }
  }
  return row[b.length] as number
}

export type CandidateOutcome = { kind: 'exact' | 'fuzzy' | 'ambiguous' | 'none'; match?: string }

/** Casa os dígitos lidos com as notas candidatas: exato primeiro; senão distância 1 para números de 5+ dígitos. */
export function matchCandidates(runs: Set<string>, candidates: string[]): CandidateOutcome {
  const unique = [...new Set(candidates.map(stripZeros))]
  const exact = unique.filter((c) => runs.has(c))
  if (exact.length === 1) return { kind: 'exact', match: exact[0] as string }
  if (exact.length > 1) return { kind: 'ambiguous' }
  const fuzzy = unique.filter(
    (c) =>
      c.length >= 5 &&
      [...runs].some((r) => Math.abs(r.length - c.length) <= 1 && levenshtein(r, c) <= 1),
  )
  if (fuzzy.length === 1) return { kind: 'fuzzy', match: fuzzy[0] as string }
  return fuzzy.length > 1 ? { kind: 'ambiguous' } : { kind: 'none' }
}
