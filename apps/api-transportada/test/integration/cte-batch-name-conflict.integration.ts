/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { SQL } from 'bun'
import { describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { DrizzleCteBatchRepository } from '../../src/cte-batches/infrastructure/drizzle-cte-batch.repository'
import { runDatabaseMigrations } from '../../src/database/database-migration.service'
import {
  companies,
  cteBatchEvents,
  cteBatchItemCharges,
  cteBatchItemDocuments,
  cteBatchItems,
  cteBatches,
  freightRuleVersions,
  freightRules,
  identityUsers,
  nfeDocuments,
  nfeImports,
  storedObjects,
  userCompanyMemberships,
} from '../../src/database/database.schema'
import { ApiError } from '../../src/shared/api.error'

const databaseUrl =
  process.env.DRIZZLE_TEST_DATABASE_URL ??
  process.env.API_TEST_DATABASE_URL ??
  process.env.DATABASE_URL
const testWithPostgres = databaseUrl === undefined ? test.skip : test

type TestDatabase = ReturnType<typeof createDrizzleProvider>

type SeededCompany = {
  readonly companyId: string
  readonly freightRuleId: string
  readonly freightRuleVersionId: string
  readonly nfeDocumentId: string
  readonly suffix: string
  readonly userId: string
}

const BATCH_NAME = 'Lote de conferencia'

describe('CT-e batch name conflict integration', () => {
  testWithPostgres(
    'rejects a repeated batch name with 409, leaves no partial graph, and keeps the name free in another company',
    async () => {
      await withDisposableDatabase(async (database) => {
        const userId = crypto.randomUUID()
        await database.db.insert(identityUsers).values({ id: userId, status: 'active' })
        const primary = await seedCompany(database, { suffix: '1', userId })
        const secondary = await seedCompany(database, { suffix: '2', userId })
        const repository = new DrizzleCteBatchRepository(database.db)

        await createBatchGraph(repository, { company: primary, name: BATCH_NAME, sequence: 1 })
        const afterFirst = await countGraph(database, primary.companyId)

        const conflict = await captureError(() =>
          createBatchGraph(repository, { company: primary, name: BATCH_NAME, sequence: 2 }),
        )

        expect(conflict).toBeInstanceOf(ApiError)
        expect((conflict as ApiError).code).toBe('CTE_BATCH_NAME_TAKEN')
        expect((conflict as ApiError).status).toBe(409)
        expect(await countGraph(database, primary.companyId)).toEqual(afterFirst)
        expect(afterFirst).toEqual({
          batches: 1,
          charges: 1,
          documents: 1,
          events: 1,
          items: 1,
        })

        await createBatchGraph(repository, { company: secondary, name: BATCH_NAME, sequence: 3 })

        expect(await countGraph(database, secondary.companyId)).toEqual(afterFirst)
        expect(await countGraph(database, primary.companyId)).toEqual(afterFirst)
      })
    },
  )
})

/** Mirrors the write order of `create-cte-batch.service.ts`: batch first, then the item graph. */
async function createBatchGraph(
  repository: DrizzleCteBatchRepository,
  input: {
    readonly company: SeededCompany
    readonly name: string
    readonly sequence: number
  },
): Promise<void> {
  const { company } = input
  const key = `${company.suffix}-${input.sequence}`
  await repository.execute(async (transaction) => {
    const batch = await transaction.createBatch({
      companyId: company.companyId,
      correlationId: `correlation-batch-${key}`,
      idempotencyFingerprint: `fingerprint-batch-${key}`,
      idempotencyKey: `batch-${key}`,
      name: input.name,
      operatorUserId: company.userId,
    })
    const batchId = readIdentifier(batch)
    const calculation = await transaction.createFreightCalculation({
      baseAmount: '1000.0000',
      calculatedAmount: '45.0000',
      companyId: company.companyId,
      correlationId: `correlation-freight-${key}`,
      createdByUserId: company.userId,
      freightRuleId: company.freightRuleId,
      freightRuleVersionId: company.freightRuleVersionId,
      idempotencyKey: `freight-${key}`,
      nfeDocumentId: company.nfeDocumentId,
      percentage: '0.045000',
      requestFingerprint: `fingerprint-freight-${key}`,
      ruleVersion: '1',
      status: 'snapshotted',
      totalAmount: '45.0000',
    })
    const item = await transaction.createBatchItem({
      batchId,
      companyId: company.companyId,
      freightCalculationId: readIdentifier(calculation),
      nfeDocumentId: company.nfeDocumentId,
      position: '1',
    })
    const itemId = readIdentifier(item)
    await transaction.createBatchItemDocument({
      batchId,
      companyId: company.companyId,
      itemId,
      nfeDocumentId: company.nfeDocumentId,
      position: '1',
    })
    await transaction.createBatchItemCharge({
      amount: '45.0000',
      baseAmount: '1000.0000',
      calculationType: 'percentage_of_cargo',
      companyId: company.companyId,
      itemId,
      label: 'Frete',
      ordinal: '1',
      rate: '0.045000',
    })
    await transaction.createBatchEvent({
      batchId,
      companyId: company.companyId,
      eventName: 'created',
    })
  })
}

type GraphCount = {
  readonly batches: number
  readonly charges: number
  readonly documents: number
  readonly events: number
  readonly items: number
}

async function countGraph(database: TestDatabase, companyId: string): Promise<GraphCount> {
  const [batches, items, documents, charges, events] = await Promise.all([
    database.db.select().from(cteBatches).where(eq(cteBatches.companyId, companyId)),
    database.db.select().from(cteBatchItems).where(eq(cteBatchItems.companyId, companyId)),
    database.db
      .select()
      .from(cteBatchItemDocuments)
      .where(eq(cteBatchItemDocuments.companyId, companyId)),
    database.db
      .select()
      .from(cteBatchItemCharges)
      .where(eq(cteBatchItemCharges.companyId, companyId)),
    database.db.select().from(cteBatchEvents).where(eq(cteBatchEvents.companyId, companyId)),
  ])

  return {
    batches: batches.length,
    charges: charges.length,
    documents: documents.length,
    events: events.length,
    items: items.length,
  }
}

async function seedCompany(
  database: TestDatabase,
  input: { readonly suffix: string; readonly userId: string },
): Promise<SeededCompany> {
  const companyId = crypto.randomUUID()
  const freightRuleId = crypto.randomUUID()
  const freightRuleVersionId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const nfeDocumentId = crypto.randomUUID()
  const xmlObjectId = crypto.randomUUID()
  const sha = input.suffix.repeat(64)

  await database.db.insert(companies).values({ id: companyId, status: 'active' })
  await database.db.insert(userCompanyMemberships).values({
    companyId,
    id: crypto.randomUUID(),
    status: 'active',
    userId: input.userId,
  })
  await database.db.insert(storedObjects).values({
    bucket: 'integration',
    companyId,
    id: xmlObjectId,
    mimeType: 'application/xml',
    objectKey: `nfe/${input.suffix}.xml`,
    provider: 's3',
    purpose: 'nfe_document',
    sha256: sha,
    sizeBytes: 100n,
    status: 'final',
  })
  await database.db.insert(nfeImports).values({
    companyId,
    correlationId: `correlation-import-${input.suffix}`,
    id: importId,
    idempotencyKey: `import-${input.suffix}`,
    requestFingerprint: `fingerprint-import-${input.suffix}`,
    requestedByUserId: input.userId,
    source: 'upload',
    status: 'completed',
  })
  await database.db.insert(freightRules).values({
    companyId,
    createdByUserId: input.userId,
    currentVersion: 1n,
    id: freightRuleId,
    name: `Frete ${input.suffix}`,
    priority: 1n,
    status: 'active',
    type: 'percentage_of_invoice_total',
  })
  await database.db.insert(freightRuleVersions).values({
    companyId,
    createdByUserId: input.userId,
    filters: {},
    freightRuleId,
    id: freightRuleVersionId,
    percentage: '0.045000',
    snapshot: {},
    status: 'active',
    validFrom: new Date('2026-01-01T00:00:00.000Z'),
    version: 1n,
  })
  await database.db.insert(nfeDocuments).values({
    accessKey: `${input.suffix}${'0'.repeat(43)}`,
    authorizationProtocol: `protocol-nfe-${input.suffix}`,
    companyId,
    createdByUserId: input.userId,
    freightValue: '0.0000',
    id: nfeDocumentId,
    importId,
    issuedAt: new Date('2026-07-20T12:00:00.000Z'),
    model: '55',
    number: `90000${input.suffix}`,
    operationNature: 'Venda',
    operationType: '1',
    productsValue: '1000.0000',
    series: '1',
    source: 'upload',
    status: 'authorized',
    totalValue: '1000.0000',
    xmlObjectId,
    xmlSha256: sha,
  })

  return {
    companyId,
    freightRuleId,
    freightRuleVersionId,
    nfeDocumentId,
    suffix: input.suffix,
    userId: input.userId,
  }
}

async function captureError(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation()
    return null
  } catch (error) {
    return error
  }
}

function readIdentifier(record: Record<string, unknown>): string {
  const value = record.id
  if (typeof value !== 'string' || value.length === 0) throw new Error('EXPECTED_IDENTIFIER')
  return value
}

async function withDisposableDatabase(
  operation: (database: TestDatabase) => Promise<void>,
): Promise<void> {
  if (databaseUrl === undefined) throw new Error('A PostgreSQL test URL is required')
  const admin = new SQL(databaseUrl, { max: 1 })
  const databaseName = `transportada_t018_${crypto.randomUUID().replaceAll('-', '')}`
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
