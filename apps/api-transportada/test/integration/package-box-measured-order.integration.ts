/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A lista das caixas já medidas abre pelo último registro e diz quem o fez, contra Postgres.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import {
  companies,
  identityUserProfiles,
  identityUsers,
  nfePackageBoxes,
  userCompanyMemberships,
} from '../../src/database/database.schema'
import { DrizzlePackageBoxRepository } from '../../src/nfe-documents/infrastructure/drizzle-package-box.repository'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const MEASUREMENT = {
  grossWeightGrams: 2300,
  heightMm: 130,
  lengthMm: 190,
  source: 'typed',
  unitsPerBox: 24,
  widthMm: 185,
} as const

describe('a lista das já medidas abre pelo último registro', () => {
  testWithPostgres(
    'ordena por measured_at decrescente e traz o nome de quem registrou, ou nulo sem membro',
    async () => {
      await withDisposableDatabase(async (database) => {
        const companyId = crypto.randomUUID()
        const joaoId = crypto.randomUUID()
        const mariaId = crypto.randomUUID()
        const catalogActorId = crypto.randomUUID()
        const boxIds = { first: crypto.randomUUID(), pending: crypto.randomUUID() } as const
        const secondBoxId = crypto.randomUUID()
        const thirdBoxId = crypto.randomUUID()

        await database.db.insert(companies).values({ id: companyId, status: 'active' })
        await seedMember(database, { companyId, name: 'João', userId: joaoId })
        await seedMember(database, { companyId, name: 'Maria', userId: mariaId })
        await database.db.insert(nfePackageBoxes).values(
          [boxIds.first, secondBoxId, thirdBoxId, boxIds.pending].map((id, index) => ({
            commercialUnit: 'CX24',
            companyId,
            description: `PRODUTO ${index}`,
            emitterTaxId: '05868574001090',
            id,
            productCode: `78910${index}`,
            unitsPerBox: 24,
          })),
        )

        const repository = new DrizzlePackageBoxRepository(database.db)
        const measure = async (boxId: string, measuredByUserId: string): Promise<void> => {
          await repository.measure({
            boxId,
            companyId,
            measuredByUserId,
            measurement: MEASUREMENT,
            measurementMarginMm: null,
          })
          await Bun.sleep(15)
        }
        await measure(boxIds.first, joaoId)
        await measure(secondBoxId, mariaId)
        await measure(thirdBoxId, catalogActorId)

        const measured = await repository.list({
          companyId,
          filters: { status: 'measured' },
          limit: 10,
        })
        expect(measured.map((box) => box.id)).toEqual([thirdBoxId, secondBoxId, boxIds.first])
        expect(measured.map((box) => box.measuredByName)).toEqual([null, 'Maria', 'João'])

        const pending = await repository.list({
          companyId,
          filters: { status: 'pending' },
          limit: 10,
        })
        expect(pending.map((box) => box.id)).toEqual([boxIds.pending])
        expect(pending[0]?.measuredByName).toBeNull()
      })
    },
  )

  testWithPostgres('mede de novo: o último registro é o que dá o nome', async () => {
    await withDisposableDatabase(async (database) => {
      const companyId = crypto.randomUUID()
      const joaoId = crypto.randomUUID()
      const mariaId = crypto.randomUUID()
      const boxId = crypto.randomUUID()
      await database.db.insert(companies).values({ id: companyId, status: 'active' })
      await seedMember(database, { companyId, name: 'João', userId: joaoId })
      await seedMember(database, { companyId, name: 'Maria', userId: mariaId })
      await database.db.insert(nfePackageBoxes).values({
        commercialUnit: 'CX24',
        companyId,
        description: 'PRODUTO',
        emitterTaxId: '05868574001090',
        id: boxId,
        productCode: '789100',
        unitsPerBox: 24,
      })

      const repository = new DrizzlePackageBoxRepository(database.db)
      for (const measuredByUserId of [joaoId, mariaId]) {
        await repository.measure({
          boxId,
          companyId,
          measuredByUserId,
          measurement: MEASUREMENT,
          measurementMarginMm: null,
        })
        await Bun.sleep(15)
      }

      const rows = await repository.list({ companyId, filters: { status: 'all' }, limit: 10 })
      expect(rows).toHaveLength(1)
      expect(rows[0]?.measuredByName).toBe('Maria')
    })
  })
})

async function seedMember(
  database: TestDatabase,
  input: { readonly companyId: string; readonly name: string; readonly userId: string },
): Promise<void> {
  await database.db.insert(identityUsers).values({ id: input.userId, status: 'active' })
  await database.db.insert(identityUserProfiles).values({
    contactAddress: `${input.userId}@example.com`,
    contactChannel: 'email',
    name: input.name,
    userId: input.userId,
    username: `user.${input.userId.slice(0, 8)}`,
  })
  await database.db.insert(userCompanyMemberships).values({
    companyId: input.companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId: input.userId,
  })
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_pkgbox_order_${crypto.randomUUID().replaceAll('-', '')}`
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
