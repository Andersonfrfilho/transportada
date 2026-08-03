/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { SQL } from 'drizzle-orm'
import { and, desc, eq, ilike, lt, ne, or, sql } from 'drizzle-orm'

import {
  CTE_BATCH_ITEM_CHARGE_CALCULATIONS,
  cteBatchEvents,
  cteBatchItemCharges,
  cteBatchItemDocuments,
  cteBatchItems,
  cteBatches,
  cteSubmissionRecords,
  freightCalculations,
  freightRuleVersions,
} from '../../database/database.schema.js'
import type { FreightCalculationStatus } from '../../database/freight.schema.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import { ApiError } from '../../shared/api.error.js'
import type {
  CteBatchPreviewDocument,
  CteBatchPreviewLink,
} from '../application/cte-batch-preview.port.js'
import type { CteBatchItemLookup, CteBatchSelectionQuery } from '../application/cte-batch.port.js'
import { createBatchNameTakenError } from '../domain/cte-batch.error.js'

import { findActiveBatchLinks, findSelectionDocuments } from './cte-batch-selection.query.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Queryable = Database | Transaction
type BatchRecord = typeof cteBatches.$inferSelect
type EventRecord = typeof cteBatchEvents.$inferSelect
type ItemRecord = typeof cteBatchItems.$inferSelect
type CteBatchItemChargeCalculation = (typeof CTE_BATCH_ITEM_CHARGE_CALCULATIONS)[number]
type CteBatchStatus = 'draft' | 'submitted' | 'in_flight' | 'done' | 'error' | 'cancelled'

const NAME_CONSTRAINT = 'cte_batches_company_id_name_unique'

class DrizzleCteBatchTransaction {
  public constructor(private readonly database: Queryable) {}

  public async createBatch(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const [record] = await runGuarded(() =>
      this.database
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
        .returning(),
    )
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

  public async createBatchItem(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const [record] = await this.database
      .insert(cteBatchItems)
      .values({
        batchId: requiredString(input.batchId),
        calculationSnapshot: input.calculationSnapshot ?? {},
        companyId: requiredString(input.companyId),
        freightCalculationId: requiredString(input.freightCalculationId),
        nfeDocumentId: requiredString(input.nfeDocumentId),
        position: BigInt(requiredString(input.position)),
      })
      .returning()
    if (record === undefined) throw new Error('CTE_BATCH_ITEM_CREATE_FAILED')
    return mapItem(record)
  }

  public async createBatchItemCharge(input: Record<string, unknown>): Promise<void> {
    await this.database.insert(cteBatchItemCharges).values({
      amount: requiredString(input.amount),
      baseAmount: requiredString(input.baseAmount),
      calculationType: requiredChargeCalculation(input.calculationType),
      companyId: requiredString(input.companyId),
      itemId: requiredString(input.itemId),
      label: requiredString(input.label),
      ordinal: BigInt(requiredString(input.ordinal)),
      rate: nullableString(input.rate),
    })
  }

  public async createBatchItemDocument(input: Record<string, unknown>): Promise<void> {
    await this.database.insert(cteBatchItemDocuments).values({
      batchId: requiredString(input.batchId),
      companyId: requiredString(input.companyId),
      itemId: requiredString(input.itemId),
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

  public async createFreightCalculation(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const [record] = await this.database
      .insert(freightCalculations)
      .values({
        adjustments: input.adjustments ?? [],
        baseAmount: requiredString(input.baseAmount),
        calculatedAmount: requiredString(input.calculatedAmount),
        calculationDetails: input.calculationDetails ?? {},
        companyId: requiredString(input.companyId),
        correlationId: requiredString(input.correlationId),
        createdByUserId: requiredString(input.createdByUserId),
        freightRuleId: requiredString(input.freightRuleId),
        freightRuleVersionId: requiredString(input.freightRuleVersionId),
        idempotencyKey: requiredString(input.idempotencyKey),
        maximumAmount: nullableString(input.maximumAmount),
        minimumAmount: nullableString(input.minimumAmount),
        nfeDocumentId: requiredString(input.nfeDocumentId),
        percentage: requiredString(input.percentage),
        requestFingerprint: requiredString(input.requestFingerprint),
        ruleSnapshot: input.ruleSnapshot ?? {},
        ruleVersion: BigInt(requiredString(input.ruleVersion)),
        status: requiredCalculationStatus(input.status),
        totalAmount: requiredString(input.totalAmount),
      })
      .returning({ id: freightCalculations.id })
    if (record === undefined) throw new Error('FREIGHT_CALCULATION_CREATE_FAILED')
    return { id: record.id }
  }

  /** O cálculo de frete é preservado como histórico; só o vínculo com a nota é desfeito. */
  public async deleteBatchItem(
    input: CteBatchItemLookup,
  ): Promise<{ readonly documentIds: readonly string[] }> {
    const documents = await this.database
      .select({ nfeDocumentId: cteBatchItemDocuments.nfeDocumentId })
      .from(cteBatchItemDocuments)
      .where(and(...buildBatchItemDocumentFilters(input)))
      .orderBy(cteBatchItemDocuments.position)
    await this.database
      .delete(cteBatchItemDocuments)
      .where(and(...buildBatchItemDocumentFilters(input)))
    await this.database
      .delete(cteBatchItemCharges)
      .where(and(...buildBatchItemChargeFilters(input)))
    await this.database.delete(cteBatchItems).where(and(...buildBatchItemRemovalFilters(input)))

    return { documentIds: documents.map((document) => document.nfeDocumentId) }
  }

  public findActiveBatchLinks(
    query: CteBatchSelectionQuery,
  ): Promise<readonly CteBatchPreviewLink[]> {
    return findActiveBatchLinks(this.database, query)
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

  public async findBatchItem(input: CteBatchItemLookup): Promise<Record<string, unknown> | null> {
    const [record] = await this.database
      .select()
      .from(cteBatchItems)
      .where(and(...buildBatchItemRemovalFilters(input)))
      .limit(1)
    return record === undefined ? null : mapItem(record)
  }

  /** A versão publicada da regra é o que congela o snapshot fiscal do lote. */
  public async findFreightRuleVersion(input: {
    readonly companyId: string
    readonly freightRuleId: string
  }): Promise<Record<string, unknown> | null> {
    const [record] = await this.database
      .select({ id: freightRuleVersions.id, version: freightRuleVersions.version })
      .from(freightRuleVersions)
      .where(
        and(
          eq(freightRuleVersions.companyId, input.companyId),
          eq(freightRuleVersions.freightRuleId, input.freightRuleId),
          eq(freightRuleVersions.status, 'active'),
        ),
      )
      .orderBy(desc(freightRuleVersions.version))
      .limit(1)
    return record === undefined ? null : { id: record.id, version: record.version.toString() }
  }

  public findSelectionDocuments(
    query: CteBatchSelectionQuery,
  ): Promise<readonly CteBatchPreviewDocument[]> {
    return findSelectionDocuments(this.database, query)
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
    readonly filters?: {
      readonly createdFrom?: string
      readonly createdUntil?: string
      readonly itemCountEq?: string
      readonly itemCountGt?: string
      readonly itemCountGte?: string
      readonly itemCountLt?: string
      readonly itemCountLte?: string
      readonly itemCountNe?: string
      readonly nameContains?: string
      readonly statusEq?: CteBatchStatus
      readonly statusNe?: CteBatchStatus
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
  }): Promise<{
    readonly items: readonly Record<string, unknown>[]
    readonly nextCursor: string | null
  }> {
    const cursor = decodeCursor(input.cursor)
    const condition = and(
      eq(cteBatches.companyId, input.context.companyId),
      cursor === null
        ? undefined
        : or(
            lt(cteBatches.createdAt, cursor.createdAt),
            and(eq(cteBatches.createdAt, cursor.createdAt), lt(cteBatches.id, cursor.id)),
          ),
      createBatchListFilters(input.filters),
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

  /** Serializa remoções e bloqueia um submit concorrente entre a leitura e o delete. */
  public async touchBatch(input: {
    readonly batchId: string
    readonly companyId: string
    readonly expectedStatus: CteBatchStatus
  }): Promise<void> {
    const [record] = await this.database
      .update(cteBatches)
      .set({ updatedAt: new Date(), version: sql`${cteBatches.version} + 1` })
      .where(
        and(
          eq(cteBatches.companyId, input.companyId),
          eq(cteBatches.id, input.batchId),
          eq(cteBatches.status, input.expectedStatus),
        ),
      )
      .returning({ id: cteBatches.id })
    if (record === undefined) {
      throw new ApiError({
        code: 'CTE_BATCH_INVALID_STATE',
        message: 'CT-e batch state transition is not allowed',
        status: 409,
      })
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

async function runGuarded<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
  try {
    return await operation()
  } catch (error) {
    if (violatedUniqueConstraint(error) === NAME_CONSTRAINT) throw createBatchNameTakenError()
    throw error
  }
}

export function buildBatchItemRemovalFilters(input: CteBatchItemLookup): SQL[] {
  return [
    eq(cteBatchItems.companyId, input.companyId),
    eq(cteBatchItems.batchId, input.batchId),
    eq(cteBatchItems.id, input.itemId),
  ]
}

export function buildBatchItemDocumentFilters(input: CteBatchItemLookup): SQL[] {
  return [
    eq(cteBatchItemDocuments.companyId, input.companyId),
    eq(cteBatchItemDocuments.batchId, input.batchId),
    eq(cteBatchItemDocuments.itemId, input.itemId),
  ]
}

export function buildBatchItemChargeFilters(input: CteBatchItemLookup): SQL[] {
  return [
    eq(cteBatchItemCharges.companyId, input.companyId),
    eq(cteBatchItemCharges.itemId, input.itemId),
  ]
}

function createBatchListFilters(
  input:
    | {
        readonly createdFrom?: string
        readonly createdUntil?: string
        readonly itemCountEq?: string
        readonly itemCountGt?: string
        readonly itemCountGte?: string
        readonly itemCountLt?: string
        readonly itemCountLte?: string
        readonly itemCountNe?: string
        readonly nameContains?: string
        readonly statusEq?: CteBatchStatus
        readonly statusNe?: CteBatchStatus
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
    input.createdFrom === undefined
      ? undefined
      : sql`${cteBatches.createdAt} >= ${new Date(input.createdFrom)}`,
    input.createdUntil === undefined
      ? undefined
      : sql`${cteBatches.createdAt} <= ${new Date(input.createdUntil)}`,
    input.itemCountEq === undefined
      ? undefined
      : sql`(select count(*) from ${cteBatchItems} where ${cteBatchItems.companyId} = ${cteBatches.companyId} and ${cteBatchItems.batchId} = ${cteBatches.id}) = ${BigInt(input.itemCountEq)}`,
    input.itemCountGt === undefined
      ? undefined
      : sql`(select count(*) from ${cteBatchItems} where ${cteBatchItems.companyId} = ${cteBatches.companyId} and ${cteBatchItems.batchId} = ${cteBatches.id}) > ${BigInt(input.itemCountGt)}`,
    input.itemCountGte === undefined
      ? undefined
      : sql`(select count(*) from ${cteBatchItems} where ${cteBatchItems.companyId} = ${cteBatches.companyId} and ${cteBatchItems.batchId} = ${cteBatches.id}) >= ${BigInt(input.itemCountGte)}`,
    input.itemCountLt === undefined
      ? undefined
      : sql`(select count(*) from ${cteBatchItems} where ${cteBatchItems.companyId} = ${cteBatches.companyId} and ${cteBatchItems.batchId} = ${cteBatches.id}) < ${BigInt(input.itemCountLt)}`,
    input.itemCountLte === undefined
      ? undefined
      : sql`(select count(*) from ${cteBatchItems} where ${cteBatchItems.companyId} = ${cteBatches.companyId} and ${cteBatchItems.batchId} = ${cteBatches.id}) <= ${BigInt(input.itemCountLte)}`,
    input.itemCountNe === undefined
      ? undefined
      : sql`(select count(*) from ${cteBatchItems} where ${cteBatchItems.companyId} = ${cteBatches.companyId} and ${cteBatchItems.batchId} = ${cteBatches.id}) <> ${BigInt(input.itemCountNe)}`,
    input.nameContains === undefined
      ? undefined
      : ilike(cteBatches.name, `%${input.nameContains}%`),
    input.statusEq === undefined ? undefined : eq(cteBatches.status, input.statusEq),
    input.statusNe === undefined ? undefined : ne(cteBatches.status, input.statusNe),
    input.updatedFrom === undefined
      ? undefined
      : sql`${cteBatches.updatedAt} >= ${new Date(input.updatedFrom)}`,
    input.updatedUntil === undefined
      ? undefined
      : sql`${cteBatches.updatedAt} <= ${new Date(input.updatedUntil)}`,
    input.versionEq === undefined ? undefined : eq(cteBatches.version, BigInt(input.versionEq)),
    input.versionGt === undefined
      ? undefined
      : sql`${cteBatches.version} > ${BigInt(input.versionGt)}`,
    input.versionGte === undefined
      ? undefined
      : sql`${cteBatches.version} >= ${BigInt(input.versionGte)}`,
    input.versionLt === undefined
      ? undefined
      : sql`${cteBatches.version} < ${BigInt(input.versionLt)}`,
    input.versionLte === undefined
      ? undefined
      : sql`${cteBatches.version} <= ${BigInt(input.versionLte)}`,
    input.versionNe === undefined ? undefined : ne(cteBatches.version, BigInt(input.versionNe)),
  )
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

function mapItem(record: ItemRecord): Record<string, unknown> {
  return {
    batchId: record.batchId,
    calculationSnapshot: record.calculationSnapshot,
    companyId: record.companyId,
    freightCalculationId: record.freightCalculationId,
    id: record.id,
    nfeDocumentId: record.nfeDocumentId,
    position: record.position.toString(),
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

function requiredCalculationStatus(value: unknown): FreightCalculationStatus {
  if (value === 'snapshotted' || value === 'rejected') return value

  throw new Error('EXPECTED_FREIGHT_CALCULATION_STATUS')
}

function requiredChargeCalculation(value: unknown): CteBatchItemChargeCalculation {
  const calculations: readonly string[] = CTE_BATCH_ITEM_CHARGE_CALCULATIONS
  if (typeof value !== 'string' || !calculations.includes(value)) {
    throw new Error('EXPECTED_CTE_BATCH_ITEM_CHARGE_CALCULATION')
  }

  return value as CteBatchItemChargeCalculation
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
