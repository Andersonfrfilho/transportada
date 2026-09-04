/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'

import {
  addressComparisons,
  geocodedAddresses,
  nfeAddresses,
  nfeParticipants,
} from '../../database/database.schema.js'
import { destinationRolesFilter } from '../../nfe-documents/infrastructure/physical-destination.join.js'
import { buildStopAddressKey } from '../../trips/domain/stop-address-key.js'
import type {
  AddressComparisonRepository,
  CityDirectoryPort,
  ComparisonCandidate,
} from '../application/address-comparison.port.js'
import { normalizeCityName } from '../domain/city-match.policy.js'

export type AddressComparisonDatabase = ReturnType<typeof createDrizzleProvider>['db']

/**
 * O lote de medição contra o banco (spec 084, G6 / **ADR-0061**).
 *
 * ⚠️ **A chave de endereço se monta em TypeScript, nunca em SQL.** Reproduzir `normalizePostalCode`
 * e `normalizeAddressNumber` como expressão do Postgres criaria uma segunda definição de "mesmo
 * lugar", livre para divergir da que agrupa as paradas — e paradas e medições passariam a discordar
 * de quais endereços são o mesmo. É o mesmo motivo pelo qual a spec 073 escolhe em memória.
 */
export function createDrizzleAddressComparisonRepository(
  database: AddressComparisonDatabase,
): AddressComparisonRepository {
  return {
    async findCandidates(input) {
      const rows = await database
        .selectDistinct({
          city: nfeAddresses.city,
          cityCode: nfeAddresses.cityCode,
          district: nfeAddresses.district,
          number: nfeAddresses.number,
          postalCode: nfeAddresses.postalCode,
          state: nfeAddresses.state,
          street: nfeAddresses.street,
        })
        .from(nfeAddresses)
        .innerJoin(
          nfeParticipants,
          and(
            eq(nfeParticipants.id, nfeAddresses.participantId),
            eq(nfeParticipants.companyId, nfeAddresses.companyId),
          ),
        )
        .where(
          and(
            eq(nfeAddresses.companyId, input.companyId),
            destinationRolesFilter(nfeParticipants.role),
            isNotNull(nfeAddresses.postalCode),
          ),
        )

      /** Uma linha por endereço distinto: a mesma loja recebe cem vezes por ano. */
      const byKey = new Map<string, (typeof rows)[number]>()
      for (const row of rows) {
        const key = buildStopAddressKey(row)
        if (key !== null && !byKey.has(key)) byKey.set(key, row)
      }
      if (byKey.size === 0) return []

      const keys = [...byKey.keys()]

      const [coordinates, measured] = await Promise.all([
        database
          .select({
            addressKey: geocodedAddresses.addressKey,
            latitude: geocodedAddresses.latitude,
            longitude: geocodedAddresses.longitude,
            precision: geocodedAddresses.precision,
            source: geocodedAddresses.source,
          })
          .from(geocodedAddresses)
          .where(
            and(
              inArray(geocodedAddresses.addressKey, keys),
              inArray(geocodedAddresses.precision, [...input.precisions]),
            ),
          ),
        /** Endereço já medido não se mede de novo: o lote é pago, e repetir é pagar duas vezes. */
        database
          .selectDistinct({ addressKey: addressComparisons.addressKey })
          .from(addressComparisons)
          .where(
            and(
              eq(addressComparisons.companyId, input.companyId),
              inArray(addressComparisons.addressKey, keys),
            ),
          ),
      ])

      const already = new Set(measured.map((row) => row.addressKey))
      const candidates: ComparisonCandidate[] = []

      for (const coordinate of coordinates) {
        if (candidates.length >= input.limit) break
        if (already.has(coordinate.addressKey)) continue

        const row = byKey.get(coordinate.addressKey)
        if (row === undefined) continue

        candidates.push({
          addressKey: coordinate.addressKey,
          city: row.city ?? '',
          cityCode: row.cityCode ?? '',
          companyId: input.companyId,
          district: row.district ?? '',
          latitude: coordinate.latitude,
          longitude: coordinate.longitude,
          number: row.number ?? '',
          postalCode: row.postalCode ?? '',
          precision: coordinate.precision,
          source: coordinate.source,
          state: row.state ?? '',
          street: row.street ?? '',
        })
      }

      return candidates
    },

    async saveComparison(record) {
      await database.insert(addressComparisons).values({
        addressKey: record.addressKey,
        cityMismatch: record.cityMismatch,
        companyId: record.companyId,
        distanceMetres: record.distanceMetres === null ? null : record.distanceMetres.toFixed(2),
        districtDiverges: record.districtDiverges,
        matchLevel: record.matchLevel,
        noteDistrict: record.noteDistrict,
        noteNumber: record.noteNumber,
        notePostalCode: record.notePostalCode,
        noteStreet: record.noteStreet,
        postalCodeDiverges: record.postalCodeDiverges,
        providerDistrict: record.providerDistrict,
        providerNumber: record.providerNumber,
        providerPlaceId: record.providerPlaceId,
        providerPostalCode: record.providerPostalCode,
        providerStreet: record.providerStreet,
        streetDiverges: record.streetDiverges,
      })
    },
  }
}

/**
 * O provedor devolve município por nome; a conferência é por código IBGE. A ponte se faz contra a
 * **nossa própria base**, que é por construção o conjunto de municípios para onde esta empresa
 * entrega — nome que não está lá vira `null`, e `checkCityMatch` descarta, que é o lado seguro.
 */
export function createDrizzleCityDirectory(
  database: AddressComparisonDatabase,
  companyId: string,
): CityDirectoryPort {
  let index: Map<string, string> | null = null

  return {
    async resolveCityCode(input) {
      if (index === null) {
        const rows = await database
          .selectDistinct({
            city: nfeAddresses.city,
            cityCode: nfeAddresses.cityCode,
            state: nfeAddresses.state,
          })
          .from(nfeAddresses)
          .where(and(eq(nfeAddresses.companyId, companyId), isNotNull(nfeAddresses.cityCode)))

        index = new Map()
        for (const row of rows) {
          if (row.city === null || row.cityCode === null) continue
          index.set(toIndexKey(row.city, row.state ?? ''), row.cityCode)
        }
      }

      return index.get(toIndexKey(input.name, input.state)) ?? null
    },
  }
}

/** A UF entra na chave: municípios homônimos em estados diferentes são lugares diferentes. */
function toIndexKey(name: string, state: string): string {
  return `${normalizeCityName(state)}|${normalizeCityName(name)}`
}
