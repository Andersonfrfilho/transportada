/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { InvalidPostalCodeError } from './postal-code.error.js'

const POSTAL_CODE_LENGTH = 8
const POSTAL_CODE_PATTERN = /^[0-9]{8}$/
const POSTAL_CODE_SEPARATORS = /[\s.\-/]/g

/**
 * Uma linha de qualquer origem de CEP do banco. `street`, `district` e `city` chegam vazios das
 * origens parciais (as duas colunas de CEP do MDF-e respondem só a UF).
 */
export type PostalCodeAddressRow = {
  readonly city: string
  readonly district: string
  readonly recordedAt: Date
  readonly state: string
  readonly street: string
}

/**
 * O que o CEP responde. Não há onde guardar número nem complemento: nessas tabelas eles são a casa
 * de uma pessoa ou de uma empresa, e devolvê-los diria a quem digita quem mora naquele CEP.
 */
export type PostalCodeSuggestion = {
  readonly city: string
  readonly district: string
  readonly state: string
  readonly street: string
}

export function parsePostalCode(value: string): string {
  const canonical = value.replaceAll(POSTAL_CODE_SEPARATORS, '')
  if (canonical.length !== POSTAL_CODE_LENGTH || !POSTAL_CODE_PATTERN.test(canonical)) {
    throw new InvalidPostalCodeError()
  }

  return canonical
}

/**
 * Canonicaliza os quatro campos e devolve `null` quando não sobrou nada: quem os leu do banco e quem
 * os leu de um provedor externo aparam o espaço e sobem a UF do mesmo jeito.
 */
export function toPostalCodeSuggestion(fields: PostalCodeSuggestion): PostalCodeSuggestion | null {
  const suggestion = {
    city: fields.city.trim(),
    district: fields.district.trim(),
    state: fields.state.trim().toUpperCase(),
    street: fields.street.trim(),
  }

  return hasAnyField(suggestion) ? suggestion : null
}

export function selectPostalCodeSuggestion(
  rows: readonly PostalCodeAddressRow[],
): PostalCodeSuggestion | null {
  const candidates = rows.map(toSuggestionCandidate).filter(isCandidate)
  const [best] = candidates.toSorted(byStreetThenRecency)
  if (best === undefined) {
    return null
  }

  return best.suggestion
}

export function isCompletePostalCodeSuggestion(
  suggestion: PostalCodeSuggestion | null,
): suggestion is PostalCodeSuggestion {
  if (suggestion === null) {
    return false
  }

  return suggestion.street !== '' && suggestion.city !== '' && suggestion.state !== ''
}

type SuggestionCandidate = {
  readonly recordedAt: Date
  readonly suggestion: PostalCodeSuggestion
}

function toSuggestionCandidate(row: PostalCodeAddressRow): SuggestionCandidate | null {
  const suggestion = toPostalCodeSuggestion(row)
  if (suggestion === null) {
    return null
  }

  return { recordedAt: row.recordedAt, suggestion }
}

function isCandidate(candidate: SuggestionCandidate | null): candidate is SuggestionCandidate {
  return candidate !== null
}

function hasAnyField(suggestion: PostalCodeSuggestion): boolean {
  return (
    suggestion.street !== '' ||
    suggestion.district !== '' ||
    suggestion.city !== '' ||
    suggestion.state !== ''
  )
}

/** Grafia corrigida depois é a que vale — mas linha sem logradouro nunca vence linha com ele. */
function byStreetThenRecency(first: SuggestionCandidate, second: SuggestionCandidate): number {
  const streetRank =
    Number(second.suggestion.street !== '') - Number(first.suggestion.street !== '')
  if (streetRank !== 0) {
    return streetRank
  }

  return second.recordedAt.getTime() - first.recordedAt.getTime()
}
