/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  createDriverTripClient,
  reportBody,
  reportPath,
  toAttachmentSendOutcome,
} from '../../src/modules/driver-trip/shared/driverTripClient.service'
import {
  enqueueReport,
  type OfflineQueueStore,
} from '../../src/modules/driver-trip/shared/offlineQueue.service'

const TAPPED_AT = '2026-09-26T09:12:00.000Z'

function createStore(): OfflineQueueStore {
  let items: Awaited<ReturnType<OfflineQueueStore['read']>> = []
  return {
    read: () => Promise.resolve(items),
    update: (mutate) => {
      items = mutate(items)
      return Promise.resolve(items)
    },
  }
}

/**
 * Spec 206 D2/D18/D3 (ADR-0088 §4): `depart` e `cancel-departure` reusam o mesmo corpo e o mesmo
 * parser (`me-trip.schema.ts`) — `{ tappedAt, location }`, `.strict()`. Divergir aqui é a chave
 * extra que a API recusa com `400`.
 */
describe('o corpo e o caminho de depart/cancel-departure (spec 206)', () => {
  it('depart manda { location, tappedAt } — o mesmo corpo que a API espera', () => {
    const body = reportBody({
      idempotencyKey: 'key-1',
      kind: 'depart',
      location: null,
      stopId: 'stop-1',
      tappedAt: TAPPED_AT,
    })

    expect(JSON.parse(body)).toEqual({ location: null, tappedAt: TAPPED_AT })
  })

  it('cancelDeparture manda o mesmo corpo — { location, tappedAt }', () => {
    const body = reportBody({
      idempotencyKey: 'key-1',
      kind: 'cancelDeparture',
      location: null,
      stopId: 'stop-1',
      tappedAt: TAPPED_AT,
    })

    expect(JSON.parse(body)).toEqual({ location: null, tappedAt: TAPPED_AT })
  })

  it('depart vai para .../stops/:stopId/depart', () => {
    expect(
      reportPath({
        idempotencyKey: 'key-1',
        kind: 'depart',
        location: null,
        stopId: 'stop-9',
        tappedAt: TAPPED_AT,
      }),
    ).toBe('/me/trips/current/stops/stop-9/depart')
  })

  it('cancelDeparture vai para .../stops/:stopId/cancel-departure', () => {
    expect(
      reportPath({
        idempotencyKey: 'key-1',
        kind: 'cancelDeparture',
        location: null,
        stopId: 'stop-9',
        tappedAt: TAPPED_AT,
      }),
    ).toBe('/me/trips/current/stops/stop-9/cancel-departure')
  })

  /**
   * Spec 206 D3: o toque entra na fila com a própria hora — nunca uma recapturada no envio. O item
   * enfileirado carrega o relato tal como o toque o construiu, `tappedAt` incluído; não é o
   * `createdAt` da fila (interno, para ordenar) que decide a ordem que o servidor vê — é este campo.
   */
  it('o item enfileirado carrega o tappedAt do toque, sem recalculá-lo', async () => {
    const store = createStore()
    const result = await enqueueReport({
      now: new Date('2026-09-26T09:12:00.050Z'),
      report: {
        idempotencyKey: 'key-1',
        kind: 'depart',
        location: null,
        stopId: 'stop-1',
        tappedAt: TAPPED_AT,
      },
      store,
    })

    expect(result.accepted).toBe(true)
    const queued = await store.read()
    expect(queued[0]?.report).toMatchObject({ kind: 'depart', tappedAt: TAPPED_AT })
  })
})

/**
 * Spec 206 D9: o `409 TRIP_HAS_STOP_EN_ROUTE` manda `error.details: [{field, message}]`, nunca um
 * objeto solto (`shared/api.error.ts` da API). É o único jeito de a fila nomear a parada certa
 * quando a tela não viu o bloqueio (outro aparelho, item enfileirado antes do snapshot) — o
 * cálculo local (`resolveEnRouteStopId`) não sabe do que aconteceu fora deste aparelho.
 */
describe('o 409 TRIP_HAS_STOP_EN_ROUTE carrega error.details (spec 206 D9)', () => {
  function createRejectingClient() {
    return createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: 'TRIP_HAS_STOP_EN_ROUTE',
                correlationId: 'corr-1',
                details: [
                  { field: 'enRouteStopId', message: 'stop-1' },
                  { field: 'enRouteStopSequence', message: '1' },
                ],
                message: 'Another stop of this trip is already en route.',
              },
            }),
            { headers: { 'content-type': 'application/json' }, status: 409 },
          ),
        ),
      getAccessToken: () => Promise.resolve('token'),
    })
  }

  it('o cliente lança com `details` populado a partir do array field/message', async () => {
    const client = createRejectingClient()

    let caught: unknown
    try {
      await client.send({
        idempotencyKey: 'key-1',
        kind: 'depart',
        location: null,
        stopId: 'stop-2',
        tappedAt: TAPPED_AT,
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({
      code: 'TRIP_HAS_STOP_EN_ROUTE',
      details: [
        { field: 'enRouteStopId', message: 'stop-1' },
        { field: 'enRouteStopSequence', message: '1' },
      ],
      status: 409,
    })
  })

  it('toAttachmentSendOutcome repassa `details` no outcome rejeitado', async () => {
    const client = createRejectingClient()
    let caught: unknown
    try {
      await client.send({
        idempotencyKey: 'key-1',
        kind: 'depart',
        location: null,
        stopId: 'stop-2',
        tappedAt: TAPPED_AT,
      })
    } catch (error) {
      caught = error
    }

    expect(toAttachmentSendOutcome(caught)).toEqual({
      cause: '409 TRIP_HAS_STOP_EN_ROUTE',
      details: [
        { field: 'enRouteStopId', message: 'stop-1' },
        { field: 'enRouteStopSequence', message: '1' },
      ],
      kind: 'rejected',
    })
  })

  it('sem `error.details` (recusa comum), `details` fica ausente', async () => {
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify({ error: { code: 'TRIP_STOP_NOT_REACHABLE' } }), {
            headers: { 'content-type': 'application/json' },
            status: 404,
          }),
        ),
      getAccessToken: () => Promise.resolve('token'),
    })

    let caught: unknown
    try {
      await client.send({
        idempotencyKey: 'key-1',
        kind: 'depart',
        location: null,
        stopId: 'stop-2',
        tappedAt: TAPPED_AT,
      })
    } catch (error) {
      caught = error
    }

    expect(toAttachmentSendOutcome(caught)).toEqual({
      cause: '404 TRIP_STOP_NOT_REACHABLE',
      kind: 'rejected',
    })
  })
})
