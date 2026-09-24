/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  resolveAutoDispatchFeedback,
  resolveDispatchBlockedFeedback,
  resolveDispatchErrorFeedback,
} from '@/modules/trip/shared/tripDispatchFeedback.service'
import type { TripStopDetail } from '@/modules/trip/shared/trip.types'
import type { TripRequestError } from '@/modules/trip/shared/tripClient.service'

const STOPS: readonly TripStopDetail[] = [
  {
    addressKey: 'a',
    arrivedAt: null,
    completedAt: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [],
    id: 'stop-1',
    label: 'Parada 1 — Rua das Flores, 100',
    sequence: 1,
  },
  {
    addressKey: 'b',
    arrivedAt: null,
    completedAt: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [],
    id: 'stop-2',
    label: 'Parada 2 — Avenida Central, 200',
    sequence: 2,
  },
]

function requestError(code: string, details?: readonly { field: string; message: string }[]) {
  const error = new Error(code) as TripRequestError
  return details === undefined ? error : Object.assign(error, { details })
}

describe('resolveDispatchBlockedFeedback (spec 185 RF8)', () => {
  test('TRIP_HAS_NO_ROUTE vira a frase de nota sem parada, sem interpolação', () => {
    expect(resolveDispatchBlockedFeedback({ code: 'TRIP_HAS_NO_ROUTE', stops: STOPS })).toEqual({
      key: 'hasNoRoute',
    })
  })

  test('TRIP_HAS_UNSCHEDULED_STOPS resolve o rótulo de cada parada a partir de trip.stops', () => {
    const feedback = resolveDispatchBlockedFeedback({
      code: 'TRIP_HAS_UNSCHEDULED_STOPS',
      stopIds: ['stop-2', 'stop-1'],
      stops: STOPS,
    })

    expect(feedback.key).toBe('hasUnscheduledStops')
    expect(feedback.params?.stops).toBe(
      'Parada 2 — Avenida Central, 200, Parada 1 — Rua das Flores, 100',
    )
  })

  test('parada que sumiu de trip.stops cai para o próprio id, nunca quebra', () => {
    const feedback = resolveDispatchBlockedFeedback({
      code: 'TRIP_HAS_UNSCHEDULED_STOPS',
      stopIds: ['stop-desconhecida'],
      stops: STOPS,
    })

    expect(feedback.params?.stops).toBe('stop-desconhecida')
  })
})

describe('resolveDispatchErrorFeedback (o botão "Despachar")', () => {
  test('TRIP_HAS_UNSCHEDULED_STOPS lê os stopIds de details (field stopId)', () => {
    const error = requestError('TRIP_HAS_UNSCHEDULED_STOPS', [
      { field: 'stopId', message: 'stop-1' },
    ])

    expect(resolveDispatchErrorFeedback({ error, stops: STOPS })).toEqual({
      key: 'hasUnscheduledStops',
      params: { stops: 'Parada 1 — Rua das Flores, 100' },
    })
  })

  test('STATE_TRANSITION_NOT_ALLOWED com o motivo "sem rota" vira hasNoRoute', () => {
    const error = requestError('STATE_TRANSITION_NOT_ALLOWED', [
      { field: 'status', message: 'The trip has no planned route.' },
    ])

    expect(resolveDispatchErrorFeedback({ error, stops: STOPS })).toEqual({ key: 'hasNoRoute' })
  })

  test('STATE_TRANSITION_NOT_ALLOWED com outro motivo não vira frase específica — null', () => {
    const error = requestError('STATE_TRANSITION_NOT_ALLOWED', [
      {
        field: 'status',
        message: 'The cargo already left: a dispatched trip no longer accepts changes.',
      },
    ])

    expect(resolveDispatchErrorFeedback({ error, stops: STOPS })).toBeNull()
  })

  test('erro sem relação com despacho (ou sem detalhes) não produz frase — cai no genérico', () => {
    expect(
      resolveDispatchErrorFeedback({ error: requestError('TRIP_NOT_FOUND'), stops: STOPS }),
    ).toBeNull()
    expect(resolveDispatchErrorFeedback({ error: null, stops: STOPS })).toBeNull()
  })
})

describe('resolveAutoDispatchFeedback (RF3 — carregar/ocorrência tentam o gatilho automático)', () => {
  test('ausente (carga ainda não fechou) não produz aviso nenhum', () => {
    expect(resolveAutoDispatchFeedback({ autoDispatch: undefined, stops: STOPS })).toBeNull()
  })

  test('dispatched é o aviso de sucesso', () => {
    expect(
      resolveAutoDispatchFeedback({ autoDispatch: { outcome: 'dispatched' }, stops: STOPS }),
    ).toEqual({ key: 'autoDispatched' })
  })

  test('blocked por parada sem agendamento resolve os rótulos das paradas', () => {
    const feedback = resolveAutoDispatchFeedback({
      autoDispatch: {
        code: 'TRIP_HAS_UNSCHEDULED_STOPS',
        details: { stopIds: ['stop-1'] },
        outcome: 'blocked',
      },
      stops: STOPS,
    })

    expect(feedback).toEqual({
      key: 'hasUnscheduledStops',
      params: { stops: 'Parada 1 — Rua das Flores, 100' },
    })
  })

  test('blocked sem rota não carrega details', () => {
    expect(
      resolveAutoDispatchFeedback({
        autoDispatch: { code: 'TRIP_HAS_NO_ROUTE', outcome: 'blocked' },
        stops: STOPS,
      }),
    ).toEqual({ key: 'hasNoRoute' })
  })
})
