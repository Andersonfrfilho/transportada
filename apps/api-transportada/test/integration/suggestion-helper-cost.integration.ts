/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 149 T7 — contra Postgres: a consulta nova (`DrizzleTripValuationQuery.readHelperOwnDailyRates`)
 * junta a diária própria de vários ajudantes numa leitura só, presa ao tenant do contexto — a mesma
 * leitura que a proposta multi-veículo usa para não repetir a consulta por veículo (D7, sem N+1).
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies, fleetDrivers } from '../../src/database/database.schema.js'
import { companyCrewSettings } from '../../src/database/company-crew-settings.schema.js'
import { DrizzleTripValuationQuery } from '../../src/trips/infrastructure/trip-valuation.query.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

/** A valoração avisa por log quando um id de motorista não responde; aqui o aviso não interessa. */
const SILENT_LOGGER = { error: () => undefined, info: () => undefined, warn: () => undefined }

type TestDatabase = ReturnType<typeof createDrizzleProvider>

describe('a diária do ajudante fora da viagem, contra Postgres (spec 149 T7)', () => {
  testWithPostgres(
    'lê a diária própria de vários ajudantes numa consulta só, presa à empresa do contexto',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        const otherCompanyId = crypto.randomUUID()
        const helperWithOwnRateId = crypto.randomUUID()
        const helperWithoutOwnRateId = crypto.randomUUID()
        const otherCompanyHelperId = crypto.randomUUID()

        await database.db.insert(companies).values([
          { id: companyId, status: 'active' },
          { id: otherCompanyId, status: 'active' },
        ])
        await database.db.insert(companyCrewSettings).values({
          companyId,
          helperDailyRate: '120.0000',
        })
        await database.db.insert(fleetDrivers).values([
          {
            companyId,
            helperDailyRate: '150.0000',
            id: helperWithOwnRateId,
            name: 'Ajudante com diária própria',
            taxId: '11111111111',
          },
          {
            companyId,
            id: helperWithoutOwnRateId,
            name: 'Ajudante sem diária própria',
            taxId: '22222222222',
          },
          /** Mesmo id de negócio em outra empresa não pode aparecer na resposta (tenant-safety). */
          {
            companyId: otherCompanyId,
            helperDailyRate: '999.0000',
            id: otherCompanyHelperId,
            name: 'Ajudante de outra empresa',
            taxId: '33333333333',
          },
        ])

        const query = new DrizzleTripValuationQuery(database.db, SILENT_LOGGER)

        const ownRates = await query.readHelperOwnDailyRates({
          companyId,
          driverIds: [helperWithOwnRateId, helperWithoutOwnRateId, otherCompanyHelperId],
        })

        expect(ownRates.get(helperWithOwnRateId)).toBe('150.0000')
        expect(ownRates.get(helperWithoutOwnRateId)).toBeNull()
        /** ⚠️ Tenant-safety: o id existe, mas em outra empresa — a consulta não vaza a linha dela. */
        expect(ownRates.has(otherCompanyHelperId)).toBe(false)

        const companyDailyRate = await query.readHelperCompanyDailyRate({ companyId })
        expect(companyDailyRate).toBe('120.0000')

        const otherCompanyDailyRate = await query.readHelperCompanyDailyRate({
          companyId: otherCompanyId,
        })
        expect(otherCompanyDailyRate).toBeNull()
      })
    },
    60_000,
  )

  testWithPostgres(
    'sem ids, não consulta o banco e devolve mapa vazio',
    async () => {
      await withDisposableDatabase(async (database) => {
        const query = new DrizzleTripValuationQuery(database.db, SILENT_LOGGER)

        const ownRates = await query.readHelperOwnDailyRates({
          companyId: crypto.randomUUID(),
          driverIds: [],
        })

        expect(ownRates.size).toBe(0)
      })
    },
    60_000,
  )
})

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_149_t7_${crypto.randomUUID().replaceAll('-', '')}`
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
