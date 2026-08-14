/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import { CNPJ_PATTERN } from '../../shared/tax-id.service.js'

const BRAZILIAN_STATE_PATTERN = /^[A-Z]{2}$/

export type FreightRuleVersionFilters = {
  readonly destinationStates: readonly string[]
  readonly senderTaxIds: readonly string[]
}

export type FreightRuleFiltersInput = {
  readonly destinationStates?: readonly string[] | undefined
  readonly senderTaxIds?: readonly string[] | undefined
}

export type MatchFreightRuleFiltersInput = {
  readonly destinationState: string | null | undefined
  readonly filters: FreightRuleVersionFilters
  readonly senderTaxId: string | null | undefined
}

export function normalizeFreightRuleFilters(
  input: FreightRuleFiltersInput | null | undefined,
): FreightRuleVersionFilters {
  return {
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
