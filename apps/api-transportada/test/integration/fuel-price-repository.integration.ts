/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { DrizzleFuelPriceRepository } from '../../src/companies/infrastructure/drizzle-fuel-price.repository.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import {
  companies,
  companyEnergySettings,
  energyTariffReferences,
} from '../../src/database/database.schema.js'
import { formatFiscalDay } from '../../src/shared/fiscal-day.service.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const DISTRIBUTOR_CODE = 'CERACA'
const DISTRIBUTOR_TAX_ID = '12345678000195'

/** Recorte que a coleta grava; a leitura precisa fixar o mesmo, senão lê a tarifa de outro subgrupo. */
const COLLECTED_SUBGROUP = 'B3'
const COLLECTED_MODALITY = 'Convencional'

describe('fuel price repository energy integration', () => {
  testWithPostgres('reads the tariff in force for the distributor the company chose', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      await chooseDistributor({ companyId, database })
      await insertTariff({ database })

      const facts = await new DrizzleFuelPriceRepository(database.db).loadFacts({ companyId })

      expect(facts.energy).toEqual({
        adjustmentFactor: '1.3500',
        distributorCode: DISTRIBUTOR_CODE,
        effectiveFrom: dayFrom(-30),
        effectiveTo: dayFrom(30),
        tePerMegawattHour: '227.7000',
        tusdPerMegawattHour: '567.8000',
      })
    })
  })

  testWithPostgres('reports no tariff while the company has not chosen a distributor', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      await insertTariff({ database })

      const facts = await new DrizzleFuelPriceRepository(database.db).loadFacts({ companyId })

      expect(facts.energy).toBeNull()
    })
  })

  /** Tarifa vencida é preço de ontem: emprestá-la hoje seria o R$/km da frota parado no passado. */
  testWithPostgres('never lends a tariff whose vigência has already closed', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      await chooseDistributor({ companyId, database })
      await insertTariff({ database, effectiveFrom: dayFrom(-400), effectiveTo: dayFrom(-30) })

      const facts = await new DrizzleFuelPriceRepository(database.db).loadFacts({ companyId })

      expect(facts.energy).toBeNull()
    })
  })

  testWithPostgres(
    'never lends the tariff of a distributor the company did not choose',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = await seedCompany(database)
        await chooseDistributor({ companyId, database })
        await insertTariff({ database, distributorCode: 'ENELSP' })

        const facts = await new DrizzleFuelPriceRepository(database.db).loadFacts({ companyId })

        expect(facts.energy).toBeNull()
      })
    },
  )

  /**
   * O recorte entra na chave natural, então a mesma distribuidora tem linha em mais de um subgrupo.
   * A do SCEE publica a TE do fio B, uma ordem de grandeza abaixo — lida como tarifa comum, o kWh
   * do veículo elétrico entraria dez vezes menor sem nada reclamar.
   */
  testWithPostgres('pins the collected recorte instead of any row of the distributor', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      await chooseDistributor({ companyId, database })
      await insertTariff({ database, subgroup: 'B1' })

      const facts = await new DrizzleFuelPriceRepository(database.db).loadFacts({ companyId })

      expect(facts.energy).toBeNull()
    })
  })

  testWithPostgres('keeps the most recent vigência when two of them cover today', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      await chooseDistributor({ companyId, database })
      await insertTariff({ database, effectiveFrom: dayFrom(-400), effectiveTo: dayFrom(30) })
      await insertTariff({
        database,
        effectiveFrom: dayFrom(-10),
        effectiveTo: dayFrom(30),
        tePerMegawattHour: '300.0000',
        tusdPerMegawattHour: '600.0000',
      })

      const facts = await new DrizzleFuelPriceRepository(database.db).loadFacts({ companyId })

      expect(facts.energy?.effectiveFrom).toBe(dayFrom(-10))
      expect(facts.energy?.tusdPerMegawattHour).toBe('600.0000')
    })
  })
})

type TestDatabase = ReturnType<typeof createDrizzleProvider>

function dayFrom(offsetInDays: number): string {
  const DAY_IN_MILLISECONDS = 86_400_000
  return formatFiscalDay(new Date(Date.now() + offsetInDays * DAY_IN_MILLISECONDS))
}

async function seedCompany(database: TestDatabase): Promise<string> {
  const companyId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  return companyId
}

async function chooseDistributor(input: {
  readonly companyId: string
  readonly database: TestDatabase
}): Promise<void> {
  await input.database.db.insert(companyEnergySettings).values({
    adjustmentFactor: '1.3500',
    companyId: input.companyId,
    distributorCode: DISTRIBUTOR_CODE,
  })
}

async function insertTariff(input: {
  readonly database: TestDatabase
  readonly distributorCode?: string
  readonly effectiveFrom?: string
  readonly effectiveTo?: string
  readonly subgroup?: string
  readonly tePerMegawattHour?: string
  readonly tusdPerMegawattHour?: string
}): Promise<void> {
  await input.database.db.insert(energyTariffReferences).values({
    distributorCode: input.distributorCode ?? DISTRIBUTOR_CODE,
    distributorTaxId: DISTRIBUTOR_TAX_ID,
    effectiveFrom: input.effectiveFrom ?? dayFrom(-30),
    effectiveTo: input.effectiveTo ?? dayFrom(30),
    modality: COLLECTED_MODALITY,
    subgroup: input.subgroup ?? COLLECTED_SUBGROUP,
    tePerMegawattHour: input.tePerMegawattHour ?? '227.7000',
    tusdPerMegawattHour: input.tusdPerMegawattHour ?? '567.8000',
  })
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t009_${crypto.randomUUID().replaceAll('-', '')}`
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
