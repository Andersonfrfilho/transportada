/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, lt, or, sql } from 'drizzle-orm'

import {
  cteBatchEvents,
  cteBatchItems,
  cteBatches,
  cteSubmissionRecords,
  freightCalculations,
  nfeDocuments,
} from '../../database/database.schema.js'
import { ApiError } from '../../shared/api.error.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Queryable = Database | Transaction
type BatchRecord = typeof cteBatches.$inferSelect
type EventRecord = typeof cteBatchEvents.$inferSelect
type CalculationRecord = typeof freightCalculations.$inferSelect
type DocumentRecord = typeof nfeDocuments.$inferSelect
type CteBatchStatus = 'draft' | 'submitted' | 'in_flight' | 'done' | 'error' | 'cancelled'

class DrizzleCteBatchTransaction {
  public constructor(private readonly database: Queryable) {}

  public async createBatch(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const [record] = await this.database
      .insert(cteBatches)
      .values({
        companyId: requiredString(input.companyId),
        correlationId: requiredString(input.correlationId),
        idempotencyFingerprint: requiredString(input.idempotencyFingerprint),
        idempotencyKey: requiredString(input.idempotencyKey),
        name: requiredString(input.name),
        operatorUserId: requiredString(input.operatorUserId),
        status: 'draft',
        version: 1n,
      })
      .returning()
    if (record === undefined) throw new Error('CTE_BATCH_CREATE_FAILED')
    return mapBatch(record, 0)
  }

  public async createBatchEvent(input: Record<string, unknown>): Promise<void> {
    await this.database.insert(cteBatchEvents).values({
      batchId: requiredString(input.batchId),
      companyId: requiredString(input.companyId),
      eventName: requiredString(input.eventName),
      occurredAt: new Date(),
      payload: input.payload ?? {},
    })
  }

  public async createBatchItem(input: Record<string, unknown>): Promise<void> {
    await this.database.insert(cteBatchItems).values({
      batchId: requiredString(input.batchId),
      calculationSnapshot: input.calculationSnapshot ?? {},
      companyId: requiredString(input.companyId),
      freightCalculationId: requiredString(input.freightCalculationId),
      nfeDocumentId: requiredString(input.nfeDocumentId),
      position: BigInt(requiredString(input.position)),
    })
  }

  public async createSubmissionRecord(input: Record<string, unknown>): Promise<void> {
    await this.database.insert(cteSubmissionRecords).values({
      batchId: requiredString(input.batchId),
      companyId: requiredString(input.companyId),
      idempotencyKey: requiredString(input.idempotencyKey),
      requestFingerprint: requiredString(input.requestFingerprint),
      result: nullableString(input.result),
      submissionStatus: requiredString(input.submissionStatus),
    })
  }

  public async findBatch(input: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    const [record] = await this.database
      .select()
      .from(cteBatches)
      .where(
        and(
          eq(cteBatches.companyId, requiredString(input.companyId)),
          eq(cteBatches.id, requiredString(input.batchId)),
        ),
      )
      .limit(1)
    if (record === undefined) return null
    return mapBatch(record, await this.countItems(record.companyId, record.id))
  }

  public async findBatchByIdempotency(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const [record] = await this.database
      .select()
      .from(cteBatches)
      .where(
        and(
          eq(cteBatches.companyId, requiredString(input.companyId)),
          eq(cteBatches.idempotencyKey, requiredString(input.idempotencyKey)),
        ),
      )
      .limit(1)
    if (record === undefined) return null
    return {
      batch: mapBatch(record, await this.countItems(record.companyId, record.id)),
      idempotencyFingerprint: record.idempotencyFingerprint,
    }
  }

  public async findEligibleDocument(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const [record] = await this.database
      .select()
      .from(nfeDocuments)
      .where(
        and(
          eq(nfeDocuments.companyId, requiredString(input.companyId)),
          eq(nfeDocuments.id, requiredString(input.documentId)),
        ),
      )
      .limit(1)
    return record === undefined ? null : mapDocument(record)
  }

  public async findFreightCalculation(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const [record] = await this.database
      .select()
      .from(freightCalculations)
      .where(
        and(
          eq(freightCalculations.companyId, requiredString(input.companyId)),
          eq(freightCalculations.nfeDocumentId, requiredString(input.documentId)),
          eq(freightCalculations.status, 'snapshotted'),
        ),
      )
      .orderBy(desc(freightCalculations.createdAt), desc(freightCalculations.id))
      .limit(1)
    return record === undefined ? null : mapCalculation(record)
  }

  public async findSubmissionRecord(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const [record] = await this.database
      .select()
      .from(cteSubmissionRecords)
      .where(
        and(
          eq(cteSubmissionRecords.companyId, requiredString(input.companyId)),
          eq(cteSubmissionRecords.batchId, requiredString(input.batchId)),
          eq(cteSubmissionRecords.idempotencyKey, requiredString(input.idempotencyKey)),
        ),
      )
      .limit(1)
    if (record === undefined) return null
    const batch = await this.findBatch({ batchId: record.batchId, companyId: record.companyId })
    return { batch, requestFingerprint: record.requestFingerprint }
  }

  public async list(input: {
    readonly context: { readonly companyId: string }
    readonly cursor: string | null
    readonly limit: number
  }): Promise<{
    readonly items: readonly Record<string, unknown>[]
    readonly nextCursor: string | null
  }> {
    const cursor = decodeCursor(input.cursor)
    const condition =
      cursor === null
        ? eq(cteBatches.companyId, input.context.companyId)
        : and(
            eq(cteBatches.companyId, input.context.companyId),
            or(
              lt(cteBatches.createdAt, cursor.createdAt),
              and(eq(cteBatches.createdAt, cursor.createdAt), lt(cteBatches.id, cursor.id)),
            ),
          )
    const rows = await this.database
      .select()
      .from(cteBatches)
      .where(condition)
      .orderBy(desc(cteBatches.createdAt), desc(cteBatches.id))
      .limit(input.limit + 1)
    const pageRows = rows.slice(0, input.limit)
    const items = await Promise.all(
      pageRows.map(async (record) =>
        mapBatch(record, await this.countItems(record.companyId, record.id)),
      ),
    )
    const last = pageRows.at(-1)
    return {
      items,
      nextCursor:
        rows.length > input.limit && last !== undefined
          ? `${last.createdAt.toISOString()}::${last.id}`
          : null,
    }
  }

  public async listEvents(input: {
    readonly batchId: string
    readonly context: { readonly companyId: string }
    readonly cursor: string | null
    readonly limit: number
  }): Promise<{
    readonly items: readonly Record<string, unknown>[]
    readonly nextCursor: string | null
  }> {
    const cursor = decodeCursor(input.cursor)
    const baseCondition = and(
      eq(cteBatchEvents.companyId, input.context.companyId),
      eq(cteBatchEvents.batchId, input.batchId),
    )
    const rows = await this.database
      .select()
      .from(cteBatchEvents)
      .where(
        cursor === null
          ? baseCondition
          : and(
              baseCondition,
              or(
                lt(cteBatchEvents.occurredAt, cursor.createdAt),
                and(
                  eq(cteBatchEvents.occurredAt, cursor.createdAt),
                  lt(cteBatchEvents.id, cursor.id),
                ),
              ),
            ),
      )
      .orderBy(desc(cteBatchEvents.occurredAt), desc(cteBatchEvents.id))
      .limit(input.limit + 1)
    const pageRows = rows.slice(0, input.limit)
    const last = pageRows.at(-1)
    return {
      items: pageRows.map(mapEvent),
      nextCursor:
        rows.length > input.limit && last !== undefined
          ? `${last.occurredAt.toISOString()}::${last.id}`
          : null,
    }
  }

  public async updateBatchStatus(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const [record] = await this.database
      .update(cteBatches)
      .set({
        status: requiredStatus(input.nextStatus),
        updatedAt: new Date(),
        version: sql`${cteBatches.version} + 1`,
      })
      .where(
        and(
          eq(cteBatches.companyId, requiredString(input.companyId)),
          eq(cteBatches.id, requiredString(input.batchId)),
          eq(cteBatches.status, requiredStatus(input.expectedStatus)),
        ),
      )
      .returning()
    if (record === undefined) {
      throw new ApiError({
        code: 'CTE_BATCH_INVALID_STATE',
        message: 'CT-e batch state transition is not allowed',
        status: 409,
      })
    }
    return mapBatch(record, await this.countItems(record.companyId, record.id))
  }

  private async countItems(companyId: string, batchId: string): Promise<number> {
    const rows = await this.database
      .select({ id: cteBatchItems.id })
      .from(cteBatchItems)
      .where(and(eq(cteBatchItems.companyId, companyId), eq(cteBatchItems.batchId, batchId)))
    return rows.length
  }
}

export class DrizzleCteBatchRepository extends DrizzleCteBatchTransaction {
  public constructor(private readonly rootDatabase: Database) {
    super(rootDatabase)
  }

  public execute<TResponse>(
    operation: (transaction: DrizzleCteBatchTransaction) => Promise<TResponse>,
  ): Promise<TResponse> {
    return this.rootDatabase.transaction((transaction) =>
      operation(new DrizzleCteBatchTransaction(transaction)),
    )
  }
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

function mapBatch(record: BatchRecord, itemCount: number): Record<string, unknown> {
  return {
    companyId: record.companyId,
    correlationId: record.correlationId,
    createdAt: record.createdAt.toISOString(),
    id: record.id,
    itemCount,
    name: record.name,
    operatorUserId: record.operatorUserId,
    status: record.status,
    updatedAt: record.updatedAt.toISOString(),
    version: record.version.toString(),
  }
}

function mapCalculation(record: CalculationRecord): Record<string, unknown> {
  return {
    calculationSnapshot: {
      calculatedAmount: record.calculatedAmount,
      freightCalculationId: record.id,
      ruleSnapshot: record.ruleSnapshot,
      totalAmount: record.totalAmount,
    },
    companyId: record.companyId,
    id: record.id,
    nfeDocumentId: record.nfeDocumentId,
    status: record.status,
  }
}

function mapDocument(record: DocumentRecord): Record<string, unknown> {
  return {
    companyId: record.companyId,
    id: record.id,
    issuedAt: record.issuedAt.toISOString(),
    status: record.status,
    totalAmount: record.totalValue,
    variant: 'complete',
  }
}

function mapEvent(record: EventRecord): Record<string, unknown> {
  return {
    batchId: record.batchId,
    createdAt: record.createdAt.toISOString(),
    eventName: record.eventName,
    id: record.id,
    payload: record.payload,
  }
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('EXPECTED_STRING')
  return value
}

function requiredStatus(value: unknown): CteBatchStatus {
  if (
    value === 'draft' ||
    value === 'submitted' ||
    value === 'in_flight' ||
    value === 'done' ||
    value === 'error' ||
    value === 'cancelled'
  ) {
    return value
  }

  throw new Error('EXPECTED_CTE_BATCH_STATUS')
}
