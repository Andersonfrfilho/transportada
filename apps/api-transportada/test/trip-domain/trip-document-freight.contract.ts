/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveTripDocumentFreight } from '../../src/trips/domain/trip-document-freight.policy.js'

const RULE = {
  filters: { destinationCityCodes: [], destinationStates: [], senderTaxIds: [] },
  freightRuleId: 'rule-1',
  maximumAmount: null,
  minimumAmount: null,
  name: 'Regra padrão',
  percentage: '0.1000',
  priority: 1n,
  validFrom: new Date('2026-01-01T00:00:00Z'),
  validUntil: null,
} as const

describe('frete da nota na viagem (spec 176)', () => {
  test('cálculo guardado: usa o valor congelado, e nunca inventa nome de regra', () => {
    const result = resolveTripDocumentFreight({
      freightCalculationStatus: 'snapshotted',
      freightCalculationTotalAmount: '680.5480',
      note: null,
      rules: [],
    })

    expect(result).toEqual({ amount: '680.5480', ruleName: null, source: 'measured' })
  })

  test('sem cálculo guardado, com regra ativa aplicável: previsão marcada com o nome da regra', () => {
    const result = resolveTripDocumentFreight({
      freightCalculationStatus: null,
      freightCalculationTotalAmount: null,
      note: {
        destinationCityCode: '3550308',
        destinationState: 'SP',
        issuedAt: new Date('2026-03-01T00:00:00Z'),
        senderTaxId: '12345678000190',
        totalAmount: '6805.4800',
      },
      rules: [RULE],
    })

    expect(result.source).toBe('estimated')
    expect(result.ruleName).toBe('Regra padrão')
    expect(result.amount).not.toBeNull()
  })

  test('sem cálculo e sem regra que case: ausência, nunca zero', () => {
    const result = resolveTripDocumentFreight({
      freightCalculationStatus: null,
      freightCalculationTotalAmount: null,
      note: {
        destinationCityCode: '3550308',
        destinationState: 'SP',
        issuedAt: new Date('2026-03-01T00:00:00Z'),
        senderTaxId: '12345678000190',
        totalAmount: '6805.4800',
      },
      rules: [],
    })

    expect(result).toEqual({ amount: null, ruleName: null, source: 'missing' })
  })

  test('cálculo rejeitado e nota sem vínculo direto: ausência, não recalcula às cegas', () => {
    const result = resolveTripDocumentFreight({
      freightCalculationStatus: 'rejected',
      freightCalculationTotalAmount: null,
      note: null,
      rules: [RULE],
    })

    expect(result).toEqual({ amount: null, ruleName: null, source: 'missing' })
  })

  test('nota sem data de emissão: não estima sem data, mesmo com regra e valor', () => {
    const result = resolveTripDocumentFreight({
      freightCalculationStatus: null,
      freightCalculationTotalAmount: null,
      note: {
        destinationCityCode: '3550308',
        destinationState: 'SP',
        issuedAt: null,
        senderTaxId: '12345678000190',
        totalAmount: '6805.4800',
      },
      rules: [RULE],
    })

    expect(result.source).toBe('missing')
  })
})
