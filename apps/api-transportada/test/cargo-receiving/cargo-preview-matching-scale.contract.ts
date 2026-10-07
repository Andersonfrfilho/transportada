/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a (T4.3): 300 linhas × 300 notas resolvem em tempo limitado. A partição só roda dentro
 * de um cliente (≤ 6 linhas, 63 subconjuntos), e a busca por nota é por índice de valor, não O(n³).
 */
import { describe, expect, test } from 'bun:test'

import { resolveCargoPreviewMatches } from '../../src/cargo-receiving/domain/cargo-preview-matching.policy.js'
import { candidate, matchParams, previewItem } from '../fixtures/cargo-preview-matching.fixture.js'

const ROUTES = 15
const LINES_PER_ROUTE = 20

function scenario(input: { withLoads: boolean }) {
  const items = []
  const candidates = []
  for (let index = 0; index < ROUTES * LINES_PER_ROUTE; index += 1) {
    const route = Math.floor(index / LINES_PER_ROUTE)
    const value = `${1000 + index}.${String(index % 100).padStart(2, '0')}`
    const weightKg = `${10 + (index % 50)}.${String(index % 1000).padStart(3, '0')}`
    const recipientCode = String(10_000 + Math.floor(index / 2))
    const postalCode = String(index).padStart(8, '0')
    items.push(
      previewItem(`i${index}`, {
        postalCode,
        recipientCode,
        routeName: `FR.R${route}`,
        value,
        weightKg,
      }),
    )
    candidates.push(
      candidate(`d${String(index).padStart(3, '0')}`, {
        grossWeightKg: weightKg,
        recipientPostalCode: postalCode,
        loadReference: input.withLoads ? String(69_000 + route) : undefined,
        recipientTaxId: `9900000000${String(Math.floor(index / 2)).padStart(4, '0')}`,
        totalValue: value,
      }),
    )
  }
  return matchParams({ candidates, items })
}

describe('a escala do vínculo (spec 237 T4.3)', () => {
  test.each([true, false])(
    '300 linhas × 300 notas (com carga: %p) em menos de 1 s',
    (withLoads) => {
      const params = scenario({ withLoads })
      const startedAt = performance.now()
      const result = resolveCargoPreviewMatches(params)
      const elapsedMs = performance.now() - startedAt
      expect(elapsedMs).toBeLessThan(1_000)
      expect(result.items.filter((item) => item.state === 'matched')).toHaveLength(300)
      expect(result.routePairs).toHaveLength(withLoads ? ROUTES : 0)
    },
  )
})
