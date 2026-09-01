/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  GOOGLE_LOCATION_TYPES,
  isFinerPrecision,
  isOptimizablePrecision,
  toGeocodingPrecision,
} from '../../src/routing/domain/geocoding-precision.policy.js'

describe('geocoding precision cascade (ADR-0044 §3)', () => {
  /**
   * Aceite da spec 058: os quatro `location_type` mapeados. É o motivo técnico da escolha do
   * provedor — ele declara a precisão, e precisão inferida é precisão errada.
   */
  test('maps every Google location type the API can return', () => {
    expect(toGeocodingPrecision('ROOFTOP')).toBe('rooftop')
    expect(toGeocodingPrecision('RANGE_INTERPOLATED')).toBe('street')
    expect(toGeocodingPrecision('GEOMETRIC_CENTER')).toBe('postal_code')
    expect(toGeocodingPrecision('APPROXIMATE')).toBe('city')

    for (const locationType of GOOGLE_LOCATION_TYPES) {
      expect(toGeocodingPrecision(locationType)).toBeString()
    }
  })

  /**
   * O desconhecido entra como o palpite mais grosseiro, nunca como o mais fino. Um `location_type`
   * novo caindo em `rooftop` colocaria um chute de quilômetros dentro da otimização sem ninguém ver.
   */
  test('treats an unknown location type as the coarsest guess, never the finest', () => {
    expect(toGeocodingPrecision('SOMETHING_GOOGLE_ADDED_LATER')).toBe('city')
    expect(toGeocodingPrecision('')).toBe('city')
  })

  /** ADR-0044 §5: centroide de município é palpite de ~8km — não é parada, e sai da otimização. */
  test('keeps a municipality centroid out of the automatic optimization', () => {
    expect(isOptimizablePrecision('city')).toBe(false)
    expect(isOptimizablePrecision('postal_code')).toBe(true)
    expect(isOptimizablePrecision('street')).toBe(true)
    expect(isOptimizablePrecision('rooftop')).toBe(true)
  })

  test('ranks the cascade from rooftop down to city', () => {
    expect(isFinerPrecision('rooftop', 'street')).toBe(true)
    expect(isFinerPrecision('street', 'postal_code')).toBe(true)
    expect(isFinerPrecision('postal_code', 'city')).toBe(true)

    expect(isFinerPrecision('city', 'rooftop')).toBe(false)
    expect(isFinerPrecision('rooftop', 'rooftop')).toBe(false)
  })
})
