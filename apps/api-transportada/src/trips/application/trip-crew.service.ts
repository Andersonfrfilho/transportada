/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { TripDriverDuplicatedError } from '../domain/trip.error.js'
import { resolveTripCrew, resolveTripVehicle, type TripDriverLine } from '../domain/trip.policy.js'
import type { TripRepositoryPort } from './trip.port.js'
import type { TripVehicleCandidate } from '../domain/trip.policy.js'

/**
 * Spec 216: sem `vehicleId`, a viagem nasce `awaiting_crew` — a ausência é o próprio resultado,
 * e nem chega a consultar o repositório. `vehicleId` presente e não encontrado continua erro
 * (`resolveTripVehicle` lança); só a ausência do campo é "sem veículo ainda".
 */
export async function resolveTripVehicleForCreation(input: {
  readonly companyId: string
  readonly repository: TripRepositoryPort
  readonly vehicleId: string | undefined
}): Promise<TripVehicleCandidate | null> {
  if (input.vehicleId === undefined) return null

  const vehicle = await input.repository.findVehicle({
    companyId: input.companyId,
    vehicleId: input.vehicleId,
  })
  return resolveTripVehicle({ vehicle })
}

export async function resolveTripCrewForCreation(input: {
  readonly companyId: string
  readonly driverIds: readonly string[]
  readonly repository: TripRepositoryPort
}): Promise<readonly TripDriverLine[]> {
  if (new Set(input.driverIds).size !== input.driverIds.length) {
    throw new TripDriverDuplicatedError()
  }

  const drivers = await input.repository.listDrivers({
    companyId: input.companyId,
    driverIds: input.driverIds,
  })
  return resolveTripCrew({ driverIds: input.driverIds, drivers })
}
