/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FleetDriverStatus } from '../../database/fleet.schema.js'
import {
  FleetDriverMembershipNotFoundError,
  FleetDriverNotFoundError,
  FleetDriverVersionConflictError,
} from '../domain/fleet.error.js'
import type {
  FleetCompanyContext,
  FleetDriver,
  FleetDriverFilters,
  FleetDriverInput,
  FleetDriverPage,
  FleetDriverRepositoryPort,
} from './fleet.port.js'

export type CreateFleetDriverInput = {
  readonly context: FleetCompanyContext
  readonly correlationId: string
  readonly driver: FleetDriverInput
}

export type ListFleetDriversInput = {
  readonly context: FleetCompanyContext
  readonly cursor: string | null
  readonly filters?: FleetDriverFilters
  readonly limit: number
}

export type UpdateFleetDriverInput = {
  readonly context: FleetCompanyContext
  readonly correlationId: string
  readonly driver: FleetDriverInput
  readonly driverId: string
  readonly expectedVersion: string
  readonly status: FleetDriverStatus
}

export type FleetDriversUseCase = {
  create(input: CreateFleetDriverInput): Promise<FleetDriver>
  list(input: ListFleetDriversInput): Promise<FleetDriverPage>
  update(input: UpdateFleetDriverInput): Promise<FleetDriver>
}

export function createFleetDriversUseCase(dependencies: {
  readonly repository: FleetDriverRepositoryPort
}): FleetDriversUseCase {
  const { repository } = dependencies

  async function assertMembership(input: {
    readonly companyId: string
    readonly membershipId: string | null
  }): Promise<void> {
    if (input.membershipId === null) return
    const belongs = await repository.hasMembership({
      companyId: input.companyId,
      membershipId: input.membershipId,
    })
    if (!belongs) throw new FleetDriverMembershipNotFoundError()
  }

  return {
    async create(input) {
      const companyId = input.context.companyId
      await assertMembership({ companyId, membershipId: input.driver.membershipId })
      return repository.create({ companyId, driver: input.driver })
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
      await assertMembership({ companyId, membershipId: input.driver.membershipId })
      const updated = await repository.update({
        companyId,
        driver: input.driver,
        driverId: input.driverId,
        expectedVersion: input.expectedVersion,
        status: input.status,
      })
      if (updated !== null) return updated

      const current = await repository.findById({ companyId, driverId: input.driverId })
      if (current === null) throw new FleetDriverNotFoundError()
      throw new FleetDriverVersionConflictError()
    },
  }
}
