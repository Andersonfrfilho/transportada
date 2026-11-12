/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF12: endereço não confiável = sem coordenada, ou precisão de CEP/município.
 */
import { describe, expect, test } from 'bun:test'

import { isStopAddressReliable } from '../../src/trips/domain/stop-address-reliability.policy.js'

const POINT = { latitude: '-23.55', longitude: '-46.63' } as const

describe('a confiança do endereço da parada (spec 294 RF12)', () => {
  test('rooftop e street são confiáveis', () => {
    expect(isStopAddressReliable({ ...POINT, precision: 'rooftop' })).toBe(true)
    expect(isStopAddressReliable({ ...POINT, precision: 'street' })).toBe(true)
  })

  test('CEP e município não são confiáveis', () => {
    expect(isStopAddressReliable({ ...POINT, precision: 'postal_code' })).toBe(false)
    expect(isStopAddressReliable({ ...POINT, precision: 'city' })).toBe(false)
  })

  test('sem coordenada não é confiável, qualquer que seja a precisão', () => {
    expect(isStopAddressReliable({ latitude: null, longitude: null, precision: null })).toBe(false)
    expect(
      isStopAddressReliable({ latitude: null, longitude: POINT.longitude, precision: 'street' }),
    ).toBe(false)
    expect(isStopAddressReliable({ ...POINT, precision: null })).toBe(false)
  })
})
