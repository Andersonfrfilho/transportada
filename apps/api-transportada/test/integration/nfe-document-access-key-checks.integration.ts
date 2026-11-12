/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { withDisposableDatabase as withDisposableDatabaseLifecycle } from '../fixtures/disposable-database.fixture.js'
import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import {
  companies,
  identityUsers,
  nfeDocuments,
  nfeImports,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema'
import { createCheckAccessKeysUseCase } from '../../src/nfe-documents/application/check-access-keys.use-case'
import { DrizzleNfeDocumentAccessKeyCheckRepository } from '../../src/nfe-documents/infrastructure/drizzle-nfe-document-access-key-check.repository'
import { isChaveDvValid } from '../../src/shared/tax-id.service'
import type { CompanyContext } from '../../src/identity/domain/tenant-context'
import { ACCESS_KEY, OTHER_ACCESS_KEY } from '../fixtures/nfe-access-key-lookup.fixture'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

const SHA = 'd'.repeat(64)
const MAX_KEYS = 200

describe('nfe document access key checks integration (spec 298 T1.4)', () => {
  testWithPostgres(
    'answers with the company own document ids and null for unknown or other-company keys, in one query',
    async () => {
      await withDisposableDatabase(async (database) => {
        const scenario = await seedScenario(database)
        const ownDocumentId = await seedDocument(database, scenario, {
          accessKey: ACCESS_KEY,
          companyId: scenario.companyIdA,
        })
        const sharedKeyDocumentId = await seedDocument(database, scenario, {
          accessKey: OTHER_ACCESS_KEY,
          companyId: scenario.companyIdA,
        })
        const foreignKey = buildAccessKey(7)
        await seedDocument(database, scenario, {
          accessKey: foreignKey,
          companyId: scenario.companyIdB,
        })
        await seedDocument(database, scenario, {
          accessKey: ACCESS_KEY,
          companyId: scenario.companyIdB,
        })
        const unknownKey = buildAccessKey(8)
        const counter = createQueryCounter(database)
        const useCase = createCheckAccessKeysUseCase({
          reader: new DrizzleNfeDocumentAccessKeyCheckRepository(counter.database),
        })

        const result = await useCase.execute({
          accessKeys: [foreignKey, ACCESS_KEY, unknownKey, OTHER_ACCESS_KEY],
          context: scenario.contextA,
        })

        expect(result).toEqual([
          { accessKey: foreignKey, documentId: null },
          { accessKey: ACCESS_KEY, documentId: ownDocumentId },
          { accessKey: unknownKey, documentId: null },
          { accessKey: OTHER_ACCESS_KEY, documentId: sharedKeyDocumentId },
        ])
        expect(counter.queries()).toBe(1)
      })
    },
  )

  testWithPostgres('resolves the maximum batch of 200 distinct keys with one query', async () => {
    await withDisposableDatabase(async (database) => {
      const scenario = await seedScenario(database)
      const accessKeys = Array.from({ length: MAX_KEYS }, (_unused, index) =>
        buildAccessKey(index + 100),
      )
      const documentId = await seedDocument(database, scenario, {
        accessKey: accessKeys[MAX_KEYS - 1] as string,
        companyId: scenario.companyIdA,
      })
      const counter = createQueryCounter(database)
      const useCase = createCheckAccessKeysUseCase({
        reader: new DrizzleNfeDocumentAccessKeyCheckRepository(counter.database),
      })

      const result = await useCase.execute({ accessKeys, context: scenario.contextA })

      expect(result).toHaveLength(MAX_KEYS)
      expect(result.filter((entry) => entry.documentId !== null)).toEqual([
        { accessKey: accessKeys[MAX_KEYS - 1] as string, documentId },
      ])
      expect(counter.queries()).toBe(1)
    })
  })
})

/** 43 dígitos derivados do contador mais o dígito verificador que o valida. */
function buildAccessKey(seed: number): string {
  const base =
    `3526081111111100019155001${String(seed).padStart(9, '0')}1${String(seed).padStart(8, '0')}`.slice(
      0,
      43,
    )
  const digit = Array.from({ length: 10 }, (_unused, candidate) => `${base}${candidate}`).find(
    isChaveDvValid,
  )
  if (digit === undefined) throw new Error('No valid check digit')
  return digit
}

function createQueryCounter(database: TestDatabase) {
  let count = 0
  const select = ((...args: Parameters<TestDatabase['db']['select']>) => {
    count += 1
    return database.db.select(...args)
  }) as TestDatabase['db']['select']
  return {
    database: { select } as unknown as TestDatabase['db'],
    queries: () => count,
  }
}

type Scenario = {
  readonly companyIdA: string
  readonly companyIdB: string
  readonly contextA: CompanyContext
  readonly userId: string
}

async function seedScenario(database: TestDatabase): Promise<Scenario> {
  const companyIdA = crypto.randomUUID()
  const companyIdB = crypto.randomUUID()
  const userId = crypto.randomUUID()
  await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
  await database.db.insert(companies).values([
    { id: companyIdA, status: 'active' },
    { id: companyIdB, status: 'active' },
  ])
  const membershipIdA = crypto.randomUUID()
  await database.db.insert(userCompanyMemberships).values([
    { companyId: companyIdA, id: membershipIdA, status: 'active', userId },
    { companyId: companyIdB, id: crypto.randomUUID(), status: 'active', userId },
  ])
  return {
    companyIdA,
    companyIdB,
    contextA: {
      companyId: companyIdA,
      kind: 'company',
      membershipId: membershipIdA,
      permissions: new Set(['invoices.read']),
      roles: [],
      userId,
    },
    userId,
  }
}

async function seedDocument(
  database: TestDatabase,
  scenario: Scenario,
  input: { readonly accessKey: string; readonly companyId: string },
): Promise<string> {
  const documentId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId: input.companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/${input.companyId}/${input.accessKey}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: SHA,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId: input.companyId,
    correlationId: `correlation-${documentId}`,
    id: importId,
    idempotencyKey: `import-${documentId}`,
    requestFingerprint: `fingerprint-${documentId}`,
    requestedByUserId: scenario.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: input.accessKey,
    authorizationProtocol: 'protocol-0001',
    companyId: input.companyId,
    createdByUserId: scenario.userId,
    id: documentId,
    importId,
    issuedAt: new Date('2026-09-01T12:00:00.000Z'),
    model: '55',
    number: '31',
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '1000.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '1000.0000',
    xmlObjectId,
    xmlSha256: SHA,
  })
  return documentId
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  await withDisposableDatabaseLifecycle({
    adminUrl: databaseUrl,
    namePrefix: 'transportada_access_key_checks',
    migrate: (connectionString) => runDatabaseMigrations({ connectionString }),
    open: (connectionString) => createDrizzleProvider({ connection: connectionString }),
    operation,
  })
}
