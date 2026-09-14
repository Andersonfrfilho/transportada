/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 095 item 4: prova que a leitura de `trips.planned_toll` funciona contra o Postgres de
 * verdade — o parser puro já tem cobertura em `test/toll-booths/toll-booth-sighting-policy.contract.ts`.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { DrizzleTollBoothSightingRepository } from '../../src/trips/infrastructure/drizzle-toll-booth-sighting.repository.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies, fleetVehicles, trips } from '../../src/database/database.schema.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

function toll(osmNodeIds: readonly number[]): unknown {
  return {
    axles: { count: 2, source: 'declared' },
    booths: osmNodeIds.map((osmNodeId) => ({
      chargeCar: null,
      chargePerAxle: '10.5000',
      chargePerAxleAutomatic: null,
      latitude: '-21.1000000',
      longitude: '-47.8000000',
      name: 'Praça SP-330',
      operator: 'CCR',
      osmNodeId,
    })),
    boothsFallenBackToManual: 0,
    boothsWithoutCharge: 0,
    chargePerAxle: '10.5000',
    paymentMode: 'manual',
    total: '21.0000',
  }
}

describe('toll booth sighting repository integration (spec 095 item 4)', () => {
  testWithPostgres('answers empty for a company that never planned a route with toll', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      await seedTrip({ companyId, database, plannedToll: null })

      const seen = await new DrizzleTollBoothSightingRepository(database.db).readSeenOsmNodeIds({
        companyId,
      })

      expect(seen).toEqual([])
    })
  })

  testWithPostgres('answers the distinct nodes across the trips of the company', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      const vehicleId = await seedVehicle({ companyId, database })
      await seedTrip({
        companyId,
        database,
        plannedToll: toll([111, 222]),
        tripId: crypto.randomUUID(),
        vehicleId,
      })
      await seedTrip({
        companyId,
        database,
        plannedToll: toll([222, 333]),
        tripId: crypto.randomUUID(),
        vehicleId,
      })

      const seen = await new DrizzleTollBoothSightingRepository(database.db).readSeenOsmNodeIds({
        companyId,
      })

      expect([...seen].sort((left, right) => left - right)).toEqual([111, 222, 333])
    })
  })

  // Nunca a praça de outra empresa — mesmo cenário de isolamento das demais consultas de pedágio
  testWithPostgres('never mixes toll booths seen by another company', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      const otherCompanyId = await seedCompany(database)
      const vehicleId = await seedVehicle({ companyId, database })
      const otherVehicleId = await seedVehicle({ companyId: otherCompanyId, database })
      await seedTrip({ companyId, database, plannedToll: toll([111]), vehicleId })
      await seedTrip({
        companyId: otherCompanyId,
        database,
        plannedToll: toll([222]),
        vehicleId: otherVehicleId,
      })

      const seen = await new DrizzleTollBoothSightingRepository(database.db).readSeenOsmNodeIds({
        companyId,
      })

      expect(seen).toEqual([111])
    })
  })
})

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function seedCompany(database: TestDatabase): Promise<string> {
  const companyId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  return companyId
}

async function seedVehicle(input: {
  readonly companyId: string
  readonly database: TestDatabase
}): Promise<string> {
  const vehicleId = crypto.randomUUID()
  await input.database.db.insert(fleetVehicles).values({
    companyId: input.companyId,
    id: vehicleId,
    plate: 'GCQ8E47',
    role: 'traction',
    state: 'SP',
    vehicleType: 'tractor_unit',
  })
  return vehicleId
}

async function seedTrip(input: {
  readonly companyId: string
  readonly database: TestDatabase
  readonly plannedToll: unknown
  readonly tripId?: string
  readonly vehicleId?: string
}): Promise<void> {
  const vehicleId = input.vehicleId ?? (await seedVehicle(input))
  await input.database.db.insert(trips).values({
    companyId: input.companyId,
    id: input.tripId ?? crypto.randomUUID(),
    plannedToll: input.plannedToll,
    plannedTollFrozenAt: input.plannedToll === null ? null : new Date(),
    vehicleId,
  })
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_toll_sighting_${crypto.randomUUID().replaceAll('-', '')}`
  const disposableUrl = new URL(databaseUrl)
  disposableUrl.pathname = `/${databaseName}`
  disposableUrl.search = ''
  let database: TestDatabase | undefined
  try {
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
