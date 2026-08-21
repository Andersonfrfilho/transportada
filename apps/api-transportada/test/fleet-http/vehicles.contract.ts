/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  CREATE_TRAILER_BODY,
  CREATE_VEHICLE_BODY,
  DERIVED_COST_VEHICLE,
  FLEET_VEHICLES_PATH,
  OTHER_COSTS_ONLY_VEHICLE,
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

  // O `tpRod` sai do tipo, e ele só existe no veicTracao — deixar passar aqui vira rejeição na SEFAZ
  test('refuses a trailer carrying a vehicle type and a traction without one', async () => {
    const trailerFixture = await createFleetHttpFixture()
    const trailerResponse = await trailerFixture.handle(
      jsonRequest({
        body: { ...CREATE_TRAILER_BODY, vehicleType: 'tractor_unit' },
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
        body: { ...CREATE_VEHICLE_BODY, vehicleType: '' },
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

  test('refuses a costPerKilometer sent in the body of a create or an update', async () => {
    const createFixture = await createFleetHttpFixture()
    const createResponse = await createFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, costPerKilometer: '1.8500' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(createResponse.status).toBe(400)
    expect((await responseApiError(createResponse)).code).toBe('INVALID_REQUEST')
    expect(createFixture.createVehicleCalls).toEqual([])

    const updateFixture = await createFleetHttpFixture()
    const updateResponse = await updateFixture.handle(
      jsonRequest({
        body: { ...UPDATE_VEHICLE_BODY, costPerKilometer: '1.8500' },
        method: 'PATCH',
        path: VEHICLE_PATH,
      }),
    )

    expect(updateResponse.status).toBe(400)
    expect(updateFixture.updateVehicleCalls).toEqual([])
  })

  test('requires a fuelType from the catalogue and carries it to the use case', async () => {
    const missingFixture = await createFleetHttpFixture()
    const missingResponse = await missingFixture.handle(
      jsonRequest({ body: bodyWithoutFuelType(), method: 'POST', path: FLEET_VEHICLES_PATH }),
    )

    expect(missingResponse.status).toBe(400)
    expect(
      (await responseApiError(missingResponse)).details?.map((detail) => detail.field),
    ).toContain('fuelType')

    const unknownFixture = await createFleetHttpFixture()
    const unknownResponse = await unknownFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, fuelType: 'glp' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(unknownResponse.status).toBe(400)
    expect(unknownFixture.createVehicleCalls).toEqual([])

    const acceptedFixture = await createFleetHttpFixture()
    const acceptedResponse = await acceptedFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, fuelType: 'gnv' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(acceptedResponse.status).toBe(201)
    expect(acceptedFixture.createVehicleCalls[0]).toMatchObject({ vehicle: { fuelType: 'gnv' } })
  })

  test('accepts otherCostsPerKilometer on the four-decimal scale and refuses a coarser one', async () => {
    const fixture = await createFleetHttpFixture()
    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, otherCostsPerKilometer: '0.5000' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createVehicleCalls[0]).toMatchObject({
      vehicle: { otherCostsPerKilometer: '0.5000' },
    })

    const coarseFixture = await createFleetHttpFixture()
    const coarseResponse = await coarseFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, otherCostsPerKilometer: '0.5' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(coarseResponse.status).toBe(400)
    expect(coarseFixture.createVehicleCalls).toEqual([])
  })

  test('serializes the derived cost, its breakdown and the fuel price beside the fixed cost', async () => {
    const fixture = await createFleetHttpFixture({ vehicle: DERIVED_COST_VEHICLE })

    const response = await fixture.handle(
      jsonRequest({ body: CREATE_VEHICLE_BODY, method: 'POST', path: FLEET_VEHICLES_PATH }),
    )

    expect(response.status).toBe(201)
    expect(await responseData(response)).toMatchObject({
      costPerKilometer: '0.9567',
      costPerKilometerBreakdown: { fuel: '0.4567', otherCosts: '0.5000' },
      fuelPrice: {
        pricePerUnit: '5.4800',
        source: 'manual',
        unit: 'litre',
        weekEndingOn: '2026-08-08',
      },
      monthlyFixedCost: null,
    })
  })

  test('omits the uninformed parcel from the breakdown and nulls the price it has none of', async () => {
    const fixture = await createFleetHttpFixture({ vehicle: OTHER_COSTS_ONLY_VEHICLE })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: FLEET_VEHICLES_PATH }))

    expect(response.status).toBe(200)
    const [listed] = await responseData<readonly Record<string, unknown>[]>(response)
    expect(listed).toMatchObject({
      costPerKilometer: '0.5000',
      costPerKilometerBreakdown: { otherCosts: '0.5000' },
      fuelPrice: null,
    })
    expect(Object.keys(listed?.costPerKilometerBreakdown as object)).toEqual(['otherCosts'])
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

  /**
   * O tipo é um campo só, e é ele que casa o veículo com a coluna da tabela do cliente. VUC e 3/4 não
   * existem no `tipoRodado` da SEFAZ — quem os nomeia é o tipo, e o rodado sai dele por derivação.
   */
  test('carries the vehicle type through create, update and listing', async () => {
    const vucVehicle = { ...VEHICLE, vehicleType: 'vuc' } as const

    const createFixture = await createFleetHttpFixture({ vehicle: vucVehicle })
    const createResponse = await createFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, vehicleType: 'vuc' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(createResponse.status).toBe(201)
    expect(await responseData(createResponse)).toMatchObject({ vehicleType: 'vuc' })
    expect(createFixture.createVehicleCalls[0]).toMatchObject({
      vehicle: { vehicleType: 'vuc' },
    })

    const updateFixture = await createFleetHttpFixture({ vehicle: vucVehicle })
    const updateResponse = await updateFixture.handle(
      jsonRequest({
        body: { ...UPDATE_VEHICLE_BODY, vehicleType: 'three_quarter' },
        method: 'PATCH',
        path: VEHICLE_PATH,
      }),
    )

    expect(updateResponse.status).toBe(200)
    expect(updateFixture.updateVehicleCalls[0]).toMatchObject({
      vehicle: { vehicleType: 'three_quarter' },
    })

    const listFixture = await createFleetHttpFixture({ vehicle: vucVehicle })
    const listResponse = await listFixture.handle(
      jsonRequest({ method: 'GET', path: FLEET_VEHICLES_PATH }),
    )

    expect(listResponse.status).toBe(200)
    expect(await responseData<readonly { readonly vehicleType: string }[]>(listResponse)).toEqual([
      expect.objectContaining({ vehicleType: 'vuc' }),
    ])
  })

  // Moto e carro entraram no catálogo e vão ao MDF-e como `06`; nome de fora do catálogo não entra
  test('accepts the types the SEFAZ list does not name and refuses one outside the catalog', async () => {
    for (const vehicleType of ['motorcycle', 'car'] as const) {
      const fixture = await createFleetHttpFixture({ vehicle: { ...VEHICLE, vehicleType } })
      const response = await fixture.handle(
        jsonRequest({
          body: { ...CREATE_VEHICLE_BODY, vehicleType },
          method: 'POST',
          path: FLEET_VEHICLES_PATH,
        }),
      )

      expect(response.status).toBe(201)
      expect(fixture.createVehicleCalls[0]).toMatchObject({ vehicle: { vehicleType } })
    }

    const invalidFixture = await createFleetHttpFixture()
    const invalidResponse = await invalidFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, vehicleType: 'carreta' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(invalidResponse.status).toBe(400)
    expect(invalidFixture.createVehicleCalls).toEqual([])
  })
})

function bodyWithoutFuelType(): unknown {
  const body: Record<string, unknown> = { ...CREATE_VEHICLE_BODY }
  delete body.fuelType
  return body
}
