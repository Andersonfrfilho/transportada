/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T5.1: a ordem estável dos rascunhos — roteiro, cidade, número da nota, id —, a mesma para
 * quem pede duas vezes e independente da ordem em que o banco devolveu as linhas.
 */
import { normalizeCityName } from './cargo-preview-trip-draft-city.policy.js'
import type { TripDraftDocumentRow } from './cargo-preview-trip-draft.types.js'

const LEADING_ZEROS = /^0+(?=\d)/u

export function compareText(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

/** Número de NF-e é texto de até 9 dígitos: 95 vem antes de 300. */
function compareInvoiceNumbers(left: string, right: string): number {
  const [a, b] = [left.replace(LEADING_ZEROS, ''), right.replace(LEADING_ZEROS, '')]
  return a.length === b.length ? compareText(a, b) : a.length - b.length
}

export function compareDocuments(left: TripDraftDocumentRow, right: TripDraftDocumentRow): number {
  return (
    compareText(normalizeCityName(left.cityName), normalizeCityName(right.cityName)) ||
    compareInvoiceNumbers(left.number, right.number) ||
    compareText(left.id, right.id)
  )
}

/** Os roteiros pelo nome; o grupo "sem roteiro" (`null`) por último. */
export function sortRouteNames(names: readonly (string | null)[]): (string | null)[] {
  return [...names].sort((left, right) => {
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1
    return compareText(left, right)
  })
}
