/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { isVehicleOwnedByDriver } from '../domain/driver-vehicle-ownership.policy.js'
import { FleetDriverNotFoundError, FleetVehicleNotFoundError } from '../domain/fleet.error.js'
import type {
  FleetCompanyContext,
  FleetDriver,
  FleetDriverRepositoryPort,
  FleetDriverVehicleAssignment,
  FleetDriverVehicleLink,
  FleetDriverVehiclePair,
  FleetDriverVehicleRepositoryPort,
} from './fleet.port.js'

export type ListFleetDriverVehiclesInput = {
  readonly context: FleetCompanyContext
  readonly driverId: string
}

export type ListFleetDriverVehiclePairsInput = {
  readonly context: FleetCompanyContext
}

export type ReplaceFleetDriverVehiclesInput = {
  readonly context: FleetCompanyContext
  readonly correlationId: string
  readonly driverId: string
  readonly vehicleIds: readonly string[]
}

export type FleetDriverVehiclesUseCase = {
  list(input: ListFleetDriverVehiclesInput): Promise<readonly FleetDriverVehicleAssignment[]>
  /**
   * Spec 081: o vínculo da empresa inteiro. Não decora nada — quem pergunta quer só saber quem está
   * amarrado a quem, e a ficha do motorista e a do veículo já vêm das listagens de frota.
   */
  listPairs(input: ListFleetDriverVehiclePairsInput): Promise<readonly FleetDriverVehiclePair[]>
  replace(input: ReplaceFleetDriverVehiclesInput): Promise<readonly FleetDriverVehicleAssignment[]>
}

export function createFleetDriverVehiclesUseCase(dependencies: {
  readonly driverRepository: FleetDriverRepositoryPort
  readonly repository: FleetDriverVehicleRepositoryPort
}): FleetDriverVehiclesUseCase {
  const { driverRepository, repository } = dependencies

  async function loadDriver(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<FleetDriver> {
    const driver = await driverRepository.findById(input)
    if (driver === null) throw new FleetDriverNotFoundError()
    return driver
  }

  function decorate(input: {
    readonly driver: FleetDriver
    readonly links: readonly FleetDriverVehicleLink[]
  }): readonly FleetDriverVehicleAssignment[] {
    return input.links.map((link) => ({
      ...link,
      ownedByDriver: isVehicleOwnedByDriver({ driver: input.driver, vehicle: link.vehicle }),
    }))
  }

  async function assertVehiclesBelongToCompany(input: {
    readonly companyId: string
    readonly vehicleIds: readonly string[]
  }): Promise<void> {
    if (input.vehicleIds.length === 0) return
    const existing = await repository.listExistingVehicleIds(input)
    if (existing.length !== input.vehicleIds.length) throw new FleetVehicleNotFoundError()
  }

  return {
    async list(input) {
      const companyId = input.context.companyId
      const driver = await loadDriver({ companyId, driverId: input.driverId })
      const links = await repository.listByDriver({ companyId, driverId: input.driverId })
      return decorate({ driver, links })
    },

    async listPairs(input) {
      return repository.listCompanyPairs({ companyId: input.context.companyId })
    },

    async replace(input) {
      const companyId = input.context.companyId
      const driver = await loadDriver({ companyId, driverId: input.driverId })
      await assertVehiclesBelongToCompany({ companyId, vehicleIds: input.vehicleIds })
      const links = await repository.replaceForDriver({
        companyId,
        driverId: input.driverId,
        vehicleIds: input.vehicleIds,
      })
      return decorate({ driver, links })
    },
  }
}
