/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { inArray } from 'drizzle-orm'

import { geocodedAddresses } from '../../database/routing.schema.js'
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

      return database
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
    },

    /**
     * `onConflictDoNothing`, e **não** o upsert da API — a diferença é o que cada lado quer dizer.
     *
     * A cascata só grava o que estava **ausente** da base: ela lê o que existe, separa o que falta e
     * resolve só isso. Conflito aqui é sempre corrida — duas sugestões pedindo o mesmo endereço novo
     * ao mesmo tempo —, e nessa corrida quem já escreveu está tão certo quanto quem chegou depois.
     *
     * Sobrescrever seria pior que inútil: se uma das duas caiu para o centroide de município porque
     * o CEP falhou só para ela, a escrita tardia **rebaixaria** a coordenada boa, e o endereço
     * ficaria em `city` para sempre — a cascata nunca mais o reconsulta, justamente porque agora ele
     * está em base. Degradação que gruda.
     *
     * Melhorar coordenada existente é o degrau 2 (a marca), na API, onde `shouldReplaceStored`
     * decide. Aqui não há decisão de precisão a tomar, e por isso a ordenação não precisa existir
     * deste lado (adendo 2026-09-01 da ADR-0044).
     */
    async save(record) {
      await database
        .insert(geocodedAddresses)
        .values(toColumns(record))
        .onConflictDoNothing({ target: geocodedAddresses.addressKey })
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
