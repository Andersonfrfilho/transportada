/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CREATE_DRIVER_BODY,
  CREATE_VEHICLE_BODY,
  FLEET_DRIVERS_PATH,
  FLEET_VEHICLES_PATH,
  jsonRequest,
  responseApiError,
  UPDATE_VEHICLE_BODY,
  VEHICLE_ID,
} from '../fixtures/fleet-http-payload.fixture'
import { createFleetHttpFixture, READ_ONLY_PERMISSIONS } from '../fixtures/fleet-http.fixture'

describe('fleet http security contract', () => {
  test('lets fleet.read list but never write', async () => {
    const fixture = await createFleetHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const listResponse = await fixture.handle(
      jsonRequest({ method: 'GET', path: FLEET_VEHICLES_PATH }),
    )
    const createResponse = await fixture.handle(
      jsonRequest({ body: CREATE_VEHICLE_BODY, method: 'POST', path: FLEET_VEHICLES_PATH }),
    )
    const updateResponse = await fixture.handle(
      jsonRequest({
        body: UPDATE_VEHICLE_BODY,
        method: 'PATCH',
        path: `${FLEET_VEHICLES_PATH}/${VEHICLE_ID}`,
      }),
    )
    const createDriverResponse = await fixture.handle(
      jsonRequest({ body: CREATE_DRIVER_BODY, method: 'POST', path: FLEET_DRIVERS_PATH }),
    )

    expect(listResponse.status).toBe(200)
    expect(createResponse.status).toBe(403)
    expect(updateResponse.status).toBe(403)
    expect(createDriverResponse.status).toBe(403)
    expect((await responseApiError(createResponse)).code).toBe('FORBIDDEN')
    expect(fixture.createVehicleCalls).toEqual([])
    expect(fixture.updateVehicleCalls).toEqual([])
    expect(fixture.createDriverCalls).toEqual([])
  })

  test('refuses a listing query the contract does not declare', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: `${FLEET_VEHICLES_PATH}?companyId=other` }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.listVehicleCalls).toEqual([])
  })
})
