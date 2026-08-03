/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { sumCargoValue } from '../../src/mdfe-manifests/domain/mdfe-manifest-grouping.policy.js'

describe('MDF-e cargo value', () => {
  // nfe_documents.total_value é numeric(19,4) — vCarga do MDF-e aceita duas casas
  test('accepts the four decimals persisted by the NF-e schema', () => {
    expect(sumCargoValue(['958.4800'])).toBe('958.48')
  })

  test('rounds once over the sum instead of once per document', () => {
    expect(sumCargoValue(['0.0050', '0.0050'])).toBe('0.01')
  })

  test('rounds half up on the discarded decimals', () => {
    expect(sumCargoValue(['10.0250'])).toBe('10.03')
  })

  test('sums an empty selection as zero', () => {
    expect(sumCargoValue([])).toBe('0.00')
  })
})
