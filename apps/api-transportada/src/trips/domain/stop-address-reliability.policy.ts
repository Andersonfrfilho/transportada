/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF12: endereço **não confiável** é o que não deixa o motorista chegar pelo mapa — sem
 * coordenada, ou com a precisão de CEP/município (um palpite de quilômetros, ADR-0044 §5).
 */
import type { GeocodingPrecision } from '../../database/geocoding.schema.js'

const RELIABLE_PRECISIONS: readonly GeocodingPrecision[] = ['rooftop', 'street']

export type StopCoordinate = {
  readonly latitude: string | null
  readonly longitude: string | null
  readonly precision: GeocodingPrecision | null
}

export function isStopAddressReliable(coordinate: StopCoordinate): boolean {
  if (coordinate.latitude === null || coordinate.longitude === null) return false
  if (coordinate.precision === null) return false
  return RELIABLE_PRECISIONS.includes(coordinate.precision)
}
