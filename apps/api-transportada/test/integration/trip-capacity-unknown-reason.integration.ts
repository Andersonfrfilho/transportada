/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies, fleetVehicles } from '../../src/database/database.schema.js'
import { trips } from '../../src/database/trip.schema.js'
import { DrizzleTripRepository } from '../../src/trips/infrastructure/drizzle-trip.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

/**
 * Spec 147 D2/RF4/T4: a ocupação nomeia por que não sabe a capacidade — e o nome muda assim que a
 * ficha do veículo é corrigida, sem tocar na viagem.
 */
describe('a viagem publica o motivo da capacidade desconhecida (spec 147 T4)', () => {
  testWithPostgres(
    'truck com body_type 00 e sem ficha vira bodyTypeMissing; ficha 02 vira reference',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        const vehicleId = crypto.randomUUID()
        const tripId = crypto.randomUUID()

        await database.db.insert(companies).values({ id: companyId, status: 'active' })
        await database.db.insert(fleetVehicles).values({
          bodyType: '00',
          companyId,
          id: vehicleId,
          plate: 'ABC1D23',
          role: 'traction',
          state: 'SP',
          vehicleType: 'truck',
        })
        await database.db
          .insert(trips)
          .values({ companyId, id: tripId, status: 'draft', vehicleId })

        const repository = new DrizzleTripRepository(database.db)

        const withMissingBody = await repository.findById({ companyId, tripId })
        expect(withMissingBody?.occupancy).toBeNull()
        expect(withMissingBody?.capacityUnknownReason).toBe('bodyTypeMissing')

        await database.db
          .update(fleetVehicles)
          .set({ bodyType: '02' })
          .where(eq(fleetVehicles.id, vehicleId))

        const withReference = await repository.findById({ companyId, tripId })
        expect(withReference?.capacityUnknownReason).toBeNull()
        expect(withReference?.occupancy?.capacitySource).toBe('reference')
      })
    },
  )
})

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t147t4_${crypto.randomUUID().replaceAll('-', '')}`
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
