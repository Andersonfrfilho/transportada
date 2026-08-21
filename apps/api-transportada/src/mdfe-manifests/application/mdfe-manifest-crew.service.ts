/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { toDisplayPersonName } from '../../shared/person-name.service.js'
import {
  MdfeManifestDriverDuplicatedError,
  MdfeManifestDriverNotAvailableError,
  MdfeManifestDriverNotFoundError,
  MdfeManifestVehicleNotAvailableError,
  MdfeManifestVehicleNotFoundError,
} from '../domain/mdfe-manifest.error.js'
import type {
  MdfeManifestDriverLine,
  MdfeManifestRepositoryPort,
  MdfeManifestVehicle,
} from './mdfe-manifest.port.js'

export async function resolveManifestVehicle(input: {
  readonly companyId: string
  readonly repository: MdfeManifestRepositoryPort
  readonly vehicleId: string
}): Promise<MdfeManifestVehicle> {
  const vehicle = await input.repository.findVehicle({
    companyId: input.companyId,
    vehicleId: input.vehicleId,
  })
  if (vehicle === null) throw new MdfeManifestVehicleNotFoundError()
  if (vehicle.role !== 'traction' || vehicle.status !== 'active') {
    throw new MdfeManifestVehicleNotAvailableError()
  }
  return vehicle
}

/** A ordem pedida vira a posição do condutor no manifesto — o primeiro é o motorista principal. */
export async function resolveManifestCrew(input: {
  readonly companyId: string
  readonly driverIds: readonly string[]
  readonly repository: MdfeManifestRepositoryPort
}): Promise<readonly MdfeManifestDriverLine[]> {
  if (new Set(input.driverIds).size !== input.driverIds.length) {
    throw new MdfeManifestDriverDuplicatedError()
  }

  const drivers = await input.repository.listDrivers({
    companyId: input.companyId,
    driverIds: input.driverIds,
  })
  const driverById = new Map(drivers.map((driver) => [driver.id, driver]))

  return input.driverIds.map((driverId, index) => {
    const driver = driverById.get(driverId)
    if (driver === undefined) throw new MdfeManifestDriverNotFoundError()
    if (driver.status !== 'active') throw new MdfeManifestDriverNotAvailableError()
    return {
      driverId,
      // O condutor entra no MDF-e com a grafia do nome: a forma canônica é do banco, não do XML
      driverName: toDisplayPersonName(driver.name),
      driverTaxId: driver.taxId,
      position: index + 1,
    }
  })
}
