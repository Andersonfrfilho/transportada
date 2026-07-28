/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createFleetVehiclesUseCase } from '../../src/fleet/application/fleet-vehicles.use-case.js'
import { ApiError } from '../../src/shared/api.error.js'
import { createVehicleRepositoryStub, FLEET_CONTEXT } from '../fixtures/fleet-application.fixture'
import { CREATE_VEHICLE_BODY, VEHICLE_ID } from '../fixtures/fleet-http-payload.fixture'

const CORRELATION_ID = 'fleet-vehicles-application'

describe('fleet vehicles use case contract', () => {
  test('creates and lists scoped by the company of the authenticated context', async () => {
    const stub = createVehicleRepositoryStub()
    const useCase = createFleetVehiclesUseCase({ repository: stub.repository })

    await useCase.create({
      context: FLEET_CONTEXT,
      correlationId: CORRELATION_ID,
      vehicle: CREATE_VEHICLE_BODY,
    })
    await useCase.list({ context: FLEET_CONTEXT, cursor: null, limit: 25 })

    expect(stub.createCalls).toEqual([
      { companyId: FLEET_CONTEXT.companyId, vehicle: { ...CREATE_VEHICLE_BODY } },
    ])
    expect(stub.listCalls).toEqual([
      { companyId: FLEET_CONTEXT.companyId, cursor: null, limit: 25 },
    ])
  })

  test('updates with the expected version and returns the new row', async () => {
    const stub = createVehicleRepositoryStub()
    const useCase = createFleetVehiclesUseCase({ repository: stub.repository })

    const updated = await useCase.update({
      context: FLEET_CONTEXT,
      correlationId: CORRELATION_ID,
      expectedVersion: '1',
      status: 'inactive',
      vehicle: CREATE_VEHICLE_BODY,
      vehicleId: VEHICLE_ID,
    })

    expect(updated.version).toBe('2')
    expect(stub.updateCalls).toEqual([
      {
        companyId: FLEET_CONTEXT.companyId,
        expectedVersion: '1',
        status: 'inactive',
        vehicle: { ...CREATE_VEHICLE_BODY },
        vehicleId: VEHICLE_ID,
      },
    ])
  })

  // Update sem linha pode ser versão velha ou veículo de outro tenant — 409 e 404 dizem coisas diferentes
  test('separates the stale version from the missing vehicle', async () => {
    const conflictUseCase = createFleetVehiclesUseCase({
      repository: createVehicleRepositoryStub({ updated: null }).repository,
    })
    const missingUseCase = createFleetVehiclesUseCase({
      repository: createVehicleRepositoryStub({ current: null, updated: null }).repository,
    })
    const input = {
      context: FLEET_CONTEXT,
      correlationId: CORRELATION_ID,
      expectedVersion: '1',
      status: 'active',
      vehicle: CREATE_VEHICLE_BODY,
      vehicleId: VEHICLE_ID,
    } as const

    const conflict = await conflictUseCase.update(input).catch((error: unknown) => error)
    const missing = await missingUseCase.update(input).catch((error: unknown) => error)

    expect(conflict).toBeInstanceOf(ApiError)
    expect((conflict as ApiError).status).toBe(409)
    expect((conflict as ApiError).code).toBe('FLEET_VEHICLE_VERSION_CONFLICT')
    expect(missing).toBeInstanceOf(ApiError)
    expect((missing as ApiError).status).toBe(404)
    expect((missing as ApiError).code).toBe('FLEET_VEHICLE_NOT_FOUND')
  })
})
