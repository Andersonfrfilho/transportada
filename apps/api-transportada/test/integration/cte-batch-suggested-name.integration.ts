/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import { createPreviewCteBatchUseCase } from '../../src/cte-batches/application/preview-cte-batch.use-case'
import { DrizzleCteBatchPreviewRepository } from '../../src/cte-batches/infrastructure/drizzle-cte-batch-preview.repository'
import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import {
  companies,
  cteBatches,
  identityUsers,
  userCompanyMemberships,
} from '../../src/database/database.schema'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const NOW = new Date('2026-07-30T12:00:00.000Z')
const PREFIX = 'CT-e 2026-07-30 #'

describe('CT-e batch suggested name integration', () => {
  testWithPostgres(
    'raises the sequence per company, ignores names outside the pattern, and never crosses tenants',
    async () => {
      await withDisposableDatabase(async (database) => {
        const userId = crypto.randomUUID()
        await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
        const primary = await seedCompany(database, userId)
        const secondary = await seedCompany(database, userId)
        const preview = createPreviewCteBatchUseCase({
          clock: { now: () => NOW },
          profiles: { listProfiles: async () => [] },
          reader: new DrizzleCteBatchPreviewRepository(database.db),
        })
        const suggestFor = async (companyId: string): Promise<string> => {
          const result = await preview.execute({
            context: { companyId, userId },
            documentIds: [],
          })
          return result.suggestedName
        }

        expect(await suggestFor(primary)).toBe(`${PREFIX}1`)

        await seedBatch(database, { companyId: primary, name: `${PREFIX}1`, userId })
        expect(await suggestFor(primary)).toBe(`${PREFIX}2`)

        await seedBatch(database, { companyId: primary, name: `${PREFIX}2`, userId })
        expect(await suggestFor(primary)).toBe(`${PREFIX}3`)

        await seedBatch(database, { companyId: primary, name: 'Lote da manha', userId })
        await seedBatch(database, { companyId: primary, name: 'CT-e 2026-07-29 #9', userId })
        await seedBatch(database, { companyId: primary, name: `${PREFIX}2 revisado`, userId })
        expect(await suggestFor(primary)).toBe(`${PREFIX}3`)

        expect(await suggestFor(secondary)).toBe(`${PREFIX}1`)

        await seedBatch(database, { companyId: secondary, name: `${PREFIX}1`, userId })
        expect(await suggestFor(secondary)).toBe(`${PREFIX}2`)
        expect(await suggestFor(primary)).toBe(`${PREFIX}3`)
      })
    },
  )
})

async function seedCompany(database: TestDatabase, userId: string): Promise<string> {
  const companyId = crypto.randomUUID()
  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(userCompanyMemberships).values({
    companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId,
  })
  return companyId
}

async function seedBatch(
  database: TestDatabase,
  input: { readonly companyId: string; readonly name: string; readonly userId: string },
): Promise<void> {
  const key = crypto.randomUUID()
  await database.db.insert(cteBatches).values({
    companyId: input.companyId,
    correlationId: `correlation-${key}`,
    id: key,
    idempotencyFingerprint: `fingerprint-${key}`,
    idempotencyKey: `batch-${key}`,
    name: input.name,
    operatorUserId: input.userId,
    status: 'draft',
  })
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_t019',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}
