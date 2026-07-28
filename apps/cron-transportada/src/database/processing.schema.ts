/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Schema copy of the API processing_outbox table (write target for automation
 * enqueue). Parity with apps/api-transportada/src/database/processing.schema.ts;
 * the existing outbox relay publishes these rows to RabbitMQ.
 */
import { bigint, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import type { NfeOriginTrigger } from './nfe.schema.js'

export const PROCESSING_EVENT_TYPES = [
  'transportada.nfe.import.requested',
  'transportada.nfe.distribution.requested',
] as const
export type ProcessingEventType = (typeof PROCESSING_EVENT_TYPES)[number]

export const processingOutbox = pgTable('processing_outbox', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  eventId: uuid('event_id').notNull(),
  aggregateType: text('aggregate_type').notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  eventType: text('event_type').$type<ProcessingEventType>().notNull(),
  eventVersion: bigint('event_version', { mode: 'bigint' }).notNull(),
  actorUserId: uuid('actor_user_id').notNull(),
  triggeredBy: text('triggered_by').$type<NfeOriginTrigger>().notNull().default('user'),
  automationJob: text('automation_job'),
  correlationId: text('correlation_id').notNull(),
  payload: jsonb().notNull(),
  attempt: bigint({ mode: 'bigint' }).notNull().default(0n),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  claimOwner: text('claim_owner'),
  claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
