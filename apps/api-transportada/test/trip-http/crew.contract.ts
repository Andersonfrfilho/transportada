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
const HELPER_ID = '44444444-4444-4444-8444-444444444443'

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
        helperIds: [],
        tripId: TRIP_ID,
        vehicleId: VEHICLE_ID,
      },
    ])
  })

  /** Spec 149 (ADR-0065): a troca de tripulação leva os ajudantes — desmarcar um é mandar a lista sem ele. */
  test('accepts helperIds alongside driverIds', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { driverIds: [DRIVER_ID], helperIds: [HELPER_ID], vehicleId: VEHICLE_ID },
        method: 'PATCH',
        path: tripCrewPath(),
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.updateTripCrewCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        driverIds: [DRIVER_ID],
        helperIds: [HELPER_ID],
        tripId: TRIP_ID,
        vehicleId: VEHICLE_ID,
      },
    ])
  })

  /** O mesmo teto da criação: dez pessoas no total, motoristas e ajudantes juntos. */
  test('refuses a crew over the maximum of ten people combining drivers and helpers', async () => {
    const fixture = await createTripHttpFixture()
    const helperIds = Array.from({ length: 10 }, () => crypto.randomUUID())

    const response = await fixture.handle(
      jsonRequest({
        body: { driverIds: [DRIVER_ID], helperIds, vehicleId: VEHICLE_ID },
        method: 'PATCH',
        path: tripCrewPath(),
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.updateTripCrewCalls).toEqual([])
  })

  test('aceita driverIds vazio e vehicleId ausente — viagem continua aguardando definição', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: {}, method: 'PATCH', path: tripCrewPath() }),
    )

    expect(response.status).toBe(200)
    expect(fixture.updateTripCrewCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        driverIds: [],
        helperIds: [],
        tripId: TRIP_ID,
        vehicleId: undefined,
      },
    ])
  })

  /** Spec 217 D2: a recusa passou a ser a da separação — o roteiro planejado deixou de barrar. */
  test('propaga a recusa quando a separação da viagem já começou', async () => {
    const fixture = await createTripHttpFixture({
      updateTripCrewError: new TripStateTransitionNotAllowedError('TRIP_SEPARATION_STARTED'),
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
