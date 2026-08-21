/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray } from 'drizzle-orm'

import { fleetDriverRegions, freightRegions } from '../../database/database.schema.js'
import type {
  FleetDriverRegionCoverage,
  FleetDriverRegionEntry,
  FleetDriverRegionRepositoryPort,
} from '../application/freight-region.port.js'
import { mapCoverage, toCoverageColumns } from './freight-region.mapper.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleFleetDriverRegionRepository implements FleetDriverRegionRepositoryPort {
  public constructor(private readonly database: Database) {}

  /**
   * Zona inteira e cidade solta na mesma consulta, com o código e o nome da rota já juntos: a tela
   * pergunta "onde este motorista roda" uma vez só, e duas listagens dariam duas verdades.
   */
  public async listByDriver(input: {
    readonly companyId: string
    readonly driverId: string
  }): Promise<readonly FleetDriverRegionCoverage[]> {
    const records = await this.database
      .select({ coverage: fleetDriverRegions, region: freightRegions })
      .from(fleetDriverRegions)
      .innerJoin(
        freightRegions,
        and(
          eq(freightRegions.id, fleetDriverRegions.regionId),
          eq(freightRegions.companyId, fleetDriverRegions.companyId),
        ),
      )
      .where(
        and(
          eq(fleetDriverRegions.companyId, input.companyId),
          eq(fleetDriverRegions.driverId, input.driverId),
        ),
      )
      .orderBy(asc(freightRegions.code), asc(fleetDriverRegions.city))

    return records.map(({ coverage, region }) =>
      mapCoverage({ code: region.code, name: region.name, record: coverage, zone: region.zone }),
    )
  }

  public async listExistingRegionIds(input: {
    readonly companyId: string
    readonly regionIds: readonly string[]
  }): Promise<readonly string[]> {
    if (input.regionIds.length === 0) return []
    const records = await this.database
      .select({ id: freightRegions.id })
      .from(freightRegions)
      .where(
        and(
          eq(freightRegions.companyId, input.companyId),
          inArray(freightRegions.id, [...input.regionIds]),
        ),
      )
    return records.map((record) => record.id)
  }

  public async replaceForDriver(input: {
    readonly companyId: string
    readonly driverId: string
    readonly entries: readonly FleetDriverRegionEntry[]
  }): Promise<readonly FleetDriverRegionCoverage[]> {
    await this.database.transaction(async (transaction) => {
      await transaction
        .delete(fleetDriverRegions)
        .where(
          and(
            eq(fleetDriverRegions.companyId, input.companyId),
            eq(fleetDriverRegions.driverId, input.driverId),
          ),
        )
      if (input.entries.length === 0) return
      await transaction.insert(fleetDriverRegions).values(
        input.entries.map((entry) => ({
          ...toCoverageColumns(entry),
          companyId: input.companyId,
          driverId: input.driverId,
        })),
      )
    })

    return this.listByDriver({ companyId: input.companyId, driverId: input.driverId })
  }
}
