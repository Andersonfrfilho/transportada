/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299 T1.4 contra o Postgres de verdade: o lembrete abre e fecha na mesma transação do evento da parada;
 * o OSRM só refina depois do commit, por `id` + `version`, e nunca derruba o evento.
 */
import { describe, expect } from 'bun:test'
import { asc, eq } from 'drizzle-orm'

import { createDriverStopReminderRuntime } from '../../src/driver-stop-reminders/infrastructure/driver-stop-reminder.runtime.js'
import { geocodedAddresses } from '../../src/database/geocoding.schema.js'
import { driverStopReminders } from '../../src/database/driver-stop-reminder.schema.js'
import { tripStops } from '../../src/database/trip.schema.js'
import { cancelTrip } from '../../src/trips/application/cancel-trip.use-case.js'
import type { ReportedLocation } from '../../src/trips/application/driver-field-report.port.js'
import { cancelStopDeparture } from '../../src/trips/application/cancel-stop-departure.use-case.js'
import {
  reportDocumentDelivery,
  reportDocumentReturn,
} from '../../src/trips/application/report-document-delivery.use-case.js'
import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import { reportStopDeparture } from '../../src/trips/application/report-stop-departure.use-case.js'
import { reportStopOccurrence } from '../../src/trips/application/report-stop-occurrence.use-case.js'
import { resolveFieldTripTarget } from '../../src/trips/application/resolve-field-trip-target.use-case.js'
import type { RouteGeometryPort } from '../../src/trips/application/route-geometry.port.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { DrizzleFieldTripTargetRepository } from '../../src/trips/infrastructure/drizzle-field-trip-target.repository.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'
import { DrizzleTripRouteRepository } from '../../src/trips/infrastructure/drizzle-trip-route.repository.js'
import {
  linkDriverMembership,
  seedCompany,
  seedTrip,
  testWithPostgres,
  withDisposableDatabase,
  type Company,
  type SeededTrip,
  type TestDatabase,
} from '../fixtures/trip-field-office-database.fixture.js'

const FALLBACK_TRAVEL_MS = 45 * 60_000
const FALLBACK_GRACE_MS = 30 * 60_000
const OSRM_TRAVEL_SECONDS = 1200
const SHARED_POINT: ReportedLocation = {
  accuracyMeters: '10.00',
  capturedAt: '2026-11-06T10:00:00.000Z',
  latitude: '-23.5505199',
  longitude: '-46.6333094',
}

type World = Readonly<{
  company: Company
  database: TestDatabase
  driverUserId: string
  trip: SeededTrip
}>

async function seedWorld(
  database: TestDatabase,
  status: 'dispatched' | 'in_transit' = 'dispatched',
): Promise<World> {
  const company = await seedCompany(database)
  const trip = await seedTrip(database, company, status)
  const driverUserId = await linkDriverMembership(database, company, company.firstDriverId)
  await database.db.insert(geocodedAddresses).values({
    addressKey: `3550308|01001000|${trip.tripId}`,
    latitude: '-23.5600000',
    longitude: '-46.6400000',
    precision: 'rooftop',
    source: 'manual',
  })
  return { company, database, driverUserId, trip }
}

function buildRouting(travelSeconds: number | null): RouteGeometryPort {
  return {
    readRouteGeometry: async () =>
      travelSeconds === null
        ? null
        : {
            legs: [{ distanceMetres: 9000, durationSeconds: travelSeconds }],
            nodeIds: null,
            nodeIdsByLeg: null,
            points: [],
          },
  }
}

function buildRuntime(world: World, routing: RouteGeometryPort) {
  return createDriverStopReminderRuntime({
    database: world.database.db,
    readDepot: async () => ({ reason: 'not_configured', status: 'absent' }),
    routing,
  })
}

function unitOfWorkFor(world: World, runtime?: ReturnType<typeof buildRuntime>) {
  return new DrizzleDriverFieldReportUnitOfWork(
    world.database.db,
    'test-bucket',
    undefined,
    runtime,
  )
}

type Uow = ReturnType<typeof unitOfWorkFor>

function depart(
  world: World,
  unitOfWork: Uow,
  now: Date,
  location: ReportedLocation | null = null,
) {
  return reportStopDeparture({
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    driverId: world.company.firstDriverId,
    idempotencyKey: crypto.randomUUID(),
    location,
    now,
    stopId: world.trip.stopId,
    tappedAt: now,
    unitOfWork,
  })
}

function arrive(world: World, unitOfWork: Uow, now: Date) {
  return reportStopArrival({
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    driverId: world.company.firstDriverId,
    idempotencyKey: crypto.randomUUID(),
    location: null,
    now,
    stopId: world.trip.stopId,
    unitOfWork,
  })
}

function settle(world: World, unitOfWork: Uow, now: Date, outcome: 'delivery' | 'return') {
  const base = {
    actorUserId: world.driverUserId,
    companyId: world.company.companyId,
    documentId: world.trip.documentId,
    driverId: world.company.firstDriverId,
    idempotencyKey: crypto.randomUUID(),
    location: null,
    now,
    unitOfWork,
  }
  return outcome === 'delivery'
    ? reportDocumentDelivery(base)
    : reportDocumentReturn({ ...base, reason: 'recipient_absent' })
}

async function readReminders(world: World) {
  return world.database.db
    .select()
    .from(driverStopReminders)
    .where(eq(driverStopReminders.tripId, world.trip.tripId))
    .orderBy(asc(driverStopReminders.createdAt), asc(driverStopReminders.stage))
}

async function readOnlyReminder(world: World) {
  const rows = await readReminders(world)
  expect(rows).toHaveLength(1)
  const [row] = rows
  if (row === undefined) throw new Error('EXPECTED_REMINDER')
  return row
}

function enabledUnitOfWork(world: World) {
  const runtime = buildRuntime(world, buildRouting(OSRM_TRAVEL_SECONDS))
  return { runtime, unitOfWork: unitOfWorkFor(world, runtime) }
}

describe('o lembrete abre e fecha com os eventos da parada (spec 299 T1.4)', () => {
  testWithPostgres(
    'a saída abre a chegada com a reserva e o OSRM refina depois do commit',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const departedAt = new Date('2026-11-06T10:00:00.000Z')
        const { runtime, unitOfWork } = enabledUnitOfWork(world)

        await depart(world, unitOfWork, departedAt, SHARED_POINT)
        await runtime.idle()
        const refined = await readOnlyReminder(world)

        expect(refined).toMatchObject({
          companyId: world.company.companyId,
          driverId: world.company.firstDriverId,
          originKind: 'shared_point',
          stage: 'arrival',
          status: 'pending',
          travelSeconds: OSRM_TRAVEL_SECONDS,
          tripStopId: world.trip.stopId,
        })
        expect(refined.anchorAt.toISOString()).toBe(departedAt.toISOString())
        expect(refined.expectedAt?.getTime()).toBe(
          departedAt.getTime() + OSRM_TRAVEL_SECONDS * 1000,
        )
        expect(refined.dueAt.getTime()).toBe(
          departedAt.getTime() + OSRM_TRAVEL_SECONDS * 1000 + FALLBACK_GRACE_MS,
        )
        expect(refined.version).toBe(2n)
      })
    },
  )

  testWithPostgres(
    'antes do OSRM responder a linha já existe com a reserva de 45 min',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const departedAt = new Date('2026-11-06T10:00:00.000Z')
        let release: () => void = () => undefined
        const gate = new Promise<void>((resolve) => {
          release = resolve
        })
        const slowRouting: RouteGeometryPort = {
          readRouteGeometry: async (...args) => {
            await gate
            return buildRouting(OSRM_TRAVEL_SECONDS).readRouteGeometry(...args)
          },
        }
        const runtime = buildRuntime(world, slowRouting)

        await depart(world, unitOfWorkFor(world, runtime), departedAt, SHARED_POINT)
        const reserved = await readOnlyReminder(world)

        expect(reserved.originKind).toBe('fallback')
        expect(reserved.travelSeconds).toBeNull()
        expect(reserved.dueAt.getTime()).toBe(
          departedAt.getTime() + FALLBACK_TRAVEL_MS + FALLBACK_GRACE_MS,
        )
        release()
        await runtime.idle()
        expect((await readOnlyReminder(world)).originKind).toBe('shared_point')
      })
    },
  )

  testWithPostgres('OSRM fora do ar mantém a reserva e não derruba a saída', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const departedAt = new Date('2026-11-06T10:00:00.000Z')
      const runtime = buildRuntime(world, buildRouting(null))

      const result = await depart(world, unitOfWorkFor(world, runtime), departedAt, SHARED_POINT)
      await runtime.idle()
      const row = await readOnlyReminder(world)

      expect(result.changed).toBe(true)
      expect(row.originKind).toBe('fallback')
      expect(row.travelSeconds).toBeNull()
      expect(row.version).toBe(1n)
      expect(row.dueAt.getTime()).toBe(
        departedAt.getTime() + FALLBACK_TRAVEL_MS + FALLBACK_GRACE_MS,
      )
    })
  })

  testWithPostgres('a chegada fecha a chegada e abre a entrega a partir dela', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const { runtime, unitOfWork } = enabledUnitOfWork(world)
      const arrivedAt = new Date('2026-11-06T10:40:00.000Z')

      await depart(world, unitOfWork, new Date('2026-11-06T10:00:00.000Z'))
      await arrive(world, unitOfWork, arrivedAt)
      await runtime.idle()
      const rows = await readReminders(world)

      const arrival = rows.find((row) => row.stage === 'arrival')
      const settlement = rows.find((row) => row.stage === 'settlement')
      expect(arrival).toMatchObject({ closedReason: 'arrived', status: 'closed' })
      expect(settlement).toMatchObject({ status: 'pending', originKind: 'fallback' })
      expect(settlement?.anchorAt.toISOString()).toBe(arrivedAt.toISOString())
      expect(settlement?.dueAt.getTime()).toBe(arrivedAt.getTime() + 30 * 60_000)
    })
  })

  testWithPostgres('a chegada do escritório também abre a entrega', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const { unitOfWork } = enabledUnitOfWork(world)
      const target = await resolveFieldTripTarget({
        companyId: world.company.companyId,
        repository: new DrizzleFieldTripTargetRepository(world.database.db),
        target: { kind: 'trip', tripId: world.trip.tripId },
      })

      await reportStopArrival({
        actorUserId: world.company.userId,
        companyId: world.company.companyId,
        idempotencyKey: crypto.randomUUID(),
        location: null,
        now: new Date(Date.now() - 60_000),
        stopId: world.trip.stopId,
        target,
        unitOfWork,
      })

      expect(await readOnlyReminder(world)).toMatchObject({
        stage: 'settlement',
        status: 'pending',
      })
    })
  })

  testWithPostgres('a chegada marcada junto com a baixa não abre a entrega', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const { runtime, unitOfWork } = enabledUnitOfWork(world)

      await depart(world, unitOfWork, new Date('2026-11-06T10:00:00.000Z'))
      await settle(world, unitOfWork, new Date(), 'delivery')
      await runtime.idle()
      const rows = await readReminders(world)

      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ stage: 'arrival', status: 'closed' })
      expect(rows.some((row) => row.stage === 'settlement')).toBe(false)
    })
  })

  for (const outcome of ['delivery', 'return'] as const) {
    testWithPostgres(`a baixa por ${outcome} que fecha a parada fecha a entrega`, async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedWorld(database)
        const { unitOfWork } = enabledUnitOfWork(world)

        await depart(world, unitOfWork, new Date('2026-11-06T10:00:00.000Z'))
        await arrive(world, unitOfWork, new Date('2026-11-06T10:40:00.000Z'))
        await settle(world, unitOfWork, new Date(), outcome)
        const rows = await readReminders(world)

        const settlement = rows.find((row) => row.stage === 'settlement')
        expect(settlement).toMatchObject({ closedReason: 'stop_closed', status: 'closed' })
        expect(settlement?.closedAt).toBeInstanceOf(Date)
      })
    })
  }

  testWithPostgres('a ocorrência da parada fecha o lembrete aberto', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const { unitOfWork } = enabledUnitOfWork(world)

      await depart(world, unitOfWork, new Date('2026-11-06T10:00:00.000Z'))
      await reportStopOccurrence({
        actorUserId: world.driverUserId,
        attachmentObjectId: null,
        companyId: world.company.companyId,
        description: 'Duas horas na fila da doca',
        distanceMeters: null,
        documentId: null,
        driverId: world.company.firstDriverId,
        idempotencyKey: crypto.randomUUID(),
        kind: 'long_wait',
        location: null,
        stopId: world.trip.stopId,
        unitOfWork,
      })

      expect(await readOnlyReminder(world)).toMatchObject({
        closedReason: 'occurrence',
        status: 'closed',
      })
    })
  })

  testWithPostgres('cancelar a saída cancela o lembrete', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const { unitOfWork } = enabledUnitOfWork(world)
      const now = new Date('2026-11-06T10:00:00.000Z')

      await depart(world, unitOfWork, now)
      await cancelStopDeparture({
        actorUserId: world.driverUserId,
        companyId: world.company.companyId,
        driverId: world.company.firstDriverId,
        idempotencyKey: crypto.randomUUID(),
        location: null,
        now: new Date('2026-11-06T10:01:00.000Z'),
        stopId: world.trip.stopId,
        tappedAt: new Date('2026-11-06T10:01:00.000Z'),
        unitOfWork,
      })

      expect(await readOnlyReminder(world)).toMatchObject({
        closedReason: 'departure_cancelled',
        status: 'cancelled',
      })
    })
  })

  testWithPostgres('encerrar a viagem fecha o que ficou aberto', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database, 'in_transit')
      const { unitOfWork } = enabledUnitOfWork(world)

      await depart(world, unitOfWork, new Date('2026-11-06T10:00:00.000Z'))
      await new DrizzleTripRepository(world.database.db).close({
        actorUserId: world.company.userId,
        channel: TRIP_FIELD_CHANNELS.backoffice,
        closeReason: null,
        companyId: world.company.companyId,
        correlationId: crypto.randomUUID(),
        ipAddress: '127.0.0.1',
        onBehalfOfDriverId: null,
        tripId: world.trip.tripId,
      })

      expect(await readOnlyReminder(world)).toMatchObject({
        closedReason: 'trip_closed',
        status: 'closed',
      })
    })
  })

  testWithPostgres('cancelar a viagem cancela o que ficou aberto', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const { unitOfWork } = enabledUnitOfWork(world)

      await depart(world, unitOfWork, new Date('2026-11-06T10:00:00.000Z'))
      await cancelTrip({
        actorUserId: world.company.userId,
        channel: TRIP_FIELD_CHANNELS.backoffice,
        companyId: world.company.companyId,
        repository: new DrizzleTripRouteRepository(world.database.db),
        tripId: world.trip.tripId,
      })

      expect(await readOnlyReminder(world)).toMatchObject({
        closedReason: 'trip_cancelled',
        status: 'cancelled',
      })
    })
  })

  testWithPostgres('o mesmo evento duas vezes não duplica o lembrete', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const runtime = buildRuntime(world, buildRouting(null))
      const sink = runtime.createEventSink(world.database.db)
      const event = {
        channel: TRIP_FIELD_CHANNELS.driverApp,
        companyId: world.company.companyId,
        kind: 'departed',
        occurredAt: new Date('2026-11-06T10:00:00.000Z'),
        target: { stopId: world.trip.stopId },
      } as const

      const first = await sink.onStopEvent(event)
      const second = await sink.onStopEvent(event)

      expect(first.openedReminderIds).toHaveLength(1)
      expect(second.openedReminderIds).toHaveLength(0)
      expect(await readReminders(world)).toHaveLength(1)
    })
  })

  testWithPostgres('a saída de outra parada substitui o lembrete da abandonada', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const secondStopId = crypto.randomUUID()
      await world.database.db.insert(tripStops).values({
        addressKey: `3550308|01002000|${world.trip.tripId}`,
        companyId: world.company.companyId,
        id: secondStopId,
        label: 'Centro, 200',
        sequence: 2n,
        tripId: world.trip.tripId,
      })
      const sink = buildRuntime(world, buildRouting(null)).createEventSink(world.database.db)
      const base = {
        channel: TRIP_FIELD_CHANNELS.driverApp,
        companyId: world.company.companyId,
        kind: 'departed',
        occurredAt: new Date('2026-11-06T10:00:00.000Z'),
      } as const

      await sink.onStopEvent({ ...base, target: { stopId: world.trip.stopId } })
      await sink.onStopEvent({ ...base, target: { stopId: secondStopId } })
      const rows = await readReminders(world)

      expect(rows.find((row) => row.tripStopId === world.trip.stopId)).toMatchObject({
        closedReason: 'superseded',
        status: 'cancelled',
      })
      expect(rows.find((row) => row.tripStopId === secondStopId)).toMatchObject({
        stage: 'arrival',
        status: 'pending',
      })
    })
  })

  testWithPostgres('com a chave global desligada nada é gravado', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedWorld(database)
      const unitOfWork = unitOfWorkFor(world)

      await depart(world, unitOfWork, new Date('2026-11-06T10:00:00.000Z'))
      await arrive(world, unitOfWork, new Date('2026-11-06T10:40:00.000Z'))

      expect(await readReminders(world)).toHaveLength(0)
    })
  })
})
