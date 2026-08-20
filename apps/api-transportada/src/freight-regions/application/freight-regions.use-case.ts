/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { FreightRegionStatus } from '../../database/freight-region.schema.js'
import {
  FreightRegionNotFoundError,
  FreightRegionVersionConflictError,
} from '../domain/freight-region.error.js'
import type {
  FreightRegion,
  FreightRegionCompanyContext,
  FreightRegionFilters,
  FreightRegionInput,
  FreightRegionPage,
  FreightRegionRepositoryPort,
} from './freight-region.port.js'

export type CreateFreightRegionInput = {
  readonly context: FreightRegionCompanyContext
  readonly correlationId: string
  readonly region: FreightRegionInput
}

export type DeleteFreightRegionInput = {
  readonly context: FreightRegionCompanyContext
  readonly correlationId: string
  readonly regionId: string
}

export type ListFreightRegionsInput = {
  readonly context: FreightRegionCompanyContext
  readonly cursor: string | null
  readonly filters?: FreightRegionFilters
  readonly limit: number
}

export type UpdateFreightRegionInput = {
  readonly context: FreightRegionCompanyContext
  readonly correlationId: string
  readonly expectedVersion: string
  readonly region: FreightRegionInput
  readonly regionId: string
  readonly status: FreightRegionStatus
}

export type FreightRegionsUseCase = {
  create(input: CreateFreightRegionInput): Promise<FreightRegion>
  delete(input: DeleteFreightRegionInput): Promise<void>
  list(input: ListFreightRegionsInput): Promise<FreightRegionPage>
  update(input: UpdateFreightRegionInput): Promise<FreightRegion>
}

export function createFreightRegionsUseCase(dependencies: {
  readonly repository: FreightRegionRepositoryPort
}): FreightRegionsUseCase {
  const { repository } = dependencies

  return {
    async create(input) {
      return repository.create({ companyId: input.context.companyId, region: input.region })
    },

    async delete(input) {
      const removed = await repository.delete({
        companyId: input.context.companyId,
        regionId: input.regionId,
      })
      if (!removed) throw new FreightRegionNotFoundError()
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
        region: input.region,
        regionId: input.regionId,
        status: input.status,
      })
      if (updated !== null) return updated

      const current = await repository.findById({ companyId, regionId: input.regionId })
      if (current === null) throw new FreightRegionNotFoundError()
      throw new FreightRegionVersionConflictError()
    },
  }
}
