/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, inArray, isNotNull, lt } from 'drizzle-orm'

import { tripStopEvents } from '../../database/trip-execution.schema.js'
import type { RedactTripLocations } from '../application/trip-location.port.js'

export type TripLocationDatabase = ReturnType<typeof createDrizzleProvider>['db']

export function createDrizzleRedactTripLocations(
  database: TripLocationDatabase,
): RedactTripLocations {
  return async ({ before, limit }) => {
    const expired = await database
      .select({ id: tripStopEvents.id })
      .from(tripStopEvents)
      .where(and(isNotNull(tripStopEvents.latitude), lt(tripStopEvents.createdAt, before)))
      .limit(limit)

    if (expired.length === 0) return 0

    await database
      .update(tripStopEvents)
      .set({ accuracyMeters: null, capturedAt: null, latitude: null, longitude: null })
      .where(
        inArray(
          tripStopEvents.id,
          expired.map((row) => row.id),
        ),
      )

    return expired.length
  }
}
