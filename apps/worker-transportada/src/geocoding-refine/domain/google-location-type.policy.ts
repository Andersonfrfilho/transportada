/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GeocodingPrecision } from '../../database/routing.schema.js'

/**
 * ⚠️ **Cópia por valor** de `api-transportada/src/routing/domain/geocoding-precision.policy.ts` —
 * só a tradução, nunca a ordenação. A ordenação de precisão continua morando só na API (adendo
 * 2026-09-01 da ADR-0044): aqui a única comparação que existe é "é melhor que `city`?", e ela já
 * mora em `isOptimizablePrecision`.
 *
 * O `location_type` é o motivo técnico da escolha do provedor (ADR-0044 §3): ele **declara** a
 * precisão em vez de deixar inferir, e precisão inferida é precisão errada.
 */
export const GOOGLE_LOCATION_TYPES = [
  'ROOFTOP',
  'RANGE_INTERPOLATED',
  'GEOMETRIC_CENTER',
  'APPROXIMATE',
] as const
export type GoogleLocationType = (typeof GOOGLE_LOCATION_TYPES)[number]

const PRECISION_BY_LOCATION_TYPE: Readonly<Record<GoogleLocationType, GeocodingPrecision>> = {
  APPROXIMATE: 'city',
  GEOMETRIC_CENTER: 'postal_code',
  RANGE_INTERPOLATED: 'street',
  ROOFTOP: 'rooftop',
}

/**
 * `city` para o que não se reconhece: o desconhecido é tratado como o palpite mais grosseiro, nunca
 * como o mais fino. Um `location_type` novo entrando como `rooftop` poria um chute de quilômetros
 * dentro da otimização sem ninguém ver — e aqui, pior, gastaria para piorar.
 */
export function toGeocodingPrecision(locationType: string): GeocodingPrecision {
  return PRECISION_BY_LOCATION_TYPE[locationType as GoogleLocationType] ?? 'city'
}
