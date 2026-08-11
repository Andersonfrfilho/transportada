/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm'

import { BILLING_INVOICE_STATUSES } from '../../database/billing.schema.js'
import {
  billingInvoiceEvents,
  billingInvoiceItems,
  billingInvoices,
  cteBatchItems,
  cteBatches,
  cteFiscalDocuments,
  cteIssuancePayloads,
  freightCalculations,
  nfeDocuments,
} from '../../database/database.schema.js'
import { ApiError } from '../../shared/api.error.js'
import { BILLING_INVOICE_ITEM_INSERT_CHUNK } from '../domain/invoice-limits.constant.js'
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  type KeysetCursor,
} from '../../shared/keyset-cursor.js'
import {
  buildActiveInvoiceItemJoin,
  buildBillingTakerJoin,
  buildEligibleCteFilters,
  buildEligibleNfeDocumentJoin,
  type EligibleCteFilterInput,
} from './eligible-cte.query.js'
import { buildNumberFilter } from './number-filter.query.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Queryable = Database | Transaction
type InvoiceRecord = typeof billingInvoices.$inferSelect

type InvoiceItemSummary = {
  readonly accessKey: string
  readonly cteNumber: string
  readonly description: string
  readonly totalAmount: string
}

export type BillingInvoiceListFilterInput = {
  readonly companyId: string
  readonly cursor: KeysetCursor | null
  readonly filters?: {
    readonly customerDocument?: string
    readonly customerDocumentIn?: readonly string[]
    readonly dueFrom?: string
    readonly dueTo?: string
    readonly invoiceNumber?: string
    readonly invoiceNumberFrom?: string
    readonly invoiceNumberIn?: readonly string[]
    readonly invoiceNumberTo?: string
    readonly issuedFrom?: string
    readonly issuedTo?: string
    readonly status?: string
    readonly statusIn?: readonly string[]
  }
}

class DrizzleBillingTransaction {
  public constructor(private readonly database: Queryable) {}

  public async listEligibleCtes(input: Record<string, unknown>): Promise<{
    readonly items: readonly Record<string, unknown>[]
    readonly nextCursor: string | null
  }> {
    const filters = optionalRecord(input.filters)
    return this.queryEligibleCtes({
      batchId: optionalString(filters['batchId']),
      batchIdIn: optionalStringArray(filters['batchIdIn']),
      companyId: requiredString(input.companyId),
      cteDocumentIds: null,
      cteNumber: optionalString(filters['cteNumber']),
      cteNumberFrom: optionalString(filters['cteNumberFrom']),
      cteNumberIn: optionalStringArray(filters['cteNumberIn']),
      cteNumberTo: optionalString(filters['cteNumberTo']),
      cursor: decodeKeysetCursor(optionalString(input.cursor)),
      customerDocument: optionalString(filters['customerDocument']),
      customerName: optionalString(filters['customerName']),
      from: optionalString(filters['from']),
      limit: requiredPositiveInteger(input.limit),
      maxAmount: optionalString(filters['maxAmount']),
      minAmount: optionalString(filters['minAmount']),
      nfeNumberFrom: optionalString(filters['nfeNumberFrom']),
      nfeNumberIn: optionalStringArray(filters['nfeNumberIn']),
      nfeNumberTo: optionalString(filters['nfeNumberTo']),
      to: optionalString(filters['to']),
    })
  }

  public async findEligibleCtesByIds(
    input: Record<string, unknown>,
  ): Promise<readonly Record<string, unknown>[]> {
    const cteDocumentIds = requiredStringArray(input.cteDocumentIds)
    if (cteDocumentIds.length === 0) return []
    const page = await this.queryEligibleCtes({
      batchId: null,
      batchIdIn: null,
      companyId: requiredString(input.companyId),
      cteDocumentIds,
      cteNumber: null,
      cteNumberFrom: null,
      cteNumberIn: null,
      cteNumberTo: null,
      cursor: null,
      customerDocument: null,
      customerName: null,
      from: null,
      limit: cteDocumentIds.length,
      maxAmount: null,
      minAmount: null,
      nfeNumberFrom: null,
      nfeNumberIn: null,
      nfeNumberTo: null,
      to: null,
    })
    return page.items
  }

  public async findBillingPreviewByIds(
    input: Record<string, unknown>,
  ): Promise<readonly Record<string, unknown>[]> {
    const cteDocumentIds = requiredStringArray(input.cteDocumentIds)
    if (cteDocumentIds.length === 0) return []
    const companyId = requiredString(input.companyId)
    const rows = await this.database
      .select({
        batchId: cteBatchItems.batchId,
        cteId: cteFiscalDocuments.id,
        cteNumber: cteFiscalDocuments.fiscalNumber,
        customerDocument: cteIssuancePayloads.takerTaxId,
        customerName: cteIssuancePayloads.takerLegalName,
        invoiceId: billingInvoiceItems.invoiceId,
        status: cteFiscalDocuments.status,
        totalAmount: freightCalculations.totalAmount,
      })
      .from(cteFiscalDocuments)
      .innerJoin(
        cteBatchItems,
        and(
          eq(cteBatchItems.companyId, cteFiscalDocuments.companyId),
          eq(cteBatchItems.id, cteFiscalDocuments.batchItemId),
        ),
      )
      .innerJoin(
        freightCalculations,
        and(
          eq(freightCalculations.companyId, cteBatchItems.companyId),
          eq(freightCalculations.id, cteBatchItems.freightCalculationId),
        ),
      )
      .leftJoin(cteIssuancePayloads, buildBillingTakerJoin())
      .leftJoin(billingInvoiceItems, buildActiveInvoiceItemJoin())
      .where(
        and(
          eq(cteFiscalDocuments.companyId, companyId),
          inArray(cteFiscalDocuments.id, cteDocumentIds),
        ),
      )

    return rows.map((row) => ({
      batchId: row.batchId,
      cteId: row.cteId,
      cteNumber: row.cteNumber.toString(),
      customerDocument: row.customerDocument ?? '',
      customerName: row.customerName ?? '',
      invoiceId: row.invoiceId,
      status: row.status,
      totalAmount: row.totalAmount,
    }))
  }

  public async findInvoiceByIdempotency(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const [record] = await this.database
      .select()
      .from(billingInvoices)
      .where(
        and(
          eq(billingInvoices.companyId, requiredString(input.companyId)),
          eq(billingInvoices.idempotencyKey, requiredString(input.idempotencyKey)),
        ),
      )
      .limit(1)
    if (record === undefined) return null
    return {
      invoice: await this.mapInvoice(record),
      requestFingerprint: record.requestFingerprint,
    }
  }

  public async reserveCtesForActiveInvoice(input: Record<string, unknown>): Promise<boolean> {
    const companyId = requiredString(input.companyId)
    const cteDocumentIds = requiredStringArray(input.cteDocumentIds)
    if (cteDocumentIds.length === 0) return true

    // Ordem estável de bloqueio: duas faturas concorrentes com CT-es em comum esperam, não travam.
    const documents = await this.database
      .select({ id: cteFiscalDocuments.id })
      .from(cteFiscalDocuments)
      .where(
        and(
          eq(cteFiscalDocuments.companyId, companyId),
          inArray(cteFiscalDocuments.id, cteDocumentIds),
          eq(cteFiscalDocuments.status, 'authorized'),
        ),
      )
      .orderBy(asc(cteFiscalDocuments.id))
      .for('update')
    if (documents.length !== new Set(cteDocumentIds).size) return false

    const [existingItem] = await this.database
      .select({ id: billingInvoiceItems.id })
      .from(billingInvoiceItems)
      .where(
        and(
          eq(billingInvoiceItems.companyId, companyId),
          inArray(billingInvoiceItems.cteDocumentId, cteDocumentIds),
          isNull(billingInvoiceItems.cancelledAt),
        ),
      )
      .limit(1)
    return existingItem === undefined
  }

  /** Cancelar a fatura solta os CT-es dela: a linha continua no relatório, mas deixa de ocupar. */
  public async releaseInvoiceItems(input: Record<string, unknown>): Promise<number> {
    const cancelledAt = requiredDate(input.cancelledAt)
    const released = await this.database
      .update(billingInvoiceItems)
      .set({ cancelledAt, updatedAt: new Date() })
      .where(
        and(
          eq(billingInvoiceItems.companyId, requiredString(input.companyId)),
          eq(billingInvoiceItems.invoiceId, requiredString(input.invoiceId)),
          isNull(billingInvoiceItems.cancelledAt),
        ),
      )
      .returning({ id: billingInvoiceItems.id })
    return released.length
  }

  public async createInvoice(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const companyId = requiredString(input.companyId)
    await this.database.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${companyId}, 9011))`,
    )
    const [numberRow] = await this.database
      .select({
        nextNumber: sql<bigint>`coalesce(max(${billingInvoices.invoiceNumber}), 0) + 1`,
      })
      .from(billingInvoices)
      .where(eq(billingInvoices.companyId, companyId))
    const invoiceNumber = numberRow?.nextNumber ?? 1n
    const [record] = await this.database
      .insert(billingInvoices)
      .values({
        actorUserId: requiredString(input.actorUserId),
        companyId,
        correlationId: requiredString(input.correlationId),
        currency: 'BRL',
        customerDocument: requiredString(input.customerDocument),
        customerName: requiredString(input.customerName),
        discountAmount: requiredString(input.discountAmount),
        dueDate: requiredDate(input.dueDate),
        idempotencyKey: requiredString(input.idempotencyKey),
        invoiceNumber,
        issueDate: requiredDate(input.issueDate),
        requestFingerprint: requiredString(input.requestFingerprint),
        status: 'issued',
        subtotalAmount: requiredString(input.subtotalAmount),
        surchargeAmount: requiredString(input.surchargeAmount),
        totalAmount: requiredString(input.totalAmount),
      })
      .returning()
    if (record === undefined) throw new Error('BILLING_INVOICE_CREATE_FAILED')
    return mapInvoiceRecord(record, [])
  }

  public async createInvoiceItems(input: Record<string, unknown>): Promise<void> {
    const values = requiredRecordArray(input.items).map((item) => ({
      batchId: requiredString(item.batchId),
      batchItemId: requiredString(item.batchItemId),
      companyId: requiredString(item.companyId),
      cteAccessKey: requiredString(item.cteAccessKey),
      cteDocumentId: requiredString(item.cteDocumentId),
      cteNumber: BigInt(requiredString(item.cteNumber)),
      description: requiredString(item.description),
      freightAmount: requiredString(item.freightAmount),
      invoiceId: requiredString(item.invoiceId),
      lineNumber: BigInt(requiredString(item.lineNumber)),
      snapshot: optionalRecord(item.snapshot),
      totalAmount: requiredString(item.totalAmount),
    }))
    if (values.length === 0) return

    try {
      for (let start = 0; start < values.length; start += BILLING_INVOICE_ITEM_INSERT_CHUNK) {
        await this.database
          .insert(billingInvoiceItems)
          .values(values.slice(start, start + BILLING_INVOICE_ITEM_INSERT_CHUNK))
      }
    } catch (error) {
      if (isCteReservationConflict(error)) throw cteAlreadyInvoicedError()
      throw error
    }
  }

  public async createInvoiceEvent(input: Record<string, unknown>): Promise<void> {
    await this.database.insert(billingInvoiceEvents).values({
      actorUserId: requiredString(input.actorUserId),
      companyId: requiredString(input.companyId),
      eventName: requiredEventName(input.eventName),
      eventVersion: 1n,
      invoiceId: requiredString(input.invoiceId),
      occurredAt: new Date(),
      payload: optionalRecord(input.payload),
      reason: optionalString(input.reason),
    })
  }

  public async listInvoices(input: Record<string, unknown>): Promise<{
    readonly items: readonly Record<string, unknown>[]
    readonly nextCursor: string | null
  }> {
    const filters = optionalRecord(input.filters)
    const limit = requiredPositiveInteger(input.limit)
    const records = await this.database
      .select()
      .from(billingInvoices)
      .where(
        and(
          ...buildInvoiceListFilters({
            companyId: requiredString(input.companyId),
            cursor: decodeKeysetCursor(optionalString(input.cursor)),
            filters: {
              ...withOptionalString('customerDocument', filters['customerDocument']),
              ...withOptionalString('dueFrom', filters['dueFrom']),
              ...withOptionalString('dueTo', filters['dueTo']),
              ...withOptionalString('invoiceNumber', filters['invoiceNumber']),
              ...withOptionalString('issuedFrom', filters['issuedFrom']),
              ...withOptionalString('issuedTo', filters['issuedTo']),
              ...withOptionalString('status', filters['status']),
            },
          }),
        ),
      )
      .orderBy(desc(billingInvoices.createdAt), desc(billingInvoices.id))
      .limit(limit + 1)
    if (records.length === 0) return { items: [], nextCursor: null }

    const page = records.slice(0, limit)
    const last = page[page.length - 1]
    const itemCounts = await this.countInvoiceItems({
      companyId: requiredString(input.companyId),
      invoiceIds: page.map((record) => record.id),
    })

    return {
      items: page.map((record) => mapInvoiceListRecord(record, itemCounts.get(record.id) ?? 0)),
      nextCursor:
        records.length > page.length && last !== undefined
          ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    }
  }

  /** Uma query só para a página inteira: a coluna "CT-es" da listagem não vale um N+1. */
  private async countInvoiceItems(
    input: Readonly<{ companyId: string; invoiceIds: readonly string[] }>,
  ): Promise<ReadonlyMap<string, number>> {
    if (input.invoiceIds.length === 0) return new Map()
    const rows = await this.database
      .select({ invoiceId: billingInvoiceItems.invoiceId, total: count() })
      .from(billingInvoiceItems)
      .where(and(...buildInvoiceItemCountFilters(input)))
      .groupBy(billingInvoiceItems.invoiceId)
    return new Map(rows.map((row) => [row.invoiceId, row.total]))
  }

  public async findInvoice(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const [record] = await this.database
      .select()
      .from(billingInvoices)
      .where(
        and(
          eq(billingInvoices.companyId, requiredString(input.companyId)),
          eq(billingInvoices.id, requiredString(input.invoiceId)),
        ),
      )
      .limit(1)
    return record === undefined ? null : this.mapInvoice(record)
  }

  public async updateInvoiceStatus(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const companyId = requiredString(input.companyId)
    const invoiceId = requiredString(input.invoiceId)
    const [record] = await this.database
      .update(billingInvoices)
      .set({
        cancelledAt: requiredDate(input.cancelledAt),
        status: 'cancelled',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(billingInvoices.companyId, companyId),
          eq(billingInvoices.id, invoiceId),
          eq(billingInvoices.status, 'issued'),
        ),
      )
      .returning()
    if (record === undefined) throw invoiceInvalidStateError()
    return this.mapInvoice(record)
  }

  public async updateInvoiceDetails(
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const [record] = await this.database
      .update(billingInvoices)
      .set({
        discountAmount: requiredString(input.discountAmount),
        observations: requiredString(input.observations),
        surchargeAmount: requiredString(input.surchargeAmount),
        totalAmount: requiredString(input.totalAmount),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(billingInvoices.companyId, requiredString(input.companyId)),
          eq(billingInvoices.id, requiredString(input.invoiceId)),
          eq(
            billingInvoices.status,
            requiredString(input.expectedStatus) as (typeof BILLING_INVOICE_STATUSES)[number],
          ),
        ),
      )
      .returning()
    if (record === undefined) throw invoiceInvalidStateError()
    return this.mapInvoice(record)
  }

  private async queryEligibleCtes(
    input: EligibleCteFilterInput & { readonly limit: number },
  ): Promise<{
    readonly items: readonly Record<string, unknown>[]
    readonly nextCursor: string | null
  }> {
    const records = await this.database
      .select({
        accessKey: cteFiscalDocuments.accessKey,
        authorizedAt: cteFiscalDocuments.authorizedAt,
        batchId: cteBatchItems.batchId,
        batchItemId: cteBatchItems.id,
        batchName: cteBatches.name,
        companyId: cteFiscalDocuments.companyId,
        cteNumber: cteFiscalDocuments.fiscalNumber,
        customerDocument: cteIssuancePayloads.takerTaxId,
        customerName: cteIssuancePayloads.takerLegalName,
        freightAmount: freightCalculations.calculatedAmount,
        freightCalculationId: freightCalculations.id,
        freightRuleVersion: freightCalculations.ruleVersion,
        id: cteFiscalDocuments.id,
        nfeNumber: nfeDocuments.number,
        status: cteFiscalDocuments.status,
        totalAmount: freightCalculations.totalAmount,
      })
      .from(cteFiscalDocuments)
      .innerJoin(
        cteBatchItems,
        and(
          eq(cteBatchItems.companyId, cteFiscalDocuments.companyId),
          eq(cteBatchItems.id, cteFiscalDocuments.batchItemId),
        ),
      )
      .innerJoin(
        cteBatches,
        and(
          eq(cteBatches.companyId, cteBatchItems.companyId),
          eq(cteBatches.id, cteBatchItems.batchId),
        ),
      )
      .innerJoin(
        freightCalculations,
        and(
          eq(freightCalculations.companyId, cteBatchItems.companyId),
          eq(freightCalculations.id, cteBatchItems.freightCalculationId),
        ),
      )
      .innerJoin(cteIssuancePayloads, buildBillingTakerJoin())
      .leftJoin(nfeDocuments, buildEligibleNfeDocumentJoin())
      .leftJoin(billingInvoiceItems, buildActiveInvoiceItemJoin())
      .where(and(...buildEligibleCteFilters(input)))
      .orderBy(asc(cteFiscalDocuments.authorizedAt), asc(cteFiscalDocuments.id))
      // A linha extra é a única forma de distinguir "página cheia" de "acabou" sem um count à parte.
      .limit(input.limit + 1)

    const rows = records.slice(0, input.limit)
    const last = rows[rows.length - 1]
    const nextCursor =
      records.length > input.limit && last !== undefined && last.authorizedAt !== null
        ? encodeKeysetCursor({ createdAt: last.authorizedAt, id: last.id })
        : null

    const items = rows.map((row) => ({
      accessKey: row.accessKey,
      authorizedAt: row.authorizedAt?.toISOString() ?? '',
      batchId: row.batchId,
      batchItemId: row.batchItemId,
      batchName: row.batchName,
      companyId: row.companyId,
      cteNumber: row.cteNumber.toString(),
      customerDocument: row.customerDocument ?? '',
      customerName: row.customerName ?? '',
      freightAmount: row.freightAmount,
      id: row.id,
      nfeNumber: row.nfeNumber,
      snapshot: {
        freightCalculationId: row.freightCalculationId,
        freightRuleVersion: row.freightRuleVersion.toString(),
        totalAmount: row.totalAmount,
      },
      status: row.status,
      totalAmount: row.totalAmount,
    }))

    return { items, nextCursor }
  }

  private async mapInvoice(record: InvoiceRecord): Promise<Record<string, unknown>> {
    const rows = await this.database
      .select({
        accessKey: billingInvoiceItems.cteAccessKey,
        cteNumber: billingInvoiceItems.cteNumber,
        description: billingInvoiceItems.description,
        lineNumber: billingInvoiceItems.lineNumber,
        totalAmount: billingInvoiceItems.totalAmount,
      })
      .from(billingInvoiceItems)
      .where(
        and(
          eq(billingInvoiceItems.companyId, record.companyId),
          eq(billingInvoiceItems.invoiceId, record.id),
        ),
      )
      .orderBy(asc(billingInvoiceItems.lineNumber))
    return mapInvoiceRecord(
      record,
      rows.map((row) => ({
        accessKey: row.accessKey,
        cteNumber: row.cteNumber.toString(),
        description: row.description,
        totalAmount: row.totalAmount,
      })),
    )
  }
}

export class DrizzleBillingRepository extends DrizzleBillingTransaction {
  public constructor(private readonly rootDatabase: Database) {
    super(rootDatabase)
  }

  public execute<TResponse>(
    operation: (transaction: DrizzleBillingTransaction) => Promise<TResponse>,
  ): Promise<TResponse> {
    return this.rootDatabase.transaction((transaction) =>
      operation(new DrizzleBillingTransaction(transaction)),
    )
  }
}

export function buildInvoiceListFilters(input: BillingInvoiceListFilterInput): SQL[] {
  const conditions: SQL[] = [eq(billingInvoices.companyId, input.companyId)]
  if (input.cursor !== null) conditions.push(invoiceKeysetCondition(input.cursor))

  const filters = input.filters
  if (filters === undefined) return conditions

  if (filters.status !== undefined) {
    conditions.push(
      eq(billingInvoices.status, filters.status as (typeof BILLING_INVOICE_STATUSES)[number]),
    )
  }
  if (filters.issuedFrom !== undefined) {
    conditions.push(gte(billingInvoices.issueDate, new Date(filters.issuedFrom)))
  }
  if (filters.issuedTo !== undefined) {
    conditions.push(lte(billingInvoices.issueDate, new Date(filters.issuedTo)))
  }
  if (filters.dueFrom !== undefined) {
    conditions.push(gte(billingInvoices.dueDate, new Date(filters.dueFrom)))
  }
  if (filters.dueTo !== undefined) {
    conditions.push(lte(billingInvoices.dueDate, new Date(filters.dueTo)))
  }
  if (filters.customerDocument !== undefined) {
    conditions.push(eq(billingInvoices.customerDocument, filters.customerDocument))
  }
  if (filters.customerDocumentIn !== undefined) {
    conditions.push(inArray(billingInvoices.customerDocument, filters.customerDocumentIn))
  }
  if (filters.statusIn !== undefined) {
    conditions.push(
      inArray(
        billingInvoices.status,
        filters.statusIn as readonly (typeof BILLING_INVOICE_STATUSES)[number][],
      ),
    )
  }
  if (filters.invoiceNumber !== undefined) {
    conditions.push(eq(billingInvoices.invoiceNumber, BigInt(filters.invoiceNumber)))
  }
  const numberFilter = buildNumberFilter({
    column: billingInvoices.invoiceNumber,
    from: filters.invoiceNumberFrom ?? null,
    list: filters.invoiceNumberIn ?? null,
    to: filters.invoiceNumberTo ?? null,
    toComparable: BigInt,
  })
  if (numberFilter !== undefined) conditions.push(numberFilter)

  return conditions
}

function invoiceKeysetCondition(cursor: KeysetCursor): SQL {
  return sql`(${lt(billingInvoices.createdAt, cursor.createdAt)} or (${eq(
    billingInvoices.createdAt,
    cursor.createdAt,
  )} and ${lt(billingInvoices.id, cursor.id)}))`
}

export function buildInvoiceItemCountFilters(
  input: Readonly<{ companyId: string; invoiceIds: readonly string[] }>,
): SQL[] {
  return [
    eq(billingInvoiceItems.companyId, input.companyId),
    inArray(billingInvoiceItems.invoiceId, [...input.invoiceIds]),
  ]
}

export function mapInvoiceListRecord(
  record: InvoiceRecord,
  itemCount: number,
): Record<string, unknown> {
  return {
    companyId: record.companyId,
    createdAt: record.createdAt.toISOString(),
    currency: record.currency,
    customerDocument: record.customerDocument,
    customerName: record.customerName,
    discountAmount: record.discountAmount,
    dueDate: record.dueDate.toISOString(),
    id: record.id,
    invoiceNumber: record.invoiceNumber.toString(),
    issueDate: record.issueDate.toISOString(),
    itemCount,
    observations: record.observations,
    status: record.status,
    subtotalAmount: record.subtotalAmount,
    surchargeAmount: record.surchargeAmount,
    totalAmount: record.totalAmount,
    updatedAt: record.updatedAt.toISOString(),
  }
}

function mapInvoiceRecord(
  record: InvoiceRecord,
  items: readonly InvoiceItemSummary[],
): Record<string, unknown> {
  return {
    companyId: record.companyId,
    createdAt: record.createdAt.toISOString(),
    currency: record.currency,
    customerDocument: record.customerDocument,
    customerName: record.customerName,
    discountAmount: record.discountAmount,
    dueDate: record.dueDate.toISOString(),
    id: record.id,
    invoiceNumber: record.invoiceNumber.toString(),
    issueDate: record.issueDate.toISOString(),
    itemCount: items.length,
    items,
    observations: record.observations,
    status: record.status,
    subtotalAmount: record.subtotalAmount,
    surchargeAmount: record.surchargeAmount,
    totalAmount: record.totalAmount,
    updatedAt: record.updatedAt.toISOString(),
  }
}

function requiredEventName(
  value: unknown,
): 'invoice_created' | 'invoice_updated' | 'invoice_cancelled' {
  if (value === 'invoice_created' || value === 'invoice_updated' || value === 'invoice_cancelled') {
    return value
  }
  throw new Error('EXPECTED_BILLING_EVENT_NAME')
}

function requiredDate(value: unknown): Date {
  const date = new Date(requiredString(value))
  if (Number.isNaN(date.getTime())) throw new Error('EXPECTED_DATE')
  return date
}

function requiredPositiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error('EXPECTED_POSITIVE_INTEGER')
  }
  return value
}

function requiredRecordArray(value: unknown): readonly Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('EXPECTED_RECORD_ARRAY')
  return value.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('EXPECTED_RECORD_ARRAY')
    }
    return item as Record<string, unknown>
  })
}

function requiredStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error('EXPECTED_STRING_ARRAY')
  }
  return value as readonly string[]
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error('EXPECTED_STRING')
  return value
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function optionalStringArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  if (value.some((item) => typeof item !== 'string')) throw new Error('EXPECTED_STRING_ARRAY')
  return value as readonly string[]
}

function withOptionalString<TKey extends string>(
  key: TKey,
  value: unknown,
): { readonly [P in TKey]?: string } {
  const parsed = optionalString(value)
  return parsed === null ? {} : ({ [key]: parsed } as { readonly [P in TKey]?: string })
}

function optionalRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function isCteReservationConflict(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const constraint = Reflect.get(error, 'constraint')
  const message = Reflect.get(error, 'message')
  return (
    constraint === 'billing_invoice_items_company_cte_document_unique' ||
    (typeof message === 'string' &&
      message.includes('billing_invoice_items_company_cte_document_unique'))
  )
}

function cteAlreadyInvoicedError(): ApiError {
  return new ApiError({
    code: 'BILLING_CTE_ALREADY_INVOICED',
    message: 'CT-e already belongs to an active invoice',
    status: 409,
  })
}

function invoiceInvalidStateError(): ApiError {
  return new ApiError({
    code: 'BILLING_INVOICE_INVALID_STATE',
    message: 'Billing invoice state transition is not allowed',
    status: 409,
  })
}
