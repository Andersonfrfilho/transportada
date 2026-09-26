/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 216: o `UPDATE`/`DELETE`+`INSERT` de `updateCrew` roda numa transação com lock — o teste com
 * repositório fake nunca exercita a constraint composta `trips_company_vehicle_fk` nem o
 * compare-and-set do status sob `SELECT … FOR NO KEY UPDATE`.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  fleetDrivers,
  fleetVehicles,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema.js'
import { trips, tripDrivers } from '../../src/database/trip.schema.js'
import { TRIP_FIELD_CHANNELS } from '../../src/trips/domain/trip-field-channel.constant.js'
import { TripStateTransitionNotAllowedError } from '../../src/trips/domain/trip.error.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const DISPOSABLE_DATABASE_TIMEOUT_MS = 60_000

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_crewupdate_${crypto.randomUUID().replaceAll('-', '')}`
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

async function seedCompanyFleet(database: TestDatabase['db']): Promise<{
  readonly companyId: string
  readonly firstDriverId: string
  readonly firstVehicleId: string
  readonly secondDriverId: string
  readonly secondVehicleId: string
  readonly userId: string
}> {
  const companyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const firstDriverId = crypto.randomUUID()
  const secondDriverId = crypto.randomUUID()
  const firstVehicleId = crypto.randomUUID()
  const secondVehicleId = crypto.randomUUID()

  await database.insert(companies).values({ id: companyId, status: 'active' })
  await database.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.insert(userCompanyMemberships).values({
    companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId,
  })
  await database.insert(fleetVehicles).values([
    {
      companyId,
      id: firstVehicleId,
      plate: 'ABC1D23',
      role: 'traction',
      state: 'SP',
      vehicleType: 'tractor_unit',
    },
    {
      companyId,
      id: secondVehicleId,
      plate: 'XYZ9E88',
      role: 'traction',
      state: 'SP',
      vehicleType: 'truck',
    },
  ])
  await database.insert(fleetDrivers).values([
    { companyId, id: firstDriverId, name: 'Primeiro Motorista', taxId: '11111111111' },
    { companyId, id: secondDriverId, name: 'Segundo Motorista', taxId: '22222222222' },
  ])

  return { companyId, firstDriverId, firstVehicleId, secondDriverId, secondVehicleId, userId }
}

describe('troca de motorista/veículo de uma viagem, contra Postgres', () => {
  testWithPostgres(
    'troca a tripulação de uma viagem draft para outro motorista e veículo',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const fleet = await seedCompanyFleet(db)
        const repository = new DrizzleTripRepository(db)

        const created = await repository.create({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.firstDriverId,
              driverName: 'Primeiro Motorista',
              driverTaxId: '11111111111',
              position: 1,
            },
          ],
          vehicleId: fleet.firstVehicleId,
        })
        expect(created.status).toBe('draft')

        const updated = await repository.updateCrew({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.secondDriverId,
              driverName: 'Segundo Motorista',
              driverTaxId: '22222222222',
              position: 1,
            },
          ],
          tripId: created.id,
          vehicleId: fleet.secondVehicleId,
        })

        expect(updated?.status).toBe('draft')

        const [tripRow] = await db
          .select({ vehicleId: trips.vehicleId })
          .from(trips)
          .where(eq(trips.id, created.id))
        expect(tripRow?.vehicleId).toBe(fleet.secondVehicleId)

        const drivers = await db
          .select({ driverId: tripDrivers.driverId })
          .from(tripDrivers)
          .where(
            and(eq(tripDrivers.companyId, fleet.companyId), eq(tripDrivers.tripId, created.id)),
          )
        expect(drivers).toEqual([{ driverId: fleet.secondDriverId }])
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )

  testWithPostgres(
    'recusa a troca depois que o roteiro já foi planejado',
    async () => {
      await withDisposableDatabase(async ({ db }) => {
        const fleet = await seedCompanyFleet(db)
        const repository = new DrizzleTripRepository(db)

        const created = await repository.create({
          actorUserId: fleet.userId,
          channel: TRIP_FIELD_CHANNELS.backoffice,
          companyId: fleet.companyId,
          crew: [
            {
              driverId: fleet.firstDriverId,
              driverName: 'Primeiro Motorista',
              driverTaxId: '11111111111',
              position: 1,
            },
          ],
          vehicleId: fleet.firstVehicleId,
        })
        await db.update(trips).set({ status: 'route_planned' }).where(eq(trips.id, created.id))

        await expect(
          repository.updateCrew({
            actorUserId: fleet.userId,
            channel: TRIP_FIELD_CHANNELS.backoffice,
            companyId: fleet.companyId,
            crew: [
              {
                driverId: fleet.secondDriverId,
                driverName: 'Segundo Motorista',
                driverTaxId: '22222222222',
                position: 1,
              },
            ],
            tripId: created.id,
            vehicleId: fleet.secondVehicleId,
          }),
        ).rejects.toThrow(TripStateTransitionNotAllowedError)

        const [tripRow] = await db
          .select({ vehicleId: trips.vehicleId })
          .from(trips)
          .where(eq(trips.id, created.id))
        expect(tripRow?.vehicleId).toBe(fleet.firstVehicleId)
      })
    },
    DISPOSABLE_DATABASE_TIMEOUT_MS,
  )
})
