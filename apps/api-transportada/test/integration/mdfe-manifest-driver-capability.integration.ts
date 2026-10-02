/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies, fleetDrivers } from '../../src/database/database.schema.js'
import { DrizzleMdfeManifestRepository } from '../../src/mdfe-manifests/infrastructure/drizzle-mdfe-manifest.repository.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

/** Spec 234 D5: o candidato a condutor do MDF-e avulso diz se a ficha dirige. */
describe('condutores do MDF-e avulso contra Postgres (spec 234)', () => {
  testWithPostgres('lista canDrive de cada ficha e só as da empresa', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = crypto.randomUUID()
      const otherCompanyId = crypto.randomUUID()
      const driverId = crypto.randomUUID()
      const helperOnlyId = crypto.randomUUID()
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
          companyId: otherCompanyId,
          id: otherCompanyDriverId,
          name: 'De fora',
          taxId: '33333333333',
        },
      ])
      const repository = new DrizzleMdfeManifestRepository(database.db)

      const drivers = await repository.listDrivers({
        companyId,
        driverIds: [driverId, helperOnlyId, otherCompanyDriverId],
      })

      const canDriveById = new Map(drivers.map((driver) => [driver.id, driver.canDrive]))
      expect(drivers).toHaveLength(2)
      expect(canDriveById.get(driverId)).toBe(true)
      expect(canDriveById.get(helperOnlyId)).toBe(false)
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
