/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  FLEET_VEHICLES_PATH,
  jsonRequest,
  responseApiError,
  responseData,
  VEHICLE_LOOKUP,
} from '../fixtures/fleet-http-payload.fixture'
import {
  COMPANY_CONTEXT,
  createFleetHttpFixture,
  READ_ONLY_PERMISSIONS,
} from '../fixtures/fleet-http.fixture'

const CAPABILITIES_PATH = '/fleet/capabilities'
const LOOKUP_PATH = `${FLEET_VEHICLES_PATH}/lookup`
const PLATE = 'ABC1D23'

describe('fleet vehicle lookup http contract', () => {
  test('answers the vehicle the provider knows', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${LOOKUP_PATH}?plate=${PLATE}` }),
    )

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual(VEHICLE_LOOKUP)
    expect(fixture.lookupVehicleCalls).toEqual([{ context: COMPANY_CONTEXT, plate: PLATE }])
  })

  test('answers nothing for a plate the provider does not know', async () => {
    const fixture = await createFleetHttpFixture({ vehicleLookupResult: null })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${LOOKUP_PATH}?plate=${PLATE}` }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ data: null })
  })

  test('rejects a plate outside the brazilian format before calling the provider', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${LOOKUP_PATH}?plate=AB-123` }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.lookupVehicleCalls).toEqual([])
  })

  test('propagates the unavailable provider as 503', async () => {
    const fixture = await createFleetHttpFixture({
      vehicleLookupError: new ApiError({
        code: 'FLEET_VEHICLE_LOOKUP_UNAVAILABLE',
        message: 'Vehicle lookup provider is not configured',
        status: 503,
      }),
    })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${LOOKUP_PATH}?plate=${PLATE}` }),
    )

    expect(response.status).toBe(503)
    expect((await responseApiError(response)).code).toBe('FLEET_VEHICLE_LOOKUP_UNAVAILABLE')
  })

  // Consultar placa é serviço pago por consulta: quem só lê a frota não gasta a franquia
  test('keeps the lookup behind fleet.manage', async () => {
    const fixture = await createFleetHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${LOOKUP_PATH}?plate=${PLATE}` }),
    )

    expect(response.status).toBe(403)
    expect(fixture.lookupVehicleCalls).toEqual([])
  })

  // `/fleet/vehicles/lookup` não pode ser lido como `/fleet/vehicles/:id` — o segmento dinâmico só aceita UUID
  test('never confuses the lookup path with a vehicle identifier', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: { plate: PLATE }, method: 'PATCH', path: LOOKUP_PATH }),
    )

    expect(response.status).toBe(404)
    expect(fixture.lookupVehicleCalls).toEqual([])
    expect(fixture.updateVehicleCalls).toEqual([])
  })
})

describe('fleet capabilities http contract', () => {
  test('tells the workspace that the plate lookup is on', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: CAPABILITIES_PATH }))

    expect(response.status).toBe(200)
    expect(await responseData(response)).toEqual({ vehicleLookup: true })
  })

  test('tells the workspace that the plate lookup is off', async () => {
    const fixture = await createFleetHttpFixture({ vehicleLookupAvailable: false })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: CAPABILITIES_PATH }))

    expect(await responseData(response)).toEqual({ vehicleLookup: false })
  })

  test('lets anyone who reads the fleet read the capabilities', async () => {
    const fixture = await createFleetHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const response = await fixture.handle(jsonRequest({ method: 'GET', path: CAPABILITIES_PATH }))

    expect(response.status).toBe(200)
  })
})
