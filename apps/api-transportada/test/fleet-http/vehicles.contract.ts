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

  // Fase C: marca, modelo, ano-modelo, eixos e frota alimentam cálculo de frete e o cInt do MDF-e
  test('carries brand, model, color, modelYear, axleCount and fleetNumber through create and update', async () => {
    const identityFields = {
      axleCount: 3,
      brand: 'Volvo',
      color: 'branca',
      fleetNumber: 'ROTA-01',
      model: 'FH 540',
      modelYear: 2020,
    }

    const createFixture = await createFleetHttpFixture()
    const createResponse = await createFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, ...identityFields },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(createResponse.status).toBe(201)
    expect(createFixture.createVehicleCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'fleet-http-correlation',
        vehicle: { ...CREATE_VEHICLE_BODY, ...identityFields },
      },
    ])

    const updateFixture = await createFleetHttpFixture()
    const updateResponse = await updateFixture.handle(
      jsonRequest({
        body: { ...UPDATE_VEHICLE_BODY, ...identityFields },
        method: 'PATCH',
        path: VEHICLE_PATH,
      }),
    )

    expect(updateResponse.status).toBe(200)
    expect(updateFixture.updateVehicleCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'fleet-http-correlation',
        expectedVersion: '1',
        status: 'active',
        vehicle: { ...CREATE_VEHICLE_BODY, ...identityFields },
        vehicleId: VEHICLE_ID,
      },
    ])
  })

  // 0 é "não informado"; a faixa vem do que o layout do MDF-e e o catálogo aceitam
  test('validates axleCount between 2 and 9 and modelYear between 1900 and 2100, zero meaning not-informed', async () => {
    const inRangeFixture = await createFleetHttpFixture()
    const inRangeResponse = await inRangeFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, axleCount: 2, modelYear: 1900 },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(inRangeResponse.status).toBe(201)

    const zeroFixture = await createFleetHttpFixture()
    const zeroResponse = await zeroFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, axleCount: 0, modelYear: 0 },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(zeroResponse.status).toBe(201)

    const outOfRangeAxleFixture = await createFleetHttpFixture()
    const outOfRangeAxleResponse = await outOfRangeAxleFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, axleCount: 1 },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(outOfRangeAxleResponse.status).toBe(400)

    const outOfRangeYearFixture = await createFleetHttpFixture()
    const outOfRangeYearResponse = await outOfRangeYearFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, modelYear: 2101 },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(outOfRangeYearResponse.status).toBe(400)
  })

  // Cor é lista fechada do Denatran: aceitar "Prata metálico" quebra filtro e relatório depois
  test('refuses a color outside the Denatran list and accepts a blank one', async () => {
    const invalidFixture = await createFleetHttpFixture()
    const invalidResponse = await invalidFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, color: 'Prata metálico' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(invalidResponse.status).toBe(400)

    const blankFixture = await createFleetHttpFixture()
    const blankResponse = await blankFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, color: '' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(blankResponse.status).toBe(201)
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

  // O cadastro do proprietário guarda 058151044 como o certificado da ANTT imprime.
  test('grava o RNTRC do proprietário com o zero da folha da ANTT em vez de encurtá-lo', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: {
          ...CREATE_VEHICLE_BODY,
          owner: { ...THIRD_PARTY_OWNER_BODY, rntrc: '058151044' },
          ownership: 'aggregate',
        },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createVehicleCalls[0]).toMatchObject({
      vehicle: { owner: { rntrc: '058151044' } },
    })
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
