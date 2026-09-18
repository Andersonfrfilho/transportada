/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterEach, describe, expect, setSystemTime, test } from 'bun:test'

import { createRateLimiter } from '../../src/http/rate-limiter.service.js'

const LONG_POLICY = { maxRequests: 1, windowMs: 30 * 60_000 } as const
const SHORT_POLICY = { maxRequests: 1, windowMs: 1_000 } as const
const SWEEP_THRESHOLD_ENTRIES = 10_000

/**
 * O balde em memória é varrido pela janela **dele**, não pela da rota que disparou a varredura:
 * senão uma rota de janela curta apagava o balde de uma de janela longa, e o teto zerava.
 */
describe('varredura do limitador em memória', () => {
  afterEach(() => {
    setSystemTime()
  })

  test('a varredura de uma rota de janela curta não zera o balde de uma de janela longa', () => {
    const startedAt = new Date('2026-09-18T12:00:00.000Z').getTime()
    setSystemTime(startedAt)
    const limiter = createRateLimiter()

    expect(limiter.consume({ key: 'long', policy: LONG_POLICY })).toEqual({ allowed: true })
    for (let index = 0; index < SWEEP_THRESHOLD_ENTRIES; index += 1) {
      limiter.consume({ key: `short-${index}`, policy: SHORT_POLICY })
    }

    setSystemTime(startedAt + 5_000)
    expect(limiter.consume({ key: 'short-trigger', policy: SHORT_POLICY })).toEqual({
      allowed: true,
    })

    const outcome = limiter.consume({ key: 'long', policy: LONG_POLICY })
    expect(outcome.allowed).toBe(false)
  })

  test('balde vencido pela própria janela é varrido e recomeça', () => {
    const startedAt = new Date('2026-09-18T12:00:00.000Z').getTime()
    setSystemTime(startedAt)
    const limiter = createRateLimiter()

    for (let index = 0; index < SWEEP_THRESHOLD_ENTRIES; index += 1) {
      limiter.consume({ key: `short-${index}`, policy: SHORT_POLICY })
    }
    setSystemTime(startedAt + 5_000)

    expect(limiter.consume({ key: 'short-0', policy: SHORT_POLICY })).toEqual({ allowed: true })
  })
})
