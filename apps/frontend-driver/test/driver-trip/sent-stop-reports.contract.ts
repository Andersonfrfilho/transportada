/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { isStopArrivalRecorded } from '@/modules/driver-trip/shared/documentActivity.service'
import type { DriverTripStop } from '@/modules/driver-trip/shared/driverTrip.types'
import { resolveEnRouteStopId } from '@/modules/driver-trip/shared/enRouteStop.service'
import type { TappedStopReport } from '@/modules/driver-trip/shared/documentActivity.service'

const NOW = '2026-09-30T09:00:00.000Z'
const STOP_ID = 'stop-1'

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
    id: STOP_ID,
    label: 'Parada 1',
    latitude: null,
    longitude: null,
    schedule: null,
    sequence: 1,
    ...overrides,
  }
}

function tapped(overrides: Partial<TappedStopReport> = {}): TappedStopReport {
  return {
    idempotencyKey: 'key-1',
    kind: 'arrive',
    queuedAt: NOW,
    stopId: STOP_ID,
    ...overrides,
  }
}

/**
 * O botão piscava a cada toque: a drenagem apaga o item da fila antes de o GET trazer o snapshot
 * novo, e a tela regredia ao estado velho. `sentReportKeys` é a mesma rede que segura as linhas de
 * status — agora também segura os botões.
 */
describe('o botão não regride entre a fila esvaziar e o snapshot chegar', () => {
  it('chegada enviada e fora da fila continua registrada', () => {
    expect(
      isStopArrivalRecorded({
        arrivedAt: null,
        queueView: [],
        sentReportKeys: new Set(['key-1']),
        stopId: STOP_ID,
        tappedReports: [tapped()],
      }),
    ).toBe(true)
  })

  it('chegada de outra parada, mesmo enviada, não libera esta', () => {
    expect(
      isStopArrivalRecorded({
        arrivedAt: null,
        queueView: [],
        sentReportKeys: new Set(['key-1']),
        stopId: STOP_ID,
        tappedReports: [tapped({ stopId: 'stop-9' })],
      }),
    ).toBe(false)
  })

  it('toque que o servidor ainda não aceitou não conta pela rede', () => {
    expect(
      isStopArrivalRecorded({
        arrivedAt: null,
        queueView: [],
        sentReportKeys: new Set(),
        stopId: STOP_ID,
        tappedReports: [tapped()],
      }),
    ).toBe(false)
  })

  it('"Iniciar rota" enviado e fora da fila continua a caminho', () => {
    expect(
      resolveEnRouteStopId({
        queueView: [],
        sentReportKeys: new Set(['key-1']),
        stops: [stop()],
        tappedReports: [tapped({ kind: 'depart' })],
      }),
    ).toBe(STOP_ID)
  })

  it('"Cheguei" enviado e fora da fila continua zerando o a caminho do snapshot velho', () => {
    expect(
      resolveEnRouteStopId({
        queueView: [],
        sentReportKeys: new Set(['key-2']),
        stops: [stop({ enRouteSince: NOW })],
        tappedReports: [
          tapped({ idempotencyKey: 'key-2', kind: 'arrive', queuedAt: '2026-09-30T09:05:00.000Z' }),
        ],
      }),
    ).toBeUndefined()
  })

  it('o toque ainda na fila não é contado duas vezes', () => {
    expect(
      resolveEnRouteStopId({
        queueView: [
          {
            attachmentCount: 0,
            idempotencyKey: 'key-1',
            kind: 'depart',
            queuedAt: NOW,
            status: { state: 'queued' },
            stopId: STOP_ID,
          },
        ],
        sentReportKeys: new Set(['key-1']),
        stops: [stop()],
        tappedReports: [tapped({ kind: 'depart' })],
      }),
    ).toBe(STOP_ID)
  })

  it('última nota entregue, enviada e fora da fila, zera o a caminho', () => {
    expect(
      resolveEnRouteStopId({
        queueView: [],
        sentReportKeys: new Set(['key-3']),
        stops: [
          stop({
            documents: [
              {
                id: 'doc-1',
                separationStatus: 'pending',
              } as DriverTripStop['documents'][number],
            ],
            enRouteSince: NOW,
          }),
        ],
        tappedReports: [tapped({ documentId: 'doc-1', idempotencyKey: 'key-3', kind: 'deliver' })],
      }),
    ).toBeUndefined()
  })
})
