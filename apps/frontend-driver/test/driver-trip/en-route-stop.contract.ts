/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type { DriverTripStop } from '@/modules/driver-trip/shared/driverTrip.types'
import {
  canReportArrival,
  canStartRouteAtStop,
  resolveEnRouteStopId,
} from '@/modules/driver-trip/shared/enRouteStop.service'
import type { EventQueueItemView } from '@/modules/driver-trip/shared/eventQueueView.service'

const NOW = '2026-09-26T09:00:00.000Z'

function stop(overrides: Partial<DriverTripStop> = {}): DriverTripStop {
  return {
    arrivedAt: null,
    completedAt: null,
    deliveryProof: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [],
    enRouteSince: null,
    enRouteTappedAt: null,
    id: 'stop-1',
    label: 'Parada 1',
    latitude: null,
    longitude: null,
    schedule: null,
    sequence: 1,
    ...overrides,
  }
}

function queueItem(overrides: Partial<EventQueueItemView> = {}): EventQueueItemView {
  return {
    attachmentCount: 0,
    idempotencyKey: 'key-1',
    kind: 'depart',
    queuedAt: NOW,
    status: { state: 'queued' },
    ...overrides,
  }
}

/**
 * Pedido do usuário (26/09, spec 206): "o botão de iniciar rota deveria ficar dentro de cada item
 * da rota e se houver uma nao pode iniciar a outra". Só uma parada a caminho por vez.
 */
describe('qual parada está a caminho (spec 206 D9)', () => {
  it('nenhuma parada a caminho, sem nada na fila: indefinido', () => {
    expect(resolveEnRouteStopId({ queueView: [], stops: [stop()] })).toBeUndefined()
  })

  it('o snapshot já traz uma parada com enRouteSince', () => {
    expect(
      resolveEnRouteStopId({
        queueView: [],
        stops: [stop({ enRouteSince: NOW, id: 'stop-1' }), stop({ id: 'stop-2', sequence: 2 })],
      }),
    ).toBe('stop-1')
  })

  it('"Iniciar rota" na fila marca a parada na hora, sem esperar o servidor', () => {
    expect(
      resolveEnRouteStopId({
        queueView: [queueItem({ kind: 'depart', stopId: 'stop-2' })],
        stops: [stop({ id: 'stop-1' }), stop({ id: 'stop-2', sequence: 2 })],
      }),
    ).toBe('stop-2')
  })

  it('um "depart" recusado pelo servidor não marca ninguém', () => {
    expect(
      resolveEnRouteStopId({
        queueView: [
          queueItem({
            kind: 'depart',
            status: { cause: '409 TRIP_HAS_STOP_EN_ROUTE', state: 'rejected' },
            stopId: 'stop-2',
          }),
        ],
        stops: [stop({ id: 'stop-1' })],
      }),
    ).toBeUndefined()
  })

  it('"Cheguei" de qualquer parada zera o "a caminho" (D7)', () => {
    expect(
      resolveEnRouteStopId({
        queueView: [
          queueItem({ kind: 'depart', queuedAt: '2026-09-26T09:00:00.000Z', stopId: 'stop-1' }),
          queueItem({
            idempotencyKey: 'key-2',
            kind: 'arrive',
            queuedAt: '2026-09-26T09:05:00.000Z',
            stopId: 'stop-1',
          }),
        ],
        stops: [stop({ id: 'stop-1' })],
      }),
    ).toBeUndefined()
  })

  it('"Cancelar rota" da parada a caminho zera na hora (D18)', () => {
    expect(
      resolveEnRouteStopId({
        queueView: [
          queueItem({ kind: 'depart', queuedAt: '2026-09-26T09:00:00.000Z', stopId: 'stop-1' }),
          queueItem({
            idempotencyKey: 'key-2',
            kind: 'cancelDeparture',
            queuedAt: '2026-09-26T09:05:00.000Z',
            stopId: 'stop-1',
          }),
        ],
        stops: [stop({ id: 'stop-1' })],
      }),
    ).toBeUndefined()
  })

  it('cancelar OUTRA parada não mexe na que está a caminho', () => {
    expect(
      resolveEnRouteStopId({
        queueView: [
          queueItem({ kind: 'depart', queuedAt: '2026-09-26T09:00:00.000Z', stopId: 'stop-1' }),
          queueItem({
            idempotencyKey: 'key-2',
            kind: 'cancelDeparture',
            queuedAt: '2026-09-26T09:05:00.000Z',
            stopId: 'stop-2',
          }),
        ],
        stops: [stop({ id: 'stop-1' })],
      }),
    ).toBe('stop-1')
  })

  it('"Registrar entrega depois" (205) cobrindo TODAS as notas pendentes zera sem sinal (D9)', () => {
    const stopWithDocuments = stop({
      documents: [
        { id: 'doc-1', separationStatus: 'loaded' } as DriverTripStop['documents'][number],
      ],
      enRouteSince: NOW,
      id: 'stop-1',
    })
    expect(
      resolveEnRouteStopId({
        queueView: [
          queueItem({
            documentId: 'doc-1',
            idempotencyKey: 'key-2',
            kind: 'deliver',
            queuedAt: '2026-09-26T09:05:00.000Z',
          }),
        ],
        stops: [stopWithDocuments],
      }),
    ).toBeUndefined()
  })

  it('cobertura PARCIAL das notas pendentes não zera — a tela liberaria e o servidor recusaria', () => {
    const stopWithDocuments = stop({
      documents: [
        { id: 'doc-1', separationStatus: 'loaded' } as DriverTripStop['documents'][number],
        { id: 'doc-2', separationStatus: 'loaded' } as DriverTripStop['documents'][number],
      ],
      enRouteSince: NOW,
      id: 'stop-1',
    })
    expect(
      resolveEnRouteStopId({
        queueView: [
          queueItem({
            documentId: 'doc-1',
            idempotencyKey: 'key-2',
            kind: 'deliver',
            queuedAt: '2026-09-26T09:05:00.000Z',
          }),
        ],
        stops: [stopWithDocuments],
      }),
    ).toBe('stop-1')
  })
})

describe('bloqueio do "Iniciar rota" — devolve o motivo, nunca um booleano (D6/D9)', () => {
  it('sem ninguém a caminho, libera', () => {
    expect(canStartRouteAtStop({ enRouteStopId: undefined, stopId: 'stop-1' })).toEqual({
      enabled: true,
    })
  })

  it('a própria parada a caminho continua liberada — é ela que mostra "Cheguei"', () => {
    expect(canStartRouteAtStop({ enRouteStopId: 'stop-1', stopId: 'stop-1' })).toEqual({
      enabled: true,
    })
  })

  it('outra parada a caminho: bloqueada, com o id de quem bloqueia', () => {
    expect(canStartRouteAtStop({ enRouteStopId: 'stop-1', stopId: 'stop-2' })).toEqual({
      blockingStopId: 'stop-1',
      enabled: false,
      reason: 'other_stop_en_route',
    })
  })
})

describe('"Cheguei" só na parada a caminho, ou em qualquer uma na API antiga (D6/D17)', () => {
  it('chegada já registrada sempre conta, mesmo se outra ficou a caminho depois', () => {
    expect(
      canReportArrival({
        enRouteStopId: 'stop-2',
        isLegacyEnRouteTracking: false,
        stop: stop({ arrivedAt: NOW, id: 'stop-1' }),
      }),
    ).toBe(true)
  })

  it('API antiga: qualquer parada mostra "Cheguei", como antes da 206', () => {
    expect(
      canReportArrival({
        enRouteStopId: undefined,
        isLegacyEnRouteTracking: true,
        stop: stop({ id: 'stop-1' }),
      }),
    ).toBe(true)
  })

  it('API nova: só a parada a caminho', () => {
    expect(
      canReportArrival({
        enRouteStopId: 'stop-1',
        isLegacyEnRouteTracking: false,
        stop: stop({ id: 'stop-1' }),
      }),
    ).toBe(true)
    expect(
      canReportArrival({
        enRouteStopId: 'stop-1',
        isLegacyEnRouteTracking: false,
        stop: stop({ id: 'stop-2' }),
      }),
    ).toBe(false)
  })

  it('API nova, ninguém a caminho ainda: nenhuma parada mostra "Cheguei"', () => {
    expect(
      canReportArrival({
        enRouteStopId: undefined,
        isLegacyEnRouteTracking: false,
        stop: stop({ id: 'stop-1' }),
      }),
    ).toBe(false)
  })
})
