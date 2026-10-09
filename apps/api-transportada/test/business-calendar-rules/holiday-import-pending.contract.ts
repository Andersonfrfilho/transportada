/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T4.1 (revisão, L1): os pares pendentes são o que falta do total, e nunca negativos — as leituras
 * do status são consultas separadas, e uma busca que terminou entre elas pode somar mais do que o total.
 */
import { describe, expect, test } from 'bun:test'

import { countPendingPairs } from '../../src/business-calendar/infrastructure/drizzle-holiday-import-status.repository.js'

const NONE = { done: 0, failed: 0, notCovered: 0, quotaExhausted: 0 }

describe('os pares pendentes do status (spec 252 T4.1, L1)', () => {
  test('é o que falta do total depois dos pares já buscados', () => {
    expect(countPendingPairs({ ...NONE, done: 1, failed: 1, total: 4 })).toBe(2)
    expect(countPendingPairs({ ...NONE, total: 4 })).toBe(4)
    expect(countPendingPairs({ ...NONE, notCovered: 1, quotaExhausted: 1, total: 4 })).toBe(2)
  })

  test('nunca é negativo, mesmo com as leituras fora de sincronia', () => {
    expect(countPendingPairs({ ...NONE, done: 5, failed: 2, total: 4 })).toBe(0)
    expect(countPendingPairs({ ...NONE, done: 1, total: 0 })).toBe(0)
  })
})
