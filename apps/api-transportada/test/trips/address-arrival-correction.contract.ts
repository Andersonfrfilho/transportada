/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 (RF14, RF15): o ponto da chegada corrige o endereço só dentro da tolerância da precisão;
 * endereço confiável nunca é sobrescrito, e o que foge da régua vira sugestão para o escritório.
 */
import { describe, expect, test } from 'bun:test'

import {
  ARRIVAL_CORRECTION_CITY_TOLERANCE_METRES,
  ARRIVAL_CORRECTION_POSTAL_CODE_TOLERANCE_METRES,
  ARRIVAL_CORRECTION_TRUSTED_TOLERANCE_METRES,
} from '../../src/trips/domain/address-arrival-correction.constant.js'
import { resolveAddressArrivalCorrection } from '../../src/trips/domain/address-arrival-correction.policy.js'
import { distanceInMetres } from '../../src/addresses/domain/coordinate-distance.js'

const ORIGIN = { latitude: '-21.1775000', longitude: '-47.8103000' }
const METRES_PER_DEGREE_LATITUDE = 111_195

function pointNorthOf(metres: number): { latitude: string; longitude: string } {
  const latitude = Number(ORIGIN.latitude) + metres / METRES_PER_DEGREE_LATITUDE
  return { latitude: latitude.toFixed(7), longitude: ORIGIN.longitude }
}

const LATITUDE_STEP = 0.0000001

/** Últimos pontos (grade de 7 casas) em que a distância medida ainda é <= limite, e o seguinte, já > limite. */
function pointsAroundLimit(metres: number): {
  readonly atLimit: { latitude: string; longitude: string }
  readonly pastLimit: { latitude: string; longitude: string }
} {
  let latitude =
    Math.round((Number(ORIGIN.latitude) + metres / METRES_PER_DEGREE_LATITUDE) * 1e7) / 1e7
  const measure = (value: number): number =>
    distanceInMetres(ORIGIN, { latitude: value.toFixed(7), longitude: ORIGIN.longitude }) ?? 0
  while (measure(latitude) > metres) latitude -= LATITUDE_STEP
  while (measure(latitude + LATITUDE_STEP) <= metres) latitude += LATITUDE_STEP
  return {
    atLimit: { latitude: latitude.toFixed(7), longitude: ORIGIN.longitude },
    pastLimit: { latitude: (latitude + LATITUDE_STEP).toFixed(7), longitude: ORIGIN.longitude },
  }
}

const BOUNDARY_ROWS = [
  ['postal_code', ARRIVAL_CORRECTION_POSTAL_CODE_TOLERANCE_METRES, 'apply'],
  ['city', ARRIVAL_CORRECTION_CITY_TOLERANCE_METRES, 'apply'],
  ['rooftop', ARRIVAL_CORRECTION_TRUSTED_TOLERANCE_METRES, 'ignore'],
  ['street', ARRIVAL_CORRECTION_TRUSTED_TOLERANCE_METRES, 'ignore'],
] as const

describe('resolveAddressArrivalCorrection — a régua do endereço', () => {
  test('tolerâncias da spec: 2 km, 15 km e 300 m', () => {
    expect(ARRIVAL_CORRECTION_POSTAL_CODE_TOLERANCE_METRES).toBe(2000)
    expect(ARRIVAL_CORRECTION_CITY_TOLERANCE_METRES).toBe(15_000)
    expect(ARRIVAL_CORRECTION_TRUSTED_TOLERANCE_METRES).toBe(300)
  })

  test('sem coordenada atual vira sugestão, sem distância', () => {
    for (const precision of ['rooftop', 'street', 'postal_code', 'city'] as const) {
      expect(
        resolveAddressArrivalCorrection({
          currentCoordinate: null,
          currentPrecision: precision,
          driverPoint: ORIGIN,
        }),
      ).toEqual({ decision: 'suggest', distanceMeters: null })
    }
  })

  for (const [precision, limit, withinDecision] of BOUNDARY_ROWS) {
    describe(precision, () => {
      test(`no limite de ${limit} m: ${withinDecision}; um passo além: suggest`, () => {
        const { atLimit, pastLimit } = pointsAroundLimit(limit)
        const input = { currentCoordinate: ORIGIN, currentPrecision: precision }

        const atLimitResult = resolveAddressArrivalCorrection({ ...input, driverPoint: atLimit })
        expect(atLimitResult.decision).toBe(withinDecision)
        expect(atLimitResult.distanceMeters).toBeLessThanOrEqual(limit)
        expect(atLimitResult.distanceMeters).toBeGreaterThan(limit - 0.1)

        const pastLimitResult = resolveAddressArrivalCorrection({
          ...input,
          driverPoint: pastLimit,
        })
        expect(pastLimitResult.decision).toBe('suggest')
      })

      test('bem dentro do limite', () => {
        const result = resolveAddressArrivalCorrection({
          currentCoordinate: ORIGIN,
          currentPrecision: precision,
          driverPoint: pointNorthOf(limit / 2),
        })
        expect(result.decision).toBe(withinDecision)
      })

      test('um pouco além do limite vira sugestão', () => {
        const result = resolveAddressArrivalCorrection({
          currentCoordinate: ORIGIN,
          currentPrecision: precision,
          driverPoint: pointNorthOf(limit + 50),
        })
        expect(result.decision).toBe('suggest')
        expect(result.distanceMeters).toBeGreaterThan(limit)
      })

      test('mesmo ponto', () => {
        const result = resolveAddressArrivalCorrection({
          currentCoordinate: ORIGIN,
          currentPrecision: precision,
          driverPoint: ORIGIN,
        })
        expect(result).toEqual({ decision: withinDecision, distanceMeters: 0 })
      })
    })
  }

  test('ponto ilegível vira sugestão, sem distância', () => {
    expect(
      resolveAddressArrivalCorrection({
        currentCoordinate: ORIGIN,
        currentPrecision: 'city',
        driverPoint: { latitude: 'x', longitude: 'y' },
      }),
    ).toEqual({ decision: 'suggest', distanceMeters: null })
  })
})
