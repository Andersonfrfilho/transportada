/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  TRIP_TRACKING_MAX_AGE_HOURS,
  checkTrackingWindow,
  resolveTrackingPurgeCutoff,
} from '../../src/trips/domain/tracking-window.policy.js'

const NOW = new Date('2026-09-03T18:00:00.000Z')

function hoursAgo(hours: number): Date {
  return new Date(NOW.getTime() - hours * 3_600_000)
}

describe('a janela do rastro (ADR-0056 §2)', () => {
  test('a viagem despachada há pouco aceita ping', () => {
    expect(checkTrackingWindow({ dispatchedAt: hoursAgo(2), now: NOW })).toBe('open')
  })

  test('um dia de trabalho com pernoite continua dentro da janela', () => {
    expect(checkTrackingWindow({ dispatchedAt: hoursAgo(30), now: NOW })).toBe('open')
  })

  /* A viagem esquecida aberta na sexta não pode acompanhar o motorista no fim de semana. */
  test('passado o teto, o ping deixa de ser aceito mesmo com a viagem aberta', () => {
    expect(checkTrackingWindow({ dispatchedAt: hoursAgo(48), now: NOW })).toBe('trip_too_old')
    expect(checkTrackingWindow({ dispatchedAt: hoursAgo(72), now: NOW })).toBe('trip_too_old')
  })

  test('a borda exata ainda está aberta — o teto é excludente', () => {
    expect(
      checkTrackingWindow({ dispatchedAt: hoursAgo(TRIP_TRACKING_MAX_AGE_HOURS), now: NOW }),
    ).toBe('open')
  })

  /**
   * Viagem que nunca saiu responde igual ao teto estourado: o app não precisa distinguir, e
   * distinguir daria ao celular um jeito de perguntar pelo estado da viagem.
   */
  test('viagem sem despacho não abre janela', () => {
    expect(checkTrackingWindow({ dispatchedAt: null, now: NOW })).toBe('trip_too_old')
  })

  test('o corte do expurgo é o mesmo teto, contado para trás', () => {
    expect(resolveTrackingPurgeCutoff(NOW)).toEqual(hoursAgo(TRIP_TRACKING_MAX_AGE_HOURS))
  })
})
