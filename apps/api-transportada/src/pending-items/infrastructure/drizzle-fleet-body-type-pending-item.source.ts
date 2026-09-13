/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, lt, ne, or, type SQL } from 'drizzle-orm'

import { fleetVehicles } from '../../database/database.schema.js'
import { decodeKeysetCursor, encodeKeysetCursor } from '../../shared/keyset-cursor.support.js'
import type {
  ListPendingItemSourceInput,
  PendingItemPage,
  PendingItemSourcePort,
} from '../application/pending-item-source.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/**
 * Spec 147 D2/T14: o cadastro antigo com `00` num tipo que carrega. `vehicle_type <> 'tractor_unit'`
 * já alcança a carreta (`role = 'trailer'`, `vehicle_type = ''`) sem precisar nomeá-la — ela não tem
 * valor próprio no catálogo de tipos. Só `active`: veículo inativo não é trabalho para ninguém
 * corrigir agora (decisão desta task, sem linha correspondente na spec).
 */
export function buildFleetBodyTypePendingItemFilters(input: {
  readonly companyId: string
  readonly cursor: { readonly createdAt: Date; readonly id: string } | null
}): readonly SQL[] {
  const filters: SQL[] = [
    eq(fleetVehicles.companyId, input.companyId),
    ne(fleetVehicles.vehicleType, 'tractor_unit'),
    eq(fleetVehicles.bodyType, '00'),
    eq(fleetVehicles.status, 'active'),
  ]
  if (input.cursor !== null) {
    filters.push(
      or(
        lt(fleetVehicles.createdAt, input.cursor.createdAt),
        and(
          eq(fleetVehicles.createdAt, input.cursor.createdAt),
          lt(fleetVehicles.id, input.cursor.id),
        ),
      )!,
    )
  }
  return filters
}

export function createFleetBodyTypePendingItemSource(dependencies: {
  readonly database: Database
}): PendingItemSourcePort {
  return {
    kind: 'vehicleBodyTypeMissing',
    async list({ companyId, cursor, limit }: ListPendingItemSourceInput): Promise<PendingItemPage> {
      const decodedCursor = decodeKeysetCursor(cursor)
      const rows = await dependencies.database
        .select({
          createdAt: fleetVehicles.createdAt,
          id: fleetVehicles.id,
          plate: fleetVehicles.plate,
        })
        .from(fleetVehicles)
        .where(and(...buildFleetBodyTypePendingItemFilters({ companyId, cursor: decodedCursor })))
        .orderBy(desc(fleetVehicles.createdAt), desc(fleetVehicles.id))
        .limit(limit + 1)

      const pageRows = rows.slice(0, limit)
      const last = pageRows.at(-1)
      return {
        items: pageRows.map((row) => ({
          entityId: row.id,
          entityType: 'vehicle' as const,
          kind: 'vehicleBodyTypeMissing' as const,
          label: row.plate,
        })),
        nextCursor: rows.length > limit && last !== undefined ? encodeKeysetCursor(last) : null,
      }
    },
    requiredPermission: 'fleet.read',
  }
}
