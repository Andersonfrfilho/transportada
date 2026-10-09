/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 257 T1.6 (D8): cancelar a viagem libera as notas, qualquer que seja o status de origem e o
 * motivo, e a nota liberada entra na viagem socorrista — inclusive a que já saiu. Contra Postgres de
 * verdade: o `released_at` e o índice único de nota viva só se provam aqui.
 */
import { describe, expect, test } from 'bun:test'
import type { DrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, isNull } from 'drizzle-orm'

import { tripDocuments, tripDrivers, trips } from '../../src/database/database.schema.js'
import { cancelTrip } from '../../src/trips/application/cancel-trip.use-case.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import {
  seedOnRoadTrip,
  useSharedRaceDatabase,
  type CrewTransferWorld,
} from '../fixtures/trip-crew-transfer.fixture.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const TEST_TIMEOUT_MS = 60_000
const RESCUE_REASON = 'Van quebrou, a outra assume as notas'

const raceDatabase = useSharedRaceDatabase(databaseUrl)

const CANCELLABLE_STATUSES = [
  'draft',
  'route_planned',
  'separating',
  'loading',
  'dispatched',
  'in_transit',
  'on_delivery_route',
] as const

function currentDatabase(): DrizzleProvider {
  return raceDatabase().database
}

async function cancelWorldTrip(world: CrewTransferWorld): Promise<void> {
  await cancelTrip({
    actorUserId: world.trip.userId,
    channel: TRIP_FIELD_CHANNELS.backoffice,
    companyId: world.trip.companyId,
    repository: new DrizzleTripRouteRepository(world.database.db),
    tripId: world.trip.tripId,
  })
}

async function readLinks(world: CrewTransferWorld) {
  return world.database.db
    .select({
      deliveredAt: tripDocuments.deliveredAt,
      nfeDocumentId: tripDocuments.nfeDocumentId,
      releasedAt: tripDocuments.releasedAt,
    })
    .from(tripDocuments)
    .where(eq(tripDocuments.tripId, world.trip.tripId))
}

async function createRescueTrip(world: CrewTransferWorld): Promise<string> {
  const [source] = await world.database.db
    .select({ vehicleId: trips.vehicleId })
    .from(trips)
    .where(eq(trips.id, world.trip.tripId))
  const crew = await world.database.db
    .select()
    .from(tripDrivers)
    .where(eq(tripDrivers.tripId, world.trip.tripId))
  if (source?.vehicleId === null || source === undefined) throw new Error('EXPECTED_VEHICLE')

  const rescue = await world.repository.create({
    actorUserId: world.trip.userId,
    channel: TRIP_FIELD_CHANNELS.backoffice,
    companyId: world.trip.companyId,
    crew: crew.map((member) => ({
      driverId: member.driverId,
      driverName: member.driverName,
      driverTaxId: member.driverTaxId,
      position: Number(member.position),
      role: member.role,
    })),
    trailerVehicleId: null,
    vehicleId: source.vehicleId,
  })
  await world.database.db.update(trips).set({ status: 'in_transit' }).where(eq(trips.id, rescue.id))
  return rescue.id
}

describe('cancelar libera as notas, em qualquer status e motivo (spec 257 D8)', () => {
  for (const origin of CANCELLABLE_STATUSES) {
    testWithPostgres(
      `cancelada a partir de ${origin}: as duas notas ficam liberadas e a linha permanece`,
      async () => {
        const world = await seedOnRoadTrip(currentDatabase())
        await world.database.db
          .update(trips)
          .set({ status: origin })
          .where(eq(trips.id, world.trip.tripId))

        await cancelWorldTrip(world)

        const links = await readLinks(world)
        expect(links).toHaveLength(2)
        for (const link of links) expect(link.releasedAt).toBeInstanceOf(Date)
      },
      TEST_TIMEOUT_MS,
    )
  }

  testWithPostgres(
    'nota já entregue não é liberada: já chegou ao destino',
    async () => {
      const world = await seedOnRoadTrip(currentDatabase())
      const [delivered] = await readLinks(world)
      if (delivered?.nfeDocumentId === undefined) throw new Error('EXPECTED_LINK')
      await world.database.db
        .update(tripDocuments)
        .set({ deliveredAt: new Date('2026-10-08T10:00:00.000Z') })
        .where(
          and(
            eq(tripDocuments.tripId, world.trip.tripId),
            eq(tripDocuments.nfeDocumentId, delivered.nfeDocumentId ?? ''),
          ),
        )

      await cancelWorldTrip(world)

      const links = await readLinks(world)
      const kept = links.find((link) => link.nfeDocumentId === delivered.nfeDocumentId)
      expect(kept?.releasedAt).toBeNull()
      expect(links.filter((link) => link.releasedAt !== null)).toHaveLength(1)
    },
    TEST_TIMEOUT_MS,
  )

  testWithPostgres(
    'a nota liberada pela cancelada entra na viagem socorrista que já saiu',
    async () => {
      const world = await seedOnRoadTrip(currentDatabase())
      const noteIds = (await readLinks(world)).flatMap((link) =>
        link.nfeDocumentId === null ? [] : [link.nfeDocumentId],
      )
      await cancelWorldTrip(world)
      const rescueTripId = await createRescueTrip(world)

      const result = await world.repository.linkDocumentsAfterDispatch({
        actorUserId: world.trip.userId,
        channel: 'backoffice',
        companyId: world.trip.companyId,
        correlationId: `correlation-${crypto.randomUUID()}`,
        ipAddress: '203.0.113.7',
        nfeDocumentIds: noteIds,
        reason: RESCUE_REASON,
        tripId: rescueTripId,
      })

      expect(result?.skipped).toEqual([])
      expect(result?.linked.map((link) => link.nfeDocumentId).sort()).toEqual([...noteIds].sort())
      const live = await world.database.db
        .select({ tripId: tripDocuments.tripId })
        .from(tripDocuments)
        .where(and(isNull(tripDocuments.releasedAt), eq(tripDocuments.tripId, rescueTripId)))
      expect(live).toHaveLength(noteIds.length)
    },
    TEST_TIMEOUT_MS,
  )
})
