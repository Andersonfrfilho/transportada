/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import {
  DRIVER_ID,
  DRIVER_OWNED_VEHICLE_ID,
  FLEET_DRIVERS_PATH,
  jsonRequest,
  LINK_ID,
  OWNED_LINK_ID,
  responseApiError,
  responseData,
  VEHICLE_ID,
} from '../fixtures/fleet-http-payload.fixture'
import {
  COMPANY_CONTEXT,
  createFleetHttpFixture,
  READ_ONLY_PERMISSIONS,
} from '../fixtures/fleet-http.fixture'

const DRIVER_VEHICLES_PATH = `${FLEET_DRIVERS_PATH}/${DRIVER_ID}/vehicles`

describe('fleet driver vehicles http contract', () => {
  test('lists the vehicles linked to the driver', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: DRIVER_VEHICLES_PATH }),
    )

    expect(response.status).toBe(200)
    const data =
      await responseData<readonly { readonly id: string; readonly ownedByDriver: boolean }[]>(
        response,
      )
    expect(data.map((link) => [link.id, link.ownedByDriver])).toEqual([
      [LINK_ID, false],
      [OWNED_LINK_ID, true],
    ])
    expect(fixture.listDriverVehicleCalls).toEqual([
      { context: COMPANY_CONTEXT, driverId: DRIVER_ID },
    ])
  })

  test('serializes the whole vehicle inside each link', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ method: 'GET', path: DRIVER_VEHICLES_PATH }),
    )

    const data = await responseData<
      readonly {
        readonly assignedAt: string
        readonly vehicle: { readonly id: string; readonly plate: string }
      }[]
    >(response)
    expect(data[0]?.assignedAt).toBe('2026-07-28T12:00:00.000Z')
    expect(data[0]?.vehicle.id).toBe(VEHICLE_ID)
    expect(data[1]?.vehicle.id).toBe(DRIVER_OWNED_VEHICLE_ID)
    expect(data[1]?.vehicle.plate).toBe('QRS4E56')
  })

  test('replaces the whole set of linked vehicles', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { vehicleIds: [VEHICLE_ID, DRIVER_OWNED_VEHICLE_ID] },
        method: 'PUT',
        path: DRIVER_VEHICLES_PATH,
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.replaceDriverVehicleCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'fleet-http-correlation',
        driverId: DRIVER_ID,
        vehicleIds: [VEHICLE_ID, DRIVER_OWNED_VEHICLE_ID],
      },
    ])
  })

  // Desvincular todos é uma operação legítima, não um corpo inválido
  test('accepts an empty set of vehicles', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: { vehicleIds: [] }, method: 'PUT', path: DRIVER_VEHICLES_PATH }),
    )

    expect(response.status).toBe(200)
    expect(fixture.replaceDriverVehicleCalls).toEqual([
      {
        context: COMPANY_CONTEXT,
        correlationId: 'fleet-http-correlation',
        driverId: DRIVER_ID,
        vehicleIds: [],
      },
    ])
  })

  test('rejects a vehicle id that is not a uuid', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: { vehicleIds: ['ABC1D23'] }, method: 'PUT', path: DRIVER_VEHICLES_PATH }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.replaceDriverVehicleCalls).toEqual([])
  })

  test('rejects a repeated vehicle id', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { vehicleIds: [VEHICLE_ID, VEHICLE_ID] },
        method: 'PUT',
        path: DRIVER_VEHICLES_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect((await responseApiError(response)).code).toBe('INVALID_REQUEST')
    expect(fixture.replaceDriverVehicleCalls).toEqual([])
  })

  test('propagates a vehicle outside the company as 404', async () => {
    const fixture = await createFleetHttpFixture({
      replaceDriverVehiclesError: new ApiError({
        code: 'FLEET_VEHICLE_NOT_FOUND',
        message: 'Vehicle not found for this company',
        status: 404,
      }),
    })

    const response = await fixture.handle(
      jsonRequest({
        body: { vehicleIds: [VEHICLE_ID] },
        method: 'PUT',
        path: DRIVER_VEHICLES_PATH,
      }),
    )

    expect(response.status).toBe(404)
    expect((await responseApiError(response)).code).toBe('FLEET_VEHICLE_NOT_FOUND')
  })

  test('lets a read only operator list but never replace the links', async () => {
    const fixture = await createFleetHttpFixture({ permissions: READ_ONLY_PERMISSIONS })

    const listed = await fixture.handle(jsonRequest({ method: 'GET', path: DRIVER_VEHICLES_PATH }))
    const replaced = await fixture.handle(
      jsonRequest({ body: { vehicleIds: [] }, method: 'PUT', path: DRIVER_VEHICLES_PATH }),
    )

    expect(listed.status).toBe(200)
    expect(replaced.status).toBe(403)
    expect(fixture.replaceDriverVehicleCalls).toEqual([])
  })
})
