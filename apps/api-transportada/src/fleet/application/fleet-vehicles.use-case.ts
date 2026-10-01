/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FleetVehicleRole, FleetVehicleStatus } from '../../database/fleet.schema.js'
import {
  FleetVehicleDefaultTrailerNotATrailerError,
  FleetVehicleNotFoundError,
  FleetVehicleRoleChangeBlockedError,
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

const ACTIVE_TRAILER_ROLE: FleetVehicleRole = 'trailer'
const ACTIVE_TRAILER_STATUS: FleetVehicleStatus = 'active'
const TRACTION_ROLE: FleetVehicleRole = 'traction'

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
      const companyId = input.context.companyId
      await assertDefaultTrailer({ companyId, repository, vehicle: input.vehicle })
      return repository.create({ companyId, vehicle: input.vehicle })
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
      await assertDefaultTrailer({ companyId, repository, vehicle: input.vehicle })
      await assertRoleChangeAllowed({
        companyId,
        nextRole: input.vehicle.role,
        repository,
        vehicleId: input.vehicleId,
      })
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

/** Feature 147 D3: quem aponta existir na empresa e ser carreta ativa exige consulta ao banco. */
async function assertDefaultTrailer(input: {
  readonly companyId: string
  readonly repository: FleetVehicleRepositoryPort
  readonly vehicle: FleetVehicleInput
}): Promise<void> {
  const { defaultTrailerVehicleId } = input.vehicle
  if (defaultTrailerVehicleId === null) return

  const trailer = await input.repository.findById({
    companyId: input.companyId,
    vehicleId: defaultTrailerVehicleId,
  })
  if (trailer === null) throw new FleetVehicleNotFoundError()
  if (trailer.role !== ACTIVE_TRAILER_ROLE || trailer.status !== ACTIVE_TRAILER_STATUS) {
    throw new FleetVehicleDefaultTrailerNotATrailerError()
  }
}

/**
 * Feature 147 D3: uma carreta que é padrão de algum cavalo, ou que puxa uma viagem aberta, não
 * pode virar tração — o vínculo ficaria pendurado num veículo que deixou de ser carreta.
 */
async function assertRoleChangeAllowed(input: {
  readonly companyId: string
  readonly nextRole: FleetVehicleRole
  readonly repository: FleetVehicleRepositoryPort
  readonly vehicleId: string
}): Promise<void> {
  if (input.nextRole !== TRACTION_ROLE) return

  const current = await input.repository.findById({
    companyId: input.companyId,
    vehicleId: input.vehicleId,
  })
  if (current === null || current.role !== ACTIVE_TRAILER_ROLE) return

  const inUse = await input.repository.isTrailerInUse({
    companyId: input.companyId,
    vehicleId: input.vehicleId,
  })
  if (inUse) throw new FleetVehicleRoleChangeBlockedError()
}
