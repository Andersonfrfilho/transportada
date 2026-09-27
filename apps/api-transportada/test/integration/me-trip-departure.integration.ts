/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 206 T2.2/T2.2a (CA3, CA4) — `depart` e `cancel-departure` contra Postgres de verdade: a
 * trava das paradas, o índice único parcial e o CHECK `trip_stops_en_route_open_check` só se
 * provam aqui — o dublê de `field-report.double.ts` não modela nem trava nem constraint.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, isNotNull } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import {
  tripDispatchSnapshots,
  tripDrivers,
  tripStopEvents,
  tripStops,
  trips,
  type TripStatus,
} from '../../src/database/trip.schema.js'
import { cancelStopDeparture } from '../../src/trips/application/cancel-stop-departure.use-case.js'
import { reportStopArrival } from '../../src/trips/application/report-stop-arrival.use-case.js'
import { reportStopDeparture } from '../../src/trips/application/report-stop-departure.use-case.js'
import { ApiError } from '../../src/shared/api.error.js'
import { DrizzleDriverFieldReportUnitOfWork } from '../../src/trips/infrastructure/drizzle-driver-field-report.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

/**
 * Longe no futuro, de propósito: sem `trip_dispatch_snapshots`, a janela do despacho congelado cai
 * no `trips.createdAt` real (hora do `insert`, D3/ADR-0067 §3) — datas fixas de 2026 ficariam
 * antes desse `createdAt` dependendo da hora real em que a suíte roda, e o `tappedAt` sairia da
 * janela (D3) por acidente, não pela intenção do teste.
 */
const NOW = new Date('2030-01-01T13:00:00.000Z')
const TAPPED_AT = new Date('2030-01-01T12:59:00.000Z')

type World = {
  readonly companyId: string
  readonly driverId: string
  readonly stopIds: readonly string[]
  readonly tripId: string
  readonly userId: string
}

async function seedTripWithTwoStops(
  database: TestDatabase,
  options: { readonly status?: TripStatus } = {},
): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()
  const stopIds = [crypto.randomUUID(), crypto.randomUUID()]

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db
    .insert(userCompanyMemberships)
    .values({ companyId, id: membershipId, status: 'active', userId })
  await database.db.insert(fleetVehicles).values({
    companyId,
    id: vehicleId,
    plate: 'GCQ8E47',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  await database.db.insert(fleetDrivers).values({
    companyId,
    id: driverId,
    membershipId,
    name: 'Motorista de Campo',
    taxId: '11111111111',
  })
  await database.db
    .insert(trips)
    .values({ companyId, id: tripId, status: options.status ?? 'dispatched', vehicleId })
  await database.db.insert(tripDrivers).values({
    companyId,
    driverId,
    driverName: 'Motorista de Campo',
    driverTaxId: '11111111111',
    position: 1n,
    tripId,
  })
  await database.db.insert(tripStops).values([
    {
      addressKey: '3550308|01001000|100',
      companyId,
      id: stopIds[0] ?? '',
      label: 'Centro, 100',
      sequence: 1n,
      tripId,
    },
    {
      addressKey: '3550308|04538133|200',
      companyId,
      id: stopIds[1] ?? '',
      label: 'Faria Lima, 200',
      sequence: 2n,
      tripId,
    },
  ])

  return { companyId, driverId, stopIds, tripId, userId }
}

function departureInput(
  world: World,
  unitOfWork: DrizzleDriverFieldReportUnitOfWork,
  input: { readonly idempotencyKey: string; readonly stopId: string; readonly tappedAt?: Date },
) {
  return {
    actorUserId: world.userId,
    companyId: world.companyId,
    driverId: world.driverId,
    idempotencyKey: input.idempotencyKey,
    location: null,
    now: NOW,
    stopId: input.stopId,
    tappedAt: input.tappedAt ?? TAPPED_AT,
    unitOfWork,
  }
}

describe('depart e cancel-departure contra Postgres (spec 206 T2.2/T2.2a)', () => {
  testWithPostgres(
    'o primeiro depart marca a caminho e leva dispatched a on_delivery_route',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedTripWithTwoStops(database)
        const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')

        const result = await reportStopDeparture(
          departureInput(world, unitOfWork, {
            idempotencyKey: 'depart-1',
            stopId: world.stopIds[0] ?? '',
          }),
        )

        expect(result.changed).toBe(true)
        const [tripRow] = await database.db
          .select({ status: trips.status })
          .from(trips)
          .where(eq(trips.id, world.tripId))
        expect(tripRow?.status).toBe('on_delivery_route')

        const [event] = await database.db
          .select()
          .from(tripStopEvents)
          .where(eq(tripStopEvents.stopId, world.stopIds[0] ?? ''))
        expect(event).toMatchObject({ channel: 'driver_app', kind: 'departed', latitude: null })
        expect(event?.tappedAt?.toISOString()).toBe(TAPPED_AT.toISOString())

        const [stop] = await database.db
          .select({
            enRouteSince: tripStops.enRouteSince,
            enRouteTappedAt: tripStops.enRouteTappedAt,
          })
          .from(tripStops)
          .where(eq(tripStops.id, world.stopIds[0] ?? ''))
        expect(stop?.enRouteSince).not.toBeNull()
        expect(stop?.enRouteTappedAt?.toISOString()).toBe(TAPPED_AT.toISOString())
      })
    },
  )

  testWithPostgres('o segundo depart na mesma parada é no-op, sem evento novo', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedTripWithTwoStops(database)
      const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')
      const stopId = world.stopIds[0] ?? ''

      await reportStopDeparture(
        departureInput(world, unitOfWork, { idempotencyKey: 'depart-1', stopId }),
      )
      const result = await reportStopDeparture(
        departureInput(world, unitOfWork, { idempotencyKey: 'depart-2', stopId }),
      )

      expect(result).toEqual({ changed: false, id: null })
      const events = await database.db
        .select()
        .from(tripStopEvents)
        .where(
          and(eq(tripStopEvents.companyId, world.companyId), eq(tripStopEvents.kind, 'departed')),
        )
      expect(events).toHaveLength(1)
    })
  })

  /** O replay do no-op repete `changed: false` — a chave também liquida no toque sem efeito. */
  testWithPostgres('o replay do no-op repete changed: false', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedTripWithTwoStops(database)
      const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')
      const stopId = world.stopIds[0] ?? ''

      await reportStopDeparture(
        departureInput(world, unitOfWork, { idempotencyKey: 'depart-1', stopId }),
      )
      await reportStopDeparture(
        departureInput(world, unitOfWork, { idempotencyKey: 'depart-2', stopId }),
      )
      const replay = await reportStopDeparture(
        departureInput(world, unitOfWork, { idempotencyKey: 'depart-2', stopId }),
      )

      expect(replay).toEqual({ changed: false, id: null })
    })
  })

  testWithPostgres(
    'depart numa segunda parada com a primeira a caminho responde 409, sem tocar a parada aberta e sem liquidar a chave',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedTripWithTwoStops(database)
        const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')

        await reportStopDeparture(
          departureInput(world, unitOfWork, {
            idempotencyKey: 'depart-1',
            stopId: world.stopIds[0] ?? '',
          }),
        )

        let error: unknown
        try {
          await reportStopDeparture(
            departureInput(world, unitOfWork, {
              idempotencyKey: 'depart-2',
              stopId: world.stopIds[1] ?? '',
            }),
          )
        } catch (caught) {
          error = caught
        }
        expect(error).toBeInstanceOf(ApiError)
        expect((error as ApiError).code).toBe('TRIP_HAS_STOP_EN_ROUTE')

        const events = await database.db
          .select()
          .from(tripStopEvents)
          .where(eq(tripStopEvents.stopId, world.stopIds[1] ?? ''))
        expect(events).toHaveLength(0)

        /** A reserva da chave caiu com a transação abortada — o reenvio depois é aceito. */
        await cancelStopDeparture(
          departureInput(world, unitOfWork, {
            idempotencyKey: 'cancela-1',
            stopId: world.stopIds[0] ?? '',
          }),
        )
        const retried = await reportStopDeparture(
          departureInput(world, unitOfWork, {
            idempotencyKey: 'depart-2',
            stopId: world.stopIds[1] ?? '',
          }),
        )
        expect(retried.changed).toBe(true)
      })
    },
  )

  /** CA4: dois `depart` concorrentes em paradas diferentes — a trava garante 409, nunca 500. */
  testWithPostgres(
    'duas paradas concorrentes deixam uma só a caminho, e o perdedor recebe 409, nunca 500',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedTripWithTwoStops(database)
        const unitOfWorkA = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')
        const unitOfWorkB = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')

        const results = await Promise.allSettled([
          reportStopDeparture(
            departureInput(world, unitOfWorkA, {
              idempotencyKey: 'depart-a',
              stopId: world.stopIds[0] ?? '',
            }),
          ),
          reportStopDeparture(
            departureInput(world, unitOfWorkB, {
              idempotencyKey: 'depart-b',
              stopId: world.stopIds[1] ?? '',
            }),
          ),
        ])

        const fulfilled = results.filter((entry) => entry.status === 'fulfilled')
        const rejected = results.filter((entry) => entry.status === 'rejected')
        expect(fulfilled).toHaveLength(1)
        expect(rejected).toHaveLength(1)
        expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ApiError)
        expect(((rejected[0] as PromiseRejectedResult).reason as ApiError).code).toBe(
          'TRIP_HAS_STOP_EN_ROUTE',
        )

        const enRouteStops = await database.db
          .select({ id: tripStops.id })
          .from(tripStops)
          .where(
            and(
              eq(tripStops.companyId, world.companyId),
              eq(tripStops.tripId, world.tripId),
              isNotNull(tripStops.enRouteSince),
            ),
          )
        expect(enRouteStops).toHaveLength(1)
      })
    },
  )

  testWithPostgres(
    'cancel-departure zera a caminho da própria parada, mantém o departed e não muda o status',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedTripWithTwoStops(database)
        const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')
        const stopId = world.stopIds[0] ?? ''

        await reportStopDeparture(
          departureInput(world, unitOfWork, { idempotencyKey: 'depart-1', stopId }),
        )
        const cancelled = await cancelStopDeparture(
          departureInput(world, unitOfWork, { idempotencyKey: 'cancela-1', stopId }),
        )

        expect(cancelled.changed).toBe(true)
        const [stop] = await database.db
          .select({ enRouteSince: tripStops.enRouteSince })
          .from(tripStops)
          .where(eq(tripStops.id, stopId))
        expect(stop?.enRouteSince).toBeNull()

        const [tripRow] = await database.db
          .select({ status: trips.status })
          .from(trips)
          .where(eq(trips.id, world.tripId))
        expect(tripRow?.status).toBe('on_delivery_route')

        const kinds = (
          await database.db
            .select({ kind: tripStopEvents.kind })
            .from(tripStopEvents)
            .where(eq(tripStopEvents.stopId, stopId))
        ).map((row) => row.kind)
        expect(kinds).toEqual(['departed', 'departure_cancelled'])
      })
    },
  )

  testWithPostgres(
    'cancelar e iniciar a mesma parada de novo grava dois departed e um cancelled entre eles',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedTripWithTwoStops(database)
        const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')
        const stopId = world.stopIds[0] ?? ''

        await reportStopDeparture(
          departureInput(world, unitOfWork, { idempotencyKey: 'depart-1', stopId }),
        )
        await cancelStopDeparture(
          departureInput(world, unitOfWork, { idempotencyKey: 'cancela-1', stopId }),
        )
        const second = await reportStopDeparture(
          departureInput(world, unitOfWork, {
            idempotencyKey: 'depart-2',
            stopId,
            tappedAt: new Date(TAPPED_AT.getTime() + 60_000),
          }),
        )

        expect(second.changed).toBe(true)
        const kinds = (
          await database.db
            .select({ kind: tripStopEvents.kind })
            .from(tripStopEvents)
            .where(eq(tripStopEvents.stopId, stopId))
        ).map((row) => row.kind)
        expect(kinds).toEqual(['departed', 'departure_cancelled', 'departed'])
      })
    },
  )

  testWithPostgres('cancelar libera a outra parada da viagem imediatamente', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedTripWithTwoStops(database)
      const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')

      await reportStopDeparture(
        departureInput(world, unitOfWork, {
          idempotencyKey: 'depart-1',
          stopId: world.stopIds[0] ?? '',
        }),
      )
      await cancelStopDeparture(
        departureInput(world, unitOfWork, {
          idempotencyKey: 'cancela-1',
          stopId: world.stopIds[0] ?? '',
        }),
      )
      const result = await reportStopDeparture(
        departureInput(world, unitOfWork, {
          idempotencyKey: 'depart-2',
          stopId: world.stopIds[1] ?? '',
        }),
      )

      expect(result.changed).toBe(true)
    })
  })

  testWithPostgres(
    'cancel-departure numa parada chegada responde 409 com reason arrived',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedTripWithTwoStops(database)
        const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')
        const stopId = world.stopIds[0] ?? ''

        await reportStopDeparture(
          departureInput(world, unitOfWork, { idempotencyKey: 'depart-1', stopId }),
        )
        await reportStopArrival({
          actorUserId: world.userId,
          companyId: world.companyId,
          driverId: world.driverId,
          idempotencyKey: 'chegada-1',
          location: null,
          now: NOW,
          stopId,
          unitOfWork,
        })

        let error: unknown
        try {
          await cancelStopDeparture(
            departureInput(world, unitOfWork, { idempotencyKey: 'cancela-1', stopId }),
          )
        } catch (caught) {
          error = caught
        }
        expect(error).toBeInstanceOf(ApiError)
        expect((error as ApiError).code).toBe('TRIP_STOP_DEPARTURE_NOT_CANCELLABLE')
        expect((error as ApiError & { reason?: string }).reason).toBe('arrived')

        // A chegada já zerou en_route_since — a prova de que os dois escritores convivem (D4/D7).
        const [stop] = await database.db
          .select({ enRouteSince: tripStops.enRouteSince })
          .from(tripStops)
          .where(eq(tripStops.id, stopId))
        expect(stop?.enRouteSince).toBeNull()
      })
    },
  )

  testWithPostgres(
    'cancel-departure numa parada sem "a caminho" é no-op, e o replay repete',
    async () => {
      await withDisposableDatabase(async (database) => {
        const world = await seedTripWithTwoStops(database)
        const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')
        const stopId = world.stopIds[0] ?? ''

        const first = await cancelStopDeparture(
          departureInput(world, unitOfWork, { idempotencyKey: 'cancela-1', stopId }),
        )
        const second = await cancelStopDeparture(
          departureInput(world, unitOfWork, { idempotencyKey: 'cancela-1', stopId }),
        )

        expect(first).toEqual({ changed: false, id: null })
        expect(second).toEqual({ changed: false, id: null })
      })
    },
  )

  testWithPostgres('depart em viagem cancelada responde 404', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedTripWithTwoStops(database, { status: 'cancelled' })
      const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')

      let error: unknown
      try {
        await reportStopDeparture(
          departureInput(world, unitOfWork, {
            idempotencyKey: 'depart-1',
            stopId: world.stopIds[0] ?? '',
          }),
        )
      } catch (caught) {
        error = caught
      }
      expect(error).toBeInstanceOf(ApiError)
      expect((error as ApiError).code).toBe('TRIP_STOP_NOT_REACHABLE')
    })
  })

  /**
   * D2: tappedAt anterior ao último arrived da viagem vira no-op — mesmo sem outra parada a
   * caminho. O despacho congelado e a chegada entram com hora explícita (em vez do `defaultNow()`
   * do banco, hora real da máquina): sem isso, o `tappedAt` de teste cairia fora da janela do
   * despacho (D3) por acaso, não pela intenção do caso.
   */
  testWithPostgres('tappedAt anterior à última chegada da viagem é no-op', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedTripWithTwoStops(database)
      const unitOfWork = new DrizzleDriverFieldReportUnitOfWork(database.db, 'test-bucket')
      const dispatchedAt = new Date(NOW.getTime() - 2 * 3_600_000)
      await database.db.insert(tripDispatchSnapshots).values({
        actorUserId: world.userId,
        companyId: world.companyId,
        dispatchedAt,
        snapshot: {},
        snapshotSha256: '0'.repeat(64),
        tripId: world.tripId,
      })
      await database.db.insert(tripStopEvents).values({
        actorUserId: world.userId,
        companyId: world.companyId,
        createdAt: NOW,
        kind: 'arrived',
        recordedAt: NOW,
        stopId: world.stopIds[0] ?? '',
      })

      const result = await reportStopDeparture(
        departureInput(world, unitOfWork, {
          idempotencyKey: 'depart-tarde',
          stopId: world.stopIds[1] ?? '',
          tappedAt: new Date(NOW.getTime() - 10 * 60_000),
        }),
      )

      expect(result).toEqual({ changed: false, id: null })
    })
  })
})

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_206_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
    // Disposable database identifiers cannot be parameterized.
    await admin.unsafe(`create database "${databaseName}"`)
    await runDatabaseMigrations({ connectionString: disposableUrl.toString() })
    database = createDrizzleProvider({ connection: disposableUrl.toString() })
    await operation(database)
  } finally {
    try {
      await database?.close()
    } finally {
      try {
        await admin.unsafe(`drop database if exists "${databaseName}" with (force)`)
      } finally {
        await admin.close({ timeout: 0 })
      }
    }
  }
}
