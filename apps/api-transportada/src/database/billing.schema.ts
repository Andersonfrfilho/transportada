/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { cteBatchItems, cteBatches } from './cte-batch.schema.js'
import { cteFiscalDocuments } from './cte-issuance.schema.js'
import { companies, userCompanyMemberships } from './identity.schema.js'
import { storedObjects } from './storage.schema.js'

export const BILLING_INVOICE_STATUSES = ['issued', 'cancelled'] as const
export const BILLING_EVENT_NAMES = [
  'invoice_created',
  'invoice_updated',
  'invoice_cancelled',
  'document_generated',
  'document_failed',
] as const
export const BILLING_DOCUMENT_KINDS = ['pdf', 'csv', 'json'] as const

export const billingInvoices = pgTable(
  'billing_invoices',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    invoiceNumber: bigint('invoice_number', { mode: 'bigint' }).notNull(),
    status: text().$type<(typeof BILLING_INVOICE_STATUSES)[number]>().notNull(),
    customerName: text('customer_name').notNull(),
    customerDocument: text('customer_document').notNull(),
    issueDate: timestamp('issue_date', { withTimezone: true }).notNull(),
    dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
    currency: text().notNull(),
    subtotalAmount: numeric('subtotal_amount', { precision: 14, scale: 2 }).notNull(),
    discountAmount: numeric('discount_amount', { precision: 14, scale: 2 }).notNull(),
    surchargeAmount: numeric('surcharge_amount', { precision: 14, scale: 2 }).notNull(),
    totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    correlationId: text('correlation_id').notNull(),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    observations: text().notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'billing_invoices_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'billing_invoices_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('billing_invoices_company_id_id_unique').on(table.companyId, table.id),
    unique('billing_invoices_company_invoice_number_unique').on(
      table.companyId,
      table.invoiceNumber,
    ),
    unique('billing_invoices_company_idempotency_key_unique').on(
      table.companyId,
      table.idempotencyKey,
    ),
    index('billing_invoices_company_status_due_date_idx').on(
      table.companyId,
      table.status,
      table.dueDate,
    ),
    index('billing_invoices_company_customer_created_at_idx').on(
      table.companyId,
      table.customerDocument,
      table.createdAt,
    ),
    check('billing_invoices_status_check', sql`${table.status} in ('issued', 'cancelled')`),
    check('billing_invoices_currency_check', sql`${table.currency} = 'BRL'`),
    check('billing_invoices_invoice_number_check', sql`${table.invoiceNumber} > 0`),
    check(
      'billing_invoices_amounts_check',
      sql`${table.subtotalAmount} >= 0 and ${table.discountAmount} >= 0 and ${table.surchargeAmount} >= 0 and ${table.totalAmount} >= 0`,
    ),
    check(
      'billing_invoices_total_check',
      sql`${table.totalAmount} = (${table.subtotalAmount} - ${table.discountAmount} + ${table.surchargeAmount})`,
    ),
    check('billing_invoices_idempotency_key_check', sql`length(${table.idempotencyKey}) > 0`),
    check(
      'billing_invoices_request_fingerprint_check',
      sql`length(${table.requestFingerprint}) > 0`,
    ),
    check(
      'billing_invoices_customer_document_check',
      sql`${table.customerDocument} ~ '^[0-9]{11,14}$'`,
    ),
    check('billing_invoices_observations_check', sql`length(${table.observations}) <= 500`),
  ],
)

export const billingInvoiceItems = pgTable(
  'billing_invoice_items',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    cteDocumentId: uuid('cte_document_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    batchItemId: uuid('batch_item_id').notNull(),
    lineNumber: bigint('line_number', { mode: 'bigint' }).notNull(),
    cteAccessKey: text('cte_access_key').notNull(),
    cteNumber: bigint('cte_number', { mode: 'bigint' }).notNull(),
    description: text().notNull(),
    freightAmount: numeric('freight_amount', { precision: 14, scale: 2 }).notNull(),
    totalAmount: numeric('total_amount', { precision: 14, scale: 2 }).notNull(),
    snapshot: jsonb().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'billing_invoice_items_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.invoiceId],
      foreignColumns: [billingInvoices.companyId, billingInvoices.id],
      name: 'billing_invoice_items_company_invoice_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.cteDocumentId],
      foreignColumns: [cteFiscalDocuments.companyId, cteFiscalDocuments.id],
      name: 'billing_invoice_items_company_cte_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.batchId],
      foreignColumns: [cteBatches.companyId, cteBatches.id],
      name: 'billing_invoice_items_company_batch_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.batchItemId],
      foreignColumns: [cteBatchItems.companyId, cteBatchItems.id],
      name: 'billing_invoice_items_company_batch_item_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('billing_invoice_items_company_id_id_unique').on(table.companyId, table.id),
    unique('billing_invoice_items_company_invoice_line_unique').on(
      table.companyId,
      table.invoiceId,
      table.lineNumber,
    ),
    unique('billing_invoice_items_company_cte_document_unique').on(
      table.companyId,
      table.cteDocumentId,
    ),
    index('billing_invoice_items_company_invoice_line_idx').on(
      table.companyId,
      table.invoiceId,
      table.lineNumber,
    ),
    check('billing_invoice_items_line_number_check', sql`${table.lineNumber} > 0`),
    check('billing_invoice_items_cte_access_key_check', sql`${table.cteAccessKey} ~ '^[0-9]{44}$'`),
    check('billing_invoice_items_cte_number_check', sql`${table.cteNumber} > 0`),
    check(
      'billing_invoice_items_amounts_check',
      sql`${table.freightAmount} >= 0 and ${table.totalAmount} >= 0`,
    ),
  ],
)

export const billingInvoiceEvents = pgTable(
  'billing_invoice_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    eventName: text('event_name').$type<(typeof BILLING_EVENT_NAMES)[number]>().notNull(),
    eventVersion: bigint('event_version', { mode: 'bigint' }).notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    reason: text(),
    payload: jsonb().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'billing_invoice_events_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.invoiceId],
      foreignColumns: [billingInvoices.companyId, billingInvoices.id],
      name: 'billing_invoice_events_company_invoice_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'billing_invoice_events_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('billing_invoice_events_company_id_id_unique').on(table.companyId, table.id),
    index('billing_invoice_events_company_invoice_occurred_at_idx').on(
      table.companyId,
      table.invoiceId,
      table.occurredAt,
    ),
    check(
      'billing_invoice_events_name_check',
      sql`${table.eventName} in ('invoice_created', 'invoice_updated', 'invoice_cancelled', 'document_generated', 'document_failed')`,
    ),
    check('billing_invoice_events_version_check', sql`${table.eventVersion} > 0`),
  ],
)

export const billingInvoiceDocuments = pgTable(
  'billing_invoice_documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    documentKind: text('document_kind').$type<(typeof BILLING_DOCUMENT_KINDS)[number]>().notNull(),
    objectId: uuid('object_id').notNull(),
    sha256: text().notNull(),
    mimeType: text('mime_type').notNull(),
    byteSize: bigint('byte_size', { mode: 'bigint' }).notNull(),
    documentVersion: bigint('document_version', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'billing_invoice_documents_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.invoiceId],
      foreignColumns: [billingInvoices.companyId, billingInvoices.id],
      name: 'billing_invoice_documents_company_invoice_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.objectId],
      foreignColumns: [storedObjects.companyId, storedObjects.id],
      name: 'billing_invoice_documents_company_object_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('billing_invoice_documents_company_id_id_unique').on(table.companyId, table.id),
    unique('billing_invoice_documents_company_invoice_kind_version_unique').on(
      table.companyId,
      table.invoiceId,
      table.documentKind,
      table.documentVersion,
    ),
    index('billing_invoice_documents_company_invoice_created_at_idx').on(
      table.companyId,
      table.invoiceId,
      table.createdAt,
    ),
    check(
      'billing_invoice_documents_kind_check',
      sql`${table.documentKind} in ('pdf', 'csv', 'json')`,
    ),
    check('billing_invoice_documents_sha256_check', sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
    check('billing_invoice_documents_byte_size_check', sql`${table.byteSize} > 0`),
    check('billing_invoice_documents_version_check', sql`${table.documentVersion} > 0`),
  ],
)
