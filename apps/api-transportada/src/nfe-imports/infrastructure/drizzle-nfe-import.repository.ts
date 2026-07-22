/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, desc, eq, lt, or, sql } from 'drizzle-orm'

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
    readonly limit: number
  }): Promise<NfeImportListPage> {
    const cursor = decodeCursor(input.cursor)
    const condition =
      cursor === null
        ? eq(nfeImports.companyId, input.companyId)
        : and(
            eq(nfeImports.companyId, input.companyId),
            or(
              lt(nfeImports.createdAt, cursor.createdAt),
              and(eq(nfeImports.createdAt, cursor.createdAt), lt(nfeImports.id, cursor.id)),
            ),
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
