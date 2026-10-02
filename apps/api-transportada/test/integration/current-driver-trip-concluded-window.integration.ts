/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 225 T1.3 (CA1) — `GET /me/trips/current` devolve a viagem recém-concluída por uma janela
 * curta. O que está em jogo é o predicado da consulta, e dublê passa com qualquer predicado: só
 * Postgres de verdade prova a janela contra o relógio do banco.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq, sql } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { tripDrivers, trips, type TripStatus } from '../../src/database/trip.schema.js'
import { DrizzleDriverScoreRepository } from '../../src/fleet/infrastructure/drizzle-driver-score.repository.js'
import { findCurrentDriverTrip } from '../../src/trips/application/find-current-driver-trip.use-case.js'
import { DrizzleCurrentDriverTripRepository } from '../../src/trips/infrastructure/drizzle-current-driver-trip.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const MINUTES_INSIDE_WINDOW = 5
const MINUTES_OUTSIDE_WINDOW = 120

type World = {
  readonly companyId: string
  readonly membershipId: string
  readonly tripId: string
}

async function seedDriverWithTrip(
  database: TestDatabase,
  input: { readonly minutesSinceUpdate: number; readonly status: TripStatus },
): Promise<World> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const membershipId = crypto.randomUUID()
  const driverId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const tripId = crypto.randomUUID()

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
  await database.db.insert(trips).values({ companyId, id: tripId, status: input.status, vehicleId })
  await database.db.insert(tripDrivers).values({
    companyId,
    driverId,
    driverName: 'Motorista de Campo',
    driverTaxId: '11111111111',
    position: 1n,
    tripId,
  })
  // O relógio do banco, não o do teste: a janela da consulta também é `now()` do Postgres.
  await database.db
    .update(trips)
    .set({ updatedAt: sql`now() - make_interval(mins => ${input.minutesSinceUpdate})` })
    .where(eq(trips.id, tripId))

  return { companyId, membershipId, tripId }
}

async function readCurrentTrips(database: TestDatabase, world: World) {
  const result = await findCurrentDriverTrip({
    companyId: world.companyId,
    membershipId: world.membershipId,
    now: new Date(),
    repository: new DrizzleCurrentDriverTripRepository(database.db),
    scores: new DrizzleDriverScoreRepository(database.db),
  })

  return result.trips.map((trip) => ({ id: trip.id, status: trip.status }))
}

describe('a viagem recém-concluída na lista do motorista (spec 225 CA1)', () => {
  testWithPostgres('concluída dentro da janela aparece com o status real', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDriverWithTrip(database, {
        minutesSinceUpdate: MINUTES_INSIDE_WINDOW,
        status: 'completed',
      })

      expect(await readCurrentTrips(database, world)).toEqual([
        { id: world.tripId, status: 'completed' },
      ])
    })
  })

  testWithPostgres('cancelada dentro da janela aparece com o status real', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDriverWithTrip(database, {
        minutesSinceUpdate: MINUTES_INSIDE_WINDOW,
        status: 'cancelled',
      })

      expect(await readCurrentTrips(database, world)).toEqual([
        { id: world.tripId, status: 'cancelled' },
      ])
    })
  })

  testWithPostgres('concluída fora da janela não aparece', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDriverWithTrip(database, {
        minutesSinceUpdate: MINUTES_OUTSIDE_WINDOW,
        status: 'completed',
      })

      expect(await readCurrentTrips(database, world)).toEqual([])
    })
  })

  testWithPostgres('a viagem ativa continua aparecendo, por mais velha que seja', async () => {
    await withDisposableDatabase(async (database) => {
      const world = await seedDriverWithTrip(database, {
        minutesSinceUpdate: MINUTES_OUTSIDE_WINDOW,
        status: 'on_delivery_route',
      })

      expect(await readCurrentTrips(database, world)).toEqual([
        { id: world.tripId, status: 'on_delivery_route' },
      ])
    })
  })
})

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_224_${crypto.randomUUID().replaceAll('-', '')}`
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
