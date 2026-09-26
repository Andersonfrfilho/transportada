/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  TripNotFoundError,
  TripStateTransitionNotAllowedError,
} from '../../src/trips/domain/trip.error.js'
import {
  jsonRequest,
  responseApiError,
  responseData,
  TRIP_ID,
  tripCrewPath,
} from '../fixtures/trip-http-payload.fixture'
import { COMPANY_CONTEXT, createTripHttpFixture } from '../fixtures/trip-http.fixture'

const DRIVER_ID = '44444444-4444-4444-8444-444444444442'
const VEHICLE_ID = '44444444-4444-4444-8444-444444444441'

describe('trip crew http contract', () => {
  /** Spec 216: define ou troca motorista/veículo enquanto a viagem está awaiting_crew ou draft. */
  test('defines/troca a tripulação de uma viagem', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { driverIds: [DRIVER_ID], vehicleId: VEHICLE_ID },
        method: 'PATCH',
        path: tripCrewPath(),
      }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toMatchObject({ status: 'draft' })
    expect(fixture.updateTripCrewCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        driverIds: [DRIVER_ID],
        tripId: TRIP_ID,
        vehicleId: VEHICLE_ID,
      },
    ])
  })

  test('aceita driverIds vazio e vehicleId ausente — viagem continua aguardando definição', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: {}, method: 'PATCH', path: tripCrewPath() }),
    )

    expect(response.status).toBe(200)
    expect(fixture.updateTripCrewCalls).toEqual([
      { context: COMPANY_CONTEXT, driverIds: [], tripId: TRIP_ID, vehicleId: undefined },
    ])
  })

  test('propaga a recusa quando a viagem já tem o roteiro planejado', async () => {
    const fixture = await createTripHttpFixture({
      updateTripCrewError: new TripStateTransitionNotAllowedError('TRIP_CREW_ALREADY_DEFINED'),
    })

    const response = await fixture.handle(
      jsonRequest({
        body: { driverIds: [DRIVER_ID], vehicleId: VEHICLE_ID },
        method: 'PATCH',
        path: tripCrewPath(),
      }),
    )

    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('STATE_TRANSITION_NOT_ALLOWED')
  })

  test('propaga a recusa quando a viagem não pertence à empresa', async () => {
    const fixture = await createTripHttpFixture({ updateTripCrewError: new TripNotFoundError() })

    const response = await fixture.handle(
      jsonRequest({
        body: { driverIds: [DRIVER_ID], vehicleId: VEHICLE_ID },
        method: 'PATCH',
        path: tripCrewPath(),
      }),
    )

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('TRIP_NOT_FOUND')
  })

  test('rejeita corpo com campo desconhecido', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: { color: 'blue' }, method: 'PATCH', path: tripCrewPath() }),
    )

    expect(response.status).toBe(400)
    expect(fixture.updateTripCrewCalls).toEqual([])
  })

  test('never matches a non-uuid trip id', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { driverIds: [DRIVER_ID], vehicleId: VEHICLE_ID },
        method: 'PATCH',
        path: tripCrewPath('not-a-uuid'),
      }),
    )

    expect(response.status).toBe(404)
    expect(fixture.updateTripCrewCalls).toEqual([])
  })
})
