/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  resolveAutoDispatchFeedback,
  resolveDispatchBlockedFeedback,
  resolveDispatchConfirmMessage,
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

  test('TRIP_AUTO_DISPATCH_FAILED vira frase própria, sem stopIds', () => {
    expect(
      resolveDispatchBlockedFeedback({ code: 'TRIP_AUTO_DISPATCH_FAILED', stops: STOPS }),
    ).toEqual({ key: 'autoDispatchFailed' })
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

  /**
   * Spec 185 revisão (achado 2): o botão manda `loadRemaining: true` sempre — a única forma deste
   * código chegar por ele é a viagem ficar vazia depois de liberar as deixadas para trás. O genérico
   * "Há notas ainda não carregadas" mentiria, então ganha frase própria aqui.
   */
  test('TRIP_HAS_UNLOADED_DOCUMENTS vira "nenhuma nota vai na viagem", nunca o genérico', () => {
    expect(
      resolveDispatchErrorFeedback({
        error: requestError('TRIP_HAS_UNLOADED_DOCUMENTS'),
        stops: STOPS,
      }),
    ).toEqual({ key: 'hasNoCargoToDispatch' })
  })
})

describe('resolveDispatchConfirmMessage (spec 185 revisão, achado 2 — o diálogo "Despachar")', () => {
  test('nada a carregar e nada deixado para trás: confirmação simples', () => {
    expect(
      resolveDispatchConfirmMessage({ isCargoClosed: true, leftBehindCount: 0, toLoadCount: 0 }),
    ).toEqual({ key: 'stateActions.dispatchConfirmSimple' })
  })

  test('só notas a carregar: uma chave, com a contagem', () => {
    expect(
      resolveDispatchConfirmMessage({ isCargoClosed: false, leftBehindCount: 0, toLoadCount: 2 }),
    ).toEqual({ key: 'stateActions.dispatchConfirmLoadRemaining', params: { count: 2 } })
  })

  test('notas a carregar e nota deixada para trás: uma chave só, nunca concatenação', () => {
    expect(
      resolveDispatchConfirmMessage({ isCargoClosed: false, leftBehindCount: 1, toLoadCount: 2 }),
    ).toEqual({
      key: 'stateActions.dispatchConfirmLoadRemainingWithLeftBehind',
      params: { leftBehindCount: 1, loadCount: 2 },
    })
  })

  test('nada a carregar, mas há nota carregada sobrando: só a contagem de deixadas para trás', () => {
    expect(
      resolveDispatchConfirmMessage({ isCargoClosed: true, leftBehindCount: 1, toLoadCount: 0 }),
    ).toEqual({ key: 'stateActions.dispatchConfirmLeftBehindOnly', params: { count: 1 } })
  })

  test('nada a carregar e nenhuma nota carregada: nenhuma nota vai, frase própria', () => {
    expect(
      resolveDispatchConfirmMessage({ isCargoClosed: false, leftBehindCount: 3, toLoadCount: 0 }),
    ).toEqual({ key: 'stateActions.dispatchConfirmNothingToCarry' })
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

  /** Achado 2 da revisão da API: código novo, sem `details`, com frase própria. */
  test('blocked por TRIP_AUTO_DISPATCH_FAILED vira "use Despachar"', () => {
    expect(
      resolveAutoDispatchFeedback({
        autoDispatch: { code: 'TRIP_AUTO_DISPATCH_FAILED', outcome: 'blocked' },
        stops: STOPS,
      }),
    ).toEqual({ key: 'autoDispatchFailed' })
  })
})
