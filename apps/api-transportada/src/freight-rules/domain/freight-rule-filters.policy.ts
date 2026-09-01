/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import { CNPJ_PATTERN } from '../../shared/tax-id.service.js'

const BRAZILIAN_STATE_PATTERN = /^[A-Z]{2}$/
/** Município do IBGE: sete dígitos, e é ele que decide — nome de cidade tem três grafias. */
const IBGE_CITY_CODE_PATTERN = /^[0-9]{7}$/

export type FreightRuleVersionFilters = {
  /**
   * Spec 065 D6: sem dimensão de município não há como precificar a entrega urbana — que é
   * justamente a que tem outro documento, outro imposto e outra margem.
   *
   * **O tipo de documento não é parâmetro** (ele decorre do município, spec 065 D3): o que se
   * cadastra aqui é o **preço** da entrega naquela cidade, nunca qual nota ela vai gerar.
   */
  readonly destinationCityCodes: readonly string[]
  readonly destinationStates: readonly string[]
  readonly senderTaxIds: readonly string[]
}

export type FreightRuleFiltersInput = {
  readonly destinationCityCodes?: readonly string[] | undefined
  readonly destinationStates?: readonly string[] | undefined
  readonly senderTaxIds?: readonly string[] | undefined
}

export type MatchFreightRuleFiltersInput = {
  readonly destinationCityCode: string | null | undefined
  readonly destinationState: string | null | undefined
  readonly filters: FreightRuleVersionFilters
  readonly senderTaxId: string | null | undefined
}

export function normalizeFreightRuleFilters(
  input: FreightRuleFiltersInput | null | undefined,
): FreightRuleVersionFilters {
  return {
    destinationCityCodes: normalizeSelector({
      code: 'FREIGHT_RULE_FILTER_CITY_INVALID',
      message: 'Destination city filter must use seven-digit IBGE municipality codes',
      pattern: IBGE_CITY_CODE_PATTERN,
      values: input?.destinationCityCodes,
    }),
    destinationStates: normalizeSelector({
      code: 'FREIGHT_RULE_FILTER_STATE_INVALID',
      message: 'Destination state filter must use two-letter state codes',
      pattern: BRAZILIAN_STATE_PATTERN,
      values: input?.destinationStates,
    }),
    senderTaxIds: normalizeSelector({
      code: 'FREIGHT_RULE_FILTER_TAX_ID_INVALID',
      message: 'Sender tax id filter must use unformatted 14-character documents',
      pattern: CNPJ_PATTERN,
      values: input?.senderTaxIds,
    }),
  }
}

export function matchesFreightRuleFilters(input: MatchFreightRuleFiltersInput): boolean {
  return (
    matchesSelector(input.filters.destinationCityCodes, input.destinationCityCode) &&
    matchesSelector(input.filters.destinationStates, input.destinationState) &&
    matchesSelector(input.filters.senderTaxIds, input.senderTaxId)
  )
}

function normalizeSelector(input: {
  readonly code: string
  readonly message: string
  readonly pattern: RegExp
  readonly values: readonly string[] | undefined
}): readonly string[] {
  if (input.values === undefined) return []

  const normalized = new Set<string>()
  for (const value of input.values) {
    const candidate = value.trim().toUpperCase()
    if (!input.pattern.test(candidate)) {
      throw new ApiError({ code: input.code, message: input.message, status: 400 })
    }
    normalized.add(candidate)
  }

  return [...normalized].sort()
}

function matchesSelector(selector: readonly string[], value: string | null | undefined): boolean {
  if (selector.length === 0) return true
  if (value === null || value === undefined) return false

  return selector.includes(value.trim().toUpperCase())
}
