/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  jsonRequest,
  responseApiError,
  responseData,
  tripDetailPath,
  TRIP_DETAIL,
  TRIP_ID,
  TRIPS_PATH,
} from '../fixtures/trip-http-payload.fixture'
import {
  COMPANY_CONTEXT,
  READ_ONLY_PERMISSIONS,
  createTripHttpFixture,
} from '../fixtures/trip-http.fixture'

describe('GET /trips/:id', () => {
  test('answers the trip with its documents (fiscal status included) and drivers', async () => {
    const fixture = await createTripHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual(TRIP_DETAIL)
    expect(fixture.getTripCalls).toEqual([
      {
        context: { ...COMPANY_CONTEXT, permissions: READ_ONLY_PERMISSIONS },
        tripId: TRIP_ID,
      },
    ])
  })

  test('refuses an identifier that is not a trip id', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${TRIPS_PATH}/not-a-uuid` }),
    )

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('NOT_FOUND')
    expect(fixture.getTripCalls).toEqual([])
  })

  test('answers 404 when the trip is not in this company', async () => {
    const fixture = await createTripHttpFixture({
      getTripError: new ApiError({
        code: 'TRIP_NOT_FOUND',
        message: 'Trip not found.',
        status: 404,
      }),
    })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('TRIP_NOT_FOUND')
  })

  test('denies who has neither fleet.read nor fleet.manage', async () => {
    const fixture = await createTripHttpFixture({ permissions: new Set([]) })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: tripDetailPath() }))

    expect(response.status).toBe(403)
    expect(fixture.getTripCalls).toEqual([])
  })
})
