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
