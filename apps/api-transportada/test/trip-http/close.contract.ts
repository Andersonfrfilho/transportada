/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { TripClosedError, TripNotFoundError } from '../../src/trips/domain/trip.error.js'
import {
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
    expect(fixture.closeTripCalls).toEqual([{ context: COMPANY_CONTEXT, tripId: TRIP_ID }])
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

  test('never matches a non-uuid trip id', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'POST', path: tripClosePath('not-a-uuid') }),
    )

    expect(response.status).toBe(404)
    expect(fixture.closeTripCalls).toEqual([])
  })
})
