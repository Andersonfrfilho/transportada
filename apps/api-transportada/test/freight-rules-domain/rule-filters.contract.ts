/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  matchesFreightRuleFilters,
  normalizeFreightRuleFilters,
} from '../../src/freight-rules/domain/freight-rule-filters.policy.js'

const SENDER_TAX_ID = '61084018000109'
const OTHER_TAX_ID = '11222333000181'

describe('freight rule filters contract', () => {
  test('normalizes an absent filter into the empty selector that matches every document', () => {
    const filters = normalizeFreightRuleFilters(undefined)

    expect(filters).toEqual({ destinationStates: [], senderTaxIds: [] })
    expect(
      matchesFreightRuleFilters({ destinationState: 'MG', filters, senderTaxId: OTHER_TAX_ID }),
    ).toBe(true)
    expect(matchesFreightRuleFilters({ destinationState: null, filters, senderTaxId: null })).toBe(
      true,
    )
  })

  test('normalizes legacy persisted filters and uppercases, trims, deduplicates and sorts the selectors', () => {
    expect(normalizeFreightRuleFilters({})).toEqual({ destinationStates: [], senderTaxIds: [] })
    expect(
      normalizeFreightRuleFilters({
        destinationStates: [' sp ', 'mg', 'SP'],
        senderTaxIds: [` ${SENDER_TAX_ID} `, SENDER_TAX_ID],
      }),
    ).toEqual({ destinationStates: ['MG', 'SP'], senderTaxIds: [SENDER_TAX_ID] })
  })

  test('applies the destination state exception only to the listed states', () => {
    const filters = normalizeFreightRuleFilters({ destinationStates: ['MG', 'RJ'] })

    expect(
      matchesFreightRuleFilters({ destinationState: 'MG', filters, senderTaxId: SENDER_TAX_ID }),
    ).toBe(true)
    expect(
      matchesFreightRuleFilters({ destinationState: 'mg', filters, senderTaxId: SENDER_TAX_ID }),
    ).toBe(true)
    expect(
      matchesFreightRuleFilters({ destinationState: 'SP', filters, senderTaxId: SENDER_TAX_ID }),
    ).toBe(false)
    expect(
      matchesFreightRuleFilters({ destinationState: null, filters, senderTaxId: SENDER_TAX_ID }),
    ).toBe(false)
  })

  test('requires every declared selector to match, never just one of them', () => {
    const filters = normalizeFreightRuleFilters({
      destinationStates: ['MG'],
      senderTaxIds: [SENDER_TAX_ID],
    })

    expect(
      matchesFreightRuleFilters({ destinationState: 'MG', filters, senderTaxId: SENDER_TAX_ID }),
    ).toBe(true)
    expect(
      matchesFreightRuleFilters({ destinationState: 'MG', filters, senderTaxId: OTHER_TAX_ID }),
    ).toBe(false)
    expect(
      matchesFreightRuleFilters({ destinationState: 'SP', filters, senderTaxId: SENDER_TAX_ID }),
    ).toBe(false)
  })

  test('rejects a selector that is not a plain uppercase state or a numeric tax id', () => {
    expect(() => normalizeFreightRuleFilters({ destinationStates: ['SAO PAULO'] })).toThrow()
    expect(() => normalizeFreightRuleFilters({ senderTaxIds: ['61.084.018/0001-09'] })).toThrow()
  })
})
