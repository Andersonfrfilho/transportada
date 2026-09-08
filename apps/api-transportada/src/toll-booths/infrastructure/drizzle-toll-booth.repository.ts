/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { inArray, sql } from 'drizzle-orm'

import { tollBooths } from '../../database/database.schema.js'
import type {
  TollBoothRepository,
  TollBoothRouteRecord,
  TollBoothSeedRecord,
} from '../application/toll-booth.port.js'

export type TollBoothDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleTollBoothRepository(database: TollBoothDatabase): TollBoothRepository {
  return {
    /**
     * Spec 090 T7: **filtra por id de nó, nunca lê a tabela inteira.** `nodeIds` pode trazer
     * repetição (a mesma rotatória volta a passar pelo mesmo nó) — o `IN` do Postgres já deduplica
     * a resposta, e é `resolveTollRouteCost` quem decide, por nó, se a praça foi cobrada.
     */
    async readByNodeIds(nodeIds): Promise<readonly TollBoothRouteRecord[]> {
      if (nodeIds.length === 0) return []

      const rows = await database
        .select({
          chargeCar: tollBooths.chargeCar,
          chargePerAxle: tollBooths.chargePerAxle,
          chargePerAxleAutomatic: tollBooths.chargePerAxleAutomatic,
          latitude: tollBooths.latitude,
          longitude: tollBooths.longitude,
          name: tollBooths.name,
          observedOn: tollBooths.observedOn,
          operator: tollBooths.operator,
          osmNodeId: tollBooths.osmNodeId,
        })
        .from(tollBooths)
        .where(inArray(tollBooths.osmNodeId, nodeIds.map(BigInt)))

      return rows.map((row) => ({
        chargeCar: row.chargeCar,
        chargePerAxle: row.chargePerAxle,
        chargePerAxleAutomatic: row.chargePerAxleAutomatic,
        latitude: row.latitude,
        longitude: row.longitude,
        name: row.name,
        observedOn: row.observedOn,
        operator: row.operator,
        osmNodeId: Number(row.osmNodeId),
      }))
    },
    async saveMany(booths) {
      if (booths.length === 0) return 0

      await database
        .insert(tollBooths)
        .values(booths.map(toColumns))
        .onConflictDoUpdate({
          set: {
            chargeCar: sql`excluded.charge_car`,
            chargePerAxle: sql`excluded.charge_per_axle`,
            latitude: sql`excluded.latitude`,
            longitude: sql`excluded.longitude`,
            name: sql`excluded.name`,
            observedOn: sql`excluded.observed_on`,
            operator: sql`excluded.operator`,
            updatedAt: sql`now()`,
          },
          target: tollBooths.osmNodeId,
        })

      return booths.length
    },
  }
}

function toColumns(booth: TollBoothSeedRecord): typeof tollBooths.$inferInsert {
  return {
    chargeCar: booth.chargeCar,
    chargePerAxle: booth.chargePerAxle,
    latitude: booth.latitude,
    longitude: booth.longitude,
    name: booth.name,
    observedOn: booth.observedOn,
    operator: booth.operator,
    osmNodeId: booth.osmNodeId,
  }
}
