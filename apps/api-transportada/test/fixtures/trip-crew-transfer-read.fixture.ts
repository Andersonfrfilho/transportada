/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 249 T1.6: os leitores do que a transferência deixa no banco — a fotografia da viagem (para
 * provar o que **não** mudou), a tripulação gravada, o histórico e a trilha de auditoria.
 */
import type { DrizzleProvider } from '@adatechnology/drizzle-provider'
import { asc, eq, sql } from 'drizzle-orm'

import {
  auditLogs,
  mdfeManifests,
  tripCrewEvents,
  tripDocuments,
  tripDrivers,
  tripStatusEvents,
  tripStops,
  trips,
} from '../../src/database/database.schema.js'
import { findCurrentDriverTrip } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import { DrizzleDriverScoreRepository } from '../../src/fleet/infrastructure/drizzle-driver-score.repository.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'
import type { CrewTransferWorld } from './trip-crew-transfer.fixture.js'

const NOW = new Date('2026-10-07T12:00:00.000Z')

/** Tudo o que a transferência jura não tocar — menos `updated_at`, que é o único que ela move. */
export type TripFreeze = {
  readonly documents: readonly unknown[]
  readonly statusEventCount: number
  readonly stops: readonly unknown[]
  readonly trip: Record<string, unknown>
}

export async function readTripFreeze(
  database: DrizzleProvider,
  tripId: string,
): Promise<TripFreeze> {
  const [tripRow] = await database.db.select().from(trips).where(eq(trips.id, tripId))
  if (tripRow === undefined) throw new Error('EXPECTED_TRIP')
  const trip: Record<string, unknown> = { ...tripRow }
  delete trip.updatedAt
  const stops = await database.db
    .select()
    .from(tripStops)
    .where(eq(tripStops.tripId, tripId))
    .orderBy(asc(tripStops.sequence))
  const documents = await database.db
    .select()
    .from(tripDocuments)
    .where(eq(tripDocuments.tripId, tripId))
    .orderBy(asc(tripDocuments.id))
  const events = await database.db
    .select({ id: tripStatusEvents.id })
    .from(tripStatusEvents)
    .where(eq(tripStatusEvents.tripId, tripId))

  return { documents, statusEventCount: events.length, stops, trip }
}

export async function readTripUpdatedAt(database: DrizzleProvider, tripId: string): Promise<Date> {
  const [row] = await database.db
    .select({ updatedAt: trips.updatedAt })
    .from(trips)
    .where(eq(trips.id, tripId))
  if (row === undefined) throw new Error('EXPECTED_TRIP')
  return row.updatedAt
}

export type StoredCrewMember = {
  readonly driverId: string
  readonly position: number
  readonly role: string
}

export async function readStoredCrew(
  database: DrizzleProvider,
  tripId: string,
): Promise<readonly StoredCrewMember[]> {
  const rows = await database.db
    .select({
      driverId: tripDrivers.driverId,
      position: tripDrivers.position,
      role: tripDrivers.role,
    })
    .from(tripDrivers)
    .where(eq(tripDrivers.tripId, tripId))
    .orderBy(asc(tripDrivers.position))
  return rows.map((row) => ({ ...row, position: Number(row.position) }))
}

export async function readCrewEvents(database: DrizzleProvider, tripId: string) {
  return database.db
    .select()
    .from(tripCrewEvents)
    .where(eq(tripCrewEvents.tripId, tripId))
    .orderBy(asc(tripCrewEvents.createdAt), asc(tripCrewEvents.id))
}

/** O tipo JSON que o Postgres guardou — `array`, nunca `string` (o jsonb duplamente codificado). */
export async function readStoredJsonTypes(
  database: DrizzleProvider,
  eventId: string,
): Promise<{ readonly next: string; readonly previous: string }> {
  const rows = (await database.db.execute(
    sql`select jsonb_typeof(previous_crew) as previous, jsonb_typeof(next_crew) as next
        from trip_crew_events where id = ${eventId}`,
  )) as unknown as readonly { next: string; previous: string }[]
  const [row] = rows
  if (row === undefined) throw new Error('EXPECTED_CREW_EVENT')
  return row
}

export async function readCrewTransferAudit(database: DrizzleProvider, tripId: string) {
  return database.db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.entityId, tripId))
    .orderBy(asc(auditLogs.createdAt))
}

export async function insertManifest(
  database: DrizzleProvider,
  world: CrewTransferWorld,
  status: 'authorized' | 'draft',
): Promise<void> {
  const [trip] = await database.db
    .select({ vehicleId: trips.vehicleId })
    .from(trips)
    .where(eq(trips.id, world.trip.tripId))
  if (trip?.vehicleId === null || trip === undefined) throw new Error('EXPECTED_TRIP_VEHICLE')

  await database.db.insert(mdfeManifests).values({
    companyId: world.trip.companyId,
    destinationState: 'SP',
    fiscalEnvironment: 'homologation',
    ...(status === 'authorized'
      ? { fiscalNumber: 1n, fiscalSeries: '1', status: 'authorized' as const }
      : { status: 'draft' as const }),
    originState: 'SP',
    tripId: world.trip.tripId,
    vehicleId: trip.vehicleId,
  })
}

/** O que o celular de um motorista lista como viagem dele — pelo vínculo, como o app. */
export async function listTripIdsOnPhone(
  database: DrizzleProvider,
  input: { readonly companyId: string; readonly membershipId: string },
): Promise<readonly string[]> {
  const result = await findCurrentDriverTrip({
    companyId: input.companyId,
    membershipId: input.membershipId,
    now: NOW,
    repository: new DrizzleCurrentDriverTripRepository(database.db),
    scores: new DrizzleDriverScoreRepository(database.db),
  })
  return result.trips.map((trip) => trip.id)
}
