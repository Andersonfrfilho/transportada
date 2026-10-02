/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  OCCURRED_AT_MAX_AGE_DAYS,
  resolveOccurredAt,
  resolveRecordedEventClock,
} from '../../src/trips/domain/occurred-at.policy.js'
import { DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS } from '../../src/trips/domain/field-delivery-timing.policy.js'
import {
  MILLISECONDS_PER_DAY,
  MILLISECONDS_PER_HOUR,
  MILLISECONDS_PER_MINUTE,
} from '../../src/shared/time.constant.js'

const RECEIVED_AT = new Date('2026-10-03T14:00:00.000Z')
const MAX_AGE_MILLISECONDS = 30 * MILLISECONDS_PER_DAY

/** Aparelho cuja hora está `clockOffsetMs` atrás do servidor e que tocou em `occurredAt`. */
function tappedAtFor(occurredAt: Date, clockOffsetMs: number): Date {
  return new Date(occurredAt.getTime() - clockOffsetMs)
}

describe('resolveOccurredAt — a hora do evento é a do toque corrigida (spec 232 D3)', () => {
  test('a idade máxima da correção é de 30 dias', () => {
    expect(OCCURRED_AT_MAX_AGE_DAYS).toBe(30)
  })

  test('relógio do aparelho atrasado: soma o desvio positivo (CA3)', () => {
    const result = resolveOccurredAt({
      clockOffsetMs: 7 * MILLISECONDS_PER_MINUTE,
      receivedAt: RECEIVED_AT,
      tappedAt: new Date('2026-10-03T09:53:00.000Z'),
    })

    expect(result).toEqual({ kind: 'corrected', occurredAt: new Date('2026-10-03T10:00:00.000Z') })
  })

  test('relógio do aparelho adiantado: o desvio negativo puxa a hora para trás', () => {
    const result = resolveOccurredAt({
      clockOffsetMs: -3 * MILLISECONDS_PER_HOUR,
      receivedAt: RECEIVED_AT,
      tappedAt: new Date('2026-10-03T13:00:00.000Z'),
    })

    expect(result).toEqual({ kind: 'corrected', occurredAt: new Date('2026-10-03T10:00:00.000Z') })
  })

  test('desvio zero devolve o próprio toque', () => {
    const tappedAt = new Date('2026-10-03T10:00:00.000Z')
    const result = resolveOccurredAt({ clockOffsetMs: 0, receivedAt: RECEIVED_AT, tappedAt })

    expect(result).toEqual({ kind: 'corrected', occurredAt: tappedAt })
  })

  describe('fronteira do futuro (recebimento + 2 min)', () => {
    test('a tolerância é a mesma da baixa do escritório: 2 min', () => {
      expect(DELIVERED_AT_FUTURE_TOLERANCE_MILLISECONDS).toBe(2 * MILLISECONDS_PER_MINUTE)
    })

    test('+2 min exatos ainda vale', () => {
      const occurredAt = new Date(RECEIVED_AT.getTime() + 2 * MILLISECONDS_PER_MINUTE)
      const clockOffsetMs = 45_000
      const result = resolveOccurredAt({
        clockOffsetMs,
        receivedAt: RECEIVED_AT,
        tappedAt: tappedAtFor(occurredAt, clockOffsetMs),
      })

      expect(result).toEqual({ kind: 'corrected', occurredAt })
    })

    test('+2 min +1 ms descarta a correção como futura', () => {
      const occurredAt = new Date(RECEIVED_AT.getTime() + 2 * MILLISECONDS_PER_MINUTE + 1)
      const clockOffsetMs = 45_000
      const result = resolveOccurredAt({
        clockOffsetMs,
        receivedAt: RECEIVED_AT,
        tappedAt: tappedAtFor(occurredAt, clockOffsetMs),
      })

      expect(result).toEqual({ kind: 'ignored', reason: 'future' })
    })

    test('o desvio é o que leva ao futuro: a hora crua do toque estava no passado', () => {
      const result = resolveOccurredAt({
        clockOffsetMs: 3 * MILLISECONDS_PER_HOUR,
        receivedAt: RECEIVED_AT,
        tappedAt: new Date('2026-10-03T12:00:00.000Z'),
      })

      expect(result).toEqual({ kind: 'ignored', reason: 'future' })
    })
  })

  describe('fronteira da idade (recebimento − 30 dias)', () => {
    test('−30 dias exatos ainda vale', () => {
      const occurredAt = new Date(RECEIVED_AT.getTime() - MAX_AGE_MILLISECONDS)
      const clockOffsetMs = -90_000
      const result = resolveOccurredAt({
        clockOffsetMs,
        receivedAt: RECEIVED_AT,
        tappedAt: tappedAtFor(occurredAt, clockOffsetMs),
      })

      expect(result).toEqual({ kind: 'corrected', occurredAt })
    })

    test('−30 dias −1 ms descarta a correção como velha demais', () => {
      const occurredAt = new Date(RECEIVED_AT.getTime() - MAX_AGE_MILLISECONDS - 1)
      const clockOffsetMs = -90_000
      const result = resolveOccurredAt({
        clockOffsetMs,
        receivedAt: RECEIVED_AT,
        tappedAt: tappedAtFor(occurredAt, clockOffsetMs),
      })

      expect(result).toEqual({ kind: 'ignored', reason: 'too_old' })
    })
  })

  describe('sem os dois campos, a correção não existe (cliente antigo)', () => {
    test('sem tappedAt', () => {
      const result = resolveOccurredAt({
        clockOffsetMs: 1_000,
        receivedAt: RECEIVED_AT,
        tappedAt: undefined,
      })

      expect(result).toEqual({ kind: 'ignored', reason: 'missing' })
    })

    test('sem clockOffsetMs', () => {
      const result = resolveOccurredAt({
        clockOffsetMs: undefined,
        receivedAt: RECEIVED_AT,
        tappedAt: new Date('2026-10-03T10:00:00.000Z'),
      })

      expect(result).toEqual({ kind: 'ignored', reason: 'missing' })
    })

    test('clockOffsetMs NaN conta como ausente', () => {
      const result = resolveOccurredAt({
        clockOffsetMs: Number.NaN,
        receivedAt: RECEIVED_AT,
        tappedAt: new Date('2026-10-03T10:00:00.000Z'),
      })

      expect(result).toEqual({ kind: 'ignored', reason: 'missing' })
    })

    test('clockOffsetMs infinito conta como ausente', () => {
      for (const clockOffsetMs of [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
        const result = resolveOccurredAt({
          clockOffsetMs,
          receivedAt: RECEIVED_AT,
          tappedAt: new Date('2026-10-03T10:00:00.000Z'),
        })

        expect(result).toEqual({ kind: 'ignored', reason: 'missing' })
      }
    })

    test('tappedAt Invalid Date conta como ausente', () => {
      const result = resolveOccurredAt({
        clockOffsetMs: 1_000,
        receivedAt: RECEIVED_AT,
        tappedAt: new Date('not a date'),
      })

      expect(result).toEqual({ kind: 'ignored', reason: 'missing' })
    })
  })

  test('nunca lança: desvio fora do alcance de Date vira correção descartada, não erro', () => {
    const tappedAt = new Date('2026-10-03T10:00:00.000Z')

    expect(
      resolveOccurredAt({
        clockOffsetMs: Number.MAX_SAFE_INTEGER,
        receivedAt: RECEIVED_AT,
        tappedAt,
      }),
    ).toEqual({ kind: 'ignored', reason: 'future' })
    expect(
      resolveOccurredAt({
        clockOffsetMs: -Number.MAX_SAFE_INTEGER,
        receivedAt: RECEIVED_AT,
        tappedAt,
      }),
    ).toEqual({ kind: 'ignored', reason: 'too_old' })
  })

  test('não muta as entradas', () => {
    const tappedAt = new Date('2026-10-03T09:53:00.000Z')
    const receivedAt = new Date(RECEIVED_AT.getTime())
    const params = Object.freeze({
      clockOffsetMs: 7 * MILLISECONDS_PER_MINUTE,
      receivedAt,
      tappedAt,
    })

    const result = resolveOccurredAt(params)

    expect(tappedAt.getTime()).toBe(new Date('2026-10-03T09:53:00.000Z').getTime())
    expect(receivedAt.getTime()).toBe(RECEIVED_AT.getTime())
    expect(params.clockOffsetMs).toBe(7 * MILLISECONDS_PER_MINUTE)
    expect(result.kind === 'corrected' && result.occurredAt).not.toBe(tappedAt)
  })
})

describe('resolveRecordedEventClock — o evento grava a decisão, não o desvio cru (spec 232 T1.5)', () => {
  const tappedAt = new Date('2026-10-03T09:58:30.000Z')

  test('correção aceita: hora crua do toque e a corrigida com o desvio aplicado', () => {
    expect(
      resolveRecordedEventClock({ clockOffsetMs: 90_000, receivedAt: RECEIVED_AT, tappedAt }),
    ).toEqual({
      correctedClock: { clockOffsetMs: 90_000, occurredAt: new Date('2026-10-03T10:00:00.000Z') },
      tappedAt,
    })
  })

  test('correção no futuro: só a hora crua, sem a chave da corrigida', () => {
    const future = new Date(RECEIVED_AT.getTime() + MILLISECONDS_PER_HOUR)
    const recorded = resolveRecordedEventClock({
      clockOffsetMs: 0,
      receivedAt: RECEIVED_AT,
      tappedAt: future,
    })

    expect(recorded).toEqual({ tappedAt: future })
    expect('correctedClock' in recorded).toBe(false)
  })

  test('correção velha demais: só a hora crua', () => {
    const old = new Date(RECEIVED_AT.getTime() - MAX_AGE_MILLISECONDS - 1)

    expect(
      resolveRecordedEventClock({ clockOffsetMs: 0, receivedAt: RECEIVED_AT, tappedAt: old }),
    ).toEqual({ tappedAt: old })
  })

  test('sem desvio: só a hora crua; sem toque: nada — cliente antigo grava como hoje', () => {
    expect(
      resolveRecordedEventClock({ clockOffsetMs: undefined, receivedAt: RECEIVED_AT, tappedAt }),
    ).toEqual({ tappedAt })
    const nothing = resolveRecordedEventClock({
      clockOffsetMs: 90_000,
      receivedAt: RECEIVED_AT,
      tappedAt: undefined,
    })
    expect(nothing).toEqual({})
    expect(Object.keys(nothing)).toEqual([])
  })
})
