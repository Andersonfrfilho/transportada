/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  TripCloseReasonRequiredError,
  TripClosedError,
  TripNotFoundError,
} from '../../src/trips/domain/trip.error.js'
import {
  CORRELATION_ID,
  jsonRequest,
  responseApiError,
  responseData,
  TRIP_ID,
  tripClosePath,
} from '../fixtures/trip-http-payload.fixture'
import { COMPANY_CONTEXT, createTripHttpFixture } from '../fixtures/trip-http.fixture'

describe('trip close http contract', () => {
  test('closes an open trip', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'POST', path: tripClosePath() }))

    expect(response.status).toBe(200)
    expect(await responseData(response)).toMatchObject({ status: 'completed' })
    expect(fixture.closeTripCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        ipAddress: 'unknown',
        reason: null,
        tripId: TRIP_ID,
      },
    ])
  })

  // Spec 156 T8c (ADR-0067): sem nota em aberto na leitura da fixture, o motivo continua opcional.
  test('closes an open trip with an explicit reason', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { reason: 'Canhotos recebidos no escritório' },
        method: 'POST',
        path: tripClosePath(),
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.closeTripCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: CORRELATION_ID,
        ipAddress: 'unknown',
        reason: 'Canhotos recebidos no escritório',
        tripId: TRIP_ID,
      },
    ])
  })

  test('propagates the not-found refusal when the trip does not belong to the company', async () => {
    const fixture = await createTripHttpFixture({ closeTripError: new TripNotFoundError() })

    const response = await fixture.handle(jsonRequest({ method: 'POST', path: tripClosePath() }))

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('TRIP_NOT_FOUND')
  })

  // ADR-0023: encerrar é terminal — repetir o encerramento propaga o mesmo erro de domínio
  test('propagates the terminal-state refusal when the trip is already closed', async () => {
    const fixture = await createTripHttpFixture({ closeTripError: new TripClosedError() })

    const response = await fixture.handle(jsonRequest({ method: 'POST', path: tripClosePath() }))

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe('TRIP_CLOSED')
  })

  // spec 156 T8c: nota em aberto sem motivo propaga o 422 de domínio até a resposta HTTP.
  test('propagates the reason-required refusal when the trip has an open document', async () => {
    const fixture = await createTripHttpFixture({
      closeTripError: new TripCloseReasonRequiredError(),
    })

    const response = await fixture.handle(jsonRequest({ method: 'POST', path: tripClosePath() }))

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe('TRIP_CLOSE_REASON_REQUIRED')
  })

  test('never matches a non-uuid trip id', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: tripClosePath('not-a-uuid') }),
    )

    expect(response.status).toBe(404)
    expect(fixture.closeTripCalls).toEqual([])
  })
})
