/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF27: o 409 de fora de ordem leva `outOfOrder` ao lado de `error`, e a rota aceita a confirmação.
 */
import { describe, expect, test } from 'bun:test'

import { createErrorResponse } from '../../src/http/response.service.js'
import { TripStopOutOfOrderError } from '../../src/trips/domain/stop-order.error.js'
import {
  parseDepartureRequest,
  parseDocumentDeliveryRequest,
  parseDocumentReturnRequest,
  parseStopArrivalRequest,
} from '../../src/trips/presentation/me-trip.schema.js'

const VIOLATION = {
  currentSequence: 3,
  currentStopId: 'stop-3',
  nextSequence: 3,
  nextStopId: 'stop-3',
  requestedSequence: 5,
  requestedStopId: 'stop-5',
} as const

const SILENT_LOGGER = { error: () => undefined, info: () => undefined, warn: () => undefined }

function jsonRequest(body: unknown): Request {
  return new Request('http://localhost/x', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  })
}

describe('o 409 de fora de ordem (spec 294 RF27)', () => {
  test('o corpo leva o código e o outOfOrder', async () => {
    const response = createErrorResponse({
      correlationId: 'c-1',
      error: new TripStopOutOfOrderError(VIOLATION),
      logger: SILENT_LOGGER,
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      error: {
        code: 'TRIP_STOP_OUT_OF_ORDER',
        correlationId: 'c-1',
        message: expect.any(String),
      },
      outOfOrder: VIOLATION,
    })
  })

  test('as rotas da tripulação aceitam confirmOutOfOrder e sem ele não o inventam', async () => {
    const departure = { confirmOutOfOrder: true, tappedAt: '2026-11-05T12:00:00.000Z' }
    expect((await parseDepartureRequest(jsonRequest(departure))).confirmOutOfOrder).toBe(true)
    expect(
      'confirmOutOfOrder' in
        (await parseDepartureRequest(jsonRequest({ tappedAt: departure.tappedAt }))),
    ).toBe(false)
    expect(
      (await parseStopArrivalRequest(jsonRequest({ confirmOutOfOrder: true }))).confirmOutOfOrder,
    ).toBe(true)
    expect(await parseStopArrivalRequest(jsonRequest({}))).toEqual({ location: null })
    expect(
      (await parseDocumentDeliveryRequest(jsonRequest({ confirmOutOfOrder: true })))
        .confirmOutOfOrder,
    ).toBe(true)
    expect(
      (
        await parseDocumentReturnRequest(
          jsonRequest({ confirmOutOfOrder: true, reason: 'recipient_absent' }),
        )
      ).confirmOutOfOrder,
    ).toBe(true)
  })
})
