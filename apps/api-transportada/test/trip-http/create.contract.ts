/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { TripVehicleNotAvailableError } from '../../src/trips/domain/trip.error.js'
import {
  CREATE_TRIP_BODY,
  DRIVER_ID,
  jsonRequest,
  responseApiError,
  responseData,
  SECOND_DRIVER_ID,
  TRIPS_PATH,
  VEHICLE_ID,
} from '../fixtures/trip-http-payload.fixture'
import { COMPANY_CONTEXT, createTripHttpFixture } from '../fixtures/trip-http.fixture'

describe('trip create http contract', () => {
  test('creates a trip with the driver crew and takes the company from the token', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: CREATE_TRIP_BODY, method: 'POST', path: TRIPS_PATH }),
    )

    expect(response.status).toBe(201)
    expect(await responseData(response)).toMatchObject({ status: 'draft', vehicleId: VEHICLE_ID })
    expect(fixture.createTripCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        driverIds: [DRIVER_ID, SECOND_DRIVER_ID],
        vehicleId: VEHICLE_ID,
      },
    ])
  })

  // spec.md linha 66: mínimo 1 condutor — a fronteira HTTP recusa antes de chegar ao domínio
  test('refuses an empty crew and any unknown field', async () => {
    const emptyCrewFixture = await createTripHttpFixture()
    const emptyCrewResponse = await emptyCrewFixture.handle(
      jsonRequest({
        body: { ...CREATE_TRIP_BODY, driverIds: [] },
        method: 'POST',
        path: TRIPS_PATH,
      }),
    )

    expect(emptyCrewResponse.status).toBe(400)
    expect((await responseApiError(emptyCrewResponse)).code).toBe('INVALID_REQUEST')
    expect(emptyCrewFixture.createTripCalls).toEqual([])

    const smuggledFixture = await createTripHttpFixture()
    const smuggledResponse = await smuggledFixture.handle(
      jsonRequest({
        body: { ...CREATE_TRIP_BODY, companyId: '00000000-0000-4000-8000-0000000009ff' },
        method: 'POST',
        path: TRIPS_PATH,
      }),
    )

    expect(smuggledResponse.status).toBe(400)
    expect(smuggledFixture.createTripCalls).toEqual([])
  })

  test('refuses a crew over the maximum of ten drivers', async () => {
    const fixture = await createTripHttpFixture()
    const driverIds = Array.from({ length: 11 }, () => crypto.randomUUID())

    const response = await fixture.handle(
      jsonRequest({ body: { ...CREATE_TRIP_BODY, driverIds }, method: 'POST', path: TRIPS_PATH }),
    )

    expect(response.status).toBe(400)
    expect(fixture.createTripCalls).toEqual([])
  })

  test('propagates a domain refusal for an unavailable vehicle', async () => {
    const fixture = await createTripHttpFixture({
      createTripError: new TripVehicleNotAvailableError(),
    })

    const response = await fixture.handle(
      jsonRequest({ body: CREATE_TRIP_BODY, method: 'POST', path: TRIPS_PATH }),
    )

    expect(response.status).toBe(422)
    expect((await responseApiError(response)).code).toBe('TRIP_VEHICLE_NOT_AVAILABLE')
  })
})
