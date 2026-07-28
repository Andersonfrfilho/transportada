/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  CREATE_TRAILER_BODY,
  CREATE_VEHICLE_BODY,
  FLEET_VEHICLES_PATH,
  jsonRequest,
  responseApiError,
  responseData,
  THIRD_PARTY_OWNER_BODY,
  UPDATE_VEHICLE_BODY,
  VEHICLE,
  VEHICLE_ID,
} from '../fixtures/fleet-http-payload.fixture'
import { COMPANY_CONTEXT, createFleetHttpFixture } from '../fixtures/fleet-http.fixture'

const VEHICLE_PATH = `${FLEET_VEHICLES_PATH}/${VEHICLE_ID}`

describe('fleet vehicles http contract', () => {
  test('lists vehicles with the tenant context and the parsed filters', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        method: 'GET',
        path: `${FLEET_VEHICLES_PATH}?limit=10&plateContains=ABC&roleEq=traction&statusEq=active`,
      }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual([{ ...VEHICLE }])
    expect(fixture.listVehicleCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        cursor: null,
        filters: { plateContains: 'ABC', roleEq: 'traction', statusEq: 'active' },
        limit: 10,
      },
    ])
  })

  test('creates a traction vehicle and takes the company from the token', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: CREATE_VEHICLE_BODY, method: 'POST', path: FLEET_VEHICLES_PATH }),
    )

    expect(response.status).toBe(201)
    expect(await responseData(response)).toEqual({ ...VEHICLE })
    expect(fixture.createVehicleCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'fleet-http-correlation',
        vehicle: { ...CREATE_VEHICLE_BODY },
      },
    ])
  })

  // tpRod só existe no veicTracao — deixar passar aqui vira rejeição na SEFAZ depois
  test('refuses a trailer carrying a wheel type and a traction without one', async () => {
    const trailerFixture = await createFleetHttpFixture()
    const trailerResponse = await trailerFixture.handle(
      jsonRequest({
        body: { ...CREATE_TRAILER_BODY, wheelType: '03' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(trailerResponse.status).toBe(400)
    expect((await responseApiError(trailerResponse)).code).toBe('INVALID_REQUEST')
    expect(trailerFixture.createVehicleCalls).toEqual([])

    const tractionFixture = await createFleetHttpFixture()
    const tractionResponse = await tractionFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, wheelType: '' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(tractionResponse.status).toBe(400)
    expect(tractionFixture.createVehicleCalls).toEqual([])
  })

  // O grupo <prop> é tudo-ou-nada e proibido em veículo próprio
  test('requires the owner group only when the vehicle is not own', async () => {
    const missingOwnerFixture = await createFleetHttpFixture()
    const missingOwnerResponse = await missingOwnerFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, ownership: 'third_party' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(missingOwnerResponse.status).toBe(400)
    expect(missingOwnerFixture.createVehicleCalls).toEqual([])

    const ownVehicleFixture = await createFleetHttpFixture()
    const ownVehicleResponse = await ownVehicleFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, owner: THIRD_PARTY_OWNER_BODY },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(ownVehicleResponse.status).toBe(400)
    expect(ownVehicleFixture.createVehicleCalls).toEqual([])

    const aggregateFixture = await createFleetHttpFixture()
    const aggregateResponse = await aggregateFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, owner: THIRD_PARTY_OWNER_BODY, ownership: 'aggregate' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(aggregateResponse.status).toBe(201)
    expect(aggregateFixture.createVehicleCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'fleet-http-correlation',
        vehicle: {
          ...CREATE_VEHICLE_BODY,
          owner: { ...THIRD_PARTY_OWNER_BODY },
          ownership: 'aggregate',
        },
      },
    ])
  })

  test('rejects a plate outside the Mercosul and legacy formats and any unknown field', async () => {
    const plateFixture = await createFleetHttpFixture()
    const plateResponse = await plateFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, plate: 'ABC-1D23' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(plateResponse.status).toBe(400)
    expect(plateFixture.createVehicleCalls).toEqual([])

    const smuggledFixture = await createFleetHttpFixture()
    const smuggledResponse = await smuggledFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, companyId: '00000000-0000-4000-8000-0000000009ff' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(smuggledResponse.status).toBe(400)
    expect(smuggledFixture.createVehicleCalls).toEqual([])
  })

  test('updates a vehicle with the expected version taken from the body', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: UPDATE_VEHICLE_BODY, method: 'PATCH', path: VEHICLE_PATH }),
    )

    expect(response.status).toBe(200)
    expect((await responseData<{ readonly version: string }>(response)).version).toBe('2')
    expect(fixture.updateVehicleCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'fleet-http-correlation',
        expectedVersion: '1',
        status: 'active',
        vehicle: { ...CREATE_VEHICLE_BODY },
        vehicleId: VEHICLE_ID,
      },
    ])
  })

  test('refuses an update without the expected version and never matches a non-uuid path', async () => {
    const missingVersionFixture = await createFleetHttpFixture()
    const missingVersionResponse = await missingVersionFixture.handle(
      jsonRequest({ body: CREATE_VEHICLE_BODY, method: 'PATCH', path: VEHICLE_PATH }),
    )

    expect(missingVersionResponse.status).toBe(400)
    expect(missingVersionFixture.updateVehicleCalls).toEqual([])

    const invalidPathFixture = await createFleetHttpFixture()
    const invalidPathResponse = await invalidPathFixture.handle(
      jsonRequest({
        body: UPDATE_VEHICLE_BODY,
        method: 'PATCH',
        path: `${FLEET_VEHICLES_PATH}/not-a-uuid`,
      }),
    )

    expect(invalidPathResponse.status).toBe(404)
    expect(invalidPathFixture.updateVehicleCalls).toEqual([])
  })

  test('propagates the optimistic locking conflict as 409', async () => {
    const fixture = await createFleetHttpFixture({
      updateVehicleError: new ApiError({
        code: 'FLEET_VEHICLE_VERSION_CONFLICT',
        message: 'Vehicle version conflict',
        status: 409,
      }),
    })

    const response = await fixture.handle(
      jsonRequest({ body: UPDATE_VEHICLE_BODY, method: 'PATCH', path: VEHICLE_PATH }),
    )

    expect(response.status).toBe(409)
    expect((await responseApiError(response)).code).toBe('FLEET_VEHICLE_VERSION_CONFLICT')
  })
})
