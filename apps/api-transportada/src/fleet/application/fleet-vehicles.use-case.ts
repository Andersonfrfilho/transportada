/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FleetVehicleStatus } from '../../database/fleet.schema.js'
import {
  FleetVehicleNotFoundError,
  FleetVehicleVersionConflictError,
} from '../domain/fleet.error.js'
import type {
  FleetCompanyContext,
  FleetVehicle,
  FleetVehicleFilters,
  FleetVehicleInput,
  FleetVehiclePage,
  FleetVehicleRepositoryPort,
} from './fleet.port.js'

export type CreateFleetVehicleInput = {
  readonly context: FleetCompanyContext
  readonly correlationId: string
  readonly vehicle: FleetVehicleInput
}

export type ListFleetVehiclesInput = {
  readonly context: FleetCompanyContext
  readonly cursor: string | null
  readonly filters?: FleetVehicleFilters
  readonly limit: number
}

export type UpdateFleetVehicleInput = {
  readonly context: FleetCompanyContext
  readonly correlationId: string
  readonly expectedVersion: string
  readonly status: FleetVehicleStatus
  readonly vehicle: FleetVehicleInput
  readonly vehicleId: string
}

export type FleetVehiclesUseCase = {
  create(input: CreateFleetVehicleInput): Promise<FleetVehicle>
  list(input: ListFleetVehiclesInput): Promise<FleetVehiclePage>
  update(input: UpdateFleetVehicleInput): Promise<FleetVehicle>
}

export function createFleetVehiclesUseCase(dependencies: {
  readonly repository: FleetVehicleRepositoryPort
}): FleetVehiclesUseCase {
  const { repository } = dependencies

  return {
    async create(input) {
      return repository.create({ companyId: input.context.companyId, vehicle: input.vehicle })
    },

    async list(input) {
      return repository.list({
        companyId: input.context.companyId,
        cursor: input.cursor,
        limit: input.limit,
        ...(input.filters === undefined ? {} : { filters: input.filters }),
      })
    },

    async update(input) {
      const companyId = input.context.companyId
      const updated = await repository.update({
        companyId,
        expectedVersion: input.expectedVersion,
        status: input.status,
        vehicle: input.vehicle,
        vehicleId: input.vehicleId,
      })
      if (updated !== null) return updated

      const current = await repository.findById({ companyId, vehicleId: input.vehicleId })
      if (current === null) throw new FleetVehicleNotFoundError()
      throw new FleetVehicleVersionConflictError()
    },
  }
}
