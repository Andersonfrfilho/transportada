/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import { companies } from '../../src/database/database.schema'
import { DrizzleDeliveryProofSettingsRepository } from '../../src/trips/infrastructure/drizzle-delivery-proof-settings.repository'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const FIELDS = {
  photo: 'required',
  receiverDocument: 'off',
  receiverName: 'optional',
  signature: 'optional',
} as const

/**
 * Spec 156 T13, ADR-0069 §6: o painel (`settings.manage`) escreve o interruptor na configuração do
 * comprovante, e o escritório (`trip.report-on-behalf`) lê só ele. As duas leituras nunca divergem,
 * e sem linha gravada vale `false`.
 */
describe('o interruptor da leitura do canhoto (spec 156 T13, ADR-0069)', () => {
  testWithPostgres(
    'sem linha, as duas leituras dão desligado',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = await seedCompany(database)
        const repository = new DrizzleDeliveryProofSettingsRepository(database.db)

        expect((await repository.readSettings({ companyId })).canhotoOcrEnabled).toBe(false)
        expect(await repository.readCanhotoOcrEnabled({ companyId })).toBe(false)
      })
    },
    60_000,
  )

  testWithPostgres(
    'gravar os quatro campos sem o interruptor cria a linha desligada',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = await seedCompany(database)
        const repository = new DrizzleDeliveryProofSettingsRepository(database.db)

        const saved = await repository.saveSettings({ companyId, settings: FIELDS })

        expect(saved).toEqual({ ...FIELDS, canhotoOcrEnabled: false })
        expect(await repository.readCanhotoOcrEnabled({ companyId })).toBe(false)
      })
    },
    60_000,
  )

  testWithPostgres(
    'ligar reflete na leitura do escritório; gravar os campos depois sem o interruptor não desliga',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = await seedCompany(database)
        const repository = new DrizzleDeliveryProofSettingsRepository(database.db)

        await repository.saveSettings({
          companyId,
          settings: { ...FIELDS, canhotoOcrEnabled: true },
        })
        expect(await repository.readCanhotoOcrEnabled({ companyId })).toBe(true)

        const saved = await repository.saveSettings({
          companyId,
          settings: { ...FIELDS, photo: 'optional' },
        })

        expect(saved).toEqual({ ...FIELDS, canhotoOcrEnabled: true, photo: 'optional' })
        expect(await repository.readCanhotoOcrEnabled({ companyId })).toBe(true)
      })
    },
    60_000,
  )

  testWithPostgres(
    'desligar de novo some da leitura do escritório',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = await seedCompany(database)
        const repository = new DrizzleDeliveryProofSettingsRepository(database.db)
        await repository.saveSettings({
          companyId,
          settings: { ...FIELDS, canhotoOcrEnabled: true },
        })

        await repository.saveSettings({
          companyId,
          settings: { ...FIELDS, canhotoOcrEnabled: false },
        })

        expect(await repository.readCanhotoOcrEnabled({ companyId })).toBe(false)
        expect((await repository.readSettings({ companyId })).canhotoOcrEnabled).toBe(false)
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
        const repository = new DrizzleDeliveryProofSettingsRepository(database.db)
        await repository.saveSettings({ companyId: otherCompanyId, settings: FIELDS })

        await repository.saveSettings({
          companyId,
          settings: { ...FIELDS, canhotoOcrEnabled: true },
        })

        expect(await repository.readCanhotoOcrEnabled({ companyId })).toBe(true)
        expect(await repository.readCanhotoOcrEnabled({ companyId: otherCompanyId })).toBe(false)
        expect(
          (await repository.readSettings({ companyId: otherCompanyId })).canhotoOcrEnabled,
        ).toBe(false)
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
  const databaseName = `transportada_canhoto_ocr_${crypto.randomUUID().replaceAll('-', '')}`
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
