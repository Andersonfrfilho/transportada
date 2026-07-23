/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, gte, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm'

import {
  billingInvoiceEvents,
  billingInvoiceItems,
  billingInvoices,
  cteBatchItems,
  cteFiscalDocuments,
  freightCalculations,
  nfeParticipants,
} from '../../database/database.schema.js'
import { ApiError } from '../../shared/api.error.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Queryable = Database | Transaction
type InvoiceRecord = typeof billingInvoices.$inferSelect

class DrizzleBillingTransaction {
  public constructor(private readonly database: Queryable) {}

  public async listEligibleCtes(
    input: Record<string, unknown>,
  ): Promise<readonly Record<string, unknown>[]> {
    const filters = optionalRecord(input.filters)
    return this.queryEligibleCtes({
      batchId: optionalString(filters['batchId']),
      companyId: requiredString(input.companyId),
      cteDocumentIds: null,
      cteNumber: optionalString(filters['cteNumber']),
      customerDocument: optionalString(filters['customerDocument']),
      from: optionalString(filters['from']),
      limit: requiredPositiveInteger(input.limit),
      maxAmount: optionalString(filters['maxAmount']),
      minAmount: optionalString(filters['minAmount']),
      to: optionalString(filters['to']),
    })
  }

  public async findEligibleCtesByIds(
    input: Record<string, unknown>,
  ): Promise<readonly Record<string, unknown>[]> {
    const cteDocumentIds = requiredStringArray(input.cteDocumentIds)
    if (cteDocumentIds.length === 0) return []
    return this.queryEligibleCtes({
      batchId: null,
      companyId: requiredString(input.companyId),
      cteDocumentIds,
      cteNumber: null,
      customerDocument: null,
      from: null,
      limit: cteDocumentIds.length,
      maxAmount: null,
      minAmount: null,
      to: null,
    })
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

  public async reserveCteForActiveInvoice(input: Record<string, unknown>): Promise<boolean> {
    const companyId = requiredString(input.companyId)
    const cteDocumentId = requiredString(input.cteDocumentId)
    const [document] = await this.database
      .select({ id: cteFiscalDocuments.id })
      .from(cteFiscalDocuments)
      .where(
        and(
          eq(cteFiscalDocuments.companyId, companyId),
          eq(cteFiscalDocuments.id, cteDocumentId),
          eq(cteFiscalDocuments.status, 'authorized'),
        ),
      )
      .limit(1)
      .for('update')
    if (document === undefined) return false

    const [existingItem] = await this.database
      .select({ id: billingInvoiceItems.id })
      .from(billingInvoiceItems)
      .where(
        and(
          eq(billingInvoiceItems.companyId, companyId),
          eq(billingInvoiceItems.cteDocumentId, cteDocumentId),
        ),
      )
      .limit(1)
    return existingItem === undefined
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
    return mapInvoiceRecord(record, 0)
  }

  public async createInvoiceItem(input: Record<string, unknown>): Promise<void> {
    try {
      await this.database.insert(billingInvoiceItems).values({
        batchId: requiredString(input.batchId),
        batchItemId: requiredString(input.batchItemId),
        companyId: requiredString(input.companyId),
        cteAccessKey: requiredString(input.cteAccessKey),
        cteDocumentId: requiredString(input.cteDocumentId),
        cteNumber: BigInt(requiredString(input.cteNumber)),
        description: requiredString(input.description),
        freightAmount: requiredString(input.freightAmount),
        invoiceId: requiredString(input.invoiceId),
        lineNumber: BigInt(requiredString(input.lineNumber)),
        snapshot: optionalRecord(input.snapshot),
        totalAmount: requiredString(input.totalAmount),
      })
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

  private async queryEligibleCtes(input: {
    readonly batchId: string | null
    readonly companyId: string
    readonly cteDocumentIds: readonly string[] | null
    readonly cteNumber: string | null
    readonly customerDocument: string | null
    readonly from: string | null
    readonly limit: number
    readonly maxAmount: string | null
    readonly minAmount: string | null
    readonly to: string | null
  }): Promise<readonly Record<string, unknown>[]> {
    const rows = await this.database
      .select({
        accessKey: cteFiscalDocuments.accessKey,
        authorizedAt: cteFiscalDocuments.authorizedAt,
        batchId: cteBatchItems.batchId,
        batchItemId: cteBatchItems.id,
        companyId: cteFiscalDocuments.companyId,
        cteNumber: cteFiscalDocuments.fiscalNumber,
        customerDocument: nfeParticipants.taxId,
        customerName: nfeParticipants.legalName,
        freightAmount: freightCalculations.calculatedAmount,
        freightCalculationId: freightCalculations.id,
        freightRuleVersion: freightCalculations.ruleVersion,
        id: cteFiscalDocuments.id,
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
      .innerJoin(
        nfeParticipants,
        and(
          eq(nfeParticipants.companyId, cteBatchItems.companyId),
          eq(nfeParticipants.documentId, cteBatchItems.nfeDocumentId),
          eq(nfeParticipants.role, 'recipient'),
        ),
      )
      .leftJoin(
        billingInvoiceItems,
        and(
          eq(billingInvoiceItems.companyId, cteFiscalDocuments.companyId),
          eq(billingInvoiceItems.cteDocumentId, cteFiscalDocuments.id),
        ),
      )
      .where(
        and(
          eq(cteFiscalDocuments.companyId, input.companyId),
          eq(cteFiscalDocuments.status, 'authorized'),
          isNotNull(cteFiscalDocuments.authorizedAt),
          isNotNull(nfeParticipants.taxId),
          isNotNull(nfeParticipants.legalName),
          isNull(billingInvoiceItems.id),
          input.batchId === null ? undefined : eq(cteBatchItems.batchId, input.batchId),
          input.cteDocumentIds === null
            ? undefined
            : inArray(cteFiscalDocuments.id, input.cteDocumentIds),
          input.cteNumber === null
            ? undefined
            : eq(cteFiscalDocuments.fiscalNumber, BigInt(input.cteNumber)),
          input.customerDocument === null
            ? undefined
            : eq(nfeParticipants.taxId, input.customerDocument),
          input.from === null
            ? undefined
            : gte(cteFiscalDocuments.authorizedAt, new Date(input.from)),
          input.to === null ? undefined : lte(cteFiscalDocuments.authorizedAt, new Date(input.to)),
          input.minAmount === null
            ? undefined
            : gte(freightCalculations.totalAmount, input.minAmount),
          input.maxAmount === null
            ? undefined
            : lte(freightCalculations.totalAmount, input.maxAmount),
        ),
      )
      .orderBy(asc(cteFiscalDocuments.authorizedAt), asc(cteFiscalDocuments.id))
      .limit(input.limit)

    return rows.map((row) => ({
      accessKey: row.accessKey,
      authorizedAt: row.authorizedAt?.toISOString() ?? '',
      batchId: row.batchId,
      batchItemId: row.batchItemId,
      companyId: row.companyId,
      cteNumber: row.cteNumber.toString(),
      customerDocument: row.customerDocument ?? '',
      customerName: row.customerName ?? '',
      freightAmount: row.freightAmount,
      id: row.id,
      snapshot: {
        freightCalculationId: row.freightCalculationId,
        freightRuleVersion: row.freightRuleVersion.toString(),
        totalAmount: row.totalAmount,
      },
      status: row.status,
      totalAmount: row.totalAmount,
    }))
  }

  private async mapInvoice(record: InvoiceRecord): Promise<Record<string, unknown>> {
    const [countRow] = await this.database
      .select({ count: sql<number>`count(*)::integer` })
      .from(billingInvoiceItems)
      .where(
        and(
          eq(billingInvoiceItems.companyId, record.companyId),
          eq(billingInvoiceItems.invoiceId, record.id),
        ),
      )
    return mapInvoiceRecord(record, countRow?.count ?? 0)
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

function mapInvoiceRecord(record: InvoiceRecord, itemCount: number): Record<string, unknown> {
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
    status: record.status,
    subtotalAmount: record.subtotalAmount,
    surchargeAmount: record.surchargeAmount,
    totalAmount: record.totalAmount,
    updatedAt: record.updatedAt.toISOString(),
  }
}

function requiredEventName(value: unknown): 'invoice_created' | 'invoice_cancelled' {
  if (value === 'invoice_created' || value === 'invoice_cancelled') return value
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
