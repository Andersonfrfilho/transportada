/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { inArray, sql } from 'drizzle-orm'

import { geocodedAddresses } from '../../database/database.schema.js'
import type {
  GeocodedAddressRecord,
  GeocodedAddressRepository,
} from '../application/geocoding.port.js'

export type GeocodedAddressDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleGeocodedAddressRepository(
  database: GeocodedAddressDatabase,
): GeocodedAddressRepository {
  return {
    async findByKeys(addressKeys) {
      if (addressKeys.length === 0) return []

      const rows = await database
        .select({
          addressKey: geocodedAddresses.addressKey,
          externalPlaceId: geocodedAddresses.externalPlaceId,
          latitude: geocodedAddresses.latitude,
          longitude: geocodedAddresses.longitude,
          precision: geocodedAddresses.precision,
          source: geocodedAddresses.source,
        })
        .from(geocodedAddresses)
        .where(inArray(geocodedAddresses.addressKey, [...addressKeys]))

      return rows
    },

    /**
     * ADR-0044 §3: a correção manual **sempre vence**, e nenhuma geocodificação posterior a desfaz —
     * senão o pino que o conferente arrastou voltaria sozinho na próxima viagem.
     *
     * A regra vive no `where` do upsert, não num `select` seguido de `if`: entre ler e decidir cabe
     * outra escrita, e é exatamente aí que a correção seria perdida. O banco resolve isso numa
     * instrução.
     */
    async save(record) {
      await database
        .insert(geocodedAddresses)
        .values(toColumns(record))
        .onConflictDoUpdate({
          set: {
            externalPlaceId: sql`excluded.external_place_id`,
            geocodedAt: sql`now()`,
            latitude: sql`excluded.latitude`,
            longitude: sql`excluded.longitude`,
            precision: sql`excluded.precision`,
            source: sql`excluded.source`,
            updatedAt: sql`now()`,
          },
          target: geocodedAddresses.addressKey,
          where: sql`${geocodedAddresses.source} <> 'manual'`,
        })
    },
  }
}

function toColumns(record: GeocodedAddressRecord): typeof geocodedAddresses.$inferInsert {
  return {
    addressKey: record.addressKey,
    externalPlaceId: record.externalPlaceId,
    latitude: record.latitude,
    longitude: record.longitude,
    precision: record.precision,
    source: record.source,
  }
}
