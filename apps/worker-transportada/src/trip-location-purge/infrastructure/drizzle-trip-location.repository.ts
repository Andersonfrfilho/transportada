/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, inArray, isNotNull, lt } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import {
  tripDeliveryProofs,
  tripDocumentOccurrences,
  tripLocationPings,
  tripStatusEvents,
  tripStopEvents,
  tripStopOccurrences,
} from '../../database/trip-execution.schema.js'
import type {
  PurgeStalePings,
  RedactDeliveryProofLocations,
  RedactDocumentOccurrenceLocations,
  RedactStatusEventLocations,
  RedactStopOccurrenceLocations,
  RedactTripLocations,
} from '../application/trip-location.port.js'
import { EXPIRED_LOCATION_STATE } from '../domain/trip-location-purge.constant.js'

export type TripLocationDatabase = ReturnType<typeof createDrizzleProvider>['db']

type LocatedEventTable =
  | typeof tripStatusEvents
  | typeof tripStopOccurrences
  | typeof tripDocumentOccurrences

type RedactLocatedEventRowsParams = {
  readonly before: Date
  readonly database: TripLocationDatabase
  readonly limit: number
  readonly table: LocatedEventTable
  readonly timeColumn: AnyPgColumn
}

/** Spec 196 D8: as três tabelas novas têm o mesmo formato de posição; só a coluna de tempo muda. */
async function redactLocatedEventRows(params: RedactLocatedEventRowsParams): Promise<number> {
  const { before, database, limit, table, timeColumn } = params
  const expired = await database
    .select({ id: table.id })
    .from(table)
    .where(and(isNotNull(table.latitude), lt(timeColumn, before)))
    .limit(limit)

  if (expired.length === 0) return 0

  await database
    .update(table)
    .set({
      accuracyMeters: null,
      capturedAt: null,
      latitude: null,
      locationState: EXPIRED_LOCATION_STATE,
      longitude: null,
    })
    .where(
      inArray(
        table.id,
        expired.map((row) => row.id),
      ),
    )

  return expired.length
}

export function createDrizzleRedactStatusEventLocations(
  database: TripLocationDatabase,
): RedactStatusEventLocations {
  return ({ before, limit }) =>
    redactLocatedEventRows({
      before,
      database,
      limit,
      table: tripStatusEvents,
      timeColumn: tripStatusEvents.recordedAt,
    })
}

export function createDrizzleRedactStopOccurrenceLocations(
  database: TripLocationDatabase,
): RedactStopOccurrenceLocations {
  return ({ before, limit }) =>
    redactLocatedEventRows({
      before,
      database,
      limit,
      table: tripStopOccurrences,
      timeColumn: tripStopOccurrences.createdAt,
    })
}

export function createDrizzleRedactDocumentOccurrenceLocations(
  database: TripLocationDatabase,
): RedactDocumentOccurrenceLocations {
  return ({ before, limit }) =>
    redactLocatedEventRows({
      before,
      database,
      limit,
      table: tripDocumentOccurrences,
      timeColumn: tripDocumentOccurrences.createdAt,
    })
}

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
      .set({
        accuracyMeters: null,
        capturedAt: null,
        latitude: null,
        locationState: EXPIRED_LOCATION_STATE,
        longitude: null,
      })
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
      .set({
        accuracyMeters: null,
        latitude: null,
        locationState: EXPIRED_LOCATION_STATE,
        longitude: null,
      })
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
