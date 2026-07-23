/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies, userCompanyMemberships } from './identity.schema.js'
import { nfeImports } from './nfe.schema.js'

export const PROCESSING_EVENT_TYPES = [
  'transportada.nfe.import.requested',
  'transportada.nfe.distribution.requested',
] as const
export type ProcessingEventType = (typeof PROCESSING_EVENT_TYPES)[number]

export const PROCESSING_JOB_MODULES = [
  'nfe',
  'freight',
  'cte_batch',
  'cte_issuance',
  'billing',
] as const
export const PROCESSING_JOB_STATUSES = [
  'pending',
  'processing',
  'succeeded',
  'retry_scheduled',
  'failed',
  'dead_letter',
  'cancelled',
] as const
export type ProcessingJobModule = (typeof PROCESSING_JOB_MODULES)[number]
export type ProcessingJobStatus = (typeof PROCESSING_JOB_STATUSES)[number]

export const processingJobs = pgTable(
  'processing_jobs',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    module: text().$type<ProcessingJobModule>().notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    status: text().$type<ProcessingJobStatus>().notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    lastErrorCode: text('last_error_code'),
    lastErrorMessage: text('last_error_message'),
    correlationId: text('correlation_id').notNull(),
    metadata: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('processing_jobs_company_id_id_unique').on(table.companyId, table.id),
    index('processing_jobs_company_status_next_attempt_idx').on(
      table.companyId,
      table.status,
      table.nextAttemptAt,
    ),
    index('processing_jobs_company_module_entity_idx').on(
      table.companyId,
      table.module,
      table.entityType,
      table.entityId,
    ),
    index('processing_jobs_company_correlation_idx').on(table.companyId, table.correlationId),
    check(
      'processing_jobs_status_check',
      sql`${table.status} in ('pending', 'processing', 'succeeded', 'retry_scheduled', 'failed', 'dead_letter', 'cancelled')`,
    ),
    check('processing_jobs_attempt_count_check', sql`${table.attemptCount} >= 0`),
    check(
      'processing_jobs_module_check',
      sql`${table.module} in ('nfe', 'freight', 'cte_batch', 'cte_issuance', 'billing')`,
    ),
    check(
      'processing_jobs_safe_error_code_check',
      sql`${table.lastErrorCode} is null or length(${table.lastErrorCode}) between 1 and 80`,
    ),
    check(
      'processing_jobs_safe_error_message_check',
      sql`${table.lastErrorMessage} is null or length(${table.lastErrorMessage}) <= 500`,
    ),
  ],
)

export const processingOutbox = pgTable(
  'processing_outbox',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    eventId: uuid('event_id').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: uuid('aggregate_id').notNull(),
    eventType: text('event_type').$type<ProcessingEventType>().notNull(),
    eventVersion: bigint('event_version', { mode: 'bigint' }).notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    correlationId: text('correlation_id').notNull(),
    payload: jsonb().notNull(),
    attempt: bigint({ mode: 'bigint' }).notNull().default(0n),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
    claimOwner: text('claim_owner'),
    claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('processing_outbox_company_id_id_unique').on(table.companyId, table.id),
    unique('processing_outbox_company_id_event_id_unique').on(table.companyId, table.eventId),
    index('processing_outbox_company_published_next_attempt_created_idx').on(
      table.companyId,
      table.publishedAt,
      table.nextAttemptAt,
      table.createdAt,
    ),
    foreignKey({
      columns: [table.companyId, table.aggregateId],
      foreignColumns: [nfeImports.companyId, nfeImports.id],
      name: 'processing_outbox_company_aggregate_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'processing_outbox_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check('processing_outbox_attempt_check', sql`${table.attempt} >= 0`),
    check('processing_outbox_event_version_check', sql`${table.eventVersion} > 0`),
    check('processing_outbox_aggregate_type_check', sql`${table.aggregateType} = 'nfe_import'`),
    check(
      'processing_outbox_event_type_check',
      sql`${table.eventType} in ('transportada.nfe.import.requested', 'transportada.nfe.distribution.requested')`,
    ),
    check(
      'processing_outbox_claim_check',
      sql`(${table.claimOwner} is null) = (${table.claimExpiresAt} is null)`,
    ),
  ],
)

export const processedMessages = pgTable(
  'processed_messages',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    consumerName: text('consumer_name').notNull(),
    eventId: uuid('event_id').notNull(),
    result: text().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('processed_messages_company_id_id_unique').on(table.companyId, table.id),
    unique('processed_messages_company_consumer_event_unique').on(
      table.companyId,
      table.consumerName,
      table.eventId,
    ),
    foreignKey({
      columns: [table.companyId, table.eventId],
      foreignColumns: [processingOutbox.companyId, processingOutbox.eventId],
      name: 'processed_messages_company_event_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
  ],
)
