/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq, sql } from 'drizzle-orm'

import { municipalityCentroids } from '../../database/database.schema.js'
import type {
  MunicipalityCentroid,
  MunicipalityCentroidRepository,
} from '../application/municipality-centroid.port.js'

export type MunicipalityCentroidDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleMunicipalityCentroidRepository(
  database: MunicipalityCentroidDatabase,
): MunicipalityCentroidRepository {
  return {
    async findByCityCode(cityCode) {
      const [row] = await database
        .select({
          cityCode: municipalityCentroids.cityCode,
          latitude: municipalityCentroids.latitude,
          longitude: municipalityCentroids.longitude,
          state: municipalityCentroids.state,
        })
        .from(municipalityCentroids)
        .where(eq(municipalityCentroids.cityCode, cityCode))
        .limit(1)

      return row ?? null
    },
    async saveMany(centroids) {
      if (centroids.length === 0) return 0

      await database
        .insert(municipalityCentroids)
        .values(centroids.map(toColumns))
        .onConflictDoUpdate({
          set: {
            latitude: sql`excluded.latitude`,
            longitude: sql`excluded.longitude`,
            state: sql`excluded.state`,
            updatedAt: sql`now()`,
          },
          target: municipalityCentroids.cityCode,
        })

      return centroids.length
    },
  }
}

function toColumns(centroid: MunicipalityCentroid): typeof municipalityCentroids.$inferInsert {
  return {
    cityCode: centroid.cityCode,
    latitude: centroid.latitude,
    longitude: centroid.longitude,
    state: centroid.state,
  }
}
