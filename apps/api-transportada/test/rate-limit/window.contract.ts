/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  isWithinRateLimit,
  resolveRateLimitWindowStartSeconds,
  resolveRetryAfterSeconds,
} from '../../src/http/rate-limit-window.policy.js'

/**
 * Spec 150 T406: a janela é fixa e alinhada ao relógio (`floor(agora / w) * w`), a mesma conta que o
 * `INSERT … ON CONFLICT` faz no banco. Duas réplicas no mesmo instante caem na mesma linha.
 */
describe('janela fixa do limitador (spec 150 T406)', () => {
  test('alinha o início da janela ao múltiplo da duração', () => {
    expect(resolveRateLimitWindowStartSeconds({ nowSeconds: 7_199, windowSeconds: 3_600 })).toBe(
      3_600,
    )
    expect(resolveRateLimitWindowStartSeconds({ nowSeconds: 7_200, windowSeconds: 3_600 })).toBe(
      7_200,
    )
    expect(resolveRateLimitWindowStartSeconds({ nowSeconds: 7_200.9, windowSeconds: 60 })).toBe(
      7_200,
    )
  })

  test('manda esperar até a janela virar, arredondando para cima', () => {
    expect(
      resolveRetryAfterSeconds({
        nowSeconds: 3_600.2,
        windowSeconds: 3_600,
        windowStartSeconds: 3_600,
      }),
    ).toBe(3_600)
    expect(
      resolveRetryAfterSeconds({
        nowSeconds: 7_000.5,
        windowSeconds: 3_600,
        windowStartSeconds: 3_600,
      }),
    ).toBe(200)
  })

  /** `Retry-After: 0` convida o cliente a martelar no mesmo segundo: o piso é 1. */
  test('nunca manda esperar menos de um segundo', () => {
    expect(
      resolveRetryAfterSeconds({
        nowSeconds: 7_200,
        windowSeconds: 3_600,
        windowStartSeconds: 3_600,
      }),
    ).toBe(1)
    expect(
      resolveRetryAfterSeconds({
        nowSeconds: 7_199.99,
        windowSeconds: 3_600,
        windowStartSeconds: 3_600,
      }),
    ).toBe(1)
  })

  test('o teto é inclusivo: a vigésima passa, a vigésima primeira não', () => {
    expect(isWithinRateLimit({ hits: 20, maxRequests: 20 })).toBe(true)
    expect(isWithinRateLimit({ hits: 21, maxRequests: 20 })).toBe(false)
  })
})
