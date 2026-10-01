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

/**
 * Feature 147 D1: `00` só é ausência real de carroceria no cavalo mecânico. Todo o resto — moto,
 * carro e os demais tipos que carregam, mais toda carreta — é obrigado a escolher; e o cavalo, ao
 * contrário, só aceita `00` (carroceria nele mandaria `tpCar` errado ao MDF-e).
 */
const NON_TRACTOR_VEHICLE_TYPES = [
  'motorcycle',
  'car',
  'utility',
  'van',
  'vuc',
  'three_quarter',
  'toco',
  'truck',
  'other',
]

describe('fleet vehicle body type contract', () => {
  test.each(NON_TRACTOR_VEHICLE_TYPES)(
    'refuses body type 00 for a %s on create',
    async (vehicleType) => {
      const fixture = await createFleetHttpFixture()

      const response = await fixture.handle(
        jsonRequest({
          body: { ...CREATE_VEHICLE_BODY, bodyType: '00', vehicleType },
          method: 'POST',
          path: FLEET_VEHICLES_PATH,
        }),
      )

      expect(response.status).toBe(400)
      expect((await responseApiError(response)).code).toBe('FLEET_VEHICLE_BODY_TYPE_REQUIRED')
      expect(fixture.createVehicleCalls).toEqual([])
    },
  )

  test('refuses body type 00 for a trailer on create', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_TRAILER_BODY, bodyType: '00' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('FLEET_VEHICLE_BODY_TYPE_REQUIRED')
    expect(fixture.createVehicleCalls).toEqual([])
  })

  test('accepts body type 00 for a tractor unit on create', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: CREATE_VEHICLE_BODY, method: 'POST', path: FLEET_VEHICLES_PATH }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createVehicleCalls).toHaveLength(1)
  })

  test('refuses a body type other than 00 for a tractor unit on create', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, bodyType: '02' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('FLEET_VEHICLE_BODY_TYPE_NOT_APPLICABLE')
    expect(fixture.createVehicleCalls).toEqual([])
  })
})
