/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0081 §3/§4 / spec 196 D3/D4 (T3.1): o carimbo inteiro de um evento — as quatro colunas de
 * posição e o estado — sai de uma função só, a partir do canal, de a ação ser **toque** do motorista
 * e de o aparelho ter mandado ponto. Escritor que repete o `if` é como as cinco tabelas passariam a
 * divergir sobre o que `null` quer dizer.
 */
import { describe, expect, test } from 'bun:test'

import { EVENT_LOCATION_STATES } from '../../src/database/event-location.schema.js'
import {
  NO_EVENT_LOCATION_STAMP,
  resolveEventLocationStamp,
} from '../../src/trips/domain/event-location-stamp.policy.js'
import {
  TRIP_FIELD_CHANNELS,
  type TripFieldChannel,
} from '../../src/trips/domain/trip-field-channel.constant.js'

const POINT = {
  accuracyMeters: '12.50',
  capturedAt: '2026-10-02T12:00:00.000Z',
  latitude: '-23.5505200',
  longitude: '-46.6333090',
} as const

const CAPTURED_STAMP = {
  accuracyMeters: '12.50',
  capturedAt: new Date('2026-10-02T12:00:00.000Z'),
  latitude: '-23.5505200',
  locationState: EVENT_LOCATION_STATES.captured,
  longitude: '-46.6333090',
} as const

const UNAVAILABLE_STAMP = {
  accuracyMeters: null,
  capturedAt: null,
  latitude: null,
  locationState: EVENT_LOCATION_STATES.unavailable,
  longitude: null,
} as const

const DRIVER_TAP_CHANNELS: TripFieldChannel[] = [
  TRIP_FIELD_CHANNELS.driverApp,
  TRIP_FIELD_CHANNELS.whatsapp,
]
const OFFICE_CHANNELS: TripFieldChannel[] = [
  TRIP_FIELD_CHANNELS.office,
  TRIP_FIELD_CHANNELS.backoffice,
]

describe('toque do motorista (ADR-0081 §3)', () => {
  test.each(DRIVER_TAP_CHANNELS)('%s com ponto grava captured e as quatro colunas', (channel) => {
    expect(resolveEventLocationStamp({ channel, isDriverTap: true, location: POINT })).toEqual(
      CAPTURED_STAMP,
    )
  })

  test.each(DRIVER_TAP_CHANNELS)(
    '%s sem ponto grava unavailable — ele tocou e a posição não veio',
    (channel) => {
      expect(resolveEventLocationStamp({ channel, isDriverTap: true, location: null })).toEqual(
        UNAVAILABLE_STAMP,
      )
    },
  )

  test('a precisão ausente continua ausente — nunca zero', () => {
    const stamp = resolveEventLocationStamp({
      channel: TRIP_FIELD_CHANNELS.driverApp,
      isDriverTap: true,
      location: { ...POINT, accuracyMeters: null },
    })

    expect(stamp.accuracyMeters).toBeNull()
    expect(stamp.locationState).toBe(EVENT_LOCATION_STATES.captured)
  })

  test('a hora da leitura vira instante, preservando o milissegundo', () => {
    const stamp = resolveEventLocationStamp({
      channel: TRIP_FIELD_CHANNELS.driverApp,
      isDriverTap: true,
      location: { ...POINT, capturedAt: '2026-10-02T12:00:00.123Z' },
    })

    expect(stamp.capturedAt?.toISOString()).toBe('2026-10-02T12:00:00.123Z')
  })
})

describe('o que não é toque do motorista não leva nada (ADR-0081 §3/§4)', () => {
  test.each(Object.values(TRIP_FIELD_CHANNELS))(
    '%s derivado, com ou sem ponto, grava tudo null — o ponto está no toque',
    (channel) => {
      for (const location of [POINT, null]) {
        expect(resolveEventLocationStamp({ channel, isDriverTap: false, location })).toEqual(
          NO_EVENT_LOCATION_STAMP,
        )
      }
    },
  )

  test('o WhatsApp do operador (não é toque do motorista) grava null, mesmo no canal que o motorista usa', () => {
    expect(
      resolveEventLocationStamp({
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        isDriverTap: false,
        location: POINT,
      }),
    ).toEqual(NO_EVENT_LOCATION_STAMP)
  })

  test.each(OFFICE_CHANNELS)(
    '%s nunca grava ponto nem estado, mesmo marcado como toque e com ponto na mão',
    (channel) => {
      for (const location of [POINT, null]) {
        expect(resolveEventLocationStamp({ channel, isDriverTap: true, location })).toEqual(
          NO_EVENT_LOCATION_STAMP,
        )
      }
    },
  )

  test('o carimbo vazio tem as cinco colunas, todas null', () => {
    expect(NO_EVENT_LOCATION_STAMP).toEqual({
      accuracyMeters: null,
      capturedAt: null,
      latitude: null,
      locationState: null,
      longitude: null,
    })
  })
})

describe('invariantes que o banco também cobra', () => {
  const combinations = Object.values(TRIP_FIELD_CHANNELS).flatMap((channel) =>
    [true, false].flatMap((isDriverTap) =>
      [POINT, null].map((location) => ({ channel, isDriverTap, location })),
    ),
  )

  test.each(combinations)(
    'captured e a coordenada andam juntas: %o',
    ({ channel, isDriverTap, location }) => {
      const stamp = resolveEventLocationStamp({ channel, isDriverTap, location })

      expect(stamp.locationState === EVENT_LOCATION_STATES.captured).toBe(stamp.latitude !== null)
      expect(stamp.latitude === null).toBe(stamp.longitude === null)
      expect(stamp.accuracyMeters === null || stamp.latitude !== null).toBe(true)
    },
  )

  test('expired é veredito do expurgo, nunca da escrita', () => {
    const written = combinations.map(
      (combination) => resolveEventLocationStamp(combination).locationState,
    )

    expect(written).not.toContain(EVENT_LOCATION_STATES.expired)
  })

  test('estado só em canal que pode carregá-lo: driver_app e whatsapp', () => {
    const channelsWithState = new Set(
      combinations
        .filter((combination) => resolveEventLocationStamp(combination).locationState !== null)
        .map((combination) => combination.channel),
    )

    expect([...channelsWithState].toSorted()).toEqual(['driver_app', 'whatsapp'])
  })
})
