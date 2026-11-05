/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 T2.3 (ADR-0113) contra o Postgres de verdade: quem pede uma etapa à frente da ordem da
 * parada tem as anteriores marcadas junto, na mesma transação; o escritório nunca marca junto.
 */
import { describe, expect } from 'bun:test'
import { and, asc, eq } from 'drizzle-orm'

import { tripStopEvents, tripStops, trips, tripDrivers } from '../../src/database/trip.schema.js'
import { readStopDwellsByTrip } from '../../src/trips/infrastructure/trip-valuation-batch.support.js'
import { listTripTimeline } from '../../src/trips/infrastructure/trip-timeline.query.js'
import { ApiError } from '../../src/shared/api.error.js'
import { TripStateTransitionNotAllowedError } from '../../src/trips/domain/trip.error.js'
import { reportDocumentDelivery } from '../../src/trips/application/report-document-delivery.use-case.js'
import { resolveFieldTripTarget } from '../../src/trips/application/resolve-field-trip-target.use-case.js'
import { DrizzleFieldTripTargetRepository } from '../../src/trips/infrastructure/drizzle-field-trip-target.repository.js'
import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import {
  linkDriverMembership,
  seedCompany,
  seedStopArrival,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

type World = Readonly<{
  company: Company
  database: TestDatabase
  driverUserId: string
  trip: SeededTrip
}>

async function seedWorld(
  database: TestDatabase,
  status: 'cancelled' | 'dispatched' | 'in_transit' = 'dispatched',
): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, status)
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)

  return { company, database, driverUserId, trip }
}

function unitOfWorkFor(world: World): DrizzleDriverFieldReportUnitOfWork {
  return new DrizzleDriverFieldReportUnitOfWork(world.database.db, 'test-bucket')
}

function deliver(
  world: World,
  input: { readonly key: string; readonly userId?: string; readonly driverId?: string },
) {
  return reportDocumentDelivery({
    actorUserId: input.userId ?? world.driverUserId,
    companyId: world.company.companyId,
    documentId: world.trip.documentId,
    driverId: input.driverId ?? world.company.firstDriverId,
    idempotencyKey: input.key,
    location: null,
    now: new Date(),
    unitOfWork: unitOfWorkFor(world),
  })
}

async function deliverFromOffice(world: World, key: string) {
  const target = await resolveFieldTripTarget({
    companyId: world.company.companyId,
    repository: new DrizzleFieldTripTargetRepository(world.database.db),
    target: { kind: 'trip', tripId: world.trip.tripId },
  })

  return reportDocumentDelivery({
    actorUserId: world.company.userId,
    companyId: world.company.companyId,
    documentId: world.trip.documentId,
    idempotencyKey: key,
    location: null,
    now: new Date(Date.now() - 60_000),
    target,
    unitOfWork: unitOfWorkFor(world),
  })
}

function arrive(world: World, key: string) {
  return reportStopArrival({
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    driverId: world.company.firstDriverId,
    idempotencyKey: key,
    location: null,
    now: new Date(),
    stopId: world.trip.stopId,
    unitOfWork: unitOfWorkFor(world),
  })
}

async function readEvents(world: World) {
  return world.database.db
    .select({
      kind: tripStopEvents.kind,
      location: tripStopEvents.latitude,
      recordedTogether: tripStopEvents.recordedTogether,
    })
    .from(tripStopEvents)
    .where(
      and(
        eq(tripStopEvents.companyId, world.company.companyId),
        eq(tripStopEvents.stopId, world.trip.stopId),
      ),
    )
    .orderBy(asc(tripStopEvents.kind))
}

async function readStop(world: World) {
  const [stop] = await world.database.db
    .select({
      arrivedAt: tripStops.arrivedAt,
      completedAt: tripStops.completedAt,
      enRouteSince: tripStops.enRouteSince,
    })
    .from(tripStops)
    .where(eq(tripStops.id, world.trip.stopId))

  return stop
}

describe('a ordem da parada na API (spec 294 T2.3)', () => {
  testWithPostgres(
    'a baixa do motorista sem saída nem chegada grava três eventos, dois marcados junto',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)

        const result = await deliver(world, { key: 'together-delivery' })

        expect(result.recordedTogether).toEqual(['departed', 'arrived'])
        const events = await readEvents(world)
        expect(events).toEqual([
          { kind: 'arrived', location: null, recordedTogether: true },
          { kind: 'delivered', location: null, recordedTogether: false },
          { kind: 'departed', location: null, recordedTogether: true },
        ])
        const stop = await readStop(world)
        expect(stop?.arrivedAt).not.toBeNull()
        expect(stop?.completedAt).not.toBeNull()
        expect(stop?.enRouteSince).toBeNull()
      })
    },
  )

  testWithPostgres(
    'a chegada sem saída marca a saída junto e não deixa a parada a caminho',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)

        const result = await arrive(world, 'together-arrival')

        expect(result.recordedTogether).toEqual(['departed'])
        expect(await readEvents(world)).toEqual([
          { kind: 'arrived', location: null, recordedTogether: false },
          { kind: 'departed', location: null, recordedTogether: true },
        ])
        const stop = await readStop(world)
        expect(stop?.arrivedAt).not.toBeNull()
        expect(stop?.enRouteSince).toBeNull()
        const [trip] = await database.db
          .select({ status: trips.status })
          .from(trips)
          .where(eq(trips.id, world.trip.tripId))
        expect(trip?.status).toBe('on_delivery_route')
      })
    },
  )

  testWithPostgres('parada já chegada: a baixa não marca nada junto', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database, 'in_transit')
      await seedStopArrival(database, world.trip, new Date('2026-09-18T09:00:00.000Z'))

      const result = await deliver(world, { key: 'already-arrived' })

      expect(result.recordedTogether).toEqual([])
      expect((await readEvents(world)).map((event) => event.recordedTogether)).toEqual([false])
    })
  })

  testWithPostgres('a baixa do escritório grava um evento e nenhum marcado junto', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database, 'in_transit')

      const result = await deliverFromOffice(world, 'office-delivery')

      expect(result.recordedTogether).toEqual([])
      expect(await readEvents(world)).toEqual([
        { kind: 'delivered', location: null, recordedTogether: false },
      ])
    })
  })

  testWithPostgres(
    'o reenvio da mesma chave não duplica e devolve o mesmo recordedTogether',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)

        const first = await deliver(world, { key: 'replay-delivery' })
        const replay = await deliver(world, { key: 'replay-delivery' })

        expect(replay.id).toBe(first.id)
        expect(replay.recordedTogether).toEqual(['departed', 'arrived'])
        expect(await readEvents(world)).toHaveLength(3)
      })
    },
  )

  testWithPostgres('o reenvio da chegada devolve a saída marcada junto sem duplicar', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)

      const first = await arrive(world, 'replay-arrival')
      const replay = await arrive(world, 'replay-arrival')

      expect(replay.id).toBe(first.id)
      expect(replay.recordedTogether).toEqual(['departed'])
      expect(await readEvents(world)).toHaveLength(2)
    })
  })

  testWithPostgres('viagem cancelada continua recusada e não grava etapa nenhuma', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database, 'cancelled')

      await expect(deliver(world, { key: 'cancelled-delivery' })).rejects.toBeInstanceOf(
        TripStateTransitionNotAllowedError,
      )
      expect(await readEvents(world)).toEqual([])
    })
  })

  testWithPostgres(
    'baixa do motorista e do escritório na mesma nota: 409 ou sucesso, nunca 500',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database, 'in_transit')

        const results = await Promise.allSettled([
          deliver(world, { key: 'race-driver' }),
          deliverFromOffice(world, 'race-office'),
        ])

        expect(results.filter((entry) => entry.status === 'fulfilled').length).toBeGreaterThan(0)
        for (const entry of results) {
          if (entry.status === 'fulfilled') continue
          expect(entry.reason).toBeInstanceOf(ApiError)
          expect((entry.reason as ApiError).status).toBe(409)
        }
        const delivered = (await readEvents(world)).filter((event) => event.kind === 'delivered')
        expect(delivered).toHaveLength(1)
      })
    },
  )

  testWithPostgres('o ajudante que baixa sem chegada também marca junto', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      await database.db
        .update(tripDrivers)
        .set({ role: 'helper' })
        .where(eq(tripDrivers.driverId, world.company.secondDriverId))
      const helperUserId = await linkDriverMembership(
        database,
        world.company,
        world.company.secondDriverId,
      )

      const result = await deliver(world, {
        driverId: world.company.secondDriverId,
        key: 'helper-delivery',
        userId: helperUserId,
      })

      expect(result.recordedTogether).toEqual(['departed', 'arrived'])
      expect((await readEvents(world)).filter((event) => event.recordedTogether)).toHaveLength(2)
    })
  })

  testWithPostgres(
    'etapas marcadas junto não medem espera, não deslocam a previsão e a linha do tempo as ordena',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const plannedAt = new Date('2026-09-18T10:00:00.000Z')
        const pendingStopId = crypto.randomUUID()
        await database.db
          .update(tripStops)
          .set({ estimatedArrivalAt: new Date('2026-09-18T08:00:00.000Z') })
          .where(eq(tripStops.id, world.trip.stopId))
        await database.db.insert(tripStops).values({
          addressKey: `3550308|01001000|${pendingStopId}`,
          arrivedAt: null,
          companyId: world.company.companyId,
          estimatedArrivalAt: plannedAt,
          id: pendingStopId,
          label: 'Outro, 200',
          sequence: 2n,
          tripId: world.trip.tripId,
        })

        await deliver(world, { key: 'delivery-without-arrival' })

        const [pending] = await database.db
          .select({ estimatedArrivalAt: tripStops.estimatedArrivalAt })
          .from(tripStops)
          .where(eq(tripStops.id, pendingStopId))
        expect(pending?.estimatedArrivalAt?.toISOString()).toBe(plannedAt.toISOString())

        const dwells = await readStopDwellsByTrip(database.db, {
          companyId: world.company.companyId,
          tripIds: [world.trip.tripId],
        })
        expect(dwells.get(world.trip.tripId)?.map((stop) => stop.dwellBasis)).toEqual([
          'unknown',
          'unknown',
        ])

        const timeline = await listTripTimeline(database.db, {
          companyId: world.company.companyId,
          cursor: null,
          limit: 50,
          tripId: world.trip.tripId,
        })
        const stopKinds = timeline.items
          .map((item) => item.kind)
          .filter((kind) => kind.startsWith('stop.') || kind === 'document.delivered')
        expect(stopKinds.reverse()).toEqual(['stop.departed', 'stop.arrived', 'document.delivered'])
      })
    },
  )
})
