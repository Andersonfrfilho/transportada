/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 257 D1/D10: o vínculo depois do despacho é uma janela própria. O vínculo comum segue fechado
 * na rua, e a lista dos estados "antes do despacho" (que decide se a rota congelada pode ser
 * apagada) não depende de nenhum dos dois.
 */
import { describe, expect, test } from 'bun:test'

import { TRIP_STATUSES, type TripStatus } from '../../src/database/trip.schema.js'
import {
  TRIP_ON_ROAD_STATUSES,
  TRIP_STATUSES_BEFORE_DISPATCH,
  TRIP_TRANSITION_BLOCK,
  checkTripAcceptsLinkage,
  checkTripAcceptsLinkageAfterDispatch,
} from '../../src/trips/domain/trip-state.policy.js'

describe('vínculo de nota depois do despacho (spec 257 D1)', () => {
  test('aceita exatamente os estados na rua', () => {
    for (const status of TRIP_STATUSES) {
      const isOnRoad = (TRIP_ON_ROAD_STATUSES as readonly TripStatus[]).includes(status)
      expect(checkTripAcceptsLinkageAfterDispatch(status) === null).toBe(isOnRoad)
    }
  })

  test('concluída e cancelada recusam com o motivo do estado', () => {
    expect(checkTripAcceptsLinkageAfterDispatch('completed')).toBe(
      TRIP_TRANSITION_BLOCK.tripCompleted,
    )
    expect(checkTripAcceptsLinkageAfterDispatch('cancelled')).toBe(
      TRIP_TRANSITION_BLOCK.tripCancelled,
    )
  })

  test('antes do despacho a rota é a do vínculo comum', () => {
    expect(checkTripAcceptsLinkageAfterDispatch('draft')).toBe(
      TRIP_TRANSITION_BLOCK.tripNotDispatched,
    )
  })

  test('o vínculo comum continua fechado na rua', () => {
    for (const status of TRIP_ON_ROAD_STATUSES) {
      expect(checkTripAcceptsLinkage(status)).toBe(TRIP_TRANSITION_BLOCK.tripAlreadyDispatched)
    }
  })
})

describe('estados antes do despacho não dependem do vínculo (spec 257 D10)', () => {
  test('nenhum estado na rua, concluído ou cancelado entra: a rota congelada fica a salvo', () => {
    for (const status of TRIP_STATUSES) {
      const isBefore = (TRIP_STATUSES_BEFORE_DISPATCH as readonly TripStatus[]).includes(status)
      const isAfter =
        status === 'cancelled' ||
        status === 'completed' ||
        (TRIP_ON_ROAD_STATUSES as readonly TripStatus[]).includes(status)
      expect(isBefore).toBe(!isAfter)
    }
  })
})
