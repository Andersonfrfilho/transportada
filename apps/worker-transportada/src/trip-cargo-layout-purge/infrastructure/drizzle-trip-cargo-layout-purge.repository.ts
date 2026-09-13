/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, inArray, isNull, lt } from 'drizzle-orm'

import { tripCargoLayoutOutbox } from '../../database/trip-cargo-layout-outbox.schema.js'
import { tripCargoLayouts } from '../../database/trip-cargo-layout.schema.js'
import type { PurgeStaleCargoLayoutPreviews } from '../application/trip-cargo-layout-purge.port.js'

export type TripCargoLayoutPurgeDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzlePurgeStaleCargoLayoutPreviews(
  database: TripCargoLayoutPurgeDatabase,
): PurgeStaleCargoLayoutPreviews {
  return ({ before, limit }) =>
    database.transaction(async (transaction) => {
      // `skip locked`: a prévia que o consumidor está calculando agora fica para a próxima batida
      const expired = await transaction
        .select({ id: tripCargoLayouts.id })
        .from(tripCargoLayouts)
        .where(and(isNull(tripCargoLayouts.tripId), lt(tripCargoLayouts.updatedAt, before)))
        .limit(limit)
        .for('update', { skipLocked: true })

      if (expired.length === 0) return { deleted: 0, deletedOutbox: 0 }
      const layoutIds = expired.map((row) => row.id)

      const outbox = await transaction
        .delete(tripCargoLayoutOutbox)
        .where(inArray(tripCargoLayoutOutbox.layoutId, layoutIds))
        .returning({ id: tripCargoLayoutOutbox.id })

      const deleted = await transaction
        .delete(tripCargoLayouts)
        .where(and(inArray(tripCargoLayouts.id, layoutIds), isNull(tripCargoLayouts.tripId)))
        .returning({ id: tripCargoLayouts.id })

      return { deleted: deleted.length, deletedOutbox: outbox.length }
    })
}
