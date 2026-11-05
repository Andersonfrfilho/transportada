/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 (RF14, RF15, revisão final S3/C3): a régua do ponto da chegada.
 *
 * 1. Chegada **tardia** (fila offline drenada depois do prazo da foto atrasada, spec 205/234) não corrige nem sugere.
 * 2. **Preciso** = `accuracyMeters` ≤ 50 m. Só o ponto preciso grava direto.
 * 3. Sem coordenada atual (ou ponto ilegível): sugestão.
 * 4. `postal_code` (2 km) / `city` (15 km): dentro e preciso → grava (`street`, `driver`); dentro e impreciso → sugestão;
 *    fora → sugestão.
 * 5. Ponto gravado por motorista (`source = driver`, `street`/`rooftop`), 300 m: dentro, preciso e mais longe que a
 *    própria precisão → regrava (refina); dentro sem isso → nada; fora e preciso → sugestão; fora e impreciso → nada.
 * 6. Confiável de outra fonte (`rooftop`/`street` de google, manual…), 300 m: dentro → nada; fora e preciso → sugestão;
 *    fora e impreciso → nada (C-L8).
 */
import { describe, expect, test } from 'bun:test'

import {
  ARRIVAL_CORRECTION_CITY_TOLERANCE_METRES,
  ARRIVAL_CORRECTION_LATE_AFTER_MILLISECONDS,
  ARRIVAL_CORRECTION_MAX_ACCURACY_METRES,
  ARRIVAL_CORRECTION_POSTAL_CODE_TOLERANCE_METRES,
  ARRIVAL_CORRECTION_TRUSTED_TOLERANCE_METRES,
} from '../../src/trips/domain/address-arrival-correction.constant.js'
import {
  isArrivalLate,
  resolveAddressArrivalCorrection,
  type AddressArrivalCorrectionInput,
} from '../../src/trips/domain/address-arrival-correction.policy.js'
import { DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS } from '../../src/trips/domain/delivery-proof-settings.policy.js'
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

const ACCURATE = 8
const INACCURATE = 120

function decide(
  overrides: Partial<AddressArrivalCorrectionInput> &
    Pick<AddressArrivalCorrectionInput, 'driverPoint'>,
) {
  return resolveAddressArrivalCorrection({
    accuracyMeters: ACCURATE,
    currentCoordinate: ORIGIN,
    currentPrecision: 'postal_code',
    currentSource: 'postal_code',
    isLate: false,
    ...overrides,
  })
}

const UNRELIABLE_ROWS = [
  ['postal_code', ARRIVAL_CORRECTION_POSTAL_CODE_TOLERANCE_METRES],
  ['city', ARRIVAL_CORRECTION_CITY_TOLERANCE_METRES],
] as const

describe('resolveAddressArrivalCorrection — a régua do endereço', () => {
  test('tolerâncias da spec: 2 km, 15 km e 300 m; precisão de 50 m; tardio = prazo da foto atrasada', () => {
    expect(ARRIVAL_CORRECTION_POSTAL_CODE_TOLERANCE_METRES).toBe(2000)
    expect(ARRIVAL_CORRECTION_CITY_TOLERANCE_METRES).toBe(15_000)
    expect(ARRIVAL_CORRECTION_TRUSTED_TOLERANCE_METRES).toBe(300)
    expect(ARRIVAL_CORRECTION_MAX_ACCURACY_METRES).toBe(50)
    expect(ARRIVAL_CORRECTION_LATE_AFTER_MILLISECONDS).toBe(
      DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS.proofWindowMinutes * 60_000,
    )
  })

  test('chegada tardia: nada, nem sugestão, em qualquer endereço', () => {
    for (const precision of ['rooftop', 'street', 'postal_code', 'city'] as const) {
      expect(
        decide({ currentPrecision: precision, driverPoint: pointNorthOf(10), isLate: true })
          .decision,
      ).toBe('ignore')
      expect(decide({ currentCoordinate: null, driverPoint: ORIGIN, isLate: true }).decision).toBe(
        'ignore',
      )
    }
  })

  test('sem coordenada atual vira sugestão, sem distância', () => {
    for (const precision of ['rooftop', 'street', 'postal_code', 'city'] as const) {
      expect(
        decide({ currentCoordinate: null, currentPrecision: precision, driverPoint: ORIGIN }),
      ).toEqual({ decision: 'suggest', distanceMeters: null })
    }
  })

  test('ponto ilegível vira sugestão, sem distância', () => {
    expect(
      decide({ currentPrecision: 'city', driverPoint: { latitude: 'x', longitude: 'y' } }),
    ).toEqual({ decision: 'suggest', distanceMeters: null })
  })

  for (const [precision, limit] of UNRELIABLE_ROWS) {
    describe(precision, () => {
      const base = { currentPrecision: precision, currentSource: precision } as const

      test(`preciso no limite de ${limit} m: apply; um passo além: suggest`, () => {
        const { atLimit, pastLimit } = pointsAroundLimit(limit)
        const atLimitResult = decide({ ...base, driverPoint: atLimit })
        expect(atLimitResult.decision).toBe('apply')
        expect(atLimitResult.distanceMeters).toBeLessThanOrEqual(limit)
        expect(atLimitResult.distanceMeters).toBeGreaterThan(limit - 0.1)
        expect(decide({ ...base, driverPoint: pastLimit }).decision).toBe('suggest')
      })

      test('dentro do limite com precisão no teto de 50 m: apply; acima de 50 m: suggest', () => {
        const point = pointNorthOf(limit / 2)
        expect(
          decide({
            ...base,
            accuracyMeters: ARRIVAL_CORRECTION_MAX_ACCURACY_METRES,
            driverPoint: point,
          }).decision,
        ).toBe('apply')
        expect(
          decide({
            ...base,
            accuracyMeters: ARRIVAL_CORRECTION_MAX_ACCURACY_METRES + 1,
            driverPoint: point,
          }).decision,
        ).toBe('suggest')
        expect(decide({ ...base, accuracyMeters: null, driverPoint: point }).decision).toBe(
          'suggest',
        )
      })

      test('fora do limite é sugestão, preciso ou não', () => {
        const point = pointNorthOf(limit + 50)
        expect(decide({ ...base, driverPoint: point }).decision).toBe('suggest')
        expect(decide({ ...base, accuracyMeters: INACCURATE, driverPoint: point }).decision).toBe(
          'suggest',
        )
      })
    })
  }

  for (const precision of ['rooftop', 'street'] as const) {
    describe(`${precision} de outra fonte (travado)`, () => {
      const base = { currentPrecision: precision, currentSource: 'google' } as const

      test('dentro de 300 m: nada, mesmo preciso', () => {
        const { atLimit } = pointsAroundLimit(ARRIVAL_CORRECTION_TRUSTED_TOLERANCE_METRES)
        expect(decide({ ...base, driverPoint: atLimit }).decision).toBe('ignore')
        expect(decide({ ...base, driverPoint: ORIGIN })).toEqual({
          decision: 'ignore',
          distanceMeters: 0,
        })
      })

      test('além de 300 m: sugestão só com ponto preciso; impreciso é ignorado (C-L8)', () => {
        const { pastLimit } = pointsAroundLimit(ARRIVAL_CORRECTION_TRUSTED_TOLERANCE_METRES)
        expect(decide({ ...base, driverPoint: pastLimit }).decision).toBe('suggest')
        expect(
          decide({ ...base, accuracyMeters: INACCURATE, driverPoint: pastLimit }).decision,
        ).toBe('ignore')
        expect(decide({ ...base, accuracyMeters: null, driverPoint: pastLimit }).decision).toBe(
          'ignore',
        )
      })

      test('o pino manual também nunca é regravado', () => {
        expect(
          decide({ ...base, currentSource: 'manual', driverPoint: pointNorthOf(100) }).decision,
        ).toBe('ignore')
      })
    })
  }

  describe('ponto já gravado por motorista (refinável)', () => {
    const base = { currentPrecision: 'street', currentSource: 'driver' } as const

    test('dentro de 300 m, preciso e mais longe que a própria precisão: apply', () => {
      const { atLimit } = pointsAroundLimit(ARRIVAL_CORRECTION_TRUSTED_TOLERANCE_METRES)
      expect(decide({ ...base, driverPoint: atLimit }).decision).toBe('apply')
      expect(decide({ ...base, driverPoint: pointNorthOf(ACCURATE + 5) }).decision).toBe('apply')
      expect(
        decide({ ...base, currentPrecision: 'rooftop', driverPoint: pointNorthOf(100) }).decision,
      ).toBe('apply')
    })

    test('dentro da própria precisão (mesmo ponto de novo): nada, sem trilha repetida', () => {
      expect(decide({ ...base, driverPoint: ORIGIN }).decision).toBe('ignore')
      expect(decide({ ...base, driverPoint: pointNorthOf(ACCURATE - 2) }).decision).toBe('ignore')
    })

    test('dentro de 300 m e impreciso: nada', () => {
      expect(
        decide({ ...base, accuracyMeters: INACCURATE, driverPoint: pointNorthOf(100) }).decision,
      ).toBe('ignore')
    })

    test('além de 300 m: sugestão se preciso, nada se impreciso', () => {
      const { pastLimit } = pointsAroundLimit(ARRIVAL_CORRECTION_TRUSTED_TOLERANCE_METRES)
      expect(decide({ ...base, driverPoint: pastLimit }).decision).toBe('suggest')
      expect(decide({ ...base, accuracyMeters: INACCURATE, driverPoint: pastLimit }).decision).toBe(
        'ignore',
      )
    })
  })
})

describe('isArrivalLate — a chegada que a fila offline entregou depois do prazo', () => {
  const receivedAt = new Date('2026-11-05T12:00:00.000Z')
  const minutesBefore = (minutes: number) => new Date(receivedAt.getTime() - minutes * 60_000)
  const window = DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS.proofWindowMinutes

  test('sem a hora do toque (cliente antigo, bot) não é tardia', () => {
    expect(isArrivalLate({ receivedAt })).toBe(false)
  })

  test('até o prazo não é tardia; um minuto além é', () => {
    expect(isArrivalLate({ receivedAt, tappedAt: minutesBefore(window) })).toBe(false)
    expect(isArrivalLate({ receivedAt, tappedAt: minutesBefore(window + 1) })).toBe(true)
  })

  test('o desvio do relógio medido pelo app corrige a hora do toque', () => {
    // O aparelho está 2 h atrasado: o toque "de 2 h atrás" foi agora.
    expect(
      isArrivalLate({
        clockOffsetMs: 120 * 60_000,
        receivedAt,
        tappedAt: minutesBefore(120),
      }),
    ).toBe(false)
  })
})
