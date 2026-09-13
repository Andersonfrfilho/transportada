/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  jsonRequest,
  responseApiError,
  responseData,
  TRIP_ID,
  TRIPS_PATH,
} from '../fixtures/trip-http-payload.fixture'
import { createTripHttpFixture, READ_ONLY_PERMISSIONS } from '../fixtures/trip-http.fixture'
import {
  TripTrailerInUseError,
  TripTrailerNotATrailerError,
  TripTrailerRequiresTractorError,
} from '../../src/trips/domain/trip.error'

const PATH = `${TRIPS_PATH}/${TRIP_ID}/trailer`
const TRAILER_ID = '00000000-0000-4000-8000-000000000a99'

describe('a carreta da viagem, pela rota', () => {
  test('atrela a carreta e devolve o detalhe atualizado', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: { trailerVehicleId: TRAILER_ID }, method: 'PUT', path: PATH }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toMatchObject({
      trailer: { id: TRAILER_ID },
    })
    expect(fixture.setTripTrailerCalls).toEqual([
      expect.objectContaining({ trailerVehicleId: TRAILER_ID, tripId: TRIP_ID }),
    ])
  })

  test('aceita null para desatrelar', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: { trailerVehicleId: null }, method: 'PUT', path: PATH }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toMatchObject({ trailer: null })
  })

  test('recusa o corpo sem o campo', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(jsonRequest({ body: {}, method: 'PUT', path: PATH }))

    expect(response.status).toBe(400)
    expect(fixture.setTripTrailerCalls).toEqual([])
  })

  test('propaga o 400 de cavalo que não traciona', async () => {
    const fixture = await createTripHttpFixture({
      setTripTrailerError: new TripTrailerRequiresTractorError(),
    })

    const response = await fixture.handle(
      jsonRequest({ body: { trailerVehicleId: TRAILER_ID }, method: 'PUT', path: PATH }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('TRIP_TRAILER_REQUIRES_TRACTOR')
  })

  test('propaga o 400 do apontado que não é carreta ativa', async () => {
    const fixture = await createTripHttpFixture({
      setTripTrailerError: new TripTrailerNotATrailerError(),
    })

    const response = await fixture.handle(
      jsonRequest({ body: { trailerVehicleId: TRAILER_ID }, method: 'PUT', path: PATH }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('TRIP_TRAILER_NOT_A_TRAILER')
  })

  test('propaga o 409 da carreta já em uso', async () => {
    const fixture = await createTripHttpFixture({
      setTripTrailerError: new TripTrailerInUseError(),
    })

    const response = await fixture.handle(
      jsonRequest({ body: { trailerVehicleId: TRAILER_ID }, method: 'PUT', path: PATH }),
    )

    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('TRIP_TRAILER_IN_USE')
  })

  test('exige trip.manage', async () => {
    const fixture = await createTripHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(
      jsonRequest({ body: { trailerVehicleId: TRAILER_ID }, method: 'PUT', path: PATH }),
    )

    expect(response.status).toBe(403)
    expect(fixture.setTripTrailerCalls).toEqual([])
  })
})
