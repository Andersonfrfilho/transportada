/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  calculatePercentageFreight,
  createFreightRuleSnapshot,
} from '../src/freight-calculations/domain/freight-calculation-engine.service.js'

const BASE_RULE_INPUT = {
  freightRuleId: 'rule-001',
  freightRuleVersionId: 'rule-version-001',
  ruleVersion: '1',
  type: 'percentage_of_invoice_total',
  validFrom: '2026-01-01T00:00:00.000Z',
  validUntil: null,
} as const

describe('freight calculation decimal engine contract', () => {
  test('calculates the configured 3.5 percent freight without hardcoded business defaults', () => {
    const ruleSnapshot = createFreightRuleSnapshot({
      ...BASE_RULE_INPUT,
      maximumAmount: null,
      minimumAmount: null,
      percentage: '0.035000',
    })

    const result = calculatePercentageFreight({
      invoice: {
        id: 'nfe-001',
        issuedAt: '2026-07-22T12:00:00.000Z',
        totalAmount: '10000.0000',
      },
      ruleSnapshot,
    })

    expect(result).toEqual({
      adjustments: [],
      baseAmount: '10000.0000',
      calculatedAmount: '350.0000',
      calculationDetails: {
        formula: 'invoiceTotalAmount * percentage',
        roundingMode: 'half_up',
        scale: 4,
      },
      maximumAmount: null,
      minimumAmount: null,
      percentage: '0.035000',
      ruleSnapshot,
      totalAmount: '350.0000',
    })
  })

  test('applies the minimum amount after the percentage calculation and records the adjustment', () => {
    const ruleSnapshot = createFreightRuleSnapshot({
      ...BASE_RULE_INPUT,
      maximumAmount: null,
      minimumAmount: '120.0000',
      percentage: '0.035000',
    })

    const result = calculatePercentageFreight({
      invoice: {
        id: 'nfe-002',
        issuedAt: '2026-07-22T12:00:00.000Z',
        totalAmount: '1000.0000',
      },
      ruleSnapshot,
    })

    expect(result.calculatedAmount).toBe('35.0000')
    expect(result.totalAmount).toBe('120.0000')
    expect(result.adjustments).toEqual([
      {
        amount: '85.0000',
        description: 'Minimum freight amount applied',
        type: 'minimum_amount',
      },
    ])
  })

  test('applies the maximum amount after the percentage calculation and records the adjustment', () => {
    const ruleSnapshot = createFreightRuleSnapshot({
      ...BASE_RULE_INPUT,
      maximumAmount: '300.0000',
      minimumAmount: null,
      percentage: '0.035000',
    })

    const result = calculatePercentageFreight({
      invoice: {
        id: 'nfe-003',
        issuedAt: '2026-07-22T12:00:00.000Z',
        totalAmount: '10000.0000',
      },
      ruleSnapshot,
    })

    expect(result.calculatedAmount).toBe('350.0000')
    expect(result.totalAmount).toBe('300.0000')
    expect(result.adjustments).toEqual([
      {
        amount: '-50.0000',
        description: 'Maximum freight amount applied',
        type: 'maximum_amount',
      },
    ])
  })

  test('uses half-up rounding at four decimal places for half-cent edge cases', () => {
    const ruleSnapshot = createFreightRuleSnapshot({
      ...BASE_RULE_INPUT,
      maximumAmount: null,
      minimumAmount: null,
      percentage: '0.333333',
    })

    const result = calculatePercentageFreight({
      invoice: {
        id: 'nfe-004',
        issuedAt: '2026-07-22T12:00:00.000Z',
        totalAmount: '0.0003',
      },
      ruleSnapshot,
    })

    expect(result.calculatedAmount).toBe('0.0001')
    expect(result.totalAmount).toBe('0.0001')
  })

  test('canonicalizes decimal strings in snapshots and rejects unsafe monetary inputs', () => {
    expect(
      createFreightRuleSnapshot({
        ...BASE_RULE_INPUT,
        maximumAmount: '999.9',
        minimumAmount: '10',
        percentage: '0.035',
      }),
    ).toMatchObject({
      maximumAmount: '999.9000',
      minimumAmount: '10.0000',
      percentage: '0.035000',
    })

    expect(() =>
      calculatePercentageFreight({
        invoice: {
          id: 'nfe-005',
          issuedAt: '2026-07-22T12:00:00.000Z',
          totalAmount: '100.00123',
        },
        ruleSnapshot: createFreightRuleSnapshot({
          ...BASE_RULE_INPUT,
          maximumAmount: null,
          minimumAmount: null,
          percentage: '0.035000',
        }),
      }),
    ).toThrow('FREIGHT_INVALID_DECIMAL_SCALE')
  })

  test('rejects invalid percentage and incoherent minimum or maximum amounts', () => {
    expect(() =>
      createFreightRuleSnapshot({
        ...BASE_RULE_INPUT,
        maximumAmount: null,
        minimumAmount: null,
        percentage: '1.000001',
      }),
    ).toThrow('FREIGHT_PERCENTAGE_OUT_OF_RANGE')

    expect(() =>
      createFreightRuleSnapshot({
        ...BASE_RULE_INPUT,
        maximumAmount: '99.0000',
        minimumAmount: '100.0000',
        percentage: '0.035000',
      }),
    ).toThrow('FREIGHT_MINIMUM_EXCEEDS_MAXIMUM')
  })
})
