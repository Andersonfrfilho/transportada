/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import { companies } from '../../src/database/database.schema'
import { DrizzleCargoSettingsRepository } from '../../src/companies/infrastructure/drizzle-cargo-settings.repository'
import { DrizzleCameraMeasurementSettingsRepository } from '../../src/nfe-documents/infrastructure/drizzle-camera-measurement-settings.repository'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

/**
 * Spec 152 D14: o painel (`companies`, `settings.manage`) escreve, e o conferente
 * (`nfe-documents`, `cargo.measure`) lê a mesma coluna por uma porta própria — as duas nunca podem
 * divergir, e a ausência de linha é sempre `false`.
 */
describe('o interruptor por empresa da medida pela câmera (spec 152 D14)', () => {
  testWithPostgres(
    'sem linha em company_cargo_settings, as duas portas leem desligado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = await seedCompany(database)
        const cargoSettings = new DrizzleCargoSettingsRepository(database.db)
        const cameraMeasurementSettings = new DrizzleCameraMeasurementSettingsRepository(
          database.db,
        )

        const loaded = await cargoSettings.load({ companyId })
        const readEnabled = await cameraMeasurementSettings.readEnabled({ companyId })

        expect(loaded.cameraMeasurementEnabled).toBe(false)
        expect(loaded.defaultVolumeWeight).toBeNull()
        expect(readEnabled).toBe(false)
      })
    },
    60_000,
  )

  testWithPostgres(
    'ligar reflete de imediato na porta do conferente, sem tocar no peso padrão',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = await seedCompany(database)
        const cargoSettings = new DrizzleCargoSettingsRepository(database.db)
        const cameraMeasurementSettings = new DrizzleCameraMeasurementSettingsRepository(
          database.db,
        )
        await cargoSettings.saveDefaultVolumeWeight({ companyId, defaultVolumeWeight: '12.5000' })

        await cargoSettings.setCameraMeasurementEnabled({ companyId, enabled: true })

        expect(await cameraMeasurementSettings.readEnabled({ companyId })).toBe(true)
        const loaded = await cargoSettings.load({ companyId })
        expect(loaded.cameraMeasurementEnabled).toBe(true)
        expect(loaded.defaultVolumeWeight).toBe('12.5000')
      })
    },
    60_000,
  )

  testWithPostgres(
    'desligar de novo some da porta do conferente, sem apagar o peso padrão gravado depois',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = await seedCompany(database)
        const cargoSettings = new DrizzleCargoSettingsRepository(database.db)
        const cameraMeasurementSettings = new DrizzleCameraMeasurementSettingsRepository(
          database.db,
        )
        await cargoSettings.setCameraMeasurementEnabled({ companyId, enabled: true })
        await cargoSettings.saveDefaultVolumeWeight({ companyId, defaultVolumeWeight: '3.0000' })

        await cargoSettings.setCameraMeasurementEnabled({ companyId, enabled: false })

        expect(await cameraMeasurementSettings.readEnabled({ companyId })).toBe(false)
        const loaded = await cargoSettings.load({ companyId })
        expect(loaded.defaultVolumeWeight).toBe('3.0000')
      })
    },
    60_000,
  )

  testWithPostgres(
    'ligar numa empresa não vaza para outra (contrato de tenant)',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = await seedCompany(database)
        const otherCompanyId = await seedCompany(database)
        const cargoSettings = new DrizzleCargoSettingsRepository(database.db)
        const cameraMeasurementSettings = new DrizzleCameraMeasurementSettingsRepository(
          database.db,
        )

        await cargoSettings.setCameraMeasurementEnabled({ companyId, enabled: true })

        expect(await cameraMeasurementSettings.readEnabled({ companyId })).toBe(true)
        expect(await cameraMeasurementSettings.readEnabled({ companyId: otherCompanyId })).toBe(
          false,
        )
        const otherLoaded = await cargoSettings.load({ companyId: otherCompanyId })
        expect(otherLoaded.cameraMeasurementEnabled).toBe(false)
      })
    },
    60_000,
  )
})

async function seedCompany(database: TestDatabase): Promise<string> {
  const companyId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  return companyId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_cammeas_${crypto.randomUUID().replaceAll('-', '')}`
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
