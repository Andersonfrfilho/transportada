/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  CREATE_VEHICLE_BODY,
  FLEET_VEHICLES_PATH,
  jsonRequest,
  responseApiError,
  responseData,
  UPDATE_VEHICLE_BODY,
  VEHICLE,
  VEHICLE_ID,
} from '../fixtures/fleet-http-payload.fixture'
import { createFleetHttpFixture } from '../fixtures/fleet-http.fixture'

const VEHICLE_PATH = `${FLEET_VEHICLES_PATH}/${VEHICLE_ID}`

const INFORMED_COSTS = {
  acquisitionAmount: '95000.0000',
  annualInsuranceAmount: '2400.0000',
  annualVehicleTaxAmount: '1200.0000',
  averageConsumption: '3.20',
  monthlyInstallmentAmount: '1500.0000',
  otherCostsPerKilometer: '1.8500',
} as const

describe('fleet vehicle cost http contract', () => {
  test('carries the six cost fields through to the create use case', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, ...INFORMED_COSTS },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(response.status).toBe(201)
    expect(fixture.createVehicleCalls[0]).toMatchObject({ vehicle: { ...INFORMED_COSTS } })
  })

  test('carries the six cost fields through to the update use case', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: { ...UPDATE_VEHICLE_BODY, ...INFORMED_COSTS },
        method: 'PATCH',
        path: VEHICLE_PATH,
      }),
    )

    expect(response.status).toBe(200)
    expect(fixture.updateVehicleCalls[0]).toMatchObject({ vehicle: { ...INFORMED_COSTS } })
  })

  test('rejects every negative cost field at once with a structured detail per field', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({
        body: {
          ...CREATE_VEHICLE_BODY,
          acquisitionAmount: '-1.0000',
          annualInsuranceAmount: '-1.0000',
          annualVehicleTaxAmount: '-1.0000',
          averageConsumption: '-1.00',
          monthlyInstallmentAmount: '-1.0000',
          otherCostsPerKilometer: '-1.0000',
        },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.createVehicleCalls).toEqual([])
    const error = await responseApiError(response)
    expect(error.code).toBe('INVALID_REQUEST')
    expect(new Set(error.details?.map((detail) => detail.field))).toEqual(
      new Set([
        'acquisitionAmount',
        'annualInsuranceAmount',
        'annualVehicleTaxAmount',
        'averageConsumption',
        'monthlyInstallmentAmount',
        'otherCostsPerKilometer',
      ]),
    )
  })

  test('rejects a derived costPerKilometer, monthlyFixedCost or costsUpdatedAt in the request body', async () => {
    const derivedFixture = await createFleetHttpFixture()
    const derivedResponse = await derivedFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, costPerKilometer: '0.9567' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(derivedResponse.status).toBe(400)
    expect(derivedFixture.createVehicleCalls).toEqual([])

    const monthlyFixedCostFixture = await createFleetHttpFixture()
    const monthlyFixedCostResponse = await monthlyFixedCostFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, monthlyFixedCost: '100.0000' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(monthlyFixedCostResponse.status).toBe(400)
    expect(monthlyFixedCostFixture.createVehicleCalls).toEqual([])

    const costsUpdatedAtFixture = await createFleetHttpFixture()
    const costsUpdatedAtResponse = await costsUpdatedAtFixture.handle(
      jsonRequest({
        body: { ...CREATE_VEHICLE_BODY, costsUpdatedAt: '2026-07-28T12:00:00.000Z' },
        method: 'POST',
        path: FLEET_VEHICLES_PATH,
      }),
    )

    expect(costsUpdatedAtResponse.status).toBe(400)
    expect(costsUpdatedAtFixture.createVehicleCalls).toEqual([])
  })

  test('exposes the zero cost defaults with no informed costs and no fixed total', async () => {
    const fixture = await createFleetHttpFixture()

    const response = await fixture.handle(
      jsonRequest({ body: CREATE_VEHICLE_BODY, method: 'POST', path: FLEET_VEHICLES_PATH }),
    )

    expect(await responseData(response)).toEqual({ ...VEHICLE })
  })
})
