/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0076 §6: o mapa do limitador tem teto. Sem ele, cada chave nova dentro da janela criava um balde
 * que só a varredura de expirados removia — memória sem limite enquanto a janela durasse.
 */
import { describe, expect, test } from 'bun:test'

import { createRateLimiter } from '../../src/http/rate-limiter.service.js'

const ONE_PER_LONG_WINDOW = { maxRequests: 1, windowMs: 10_000 } as const
const ONE_PER_SHORT_WINDOW = { maxRequests: 1, windowMs: 100 } as const

function createClock(): { readonly now: () => number; advance: (milliseconds: number) => void } {
  let current = 0
  return {
    advance(milliseconds) {
      current += milliseconds
    },
    now: () => current,
  }
}

describe('teto do mapa do limitador', () => {
  test('nunca guarda mais baldes que o teto', () => {
    const limiter = createRateLimiter({ maxEntries: 3 })

    for (let index = 0; index < 50; index += 1) {
      limiter.consume({ key: `chave-${index}`, policy: ONE_PER_LONG_WINDOW })
    }

    expect(limiter.size()).toBe(3)
  })

  test('cheio de baldes vivos, sai o mais antigo', () => {
    const limiter = createRateLimiter({ maxEntries: 2 })

    expect(limiter.consume({ key: 'a', policy: ONE_PER_LONG_WINDOW }).allowed).toBe(true)
    expect(limiter.consume({ key: 'a', policy: ONE_PER_LONG_WINDOW }).allowed).toBe(false)
    limiter.consume({ key: 'b', policy: ONE_PER_LONG_WINDOW })
    limiter.consume({ key: 'c', policy: ONE_PER_LONG_WINDOW })

    expect(limiter.consume({ key: 'b', policy: ONE_PER_LONG_WINDOW }).allowed).toBe(false)
    expect(limiter.consume({ key: 'a', policy: ONE_PER_LONG_WINDOW }).allowed).toBe(true)
  })

  test('antes de despejar vivo, varre expirado — cada balde pela própria janela', () => {
    const clock = createClock()
    const limiter = createRateLimiter({ maxEntries: 2, now: clock.now })

    limiter.consume({ key: 'longo', policy: ONE_PER_LONG_WINDOW })
    limiter.consume({ key: 'curto', policy: ONE_PER_SHORT_WINDOW })
    clock.advance(500)
    limiter.consume({ key: 'novo', policy: ONE_PER_SHORT_WINDOW })

    expect(limiter.size()).toBe(2)
    expect(limiter.consume({ key: 'longo', policy: ONE_PER_LONG_WINDOW }).allowed).toBe(false)
  })

  test('chave que já existe não despeja ninguém', () => {
    const limiter = createRateLimiter({ maxEntries: 2 })
    const policy = { maxRequests: 5, windowMs: 10_000 } as const

    limiter.consume({ key: 'a', policy })
    limiter.consume({ key: 'b', policy })
    limiter.consume({ key: 'b', policy })

    expect(limiter.size()).toBe(2)
  })
})
