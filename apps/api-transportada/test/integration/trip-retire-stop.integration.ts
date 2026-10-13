/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Retirar a parada do rascunho desvincula, numa transação, todas as notas vivas dela e deixa o
 * histórico: um evento por nota, com quem retirou, de qual parada e por quê, lido pela linha do
 * tempo da viagem. Contra Postgres, em banco descartável.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  tripDocumentReleaseEvents,
  tripDocuments,
  tripStops,
} from '../../src/database/trip.schema.js'
import { seedTrip, seedWorld, type TestDatabase } from '../fixtures/trip-list-world.fixture.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import { listTripTimeline } from '../../src/trips/infrastructure/trip-timeline.query.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

describe('retirar a parada do rascunho', () => {
  testWithPostgres(
    'solta as notas vivas da parada, grava um evento por nota e a linha do tempo conta',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const tripId = await seedTrip(database, {
          documentWeights: ['120.000', '80.000'],
          vehicleId: world.capableVehicleId,
          world,
        })
        const repository = new DrizzleTripRepository(database.db)
        const [stop] = await database.db
          .select({ id: tripStops.id })
          .from(tripStops)
          .where(eq(tripStops.tripId, tripId))
        const stopId = stop?.id ?? ''
        const actorUserId = crypto.randomUUID()

        const result = await repository.retireStop({
          actor: { channel: 'backoffice', userId: actorUserId },
          companyId: world.companyId,
          note: 'Endereço sem coordenada',
          stopId,
          tripId,
        })

        expect(result?.hasDeliveredDocument).toBe(false)
        expect(result?.released).toHaveLength(2)
        const live = await database.db
          .select({ id: tripDocuments.id, releasedAt: tripDocuments.releasedAt })
          .from(tripDocuments)
          .where(eq(tripDocuments.tripId, tripId))
        expect(live.every((row) => row.releasedAt !== null)).toBe(true)

        const events = await database.db
          .select()
          .from(tripDocumentReleaseEvents)
          .where(eq(tripDocumentReleaseEvents.tripId, tripId))
        expect(events).toHaveLength(2)
        expect(events.every((event) => event.scope === 'stop')).toBe(true)
        expect(events.every((event) => event.stopLabel === 'Parada 1')).toBe(true)
        expect(events.every((event) => event.actorUserId === actorUserId)).toBe(true)

        const timeline = await listTripTimeline(database.db, {
          companyId: world.companyId,
          cursor: null,
          limit: 50,
          tripId,
        })
        const released = timeline.items.filter((item) => item.kind === 'document.released')
        expect(released).toHaveLength(2)
        expect(released[0]?.documentRelease).toEqual({
          note: 'Endereço sem coordenada',
          scope: 'stop',
          stopLabel: 'Parada 1',
        })
      })
    },
    60_000,
  )

  testWithPostgres(
    'parada de outra viagem responde null e não solta nada',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const tripId = await seedTrip(database, {
          documentWeights: ['120.000'],
          vehicleId: world.capableVehicleId,
          world,
        })
        const otherTripId = await seedTrip(database, {
          documentWeights: ['50.000'],
          vehicleId: world.capableVehicleId,
          world,
        })
        const repository = new DrizzleTripRepository(database.db)
        const [otherStop] = await database.db
          .select({ id: tripStops.id })
          .from(tripStops)
          .where(eq(tripStops.tripId, otherTripId))

        const result = await repository.retireStop({
          actor: { channel: 'backoffice', userId: crypto.randomUUID() },
          companyId: world.companyId,
          stopId: otherStop?.id ?? '',
          tripId,
        })

        expect(result).toBeNull()
        const documents = await database.db
          .select({ releasedAt: tripDocuments.releasedAt })
          .from(tripDocuments)
        expect(documents).toHaveLength(2)
        expect(documents.every((row) => row.releasedAt === null)).toBe(true)
        const events = await database.db.select().from(tripDocumentReleaseEvents)
        expect(events).toHaveLength(0)
      })
    },
    60_000,
  )
})

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_retire_stop',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}
