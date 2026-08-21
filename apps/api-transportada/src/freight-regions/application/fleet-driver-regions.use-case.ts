/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { FleetDriverNotFoundError } from '../../fleet/domain/fleet.error.js'
import { FreightRegionUnknownError } from '../domain/freight-region.error.js'
import type {
  FleetDriverExistencePort,
  FleetDriverRegionCoverage,
  FleetDriverRegionEntry,
  FleetDriverRegionRepositoryPort,
  FreightRegionCompanyContext,
} from './freight-region.port.js'

export type ListFleetDriverRegionsInput = {
  readonly context: FreightRegionCompanyContext
  readonly driverId: string
}

export type ReplaceFleetDriverRegionsInput = {
  readonly context: FreightRegionCompanyContext
  readonly correlationId: string
  readonly driverId: string
  readonly entries: readonly FleetDriverRegionEntry[]
}

export type FleetDriverRegionsUseCase = {
  list(input: ListFleetDriverRegionsInput): Promise<readonly FleetDriverRegionCoverage[]>
  replace(input: ReplaceFleetDriverRegionsInput): Promise<readonly FleetDriverRegionCoverage[]>
}

export function createFleetDriverRegionsUseCase(dependencies: {
  readonly drivers: FleetDriverExistencePort
  readonly repository: FleetDriverRegionRepositoryPort
}): FleetDriverRegionsUseCase {
  const { drivers, repository } = dependencies

  async function assertDriver(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<void> {
    if (!(await drivers.exists(input))) throw new FleetDriverNotFoundError()
  }

  /**
   * A FK de rota devolveria `23503` — 500 genérico — para cobertura apontando para rota de outra
   * empresa. Perguntar antes transforma o vazamento de tenant em recusa explicada.
   */
  async function assertRegionsBelongToCompany(input: {
    readonly companyId: string
    readonly entries: readonly FleetDriverRegionEntry[]
  }): Promise<void> {
    const regionIds = [...new Set(input.entries.map((entry) => entry.regionId))]
    if (regionIds.length === 0) return
    const existing = await repository.listExistingRegionIds({
      companyId: input.companyId,
      regionIds,
    })
    if (existing.length !== regionIds.length) throw new FreightRegionUnknownError()
  }

  return {
    async list(input) {
      const companyId = input.context.companyId
      await assertDriver({ companyId, driverId: input.driverId })
      return repository.listByDriver({ companyId, driverId: input.driverId })
    },

    async replace(input) {
      const companyId = input.context.companyId
      await assertDriver({ companyId, driverId: input.driverId })
      await assertRegionsBelongToCompany({ companyId, entries: input.entries })
      return repository.replaceForDriver({
        companyId,
        driverId: input.driverId,
        entries: input.entries,
      })
    },
  }
}
