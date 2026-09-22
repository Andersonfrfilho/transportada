/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154, T202b — decisão do usuário em 2026-09-17: a contagem do RF2 ("praças sem tarifa por
 * eixo conhecida") é pendência da EMPRESA, a mesma resposta que `resolveEffectiveTollBoothCharge`
 * daria por praça — não o catálogo cru. Os dois casos-chave do prompt:
 */
import { describe, expect, test } from 'bun:test'

import { countBoothsWithoutKnownAxleCharge } from '../../src/toll-booths/domain/toll-booth-axle-charge-gap.policy.js'

describe('toll booth axle charge gap policy (spec 154, T202b)', () => {
  test('a booth without a catalog charge does not count for the company that adjusted it', () => {
    const gapCount = countBoothsWithoutKnownAxleCharge({
      adjustments: [{ chargePerAxle: '8.5000', osmNodeId: 1 }],
      catalog: [{ chargePerAxle: null, osmNodeId: 1 }],
    })

    expect(gapCount).toBe(0)
  })

  test('the same booth still counts for a company that never adjusted it', () => {
    const gapCount = countBoothsWithoutKnownAxleCharge({
      adjustments: [],
      catalog: [{ chargePerAxle: null, osmNodeId: 1 }],
    })

    expect(gapCount).toBe(1)
  })

  test('a booth with a known catalog charge never counts, adjusted or not', () => {
    const gapCount = countBoothsWithoutKnownAxleCharge({
      adjustments: [{ chargePerAxle: '5.0000', osmNodeId: 2 }],
      catalog: [
        { chargePerAxle: '10.0000', osmNodeId: 1 },
        { chargePerAxle: '10.0000', osmNodeId: 2 },
      ],
    })

    expect(gapCount).toBe(0)
  })

  test('an adjustment row that leaves the axle field blank still falls back to the catalog', () => {
    const gapCount = countBoothsWithoutKnownAxleCharge({
      adjustments: [{ chargePerAxle: null, osmNodeId: 1 }],
      catalog: [{ chargePerAxle: null, osmNodeId: 1 }],
    })

    expect(gapCount).toBe(1)
  })

  test('an empty catalog answers zero', () => {
    const gapCount = countBoothsWithoutKnownAxleCharge({ adjustments: [], catalog: [] })

    expect(gapCount).toBe(0)
  })
})
