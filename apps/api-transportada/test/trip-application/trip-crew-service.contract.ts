/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { resolveTripVehicleForCreation } from '../../src/trips/application/trip-crew.service.js'
import type { TripRepositoryPort } from '../../src/trips/application/trip.port.js'
import { TripVehicleNotFoundError } from '../../src/trips/domain/trip.error.js'
import type { TripVehicleCandidate } from '../../src/trips/domain/trip.policy.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const VEHICLE_ID = '44444444-4444-4444-8444-444444444441'
const VEHICLE: TripVehicleCandidate = { id: VEHICLE_ID, role: 'traction', status: 'active' }

function repositoryFindingVehicle(vehicle: TripVehicleCandidate | null): TripRepositoryPort {
  return {
    findVehicle: async () => vehicle,
  } as unknown as TripRepositoryPort
}

describe('resolveTripVehicleForCreation', () => {
  /**
   * Spec 216: a viagem pode nascer sem veículo (`awaiting_crew`) — sem `vehicleId`, a ausência é
   * o próprio resultado, e o repositório nem chega a ser consultado.
   */
  test('sem vehicleId, devolve null sem consultar o repositório', async () => {
    let findVehicleCalls = 0
    const repository = {
      findVehicle: async () => {
        findVehicleCalls += 1
        return VEHICLE
      },
    } as unknown as TripRepositoryPort

    const vehicle = await resolveTripVehicleForCreation({
      companyId: COMPANY_ID,
      repository,
      vehicleId: undefined,
    })

    expect(vehicle).toBeNull()
    expect(findVehicleCalls).toBe(0)
  })

  test('com vehicleId presente e encontrado, devolve o veículo', async () => {
    const vehicle = await resolveTripVehicleForCreation({
      companyId: COMPANY_ID,
      repository: repositoryFindingVehicle(VEHICLE),
      vehicleId: VEHICLE_ID,
    })

    expect(vehicle).toEqual(VEHICLE)
  })

  /** vehicleId informado e não encontrado continua erro — só a ausência do campo é "sem veículo". */
  test('com vehicleId presente e não encontrado, continua lançando', async () => {
    await expect(
      resolveTripVehicleForCreation({
        companyId: COMPANY_ID,
        repository: repositoryFindingVehicle(null),
        vehicleId: VEHICLE_ID,
      }),
    ).rejects.toThrow(TripVehicleNotFoundError)
  })
})
