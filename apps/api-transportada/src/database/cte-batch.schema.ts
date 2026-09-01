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

import { companies, userCompanyMemberships } from './identity.schema.js'
import { freightCalculations } from './freight.schema.js'
import { nfeDocuments } from './nfe.schema.js'

export const CTE_BATCH_STATUSES = [
  'draft',
  'submitted',
  'in_flight',
  'done',
  'error',
  'cancelled',
] as const
export const CTE_BATCH_ITEM_CHARGE_CALCULATIONS = [
  'percentage_of_cargo',
  'percentage_of_freight',
  'fixed_amount',
] as const
export const CTE_SUBMISSION_STATUSES = ['pending', 'accepted', 'conflict', 'rejected'] as const
export const CTE_SUBMISSION_RESULTS = ['ok', 'error'] as const

export const CTE_BATCH_EVENTS = [
  'created',
  'updated',
  'submitted',
  'in_flight',
  'done',
  'error',
  'cancelled',
] as const

export const cteBatches = pgTable(
  'cte_batches',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    operatorUserId: uuid('operator_user_id').notNull(),
    name: text().notNull(),
    status: text().$type<(typeof CTE_BATCH_STATUSES)[number]>().notNull(),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    idempotencyKey: text('idempotency_key').notNull(),
    idempotencyFingerprint: text('idempotency_fingerprint').notNull(),
    correlationId: text('correlation_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cte_batches_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cte_batches_company_id_id_unique').on(table.companyId, table.id),
    unique('cte_batches_company_id_name_unique').on(table.companyId, table.name),
    unique('cte_batches_company_id_idempotency_key_unique').on(
      table.companyId,
      table.idempotencyKey,
    ),
    index('cte_batches_company_status_created_at_idx').on(
      table.companyId,
      table.status,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.operatorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'cte_batches_operator_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'cte_batches_status_check',
      sql`${table.status} in ('draft', 'submitted', 'in_flight', 'done', 'error', 'cancelled')`,
    ),
    check('cte_batches_version_check', sql`${table.version} > 0`),
    check(
      'cte_batches_idempotency_key_check',
      sql`${table.idempotencyKey} is not null and length(${table.idempotencyKey}) > 0`,
    ),
    check(
      'cte_batches_idempotency_fingerprint_check',
      sql`${table.idempotencyFingerprint} is not null and length(${table.idempotencyFingerprint}) > 0`,
    ),
    check('cte_batches_correlation_id_check', sql`length(${table.correlationId}) > 0`),
  ],
)

export const cteBatchItems = pgTable(
  'cte_batch_items',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    nfeDocumentId: uuid('nfe_document_id').notNull(),
    freightCalculationId: uuid('freight_calculation_id').notNull(),
    calculationSnapshot: jsonb('calculation_snapshot').notNull(),
    position: bigint({ mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cte_batch_items_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cte_batch_items_company_id_id_unique').on(table.companyId, table.id),
    unique('cte_batch_items_company_id_batch_id_nfe_unique').on(
      table.companyId,
      table.batchId,
      table.nfeDocumentId,
    ),
    index('cte_batch_items_company_batch_created_at_idx').on(
      table.companyId,
      table.batchId,
      table.createdAt,
    ),
    /**
     * Spec 059 RF-2: o caminho da **nota** até o CT-e. O unique existente lidera por `batch_id`,
     * então a busca por nota sozinha varre — e a prontidão de uma viagem de 200 notas seria 200
     * varreduras.
     */
    index('cte_batch_items_company_nfe_document_idx').on(table.companyId, table.nfeDocumentId),
    index('cte_batch_items_company_created_at_id_idx').on(
      table.companyId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
    foreignKey({
      columns: [table.companyId, table.batchId],
      foreignColumns: [cteBatches.companyId, cteBatches.id],
      name: 'cte_batch_items_company_batch_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.nfeDocumentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'cte_batch_items_company_nfe_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.freightCalculationId],
      foreignColumns: [freightCalculations.companyId, freightCalculations.id],
      name: 'cte_batch_items_company_freight_calculation_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check('cte_batch_items_position_check', sql`${table.position} > 0`),
  ],
)

export const cteBatchItemDocuments = pgTable(
  'cte_batch_item_documents',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    itemId: uuid('item_id').notNull(),
    nfeDocumentId: uuid('nfe_document_id').notNull(),
    position: bigint({ mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cte_batch_item_documents_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cte_batch_item_documents_company_id_id_unique').on(table.companyId, table.id),
    unique('cte_batch_item_documents_company_batch_nfe_unique').on(
      table.companyId,
      table.batchId,
      table.nfeDocumentId,
    ),
    unique('cte_batch_item_documents_company_item_position_unique').on(
      table.companyId,
      table.itemId,
      table.position,
    ),
    index('cte_batch_item_documents_company_item_idx').on(table.companyId, table.itemId),
    foreignKey({
      columns: [table.companyId, table.itemId],
      foreignColumns: [cteBatchItems.companyId, cteBatchItems.id],
      name: 'cte_batch_item_documents_company_item_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.batchId],
      foreignColumns: [cteBatches.companyId, cteBatches.id],
      name: 'cte_batch_item_documents_company_batch_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.companyId, table.nfeDocumentId],
      foreignColumns: [nfeDocuments.companyId, nfeDocuments.id],
      name: 'cte_batch_item_documents_company_nfe_document_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check('cte_batch_item_documents_position_check', sql`${table.position} > 0`),
  ],
)

export const cteBatchItemCharges = pgTable(
  'cte_batch_item_charges',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    itemId: uuid('item_id').notNull(),
    ordinal: bigint({ mode: 'bigint' }).notNull(),
    label: text().notNull(),
    calculationType: text('calculation_type')
      .$type<(typeof CTE_BATCH_ITEM_CHARGE_CALCULATIONS)[number]>()
      .notNull(),
    rate: numeric({ precision: 9, scale: 6 }),
    baseAmount: numeric('base_amount', { precision: 19, scale: 4 }).notNull(),
    amount: numeric({ precision: 19, scale: 4 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cte_batch_item_charges_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cte_batch_item_charges_company_id_id_unique').on(table.companyId, table.id),
    unique('cte_batch_item_charges_company_item_ordinal_unique').on(
      table.companyId,
      table.itemId,
      table.ordinal,
    ),
    foreignKey({
      columns: [table.companyId, table.itemId],
      foreignColumns: [cteBatchItems.companyId, cteBatchItems.id],
      name: 'cte_batch_item_charges_company_item_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'cte_batch_item_charges_calculation_type_check',
      sql`${table.calculationType} in ('percentage_of_cargo', 'percentage_of_freight', 'fixed_amount')`,
    ),
    check(
      'cte_batch_item_charges_value_coherence_check',
      sql`case when ${table.calculationType} = 'fixed_amount' then ${table.rate} is null else ${table.rate} is not null end`,
    ),
    check(
      'cte_batch_item_charges_rate_check',
      sql`${table.rate} is null or (${table.rate} >= 0 and ${table.rate} <= 1)`,
    ),
    check('cte_batch_item_charges_amount_check', sql`${table.amount} >= 0`),
    check('cte_batch_item_charges_base_amount_check', sql`${table.baseAmount} >= 0`),
    check('cte_batch_item_charges_ordinal_check', sql`${table.ordinal} > 0`),
    check('cte_batch_item_charges_label_check', sql`length(${table.label}) > 0`),
  ],
)

/**
 * Nomes aceitos pelo CHECK de `cte_batch_events`. A lista alimenta o tipo da coluna e a própria
 * constraint: separar os dois foi o que deixou `items_appended` passar no TypeScript e estourar
 * 23514 no banco, derrubando a transação inteira da fatia.
 */
export const CTE_BATCH_EVENT_NAMES = [
  'created',
  'updated',
  'items_appended',
  'submitted',
  'in_flight',
  'done',
  'error',
  'cancelled',
] as const

export type CteBatchEventName = (typeof CTE_BATCH_EVENT_NAMES)[number]

export const cteBatchEvents = pgTable(
  'cte_batch_events',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    eventName: text('event_name').$type<CteBatchEventName>().notNull(),
    payload: jsonb().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cte_batch_events_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cte_batch_events_company_id_id_unique').on(table.companyId, table.id),
    index('cte_batch_events_company_batch_occurred_at_idx').on(
      table.companyId,
      table.batchId,
      table.occurredAt,
    ),
    foreignKey({
      columns: [table.companyId, table.batchId],
      foreignColumns: [cteBatches.companyId, cteBatches.id],
      name: 'cte_batch_events_company_batch_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'cte_batch_events_name_check',
      sql`${table.eventName} in (${sql.raw(CTE_BATCH_EVENT_NAMES.map((name) => `'${name}'`).join(', '))})`,
    ),
  ],
)

export const cteSubmissionRecords = pgTable(
  'cte_submission_records',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    result: text(),
    submissionStatus: text('submission_status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'cte_submission_records_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('cte_submission_records_company_id_id_unique').on(table.companyId, table.id),
    unique('cte_submission_records_company_id_batch_id_idempotency_key_unique').on(
      table.companyId,
      table.batchId,
      table.idempotencyKey,
    ),
    foreignKey({
      columns: [table.companyId, table.batchId],
      foreignColumns: [cteBatches.companyId, cteBatches.id],
      name: 'cte_submission_records_company_batch_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'cte_submission_records_submission_status_check',
      sql`${table.submissionStatus} in ('pending', 'accepted', 'conflict', 'rejected')`,
    ),
    check(
      'cte_submission_records_result_check',
      sql`${table.result} is null or ${table.result} in ('ok', 'error')`,
    ),
  ],
)
