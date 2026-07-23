/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, desc, eq, lt, ne, or, sql } from 'drizzle-orm'

import { nfeImportItems, nfeImports } from '../../database/nfe.schema.js'
import { processingOutbox } from '../../database/processing.schema.js'
import type {
  CompensateNfeImportRepositoryPort,
  FinalizeNfeImportRepositoryPort,
  ImportLookup,
  NfeImportDetail,
  NfeImportItem,
  NfeImportItemDraft,
  NfeImportListPage,
  NfeImportListReaderPort,
  NfeImportSafeError,
  NfeImportSummary,
  OutboxInput,
  ReprocessNfeImportTransactionPort,
  ReprocessNfeImportUnitOfWorkPort,
  RequestNfeImportTransactionPort,
  RequestNfeImportUnitOfWorkPort,
} from '../application/nfe-import.types.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Queryable = Database | Transaction

export class DrizzleNfeImportRepository
  implements
    RequestNfeImportUnitOfWorkPort,
    ReprocessNfeImportUnitOfWorkPort,
    FinalizeNfeImportRepositoryPort,
    CompensateNfeImportRepositoryPort,
    NfeImportListReaderPort
{
  public constructor(private readonly database: Database) {}

  public execute<T>(
    operation: (
      transaction: RequestNfeImportTransactionPort & ReprocessNfeImportTransactionPort,
    ) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction((transaction) =>
      operation(new DrizzleNfeImportTransaction(transaction)),
    )
  }

  public createImport(): Promise<NfeImportSummary> {
    return Promise.reject(new Error('NFE import mutation requires a transaction'))
  }
  public createItems(): Promise<void> {
    return Promise.reject(new Error('NFE import mutation requires a transaction'))
  }
  public saveIdempotency(): Promise<void> {
    return Promise.reject(new Error('NFE import mutation requires a transaction'))
  }
  public saveOutbox(): Promise<void> {
    return Promise.reject(new Error('NFE import mutation requires a transaction'))
  }
  public queueRetry(): Promise<NfeImportSummary> {
    return Promise.reject(new Error('NFE import mutation requires a transaction'))
  }

  public findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
  }): Promise<{ readonly fingerprint: string; readonly response: NfeImportSummary } | null> {
    return findIdempotency(this.database, input)
  }

  public findById(input: ImportLookup): Promise<NfeImportDetail | null> {
    return findDetail(this.database, input)
  }

  public async saveResult(input: {
    readonly companyId: string
    readonly importId: string
    readonly items: readonly Pick<NfeImportItem, 'error' | 'id' | 'status'>[]
    readonly summary: NfeImportSummary
  }): Promise<void> {
    await this.database.transaction(async (transaction) => {
      for (const item of input.items) {
        await transaction
          .update(nfeImportItems)
          .set({ error: item.error, status: item.status, updatedAt: new Date() })
          .where(
            and(
              eq(nfeImportItems.companyId, input.companyId),
              eq(nfeImportItems.importId, input.importId),
              eq(nfeImportItems.id, item.id),
            ),
          )
      }
      await updateSummary(transaction, input.summary)
    })
  }

  public async fail(
    input: ImportLookup & { readonly error: NfeImportSafeError },
  ): Promise<NfeImportSummary | null> {
    return this.database.transaction(async (transaction) => {
      const [record] = await transaction
        .update(nfeImports)
        .set({
          status: 'failed',
          terminalError: input.error,
          updatedAt: new Date(),
          version: sql`${nfeImports.version} + 1`,
        })
        .where(and(eq(nfeImports.companyId, input.companyId), eq(nfeImports.id, input.importId)))
        .returning()
      return record === undefined ? null : mapSummary(record)
    })
  }

  public async list(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: {
      readonly correlationIdEq?: string
      readonly correlationIdNe?: string
      readonly createdFrom?: string
      readonly createdUntil?: string
      readonly duplicatedCountEq?: string
      readonly duplicatedCountGt?: string
      readonly duplicatedCountGte?: string
      readonly duplicatedCountLt?: string
      readonly duplicatedCountLte?: string
      readonly duplicatedCountNe?: string
      readonly failedCountEq?: string
      readonly failedCountGt?: string
      readonly failedCountGte?: string
      readonly failedCountLt?: string
      readonly failedCountLte?: string
      readonly failedCountNe?: string
      readonly idEq?: string
      readonly idNe?: string
      readonly importedCountEq?: string
      readonly importedCountGt?: string
      readonly importedCountGte?: string
      readonly importedCountLt?: string
      readonly importedCountLte?: string
      readonly importedCountNe?: string
      readonly invalidCountEq?: string
      readonly invalidCountGt?: string
      readonly invalidCountGte?: string
      readonly invalidCountLt?: string
      readonly invalidCountLte?: string
      readonly invalidCountNe?: string
      readonly processedCountEq?: string
      readonly processedCountGt?: string
      readonly processedCountGte?: string
      readonly processedCountLt?: string
      readonly processedCountLte?: string
      readonly processedCountNe?: string
      readonly receivedCountEq?: string
      readonly receivedCountGt?: string
      readonly receivedCountGte?: string
      readonly receivedCountLt?: string
      readonly receivedCountLte?: string
      readonly receivedCountNe?: string
      readonly rejectedCountEq?: string
      readonly rejectedCountGt?: string
      readonly rejectedCountGte?: string
      readonly rejectedCountLt?: string
      readonly rejectedCountLte?: string
      readonly rejectedCountNe?: string
      readonly requestedByUserIdEq?: string
      readonly requestedByUserIdNe?: string
      readonly sourceEq?: 'distribution' | 'upload'
      readonly sourceNe?: 'distribution' | 'upload'
      readonly statusEq?:
        | 'pending'
        | 'queued'
        | 'processing'
        | 'completed'
        | 'partially_processed'
        | 'failed'
        | 'cancelled'
      readonly statusNe?:
        | 'pending'
        | 'queued'
        | 'processing'
        | 'completed'
        | 'partially_processed'
        | 'failed'
        | 'cancelled'
      readonly updatedFrom?: string
      readonly updatedUntil?: string
      readonly versionEq?: string
      readonly versionGt?: string
      readonly versionGte?: string
      readonly versionLt?: string
      readonly versionLte?: string
      readonly versionNe?: string
    }
    readonly limit: number
  }): Promise<NfeImportListPage> {
    const cursor = decodeCursor(input.cursor)
    const condition = and(
      eq(nfeImports.companyId, input.companyId),
      cursor === null
        ? undefined
        : or(
            lt(nfeImports.createdAt, cursor.createdAt),
            and(eq(nfeImports.createdAt, cursor.createdAt), lt(nfeImports.id, cursor.id)),
          ),
      createImportListFilters(input.filters),
    )
    const rows = await this.database
      .select()
      .from(nfeImports)
      .where(condition)
      .orderBy(desc(nfeImports.createdAt), desc(nfeImports.id))
      .limit(input.limit + 1)
    const hasMore = rows.length > input.limit
    const pageRows = rows.slice(0, input.limit)
    const last = pageRows.at(-1)
    return {
      items: pageRows.map(mapSummary),
      nextCursor:
        hasMore && last !== undefined ? `${last.createdAt.toISOString()}::${last.id}` : null,
    }
  }
}

function createImportListFilters(
  input:
    | {
        readonly correlationIdEq?: string
        readonly correlationIdNe?: string
        readonly createdFrom?: string
        readonly createdUntil?: string
        readonly duplicatedCountEq?: string
        readonly duplicatedCountGt?: string
        readonly duplicatedCountGte?: string
        readonly duplicatedCountLt?: string
        readonly duplicatedCountLte?: string
        readonly duplicatedCountNe?: string
        readonly failedCountEq?: string
        readonly failedCountGt?: string
        readonly failedCountGte?: string
        readonly failedCountLt?: string
        readonly failedCountLte?: string
        readonly failedCountNe?: string
        readonly idEq?: string
        readonly idNe?: string
        readonly importedCountEq?: string
        readonly importedCountGt?: string
        readonly importedCountGte?: string
        readonly importedCountLt?: string
        readonly importedCountLte?: string
        readonly importedCountNe?: string
        readonly invalidCountEq?: string
        readonly invalidCountGt?: string
        readonly invalidCountGte?: string
        readonly invalidCountLt?: string
        readonly invalidCountLte?: string
        readonly invalidCountNe?: string
        readonly processedCountEq?: string
        readonly processedCountGt?: string
        readonly processedCountGte?: string
        readonly processedCountLt?: string
        readonly processedCountLte?: string
        readonly processedCountNe?: string
        readonly receivedCountEq?: string
        readonly receivedCountGt?: string
        readonly receivedCountGte?: string
        readonly receivedCountLt?: string
        readonly receivedCountLte?: string
        readonly receivedCountNe?: string
        readonly rejectedCountEq?: string
        readonly rejectedCountGt?: string
        readonly rejectedCountGte?: string
        readonly rejectedCountLt?: string
        readonly rejectedCountLte?: string
        readonly rejectedCountNe?: string
        readonly requestedByUserIdEq?: string
        readonly requestedByUserIdNe?: string
        readonly sourceEq?: 'distribution' | 'upload'
        readonly sourceNe?: 'distribution' | 'upload'
        readonly statusEq?:
          | 'pending'
          | 'queued'
          | 'processing'
          | 'completed'
          | 'partially_processed'
          | 'failed'
          | 'cancelled'
        readonly statusNe?:
          | 'pending'
          | 'queued'
          | 'processing'
          | 'completed'
          | 'partially_processed'
          | 'failed'
          | 'cancelled'
        readonly updatedFrom?: string
        readonly updatedUntil?: string
        readonly versionEq?: string
        readonly versionGt?: string
        readonly versionGte?: string
        readonly versionLt?: string
        readonly versionLte?: string
        readonly versionNe?: string
      }
    | undefined,
) {
  if (input === undefined) return undefined
  return and(
    input.correlationIdEq === undefined
      ? undefined
      : eq(nfeImports.correlationId, input.correlationIdEq),
    input.correlationIdNe === undefined
      ? undefined
      : ne(nfeImports.correlationId, input.correlationIdNe),
    input.createdFrom === undefined
      ? undefined
      : sql`${nfeImports.createdAt} >= ${new Date(input.createdFrom)}`,
    input.createdUntil === undefined
      ? undefined
      : sql`${nfeImports.createdAt} <= ${new Date(input.createdUntil)}`,
    input.duplicatedCountEq === undefined
      ? undefined
      : eq(nfeImports.duplicatedCount, BigInt(input.duplicatedCountEq)),
    input.duplicatedCountGt === undefined
      ? undefined
      : sql`${nfeImports.duplicatedCount} > ${BigInt(input.duplicatedCountGt)}`,
    input.duplicatedCountGte === undefined
      ? undefined
      : sql`${nfeImports.duplicatedCount} >= ${BigInt(input.duplicatedCountGte)}`,
    input.duplicatedCountLt === undefined
      ? undefined
      : sql`${nfeImports.duplicatedCount} < ${BigInt(input.duplicatedCountLt)}`,
    input.duplicatedCountLte === undefined
      ? undefined
      : sql`${nfeImports.duplicatedCount} <= ${BigInt(input.duplicatedCountLte)}`,
    input.duplicatedCountNe === undefined
      ? undefined
      : ne(nfeImports.duplicatedCount, BigInt(input.duplicatedCountNe)),
    input.failedCountEq === undefined
      ? undefined
      : eq(nfeImports.failedCount, BigInt(input.failedCountEq)),
    input.failedCountGt === undefined
      ? undefined
      : sql`${nfeImports.failedCount} > ${BigInt(input.failedCountGt)}`,
    input.failedCountGte === undefined
      ? undefined
      : sql`${nfeImports.failedCount} >= ${BigInt(input.failedCountGte)}`,
    input.failedCountLt === undefined
      ? undefined
      : sql`${nfeImports.failedCount} < ${BigInt(input.failedCountLt)}`,
    input.failedCountLte === undefined
      ? undefined
      : sql`${nfeImports.failedCount} <= ${BigInt(input.failedCountLte)}`,
    input.failedCountNe === undefined
      ? undefined
      : ne(nfeImports.failedCount, BigInt(input.failedCountNe)),
    input.idEq === undefined ? undefined : eq(nfeImports.id, input.idEq),
    input.idNe === undefined ? undefined : ne(nfeImports.id, input.idNe),
    input.importedCountEq === undefined
      ? undefined
      : eq(nfeImports.importedCount, BigInt(input.importedCountEq)),
    input.importedCountGt === undefined
      ? undefined
      : sql`${nfeImports.importedCount} > ${BigInt(input.importedCountGt)}`,
    input.importedCountGte === undefined
      ? undefined
      : sql`${nfeImports.importedCount} >= ${BigInt(input.importedCountGte)}`,
    input.importedCountLt === undefined
      ? undefined
      : sql`${nfeImports.importedCount} < ${BigInt(input.importedCountLt)}`,
    input.importedCountLte === undefined
      ? undefined
      : sql`${nfeImports.importedCount} <= ${BigInt(input.importedCountLte)}`,
    input.importedCountNe === undefined
      ? undefined
      : ne(nfeImports.importedCount, BigInt(input.importedCountNe)),
    input.invalidCountEq === undefined
      ? undefined
      : eq(nfeImports.invalidCount, BigInt(input.invalidCountEq)),
    input.invalidCountGt === undefined
      ? undefined
      : sql`${nfeImports.invalidCount} > ${BigInt(input.invalidCountGt)}`,
    input.invalidCountGte === undefined
      ? undefined
      : sql`${nfeImports.invalidCount} >= ${BigInt(input.invalidCountGte)}`,
    input.invalidCountLt === undefined
      ? undefined
      : sql`${nfeImports.invalidCount} < ${BigInt(input.invalidCountLt)}`,
    input.invalidCountLte === undefined
      ? undefined
      : sql`${nfeImports.invalidCount} <= ${BigInt(input.invalidCountLte)}`,
    input.invalidCountNe === undefined
      ? undefined
      : ne(nfeImports.invalidCount, BigInt(input.invalidCountNe)),
    input.processedCountEq === undefined
      ? undefined
      : eq(nfeImports.processedCount, BigInt(input.processedCountEq)),
    input.processedCountGt === undefined
      ? undefined
      : sql`${nfeImports.processedCount} > ${BigInt(input.processedCountGt)}`,
    input.processedCountGte === undefined
      ? undefined
      : sql`${nfeImports.processedCount} >= ${BigInt(input.processedCountGte)}`,
    input.processedCountLt === undefined
      ? undefined
      : sql`${nfeImports.processedCount} < ${BigInt(input.processedCountLt)}`,
    input.processedCountLte === undefined
      ? undefined
      : sql`${nfeImports.processedCount} <= ${BigInt(input.processedCountLte)}`,
    input.processedCountNe === undefined
      ? undefined
      : ne(nfeImports.processedCount, BigInt(input.processedCountNe)),
    input.receivedCountEq === undefined
      ? undefined
      : eq(nfeImports.receivedCount, BigInt(input.receivedCountEq)),
    input.receivedCountGt === undefined
      ? undefined
      : sql`${nfeImports.receivedCount} > ${BigInt(input.receivedCountGt)}`,
    input.receivedCountGte === undefined
      ? undefined
      : sql`${nfeImports.receivedCount} >= ${BigInt(input.receivedCountGte)}`,
    input.receivedCountLt === undefined
      ? undefined
      : sql`${nfeImports.receivedCount} < ${BigInt(input.receivedCountLt)}`,
    input.receivedCountLte === undefined
      ? undefined
      : sql`${nfeImports.receivedCount} <= ${BigInt(input.receivedCountLte)}`,
    input.receivedCountNe === undefined
      ? undefined
      : ne(nfeImports.receivedCount, BigInt(input.receivedCountNe)),
    input.rejectedCountEq === undefined
      ? undefined
      : eq(nfeImports.rejectedCount, BigInt(input.rejectedCountEq)),
    input.rejectedCountGt === undefined
      ? undefined
      : sql`${nfeImports.rejectedCount} > ${BigInt(input.rejectedCountGt)}`,
    input.rejectedCountGte === undefined
      ? undefined
      : sql`${nfeImports.rejectedCount} >= ${BigInt(input.rejectedCountGte)}`,
    input.rejectedCountLt === undefined
      ? undefined
      : sql`${nfeImports.rejectedCount} < ${BigInt(input.rejectedCountLt)}`,
    input.rejectedCountLte === undefined
      ? undefined
      : sql`${nfeImports.rejectedCount} <= ${BigInt(input.rejectedCountLte)}`,
    input.rejectedCountNe === undefined
      ? undefined
      : ne(nfeImports.rejectedCount, BigInt(input.rejectedCountNe)),
    input.requestedByUserIdEq === undefined
      ? undefined
      : eq(nfeImports.requestedByUserId, input.requestedByUserIdEq),
    input.requestedByUserIdNe === undefined
      ? undefined
      : ne(nfeImports.requestedByUserId, input.requestedByUserIdNe),
    input.sourceEq === undefined ? undefined : eq(nfeImports.source, input.sourceEq),
    input.sourceNe === undefined ? undefined : ne(nfeImports.source, input.sourceNe),
    input.statusEq === undefined ? undefined : eq(nfeImports.status, input.statusEq),
    input.statusNe === undefined ? undefined : ne(nfeImports.status, input.statusNe),
    input.updatedFrom === undefined
      ? undefined
      : sql`${nfeImports.updatedAt} >= ${new Date(input.updatedFrom)}`,
    input.updatedUntil === undefined
      ? undefined
      : sql`${nfeImports.updatedAt} <= ${new Date(input.updatedUntil)}`,
    input.versionEq === undefined ? undefined : eq(nfeImports.version, BigInt(input.versionEq)),
    input.versionGt === undefined
      ? undefined
      : sql`${nfeImports.version} > ${BigInt(input.versionGt)}`,
    input.versionGte === undefined
      ? undefined
      : sql`${nfeImports.version} >= ${BigInt(input.versionGte)}`,
    input.versionLt === undefined
      ? undefined
      : sql`${nfeImports.version} < ${BigInt(input.versionLt)}`,
    input.versionLte === undefined
      ? undefined
      : sql`${nfeImports.version} <= ${BigInt(input.versionLte)}`,
    input.versionNe === undefined ? undefined : ne(nfeImports.version, BigInt(input.versionNe)),
  )
}

class DrizzleNfeImportTransaction
  implements RequestNfeImportTransactionPort, ReprocessNfeImportTransactionPort
{
  private requestFingerprint: string | null = null

  public constructor(private readonly transaction: Transaction) {}
  public setRequestFingerprint(fingerprint: string): void {
    this.requestFingerprint = fingerprint
  }

  public findIdempotency(input: {
    readonly companyId: string
    readonly idempotencyKey: string
  }): Promise<{ readonly fingerprint: string; readonly response: NfeImportSummary } | null> {
    return findIdempotency(this.transaction, input)
  }

  public async createImport(
    input: Omit<NfeImportSummary, 'createdAt' | 'id' | 'updatedAt' | 'version'> & {
      readonly id?: string
    },
  ): Promise<NfeImportSummary> {
    if (this.requestFingerprint === null)
      throw new Error('NFE import fingerprint was not initialized')
    const [record] = await this.transaction
      .insert(nfeImports)
      .values({ ...input, requestFingerprint: this.requestFingerprint })
      .returning()
    if (record === undefined) throw new Error('NFE import was not persisted')
    return mapSummary(record)
  }

  public async createItems(input: {
    readonly importId: string
    readonly items: readonly NfeImportItemDraft[]
  }): Promise<void> {
    if (input.items.length === 0) return
    await this.transaction
      .insert(nfeImportItems)
      .values(input.items.map((item) => ({ ...item, importId: input.importId })))
  }

  public async saveIdempotency(): Promise<void> {
    // nfe_imports is the authoritative idempotency record for this operation.
  }

  public async saveOutbox(input: OutboxInput): Promise<void> {
    await this.transaction
      .insert(processingOutbox)
      .values({ ...input, eventVersion: BigInt(input.eventVersion) })
  }

  public findById(input: ImportLookup): Promise<NfeImportDetail | null> {
    return findDetail(this.transaction, input)
  }

  public async queueRetry(
    input: ImportLookup & { readonly items: readonly NfeImportItemDraft[] },
  ): Promise<NfeImportSummary> {
    if (input.items.length > 0)
      await this.transaction.insert(nfeImportItems).values([...input.items])
    const [record] = await this.transaction
      .update(nfeImports)
      .set({
        status: 'queued',
        terminalError: null,
        updatedAt: new Date(),
        version: sql`${nfeImports.version} + 1`,
      })
      .where(and(eq(nfeImports.companyId, input.companyId), eq(nfeImports.id, input.importId)))
      .returning()
    if (record === undefined) throw new Error('NFE import retry target was not found')
    return mapSummary(record)
  }
}

async function findIdempotency(
  database: Queryable,
  input: { readonly companyId: string; readonly idempotencyKey: string },
): Promise<{ readonly fingerprint: string; readonly response: NfeImportSummary } | null> {
  const [record] = await database
    .select()
    .from(nfeImports)
    .where(
      and(
        eq(nfeImports.companyId, input.companyId),
        eq(nfeImports.idempotencyKey, input.idempotencyKey),
      ),
    )
    .limit(1)
  return record === undefined
    ? null
    : { fingerprint: record.requestFingerprint, response: mapSummary(record) }
}

async function findDetail(
  database: Queryable,
  input: ImportLookup,
): Promise<NfeImportDetail | null> {
  const [record] = await database
    .select()
    .from(nfeImports)
    .where(and(eq(nfeImports.companyId, input.companyId), eq(nfeImports.id, input.importId)))
    .limit(1)
  if (record === undefined) return null
  const items = await database
    .select()
    .from(nfeImportItems)
    .where(
      and(
        eq(nfeImportItems.companyId, input.companyId),
        eq(nfeImportItems.importId, input.importId),
      ),
    )
    .orderBy(asc(nfeImportItems.ordinal), asc(nfeImportItems.attempt))
  return { ...mapSummary(record), items: items.map(mapItem) }
}

async function updateSummary(database: Queryable, summary: NfeImportSummary): Promise<void> {
  await database
    .update(nfeImports)
    .set({
      duplicatedCount: summary.duplicatedCount,
      failedCount: summary.failedCount,
      importedCount: summary.importedCount,
      invalidCount: summary.invalidCount,
      processedCount: summary.processedCount,
      rejectedCount: summary.rejectedCount,
      status: summary.status,
      terminalError: summary.terminalError,
      updatedAt: new Date(),
      version: summary.version,
    })
    .where(and(eq(nfeImports.companyId, summary.companyId), eq(nfeImports.id, summary.id)))
}

type ImportRecord = typeof nfeImports.$inferSelect
type ItemRecord = typeof nfeImportItems.$inferSelect

function mapSummary(record: ImportRecord): NfeImportSummary {
  return {
    companyId: record.companyId,
    correlationId: record.correlationId,
    createdAt: record.createdAt.toISOString(),
    duplicatedCount: record.duplicatedCount,
    failedCount: record.failedCount,
    id: record.id,
    idempotencyKey: record.idempotencyKey,
    importedCount: record.importedCount,
    invalidCount: record.invalidCount,
    processedCount: record.processedCount,
    receivedCount: record.receivedCount,
    rejectedCount: record.rejectedCount,
    requestedByUserId: record.requestedByUserId,
    source: record.source,
    status: record.status,
    terminalError: asSafeError(record.terminalError),
    updatedAt: record.updatedAt.toISOString(),
    version: record.version,
  }
}

function mapItem(record: ItemRecord): NfeImportItem {
  return {
    ...(record.accessKey === null ? {} : { accessKey: record.accessKey }),
    attempt: record.attempt,
    companyId: record.companyId,
    ...(record.environment === null ? {} : { environment: record.environment }),
    error: asSafeError(record.error),
    id: record.id,
    importId: record.importId,
    ordinal: record.ordinal,
    previousAttempt: record.previousAttempt,
    previousItemId: record.previousItemId,
    sourceEntry: record.sourceEntry,
    sourceName: record.sourceName,
    ...(record.sourceNsu === null ? {} : { sourceNsu: record.sourceNsu }),
    sourceObjectId: record.sourceObjectId,
    sourceSha256: record.sourceSha256,
    status: record.status,
    ...(record.variant === null ? {} : { variant: record.variant }),
  }
}

function asSafeError(value: unknown): NfeImportSafeError | null {
  if (value === null || typeof value !== 'object') return null
  const candidate = value as { readonly code?: unknown; readonly message?: unknown }
  return typeof candidate.code === 'string' && typeof candidate.message === 'string'
    ? { code: candidate.code, message: candidate.message }
    : null
}

function decodeCursor(
  value: string | null,
): { readonly createdAt: Date; readonly id: string } | null {
  if (value === null) return null
  const separator = value.lastIndexOf('::')
  if (separator < 0) return null
  const createdAt = new Date(value.slice(0, separator))
  const id = value.slice(separator + 2)
  return Number.isNaN(createdAt.getTime()) || id.length === 0 ? null : { createdAt, id }
}
