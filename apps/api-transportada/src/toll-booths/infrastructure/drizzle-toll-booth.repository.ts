/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { tollBooths } from '../../database/database.schema.js'
import type { TollBoothRepository, TollBoothSeedRecord } from '../application/toll-booth.port.js'

export type TollBoothDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleTollBoothRepository(database: TollBoothDatabase): TollBoothRepository {
  return {
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
