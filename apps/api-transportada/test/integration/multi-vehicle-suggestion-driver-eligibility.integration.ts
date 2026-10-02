/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies, fleetDrivers } from '../../src/database/database.schema.js'
import { createDrizzleMultiVehicleSuggestionRepository } from '../../src/routing/infrastructure/drizzle-multi-vehicle-suggestion.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

/** Spec 234 D5: a proposta separa quem dirige de quem só ajuda, nas duas pontas da tripulação. */
describe('elegibilidade de motorista e ajudante da multi-veículo contra Postgres (spec 234)', () => {
  testWithPostgres('só quem dirige é motorista, e só quem ajuda é ajudante', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = crypto.randomUUID()
      const otherCompanyId = crypto.randomUUID()
      const driverId = crypto.randomUUID()
      const helperOnlyId = crypto.randomUUID()
      const driverWhoHelpsId = crypto.randomUUID()
      const otherCompanyDriverId = crypto.randomUUID()
      await database.db.insert(companies).values([
        { id: companyId, status: 'active' },
        { id: otherCompanyId, status: 'active' },
      ])
      await database.db.insert(fleetDrivers).values([
        { companyId, id: driverId, name: 'Motorista', taxId: '11111111111' },
        {
          canActAsHelper: true,
          canDrive: false,
          companyId,
          id: helperOnlyId,
          name: 'Ajudante',
          taxId: '22222222222',
        },
        {
          canActAsHelper: true,
          companyId,
          id: driverWhoHelpsId,
          name: 'Motorista que ajuda',
          taxId: '33333333333',
        },
        {
          canActAsHelper: true,
          companyId: otherCompanyId,
          id: otherCompanyDriverId,
          name: 'Motorista de fora que ajuda',
          taxId: '44444444444',
        },
      ])
      const repository = createDrizzleMultiVehicleSuggestionRepository(database.db)
      const everyone = [driverId, helperOnlyId, driverWhoHelpsId, otherCompanyDriverId]

      expect(await repository.findIneligibleDriverIds({ companyId, driverIds: everyone })).toEqual([
        helperOnlyId,
        otherCompanyDriverId,
      ])
      expect(await repository.findIneligibleDriverIds({ companyId, driverIds: [] })).toEqual([])
      // O ajudante-puro segue elegível como ajudante; quem só dirige não
      expect(await repository.findIneligibleHelperIds({ companyId, helperIds: everyone })).toEqual([
        driverId,
        otherCompanyDriverId,
      ])
    })
  })
})

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t234_${crypto.randomUUID().replaceAll('-', '')}`
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
