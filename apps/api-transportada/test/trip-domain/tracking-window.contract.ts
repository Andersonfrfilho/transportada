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
   * ⚠️ **Ausência de data não é idade, e tratá-la como velhice apaga o rastro em silêncio.**
   *
   * A data sai de `trip_dispatch_snapshots` por `leftJoin` — `trips` não tem `dispatched_at`. Então
   * toda viagem sem snapshot (as anteriores à tabela, e qualquer despacho que não o tenha gravado)
   * caía como "velha demais": o motorista seguia mandando posição, o portal do contratante mostrava
   * vazio, e **nada acusava**. Foram duas integrações do portal reprovando que trouxeram isto à
   * tona, e elas descrevem o caso real — viagem despachada, sem snapshot.
   *
   * Sem data não há o que comparar, e a resposta honesta é **deixar passar**: quem cumpre a LGPD
   * aqui é o expurgo por idade, que corta o ping velho tenha a viagem fechado ou não. Inferir
   * idade de um dado que não é sobre idade era a troca errada.
   */
  test('viagem sem data de despacho não é viagem velha', () => {
    expect(checkTrackingWindow({ dispatchedAt: null, now: NOW })).toBe('open')
  })

  test('o corte do expurgo é o mesmo teto, contado para trás', () => {
    expect(resolveTrackingPurgeCutoff(NOW)).toEqual(hoursAgo(TRIP_TRACKING_MAX_AGE_HOURS))
  })
})
