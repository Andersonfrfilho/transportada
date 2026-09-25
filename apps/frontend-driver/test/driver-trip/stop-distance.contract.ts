/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  formatStopDistance,
  haversineDistanceKm,
} from '@/modules/driver-trip/shared/driverStopDistance.service'
import type {
  DriverReportedLocation,
  DriverTripStop,
} from '@/modules/driver-trip/shared/driverTrip.types'

function buildStop(overrides: Partial<DriverTripStop> = {}): DriverTripStop {
  return {
    arrivedAt: null,
    completedAt: null,
    deliveryProof: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [],
    id: 'stop-1',
    label: 'Rua das Entregas, 100',
    latitude: '-23.5505',
    longitude: '-46.6333',
    schedule: null,
    sequence: 1,
    ...overrides,
  }
}

const LOCATION: DriverReportedLocation = {
  capturedAt: '2026-09-03T13:00:00.000Z',
  latitude: -23.5505,
  longitude: -46.6333,
}

describe('a distância até a parada (D2/T050)', () => {
  it('mede pela haversine — São Paulo → Campinas fica perto dos 88 km reais', () => {
    const distance = haversineDistanceKm({
      from: { latitude: -23.5505, longitude: -46.6333 },
      to: { latitude: -22.9099, longitude: -47.0626 },
    })
    expect(distance).toBeGreaterThan(80)
    expect(distance).toBeLessThan(95)
  })

  it('formata com vírgula e uma casa, no padrão "X,X km"', () => {
    const label = formatStopDistance({
      location: LOCATION,
      stop: buildStop({ latitude: '-22.9099', longitude: '-47.0626' }),
    })
    expect(label).toMatch(/^\d+,\d km$/u)
  })

  it('sem posição conhecida não renderiza nada — nunca "0 km"', () => {
    expect(formatStopDistance({ location: null, stop: buildStop() })).toBeNull()
  })

  it('sem coordenada da parada não renderiza nada', () => {
    expect(
      formatStopDistance({ location: LOCATION, stop: buildStop({ latitude: null }) }),
    ).toBeNull()
    expect(
      formatStopDistance({ location: LOCATION, stop: buildStop({ longitude: null }) }),
    ).toBeNull()
  })

  it('coordenada que não é número é ausência, não NaN na tela', () => {
    expect(
      formatStopDistance({
        location: LOCATION,
        stop: buildStop({ latitude: 'abc', longitude: '-46.6' }),
      }),
    ).toBeNull()
  })

  it('muito perto vira o piso "0,1 km" — "0,0 km" leria como dado inventado', () => {
    expect(formatStopDistance({ location: LOCATION, stop: buildStop() })).toBe('0,1 km')
  })
})
