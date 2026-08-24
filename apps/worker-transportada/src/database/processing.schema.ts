/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { bigint, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * Os `default` daqui são os mesmos que a API versiona na migration, e existem porque a rotina de
 * distribuição **escreve** nesta tabela — até ela, o worker só lia e o relay só atualizava, e a cópia
 * sem default bastava. Sem eles, a inserção do evento teria de inventar `attempt` e `next_attempt_at`
 * no call site, e o relay passaria a depender de dois lugares dizerem a mesma coisa.
 */
export const processingOutbox = pgTable('processing_outbox', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  eventId: uuid('event_id').notNull(),
  aggregateType: text('aggregate_type').notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  eventType: text('event_type').notNull(),
  eventVersion: bigint('event_version', { mode: 'bigint' }).notNull(),
  actorUserId: uuid('actor_user_id').notNull(),
  triggeredBy: text('triggered_by').notNull().default('user'),
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

export const processedMessages = pgTable('processed_messages', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  consumerName: text('consumer_name').notNull(),
  eventId: uuid('event_id').notNull(),
  result: text().notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull(),
})

export const cteProcessedMessages = pgTable('cte_processed_messages', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  consumerName: text('consumer_name').notNull(),
  eventId: uuid('event_id').notNull(),
  batchItemId: uuid('batch_item_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  result: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const mdfeProcessedMessages = pgTable('mdfe_processed_messages', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  consumerName: text('consumer_name').notNull(),
  eventId: uuid('event_id').notNull(),
  manifestId: uuid('manifest_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  result: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const nfseProcessedMessages = pgTable('nfse_processed_messages', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  consumerName: text('consumer_name').notNull(),
  eventId: uuid('event_id').notNull(),
  invoiceId: uuid('invoice_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  result: text().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const nfseIssuanceOutbox = pgTable('nfse_issuance_outbox', {
  id: uuid().primaryKey(),
  eventId: uuid('event_id').notNull(),
  companyId: uuid('company_id').notNull(),
  aggregateType: text('aggregate_type').notNull(),
  aggregateSubtype: text('aggregate_subtype').notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  invoiceId: uuid('invoice_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  attemptKind: text('attempt_kind').notNull(),
  status: text('status').notNull(),
  eventType: text('event_type').notNull(),
  eventVersion: bigint('event_version', { mode: 'bigint' }).notNull(),
  attemptFingerprint: text('attempt_fingerprint').notNull(),
  actorUserId: uuid('actor_user_id').notNull(),
  correlationId: text('correlation_id').notNull(),
  payload: jsonb().notNull(),
  claimOwner: text('claim_owner'),
  claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const mdfeIssuanceOutbox = pgTable('mdfe_issuance_outbox', {
  id: uuid().primaryKey(),
  eventId: uuid('event_id').notNull(),
  companyId: uuid('company_id').notNull(),
  aggregateType: text('aggregate_type').notNull(),
  aggregateSubtype: text('aggregate_subtype').notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  manifestId: uuid('manifest_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  attemptKind: text('attempt_kind').notNull(),
  status: text('status').notNull(),
  eventType: text('event_type').notNull(),
  eventVersion: bigint('event_version', { mode: 'bigint' }).notNull(),
  attemptFingerprint: text('attempt_fingerprint').notNull(),
  actorUserId: uuid('actor_user_id').notNull(),
  correlationId: text('correlation_id').notNull(),
  payload: jsonb().notNull(),
  claimOwner: text('claim_owner'),
  claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

export const cteIssuanceOutbox = pgTable('cte_issuance_outbox', {
  id: uuid().primaryKey(),
  eventId: uuid('event_id').notNull(),
  aggregateType: text('aggregate_type').notNull(),
  aggregateSubtype: text('aggregate_subtype').notNull(),
  companyId: uuid('company_id').notNull(),
  aggregateId: uuid('aggregate_id').notNull(),
  batchId: uuid('batch_id').notNull(),
  batchItemId: uuid('batch_item_id').notNull(),
  attemptId: uuid('attempt_id').notNull(),
  attemptKind: text('attempt_kind').notNull(),
  status: text('status').notNull(),
  eventType: text('event_type').notNull(),
  eventVersion: bigint('event_version', { mode: 'bigint' }).notNull(),
  attemptFingerprint: text('attempt_fingerprint').notNull(),
  actorUserId: uuid('actor_user_id').notNull(),
  correlationId: text('correlation_id').notNull(),
  payload: jsonb().notNull(),
  claimOwner: text('claim_owner'),
  claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
