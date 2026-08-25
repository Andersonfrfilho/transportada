/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  jsonRequest,
  responseApiError,
  responseData,
  tripCancelPath,
  tripDispatchPath,
  tripDocumentLoadPath,
  tripDocumentReturnPath,
  tripDocumentSeparatePath,
  tripDocumentsBatchStatusPath,
  tripPlanRoutePath,
  tripStopsOrderPath,
  tripStopsPath,
  TRIP_DOCUMENT_ID,
  TRIP_ID,
} from '../fixtures/trip-http-payload.fixture'
import {
  createTripHttpFixture,
  FLEET_ONLY_PERMISSIONS,
  NO_PERMISSIONS,
} from '../fixtures/trip-http.fixture'

/**
 * ADR-0043 §1, §2: as rotas de estado da spec 056 RF-6, testadas na fronteira HTTP — o encanamento
 * que liga a máquina pura (T006) aos use cases (T007–T010) já foi testado sozinho; este arquivo
 * cobre parsing de corpo, resolução de path parameter e a permissão de cada rota.
 */
describe('trip state routes (spec 056 T012)', () => {
  test('separates a document with an optional body, and forwards the note', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { note: 'conferido no portão' },
        method: 'POST',
        path: tripDocumentSeparatePath(),
      }),
    )

    expect(response.status).toBe(200)
    const data = await responseData(response)
    expect(data).toMatchObject({ tripStatus: 'separating' })
    expect(fixture.separateTripDocumentCalls[0]).toMatchObject({
      documentId: TRIP_DOCUMENT_ID,
      note: 'conferido no portão',
    })
  })

  test('separates a document with no body at all', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: tripDocumentSeparatePath() }),
    )

    expect(response.status).toBe(200)
    expect(fixture.separateTripDocumentCalls[0]).toMatchObject({ note: null })
  })

  test('loads a document', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: tripDocumentLoadPath() }),
    )

    expect(response.status).toBe(200)
    expect(fixture.loadTripDocumentCalls).toHaveLength(1)
  })

  test('returns a document, forwarding the reason', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { returnReason: 'Destinatário ausente' },
        method: 'POST',
        path: tripDocumentReturnPath(),
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.returnTripDocumentCalls[0]).toMatchObject({
      returnReason: 'Destinatário ausente',
    })
  })

  test('transitions a batch of documents in one call', async () => {
    const fixture = await createTripHttpFixture()
    const documentIds = [TRIP_DOCUMENT_ID, '00000000-0000-4000-8000-000000000a20']

    const response = await fixture.handle(
      jsonRequest({
        body: { action: 'separate', documentIds },
        method: 'POST',
        path: tripDocumentsBatchStatusPath(),
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.batchStatusCalls).toEqual([
      expect.objectContaining({ action: 'separate', documentIds, note: null, returnReason: null }),
    ])
  })

  test('refuses an empty batch', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { action: 'separate', documentIds: [] },
        method: 'POST',
        path: tripDocumentsBatchStatusPath(),
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.batchStatusCalls).toHaveLength(0)
  })

  test('plans the route with no body', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: tripPlanRoutePath() }),
    )

    expect(response.status).toBe(200)
    const data = await responseData(response)
    expect(data).toEqual({ tripStatus: 'route_planned' })
  })

  test('dispatches without force by default', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: tripDispatchPath() }),
    )

    expect(response.status).toBe(200)
    expect(fixture.dispatchTripCalls[0]).toMatchObject({ force: false, forceReason: null })
  })

  test('dispatches forced, with a reason', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { force: true, forceReason: 'Cliente pediu para não esperar' },
        method: 'POST',
        path: tripDispatchPath(),
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.dispatchTripCalls[0]).toMatchObject({
      force: true,
      forceReason: 'Cliente pediu para não esperar',
    })
  })

  test('cancels the trip', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'POST', path: tripCancelPath() }))

    expect(response.status).toBe(200)
    expect(fixture.cancelTripCalls).toHaveLength(1)
  })

  test('lists the stops of a trip', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripStopsPath() }))

    expect(response.status).toBe(200)
    expect(fixture.listStopsCalls).toHaveLength(1)
  })

  test('reorders the stops of a trip', async () => {
    const fixture = await createTripHttpFixture()
    const stopIds = [
      '00000000-0000-4000-8000-000000000b02',
      '00000000-0000-4000-8000-000000000b01',
    ]

    const response = await fixture.handle(
      jsonRequest({ body: { stopIds }, method: 'PATCH', path: tripStopsOrderPath() }),
    )

    expect(response.status).toBe(200)
    const data = await responseData(response)
    expect(data).toEqual({ tripStatus: 'route_planned' })
    expect(fixture.reorderStopsCalls[0]).toMatchObject({ stopIds, tripId: TRIP_ID })
  })

  test('refuses an empty stop order', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: { stopIds: [] }, method: 'PATCH', path: tripStopsOrderPath() }),
    )

    expect(response.status).toBe(400)
    expect(fixture.reorderStopsCalls).toHaveLength(0)
  })

  test('surfaces the domain error code and status when a transition is refused', async () => {
    const { TripStateTransitionNotAllowedError } = await import(
      '../../src/trips/domain/trip.error.js'
    )
    const fixture = await createTripHttpFixture({
      separateTripDocumentError: new TripStateTransitionNotAllowedError(
        'TRIP_ROUTE_NOT_PLANNED',
      ),
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: tripDocumentSeparatePath() }),
    )

    expect(response.status).toBe(409)
    const error = await responseApiError(response)
    expect(error.code).toBe('STATE_TRANSITION_NOT_ALLOWED')
  })

  test('every state route requires trip.manage, and GET stops requires fleet.read', async () => {
    const fixture = await createTripHttpFixture({ permissions: NO_PERMISSIONS })

    const responses = await Promise.all([
      fixture.handle(jsonRequest({ method: 'POST', path: tripDocumentSeparatePath() })),
      fixture.handle(jsonRequest({ method: 'POST', path: tripDocumentLoadPath() })),
      fixture.handle(jsonRequest({ method: 'POST', path: tripDocumentReturnPath() })),
      fixture.handle(
        jsonRequest({
          body: { action: 'separate', documentIds: [TRIP_DOCUMENT_ID] },
          method: 'POST',
          path: tripDocumentsBatchStatusPath(),
        }),
      ),
      fixture.handle(jsonRequest({ method: 'POST', path: tripPlanRoutePath() })),
      fixture.handle(jsonRequest({ method: 'POST', path: tripDispatchPath() })),
      fixture.handle(jsonRequest({ method: 'POST', path: tripCancelPath() })),
      fixture.handle(jsonRequest({ method: 'GET', path: tripStopsPath() })),
      fixture.handle(
        jsonRequest({
          body: { stopIds: [TRIP_DOCUMENT_ID] },
          method: 'PATCH',
          path: tripStopsOrderPath(),
        }),
      ),
    ])

    for (const response of responses) expect(response.status).toBe(403)
    expect(fixture.separateTripDocumentCalls).toHaveLength(0)
    expect(fixture.batchStatusCalls).toHaveLength(0)
    expect(fixture.dispatchTripCalls).toHaveLength(0)
    expect(fixture.reorderStopsCalls).toHaveLength(0)
  })

  // `fleet.manage` sozinho não é `trip.manage` (spec 055 D5) — o separador continua com o poder
  // certo, e quem cadastra frota não ganha o de mexer no estado da viagem de graça.
  test('refuses every state route to fleet.manage alone', async () => {
    const fixture = await createTripHttpFixture({ permissions: FLEET_ONLY_PERMISSIONS })

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: tripDocumentSeparatePath() }),
    )

    expect(response.status).toBe(403)
  })
})
