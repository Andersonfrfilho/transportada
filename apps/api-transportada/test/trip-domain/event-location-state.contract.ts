/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ADR-0081 §3 / spec 196 D3 (revista): só o motorista tem ponto e estado, no app ou no WhatsApp. A decisão mora
 * numa função só — repetir o `if` em cada escritor é como as cinco tabelas passariam a divergir.
 */
import { describe, expect, test } from 'bun:test'

import { EVENT_LOCATION_STATES } from '../../src/database/event-location.schema.js'
import { resolveEventLocationState } from '../../src/trips/domain/event-location-state.policy.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'

describe('o estado do ponto sai do canal e da presença da coordenada (ADR-0081 §3)', () => {
  test.each(Object.values(TRIP_FIELD_CHANNELS))('com coordenada, %s grava captured', (channel) => {
    expect(resolveEventLocationState({ channel, hasCoordinate: true })).toBe(
      EVENT_LOCATION_STATES.captured,
    )
  })

  test('sem coordenada, o app do motorista grava unavailable — ele tocou e a posição não veio', () => {
    expect(
      resolveEventLocationState({
        channel: TRIP_FIELD_CHANNELS.driverApp,
        hasCoordinate: false,
      }),
    ).toBe(EVENT_LOCATION_STATES.unavailable)
  })

  test.each([TRIP_FIELD_CHANNELS.office, TRIP_FIELD_CHANNELS.backoffice])(
    'sem coordenada, %s fica null — não se aplica, e vermelho ali seria mentira',
    (channel) => {
      expect(resolveEventLocationState({ channel, hasCoordinate: false })).toBeNull()
    },
  )

  /**
   * D3 revista (2026-10-02): a mensagem de localização do WhatsApp carrega o ponto, então o canal
   * passa a pedir posição como o app. O contrato anterior proibia isto; a inversão é intencional.
   */
  test('o WhatsApp do motorista sem ponto grava unavailable — ele pode mandar localização', () => {
    expect(
      resolveEventLocationState({
        channel: TRIP_FIELD_CHANNELS.whatsapp,
        hasCoordinate: false,
      }),
    ).toBe(EVENT_LOCATION_STATES.unavailable)
  })

  test('o estado nunca é expired na escrita — expired é veredito do expurgo', () => {
    const written = Object.values(TRIP_FIELD_CHANNELS).flatMap((channel) =>
      [true, false].map((hasCoordinate) => resolveEventLocationState({ channel, hasCoordinate })),
    )

    expect(written).not.toContain(EVENT_LOCATION_STATES.expired)
  })
})
