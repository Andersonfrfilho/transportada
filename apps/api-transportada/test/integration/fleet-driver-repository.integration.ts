/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies } from '../../src/database/database.schema.js'
import { FleetDriverProfileEmptyError } from '../../src/fleet/domain/fleet.error.js'
import { DrizzleFleetDriverRepository } from '../../src/fleet/infrastructure/drizzle-fleet-driver.repository.js'
import { DRIVER_FIELDS } from '../fixtures/fleet-http-payload.fixture'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const HELPER_ONLY_FIELDS = {
  ...DRIVER_FIELDS,
  canActAsHelper: true,
  licenseCategory: '',
  licenseExpiresAt: null,
  licenseNumber: '',
  membershipId: null,
} as const

describe('fleet driver repository integration (spec 234)', () => {
  testWithPostgres('persists and reads the crew columns the profile chose', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, repository } = await setUp(database)

      const helper = await repository.create({
        canDrive: false,
        companyId,
        driver: HELPER_ONLY_FIELDS,
      })
      const driver = await repository.create({
        canDrive: true,
        companyId,
        driver: { ...DRIVER_FIELDS, membershipId: null, taxId: '98765432100' },
      })

      expect([helper.canDrive, helper.canActAsHelper]).toEqual([false, true])
      expect([driver.canDrive, driver.canActAsHelper]).toEqual([true, false])
      const reread = await repository.findById({ companyId, driverId: helper.id })
      expect(reread?.canDrive).toBe(false)
      const page = await repository.list({ companyId, cursor: null, limit: 10 })
      expect(page.items.map((item) => [item.id, item.canDrive]).sort()).toEqual(
        [
          [helper.id, false],
          [driver.id, true],
        ].sort(),
      )
    })
  })

  testWithPostgres('refuses a helper-only ficha that would stop helping, as 409', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, repository } = await setUp(database)
      const helper = await repository.create({
        canDrive: false,
        companyId,
        driver: HELPER_ONLY_FIELDS,
      })

      const failure = await repository
        .update({
          companyId,
          driver: { ...HELPER_ONLY_FIELDS, canActAsHelper: false },
          driverId: helper.id,
          expectedVersion: helper.version,
          status: 'active',
        })
        .catch((error: unknown) => error)

      expect(failure).toBeInstanceOf(FleetDriverProfileEmptyError)
      expect((failure as FleetDriverProfileEmptyError).status).toBe(409)
      const unchanged = await repository.findById({ companyId, driverId: helper.id })
      expect([unchanged?.canActAsHelper, unchanged?.canDrive, unchanged?.version]).toEqual([
        true,
        false,
        helper.version,
      ])
    })
  })

  testWithPostgres('keeps can_drive out of the update and still honours the version', async () => {
    await withDisposableDatabase(async (database) => {
      const { companyId, repository } = await setUp(database)
      const helper = await repository.create({
        canDrive: false,
        companyId,
        driver: HELPER_ONLY_FIELDS,
      })
      const driver = await repository.create({
        canDrive: true,
        companyId,
        driver: { ...DRIVER_FIELDS, membershipId: null, taxId: '98765432100' },
      })

      const renamedHelper = await repository.update({
        companyId,
        driver: { ...HELPER_ONLY_FIELDS, name: 'Maria Ajudante' },
        driverId: helper.id,
        expectedVersion: helper.version,
        status: 'active',
      })
      const driverNowHelps = await repository.update({
        companyId,
        driver: {
          ...DRIVER_FIELDS,
          canActAsHelper: true,
          membershipId: null,
          taxId: '98765432100',
        },
        driverId: driver.id,
        expectedVersion: driver.version,
        status: 'active',
      })
      const driverStopsHelping = await repository.update({
        companyId,
        driver: {
          ...DRIVER_FIELDS,
          canActAsHelper: false,
          membershipId: null,
          taxId: '98765432100',
        },
        driverId: driver.id,
        expectedVersion: driverNowHelps?.version ?? '',
        status: 'active',
      })
      // Versão velha numa ficha que a escrita esvaziaria: nenhuma linha casa, então nada é avaliado
      const stale = await repository.update({
        companyId,
        driver: { ...HELPER_ONLY_FIELDS, canActAsHelper: false },
        driverId: helper.id,
        expectedVersion: helper.version,
        status: 'active',
      })

      expect([renamedHelper?.canDrive, renamedHelper?.canActAsHelper]).toEqual([false, true])
      expect([driverNowHelps?.canDrive, driverNowHelps?.canActAsHelper]).toEqual([true, true])
      expect([driverStopsHelping?.canDrive, driverStopsHelping?.canActAsHelper]).toEqual([
        true,
        false,
      ])
      expect(stale).toBeNull()
    })
  })
})

type TestDatabase = ReturnType<typeof createDrizzleProvider>

async function setUp(database: TestDatabase): Promise<{
  readonly companyId: string
  readonly repository: DrizzleFleetDriverRepository
}> {
  const companyId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  return { companyId, repository: new DrizzleFleetDriverRepository(database.db) }
}

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
