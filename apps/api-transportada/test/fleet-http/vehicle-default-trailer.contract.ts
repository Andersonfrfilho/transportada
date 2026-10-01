/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CREATE_TRAILER_BODY,
  CREATE_VEHICLE_BODY,
  FLEET_VEHICLES_PATH,
  jsonRequest,
  responseApiError,
} from '../fixtures/fleet-http-payload.fixture'
import { createFleetHttpFixture } from '../fixtures/fleet-http.fixture'

const TRAILER_ID = '00000000-0000-4000-8000-000000000916'

/**
 * Feature 147 D3: a carreta padrão só existe no cavalo. O apontado existir/ser carreta ativa
 * exige consulta ao banco e é coberto em `test/fleet-application/vehicles.contract.ts` — o fixture
 * HTTP não chama o caso de uso de verdade.
 */
describe('fleet vehicle default trailer contract', () => {
  test('refuses a default trailer for a trailer on create', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_TRAILER_BODY, defaultTrailerVehicleId: TRAILER_ID },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe(
      'FLEET_VEHICLE_DEFAULT_TRAILER_REQUIRES_TRACTOR',
    )
    expect(fixture.createVehicleCalls).toEqual([])
  })

  test('accepts no default trailer for a trailer on create', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: CREATE_TRAILER_BODY, method: 'POST', path: FLEET_VEHICLES_PATH }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createVehicleCalls).toHaveLength(1)
  })

  test('accepts a default trailer for a tractor unit on create', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, defaultTrailerVehicleId: TRAILER_ID },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createVehicleCalls).toHaveLength(1)
  })
})
