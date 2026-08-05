/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FleetDriverStatus, FleetVehicleRole, FleetVehicleStatus } from '../../database/fleet.schema.js'
import {
  TripDocumentReferenceInvalidError,
  TripDriverDuplicatedError,
  TripDriverNotAvailableError,
  TripDriverNotFoundError,
  TripVehicleNotAvailableError,
  TripVehicleNotFoundError,
} from './trip.error.js'

export type TripVehicleCandidate = {
  readonly id: string
  readonly role: FleetVehicleRole
  readonly status: FleetVehicleStatus
}

export type TripDriverCandidate = {
  readonly id: string
  readonly name: string
  readonly status: FleetDriverStatus
  readonly taxId: string
}

export type TripDriverLine = {
  readonly driverId: string
  readonly driverName: string
  readonly driverTaxId: string
  readonly position: number
}

/**
 * Regra pura (ADR-0023): extraída de `resolveManifestVehicle` (mdfe-manifest-crew.service.ts) —
 * a viagem exige o mesmo veículo de tração ativo que o manifesto exigia. A busca do veículo é
 * responsabilidade da camada de aplicação (T006); esta função só decide.
 */
export function resolveTripVehicle(input: {
  readonly vehicle: TripVehicleCandidate | null
}): TripVehicleCandidate {
  const { vehicle } = input
  if (vehicle === null) throw new TripVehicleNotFoundError()
  if (vehicle.role !== 'traction' || vehicle.status !== 'active') {
    throw new TripVehicleNotAvailableError()
  }
  return vehicle
}

/**
 * Regra pura (ADR-0023): extraída de `resolveManifestCrew` (mdfe-manifest-crew.service.ts) — a
 * ordem pedida vira a posição do condutor na viagem, o primeiro é o motorista principal. A busca
 * dos condutores é responsabilidade da camada de aplicação (T006); esta função só decide.
 */
export function resolveTripCrew(input: {
  readonly driverIds: readonly string[]
  readonly drivers: readonly TripDriverCandidate[]
}): readonly TripDriverLine[] {
  const { driverIds, drivers } = input
  if (new Set(driverIds).size !== driverIds.length) {
    throw new TripDriverDuplicatedError()
  }

  const driverById = new Map(drivers.map((driver) => [driver.id, driver]))

  return driverIds.map((driverId, index) => {
    const driver = driverById.get(driverId)
    if (driver === undefined) throw new TripDriverNotFoundError()
    if (driver.status !== 'active') throw new TripDriverNotAvailableError()
    return {
      driverId,
      driverName: driver.name,
      driverTaxId: driver.taxId,
      position: index + 1,
    }
  })
}

/**
 * Espelha `trip_documents_entity_xor_check` do banco (defesa em profundidade, ADR-0023 §2): a
 * viagem vincula a nota crua ou o frete já calculado sobre ela, nunca os dois nem nenhum.
 */
export function assertTripDocumentReference(input: {
  readonly freightCalculationId: string | null
  readonly nfeDocumentId: string | null
}): void {
  const hasNfeDocument = input.nfeDocumentId !== null
  const hasFreightCalculation = input.freightCalculationId !== null
  if (hasNfeDocument === hasFreightCalculation) {
    throw new TripDocumentReferenceInvalidError()
  }
}
