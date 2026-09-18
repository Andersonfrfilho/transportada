/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, inArray, isNotNull, lt } from 'drizzle-orm'

import {
  tripDeliveryProofs,
  tripLocationPings,
  tripStopEvents,
} from '../../database/trip-execution.schema.js'
import type {
  PurgeStalePings,
  RedactDeliveryProofLocations,
  RedactTripLocations,
} from '../application/trip-location.port.js'

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

/** Spec 159 T11: só a posição da foto cai — o arquivo, o veredito e o horário declarado ficam. */
export function createDrizzleRedactDeliveryProofLocations(
  database: TripLocationDatabase,
): RedactDeliveryProofLocations {
  return async ({ before, limit }) => {
    const expired = await database
      .select({ id: tripDeliveryProofs.id })
      .from(tripDeliveryProofs)
      .where(and(isNotNull(tripDeliveryProofs.latitude), lt(tripDeliveryProofs.createdAt, before)))
      .limit(limit)

    if (expired.length === 0) return 0

    await database
      .update(tripDeliveryProofs)
      .set({ accuracyMeters: null, latitude: null, longitude: null })
      .where(
        inArray(
          tripDeliveryProofs.id,
          expired.map((row) => row.id),
        ),
      )

    return expired.length
  }
}

/** A linha inteira cai: ping sem posição não é dado, ao contrário do evento de parada. */
export function createDrizzlePurgeStalePings(database: TripLocationDatabase): PurgeStalePings {
  return async ({ before, limit }) => {
    const expired = await database
      .select({ id: tripLocationPings.id })
      .from(tripLocationPings)
      .where(lt(tripLocationPings.recordedAt, before))
      .limit(limit)

    if (expired.length === 0) return 0

    await database.delete(tripLocationPings).where(
      inArray(
        tripLocationPings.id,
        expired.map((row) => row.id),
      ),
    )

    return expired.length
  }
}
