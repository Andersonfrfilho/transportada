/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 206 D3: a comparação do `tappedAt` do aparelho com a tolerância de relógio e com a janela do
 * despacho congelado.
 */
import { describe, expect, it } from 'bun:test'

import {
  DEPARTURE_TAPPED_AT_TOLERANCE_MILLISECONDS,
  isDepartureTapStale,
  resolveDepartureTappedAt,
} from '../../src/trips/domain/departure-order.policy.js'

const NOW = new Date('2026-09-26T13:00:00.000Z')
const DISPATCHED_AT = new Date('2026-09-26T08:00:00.000Z')

describe('resolveDepartureTappedAt', () => {
  it('devolve o próprio tappedAt quando está dentro da janela', () => {
    const tappedAt = new Date(NOW.getTime() - 60_000)

    expect(resolveDepartureTappedAt({ dispatchedAt: DISPATCHED_AT, now: NOW, tappedAt })).toEqual(
      tappedAt,
    )
  })

  it('dispensa a comparação (null) quando o toque é mais de 2 min no futuro', () => {
    const tappedAt = new Date(NOW.getTime() + DEPARTURE_TAPPED_AT_TOLERANCE_MILLISECONDS + 1_000)

    expect(resolveDepartureTappedAt({ dispatchedAt: DISPATCHED_AT, now: NOW, tappedAt })).toBeNull()
  })

  it('aceita o toque exatamente na borda da tolerância de futuro', () => {
    const tappedAt = new Date(NOW.getTime() + DEPARTURE_TAPPED_AT_TOLERANCE_MILLISECONDS)

    expect(resolveDepartureTappedAt({ dispatchedAt: DISPATCHED_AT, now: NOW, tappedAt })).toEqual(
      tappedAt,
    )
  })

  it('dispensa a comparação (null) quando o toque é anterior ao despacho congelado', () => {
    const tappedAt = new Date(DISPATCHED_AT.getTime() - 1_000)

    expect(resolveDepartureTappedAt({ dispatchedAt: DISPATCHED_AT, now: NOW, tappedAt })).toBeNull()
  })

  it('sem despacho congelado (viagem legada), só a janela de futuro vale', () => {
    const tappedAt = new Date('2020-01-01T00:00:00.000Z')

    expect(resolveDepartureTappedAt({ dispatchedAt: null, now: NOW, tappedAt })).toEqual(tappedAt)
  })
})

describe('isDepartureTapStale', () => {
  it('não é velho quando não há departed nem arrived anteriores', () => {
    expect(
      isDepartureTapStale({
        lastArrivedAt: null,
        lastDepartedTappedAt: null,
        resolvedTappedAt: NOW,
      }),
    ).toBe(false)
  })

  it('é velho quando o toque é anterior ao último departed da viagem', () => {
    const lastDepartedTappedAt = new Date(NOW.getTime())
    const resolvedTappedAt = new Date(
      NOW.getTime() - DEPARTURE_TAPPED_AT_TOLERANCE_MILLISECONDS - 1_000,
    )

    expect(
      isDepartureTapStale({ lastArrivedAt: null, lastDepartedTappedAt, resolvedTappedAt }),
    ).toBe(true)
  })

  it('é velho quando o toque é anterior ao último arrived da viagem', () => {
    const lastArrivedAt = new Date(NOW.getTime())
    const resolvedTappedAt = new Date(
      NOW.getTime() - DEPARTURE_TAPPED_AT_TOLERANCE_MILLISECONDS - 1_000,
    )

    expect(
      isDepartureTapStale({ lastArrivedAt, lastDepartedTappedAt: null, resolvedTappedAt }),
    ).toBe(true)
  })

  it('compara contra o mais recente dos dois, nunca o mais antigo', () => {
    const lastDepartedTappedAt = new Date(NOW.getTime() - 3_600_000)
    const lastArrivedAt = new Date(NOW.getTime())
    const resolvedTappedAt = new Date(
      NOW.getTime() - DEPARTURE_TAPPED_AT_TOLERANCE_MILLISECONDS - 1_000,
    )

    expect(isDepartureTapStale({ lastArrivedAt, lastDepartedTappedAt, resolvedTappedAt })).toBe(
      true,
    )
  })

  it('dentro da tolerância não é velho', () => {
    const lastDepartedTappedAt = NOW
    const resolvedTappedAt = new Date(
      NOW.getTime() - DEPARTURE_TAPPED_AT_TOLERANCE_MILLISECONDS + 1_000,
    )

    expect(
      isDepartureTapStale({ lastArrivedAt: null, lastDepartedTappedAt, resolvedTappedAt }),
    ).toBe(false)
  })

  it('um tappedAt fora da janela (null) nunca é velho — não há o que comparar', () => {
    expect(
      isDepartureTapStale({
        lastArrivedAt: NOW,
        lastDepartedTappedAt: NOW,
        resolvedTappedAt: null,
      }),
    ).toBe(false)
  })
})
