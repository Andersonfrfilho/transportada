/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { TripVehicleNotAvailableError } from '../../src/trips/domain/trip.error.js'
import {
  CREATE_TRIP_BODY,
  DRIVER_ID,
  HELPER_ID,
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
        helperIds: [],
        vehicleId: VEHICLE_ID,
      },
    ])
  })

  // Spec 149 (ADR-0065): a criação aceita `helperIds` ao lado de `driverIds`.
  test('accepts helperIds alongside driverIds', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_TRIP_BODY, helperIds: [HELPER_ID] },
        method: 'POST',
        path: TRIPS_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createTripCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        driverIds: [DRIVER_ID, SECOND_DRIVER_ID],
        helperIds: [HELPER_ID],
        vehicleId: VEHICLE_ID,
      },
    ])
  })

  // Evidence T1: o teto de 10 vale para a tripulação inteira (motoristas + ajudantes).
  test('refuses a crew over the maximum of ten people combining drivers and helpers', async () => {
    const fixture = await createTripHttpFixture()
    const helperIds = Array.from({ length: 9 }, () => crypto.randomUUID())

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_TRIP_BODY, helperIds },
        method: 'POST',
        path: TRIPS_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.createTripCalls).toEqual([])
  })

  test('rejects an unknown field', async () => {
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

  /**
   * Spec 217 T201 (RF2): a criação sem tripulação deixou de ser 400 na fronteira HTTP — a viagem
   * nasce `awaiting_crew` (RF3/D1), provado a fundo (par → status) em
   * `test/trip-application/trip-use-case.contract.ts`. Aqui a prova é a do encanamento: o schema
   * aceita `driverIds: []` e `vehicleId` ausente, e repassa exatamente isso ao caso de uso — sem
   * regressão do par completo, que continua obrigatório a virar `draft`.
   */
  test('accepts driverIds vazio e vehicleId ausente', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: { driverIds: [] }, method: 'POST', path: TRIPS_PATH }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createTripCalls).toEqual([
      { context: COMPANY_CONTEXT, driverIds: [], vehicleId: undefined },
    ])
  })

  test('accepts só motorista, sem veículo', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: { driverIds: [DRIVER_ID] }, method: 'POST', path: TRIPS_PATH }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createTripCalls).toEqual([
      { context: COMPANY_CONTEXT, driverIds: [DRIVER_ID], vehicleId: undefined },
    ])
  })

  test('accepts só veículo, sem motorista', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { driverIds: [], vehicleId: VEHICLE_ID },
        method: 'POST',
        path: TRIPS_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createTripCalls).toEqual([
      { context: COMPANY_CONTEXT, driverIds: [], vehicleId: VEHICLE_ID },
    ])
  })

  /** Sem regressão (RF2): com os dois, o corpo continua igual ao de antes da 217. */
  test('accepts os dois, igual ao comportamento de antes da 217', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: CREATE_TRIP_BODY, method: 'POST', path: TRIPS_PATH }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createTripCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        driverIds: [DRIVER_ID, SECOND_DRIVER_ID],
        vehicleId: VEHICLE_ID,
      },
    ])
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

  /**
   * Spec 143 aceite 2: `dailyAllowanceDays` informado desce para o use case tal como chegou —
   * quem decide dias sugeridos versus informados é a política (T2), nunca a rota.
   */
  test('forwards the informed daily allowance days', async () => {
    const fixture = await createTripHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_TRIP_BODY, dailyAllowanceDays: 2 },
        method: 'POST',
        path: TRIPS_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createTripCalls[0]).toMatchObject({ dailyAllowanceDays: 2 })
  })

  /**
   * Spec 143 aceite 8: zero não é "sem diária" — é entrada inválida, e o zod é a primeira barreira,
   * antes mesmo do CHECK do banco (T1).
   */
  test('refuses a zero or negative daily allowance days', async () => {
    const zeroFixture = await createTripHttpFixture()
    const zeroResponse = await zeroFixture.handle(
      jsonRequest({
        body: { ...CREATE_TRIP_BODY, dailyAllowanceDays: 0 },
        method: 'POST',
        path: TRIPS_PATH,
      }),
    )

    expect(zeroResponse.status).toBe(400)
    expect(zeroFixture.createTripCalls).toEqual([])

    const negativeFixture = await createTripHttpFixture()
    const negativeResponse = await negativeFixture.handle(
      jsonRequest({
        body: { ...CREATE_TRIP_BODY, dailyAllowanceDays: -1 },
        method: 'POST',
        path: TRIPS_PATH,
      }),
    )

    expect(negativeResponse.status).toBe(400)
    expect(negativeFixture.createTripCalls).toEqual([])
  })
})
