/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 (RF14, RF15): o ponto da chegada corrige o endereço só dentro da tolerância da precisão
 * atual; endereço confiável nunca é sobrescrito e o que foge da régua vira sugestão ao escritório.
 */
import { distanceInMetres, type Coordinate } from '../../addresses/domain/coordinate-distance.js'
import type { GeocodingPrecision } from '../../database/geocoding.schema.js'
import {
  ARRIVAL_CORRECTION_CITY_TOLERANCE_METRES,
  ARRIVAL_CORRECTION_POSTAL_CODE_TOLERANCE_METRES,
  ARRIVAL_CORRECTION_TRUSTED_TOLERANCE_METRES,
} from './address-arrival-correction.constant.js'

export type AddressArrivalCorrectionDecision = 'apply' | 'ignore' | 'suggest'

export type AddressArrivalCorrectionInput = {
  readonly currentCoordinate: Coordinate | null
  readonly currentPrecision: GeocodingPrecision
  readonly driverPoint: Coordinate
}

export type AddressArrivalCorrectionResult = {
  readonly decision: AddressArrivalCorrectionDecision
  readonly distanceMeters: number | null
}

const TOLERANCE_BY_PRECISION: Readonly<Record<GeocodingPrecision, number>> = {
  city: ARRIVAL_CORRECTION_CITY_TOLERANCE_METRES,
  postal_code: ARRIVAL_CORRECTION_POSTAL_CODE_TOLERANCE_METRES,
  rooftop: ARRIVAL_CORRECTION_TRUSTED_TOLERANCE_METRES,
  street: ARRIVAL_CORRECTION_TRUSTED_TOLERANCE_METRES,
}

const TRUSTED_PRECISIONS: ReadonlySet<GeocodingPrecision> = new Set(['rooftop', 'street'])

export function resolveAddressArrivalCorrection(
  input: AddressArrivalCorrectionInput,
): AddressArrivalCorrectionResult {
  const { currentCoordinate, currentPrecision, driverPoint } = input
  if (currentCoordinate === null) return { decision: 'suggest', distanceMeters: null }

  const distanceMeters = distanceInMetres(currentCoordinate, driverPoint)
  if (distanceMeters === null) return { decision: 'suggest', distanceMeters: null }
  if (distanceMeters > TOLERANCE_BY_PRECISION[currentPrecision])
    return { decision: 'suggest', distanceMeters }

  const withinDecision = TRUSTED_PRECISIONS.has(currentPrecision) ? 'ignore' : 'apply'
  return { decision: withinDecision, distanceMeters }
}
