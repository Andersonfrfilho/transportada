/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { DrizzleCompanyEnergyRepository } from '../../src/companies/infrastructure/drizzle-company-energy.repository.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service.js'
import { companies, energyTariffReferences } from '../../src/database/database.schema.js'
import { formatFiscalDay } from '../../src/shared/fiscal-day.service.js'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

const CERACA = { code: 'CERACA', taxId: '12345678000195' }
const CPFL = { code: 'CPFL-PAULISTA', taxId: '33050196000188' }

describe('company energy repository integration', () => {
  testWithPostgres('reports no choice while the company never made one', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)

      expect(
        await new DrizzleCompanyEnergyRepository(database.db).loadChoice({ companyId }),
      ).toBeNull()
    })
  })

  testWithPostgres('saves the choice and reads it back whole', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      const repository = new DrizzleCompanyEnergyRepository(database.db)

      await repository.saveChoice({
        adjustmentFactor: '1.3500',
        companyId,
        distributorCode: CERACA.code,
      })

      expect(await repository.loadChoice({ companyId })).toEqual({
        adjustmentFactor: '1.3500',
        distributorCode: CERACA.code,
      })
    })
  })

  /** Trocar de distribuidora é reescrever a única linha da empresa, nunca acumular uma segunda. */
  testWithPostgres('replaces the choice instead of stacking a second one', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      const repository = new DrizzleCompanyEnergyRepository(database.db)

      await repository.saveChoice({
        adjustmentFactor: '1.0000',
        companyId,
        distributorCode: CERACA.code,
      })
      await repository.saveChoice({
        adjustmentFactor: '1.2500',
        companyId,
        distributorCode: CPFL.code,
      })

      expect(await repository.loadChoice({ companyId })).toEqual({
        adjustmentFactor: '1.2500',
        distributorCode: CPFL.code,
      })
    })
  })

  testWithPostgres('clears the choice and stays quiet when there was none', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = await seedCompany(database)
      const repository = new DrizzleCompanyEnergyRepository(database.db)

      await repository.clearChoice({ companyId })
      await repository.saveChoice({
        adjustmentFactor: '1.0000',
        companyId,
        distributorCode: CERACA.code,
      })
      await repository.clearChoice({ companyId })

      expect(await repository.loadChoice({ companyId })).toBeNull()
    })
  })

  /** A escolha é da empresa: duas instalações na mesma base não podem ler a distribuidora uma da outra. */
  testWithPostgres('never lends the choice of another company', async () => {
    await withDisposableDatabase(async (database) => {
      const [companyId, otherCompanyId] = await Promise.all([
        seedCompany(database),
        seedCompany(database),
      ])
      const repository = new DrizzleCompanyEnergyRepository(database.db)

      await repository.saveChoice({
        adjustmentFactor: '1.3500',
        companyId: otherCompanyId,
        distributorCode: CERACA.code,
      })

      expect(await repository.loadChoice({ companyId })).toBeNull()
    })
  })

  testWithPostgres('offers an empty catalog before the first collection runs', async () => {
    await withDisposableDatabase(async (database) => {
      expect(await new DrizzleCompanyEnergyRepository(database.db).listDistributors()).toEqual([])
    })
  })

  /**
   * A mesma distribuidora publica uma linha por vigência e por recorte; o select quer uma opção por
   * distribuidora, e em ordem estável — lista que troca de ordem entre duas leituras faz o operador
   * procurar de novo o que já tinha achado.
   */
  testWithPostgres('names each distributor once, ordered by code', async () => {
    await withDisposableDatabase(async (database) => {
      await insertTariff({ database, distributor: CPFL })
      await insertTariff({ database, distributor: CERACA })
      await insertTariff({ database, distributor: CERACA, effectiveFrom: dayFrom(-400) })

      expect(await new DrizzleCompanyEnergyRepository(database.db).listDistributors()).toEqual([
        CERACA,
        CPFL,
      ])
    })
  })

  /**
   * Vigência fechada continua sendo distribuidora legítima: a próxima homologação publica a nova, e
   * esconder a opção obrigaria o operador a esperar a coleta para configurar o que ele já sabe.
   */
  testWithPostgres('offers a distributor whose vigência has already closed', async () => {
    await withDisposableDatabase(async (database) => {
      await insertTariff({
        database,
        distributor: CERACA,
        effectiveFrom: dayFrom(-400),
        effectiveTo: dayFrom(-40),
      })

      expect(await new DrizzleCompanyEnergyRepository(database.db).listDistributors()).toEqual([
        CERACA,
      ])
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

async function insertTariff(input: {
  readonly database: TestDatabase
  readonly distributor: { readonly code: string; readonly taxId: string }
  readonly effectiveFrom?: string
  readonly effectiveTo?: string
}): Promise<void> {
  await input.database.db.insert(energyTariffReferences).values({
    distributorCode: input.distributor.code,
    distributorTaxId: input.distributor.taxId,
    effectiveFrom: input.effectiveFrom ?? dayFrom(-30),
    effectiveTo: input.effectiveTo ?? dayFrom(30),
    modality: 'Convencional',
    subgroup: 'B3',
    tePerMegawattHour: '227.7000',
    tusdPerMegawattHour: '567.8000',
  })
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t011_${crypto.randomUUID().replaceAll('-', '')}`
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
