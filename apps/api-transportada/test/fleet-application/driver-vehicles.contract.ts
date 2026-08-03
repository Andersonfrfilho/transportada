/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createFleetDriverVehiclesUseCase } from '../../src/fleet/application/fleet-driver-vehicles.use-case.js'
import { ApiError } from '../../src/shared/api.error.js'
import {
  createDriverRepositoryStub,
  createDriverVehicleRepositoryStub,
  FLEET_CONTEXT,
} from '../fixtures/fleet-application.fixture'
import {
  DRIVER,
  DRIVER_ID,
  DRIVER_OWNED_VEHICLE_ID,
  LINKED_COMPANY_TAX_ID,
  VEHICLE_ID,
} from '../fixtures/fleet-http-payload.fixture'

const CORRELATION_ID = 'fleet-driver-vehicles-application'
const OTHER_COMPANY_VEHICLE_ID = '00000000-0000-4000-8000-000000000999'
const AUTONOMOUS_DRIVER = { ...DRIVER, linkedTaxId: LINKED_COMPANY_TAX_ID }

function createUseCase(
  input: Readonly<{
    drivers?: ReturnType<typeof createDriverRepositoryStub>
    links?: ReturnType<typeof createDriverVehicleRepositoryStub>
  }> = {},
) {
  const drivers = input.drivers ?? createDriverRepositoryStub({ current: AUTONOMOUS_DRIVER })
  const links = input.links ?? createDriverVehicleRepositoryStub()
  return {
    drivers,
    links,
    useCase: createFleetDriverVehiclesUseCase({
      driverRepository: drivers.repository,
      repository: links.repository,
    }),
  }
}

describe('fleet driver vehicles use case contract', () => {
  // O CNPJ vinculado é o do próprio motorista — veículo dele não é veículo da transportadora
  test('separates the driver own vehicle from the carrier vehicle', async () => {
    const { useCase } = createUseCase()

    const links = await useCase.list({ context: FLEET_CONTEXT, driverId: DRIVER_ID })

    expect(links.map((link) => [link.vehicle.id, link.ownedByDriver])).toEqual([
      [VEHICLE_ID, false],
      [DRIVER_OWNED_VEHICLE_ID, true],
    ])
  })

  test('reads the links inside the company of the authenticated context', async () => {
    const { links, useCase } = createUseCase()

    await useCase.list({ context: FLEET_CONTEXT, driverId: DRIVER_ID })

    expect(links.listCalls).toEqual([{ companyId: FLEET_CONTEXT.companyId, driverId: DRIVER_ID }])
  })

  test('refuses to list the vehicles of a driver that is not in the company', async () => {
    const { useCase } = createUseCase({ drivers: createDriverRepositoryStub({ current: null }) })

    const failure = await useCase
      .list({ context: FLEET_CONTEXT, driverId: DRIVER_ID })
      .catch((error: unknown) => error)

    expect((failure as ApiError).code).toBe('FLEET_DRIVER_NOT_FOUND')
    expect((failure as ApiError).status).toBe(404)
  })

  test('replaces the whole set of vehicles of the driver', async () => {
    const { links, useCase } = createUseCase()

    await useCase.replace({
      context: FLEET_CONTEXT,
      correlationId: CORRELATION_ID,
      driverId: DRIVER_ID,
      vehicleIds: [VEHICLE_ID, DRIVER_OWNED_VEHICLE_ID],
    })

    expect(links.replaceCalls).toEqual([
      {
        companyId: FLEET_CONTEXT.companyId,
        driverId: DRIVER_ID,
        vehicleIds: [VEHICLE_ID, DRIVER_OWNED_VEHICLE_ID],
      },
    ])
  })

  // Placa de outra empresa não entra por id no corpo da requisição
  test('refuses a vehicle that does not belong to the company', async () => {
    const { links, useCase } = createUseCase({
      links: createDriverVehicleRepositoryStub({ existingVehicleIds: [VEHICLE_ID] }),
    })

    const failure = await useCase
      .replace({
        context: FLEET_CONTEXT,
        correlationId: CORRELATION_ID,
        driverId: DRIVER_ID,
        vehicleIds: [VEHICLE_ID, OTHER_COMPANY_VEHICLE_ID],
      })
      .catch((error: unknown) => error)

    expect((failure as ApiError).code).toBe('FLEET_VEHICLE_NOT_FOUND')
    expect((failure as ApiError).status).toBe(404)
    expect(links.replaceCalls).toEqual([])
    expect(links.vehicleLookupCalls).toEqual([
      {
        companyId: FLEET_CONTEXT.companyId,
        vehicleIds: [VEHICLE_ID, OTHER_COMPANY_VEHICLE_ID],
      },
    ])
  })

  test('refuses to replace the vehicles of a driver that is not in the company', async () => {
    const { links, useCase } = createUseCase({
      drivers: createDriverRepositoryStub({ current: null }),
    })

    const failure = await useCase
      .replace({
        context: FLEET_CONTEXT,
        correlationId: CORRELATION_ID,
        driverId: DRIVER_ID,
        vehicleIds: [VEHICLE_ID],
      })
      .catch((error: unknown) => error)

    expect((failure as ApiError).code).toBe('FLEET_DRIVER_NOT_FOUND')
    expect(links.replaceCalls).toEqual([])
  })

  // Sem veículo nenhum é um estado válido: o motorista foi desligado do conjunto
  test('accepts an empty set without looking up vehicles', async () => {
    const { links, useCase } = createUseCase()

    await useCase.replace({
      context: FLEET_CONTEXT,
      correlationId: CORRELATION_ID,
      driverId: DRIVER_ID,
      vehicleIds: [],
    })

    expect(links.vehicleLookupCalls).toEqual([])
    expect(links.replaceCalls).toEqual([
      { companyId: FLEET_CONTEXT.companyId, driverId: DRIVER_ID, vehicleIds: [] },
    ])
  })

  // Sem CNPJ vinculado, o veículo da empresa do autônomo deixa de ser dele
  test('does not claim ownership when the driver has no linked company', async () => {
    const { useCase } = createUseCase({
      drivers: createDriverRepositoryStub({ current: { ...DRIVER, linkedTaxId: '' } }),
    })

    const links = await useCase.list({ context: FLEET_CONTEXT, driverId: DRIVER_ID })

    expect(links.every((link) => !link.ownedByDriver)).toBeTrue()
  })
})
