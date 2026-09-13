/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createFleetVehiclesUseCase } from '../../src/fleet/application/fleet-vehicles.use-case.js'
import type { FleetVehicle } from '../../src/fleet/application/fleet.port.js'
import { ApiError } from '../../src/shared/api.error.js'
import { createVehicleRepositoryStub, FLEET_CONTEXT } from '../fixtures/fleet-application.fixture'
import {
  CREATE_TRAILER_BODY,
  CREATE_VEHICLE_BODY,
  VEHICLE,
  VEHICLE_ID,
} from '../fixtures/fleet-http-payload.fixture'

const CORRELATION_ID = 'fleet-vehicles-application'
const TRAILER_ID = '00000000-0000-4000-8000-000000000916'
const ACTIVE_TRAILER: FleetVehicle = { ...VEHICLE, ...CREATE_TRAILER_BODY, id: TRAILER_ID }

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

  // Feature 147 T9: quem aponta existir na empresa e ser carreta ativa exige consulta ao banco.
  describe('default trailer', () => {
    test('accepts an existing active trailer of the company', async () => {
      const stub = createVehicleRepositoryStub({ current: ACTIVE_TRAILER })
      const useCase = createFleetVehiclesUseCase({ repository: stub.repository })

      await useCase.create({
        context: FLEET_CONTEXT,
        correlationId: CORRELATION_ID,
        vehicle: { ...CREATE_VEHICLE_BODY, defaultTrailerVehicleId: TRAILER_ID },
      })

      expect(stub.createCalls).toHaveLength(1)
    })

    test('refuses a default trailer that does not belong to the company', async () => {
      const stub = createVehicleRepositoryStub({ current: null })
      const useCase = createFleetVehiclesUseCase({ repository: stub.repository })

      const error = await useCase
        .create({
          context: FLEET_CONTEXT,
          correlationId: CORRELATION_ID,
          vehicle: { ...CREATE_VEHICLE_BODY, defaultTrailerVehicleId: TRAILER_ID },
        })
        .catch((thrown: unknown) => thrown)

      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(404)
      expect((error as ApiError).code).toBe('FLEET_VEHICLE_NOT_FOUND')
      expect(stub.createCalls).toEqual([])
    })

    test('refuses a default trailer that exists but is not an active trailer', async () => {
      const stub = createVehicleRepositoryStub({
        current: { ...ACTIVE_TRAILER, status: 'inactive' },
      })
      const useCase = createFleetVehiclesUseCase({ repository: stub.repository })

      const error = await useCase
        .create({
          context: FLEET_CONTEXT,
          correlationId: CORRELATION_ID,
          vehicle: { ...CREATE_VEHICLE_BODY, defaultTrailerVehicleId: TRAILER_ID },
        })
        .catch((thrown: unknown) => thrown)

      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(400)
      expect((error as ApiError).code).toBe('FLEET_VEHICLE_DEFAULT_TRAILER_NOT_A_TRAILER')
      expect(stub.createCalls).toEqual([])
    })
  })

  // Feature 147 T9: a carreta padrão de um cavalo, ou presa numa viagem aberta, não vira tração.
  describe('role change away from trailer', () => {
    test('refuses when the trailer is in use', async () => {
      const stub = createVehicleRepositoryStub({
        current: { ...VEHICLE, role: 'trailer' },
        trailerInUse: true,
      })
      const useCase = createFleetVehiclesUseCase({ repository: stub.repository })

      const error = await useCase
        .update({
          context: FLEET_CONTEXT,
          correlationId: CORRELATION_ID,
          expectedVersion: '1',
          status: 'active',
          vehicle: CREATE_VEHICLE_BODY,
          vehicleId: VEHICLE_ID,
        })
        .catch((thrown: unknown) => thrown)

      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).status).toBe(409)
      expect((error as ApiError).code).toBe('FLEET_VEHICLE_ROLE_CHANGE_BLOCKED')
      expect(stub.updateCalls).toEqual([])
    })

    test('allows the change when the trailer is not in use anywhere', async () => {
      const stub = createVehicleRepositoryStub({
        current: { ...VEHICLE, role: 'trailer' },
        trailerInUse: false,
      })
      const useCase = createFleetVehiclesUseCase({ repository: stub.repository })

      await useCase.update({
        context: FLEET_CONTEXT,
        correlationId: CORRELATION_ID,
        expectedVersion: '1',
        status: 'active',
        vehicle: CREATE_VEHICLE_BODY,
        vehicleId: VEHICLE_ID,
      })

      expect(stub.updateCalls).toHaveLength(1)
    })

    test('does not check trailer usage when the role does not change to traction', async () => {
      const stub = createVehicleRepositoryStub({
        current: ACTIVE_TRAILER,
        trailerInUse: true,
      })
      const useCase = createFleetVehiclesUseCase({ repository: stub.repository })

      await useCase.update({
        context: FLEET_CONTEXT,
        correlationId: CORRELATION_ID,
        expectedVersion: '1',
        status: 'active',
        vehicle: CREATE_TRAILER_BODY,
        vehicleId: TRAILER_ID,
      })

      expect(stub.updateCalls).toHaveLength(1)
    })
  })
})
