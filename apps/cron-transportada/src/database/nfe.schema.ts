/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Schema copy of the API nfe_imports table (write target for automation
 * enqueue). Parity with apps/api-transportada/src/database/nfe.schema.ts;
 * the cron only inserts automation imports (triggered_by='automation').
 */
import { bigint, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const NFE_IMPORT_SOURCES = ['upload', 'distribution'] as const
export type NfeImportSource = (typeof NFE_IMPORT_SOURCES)[number]

export const NFE_ORIGIN_TRIGGERS = ['user', 'automation'] as const
export type NfeOriginTrigger = (typeof NFE_ORIGIN_TRIGGERS)[number]

export const NFE_IMPORT_STATUSES = [
  'pending',
  'queued',
  'processing',
  'completed',
  'partially_processed',
  'failed',
  'cancelled',
] as const
export type NfeImportStatus = (typeof NFE_IMPORT_STATUSES)[number]

export const nfeImports = pgTable('nfe_imports', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  source: text().$type<NfeImportSource>().notNull(),
  triggeredBy: text('triggered_by').$type<NfeOriginTrigger>().notNull().default('user'),
  automationJob: text('automation_job'),
  requestedByUserId: uuid('requested_by_user_id').notNull(),
  correlationId: text('correlation_id').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  requestFingerprint: text('request_fingerprint').notNull(),
  status: text().$type<NfeImportStatus>().notNull(),
  receivedCount: bigint('received_count', { mode: 'bigint' }).notNull().default(0n),
  processedCount: bigint('processed_count', { mode: 'bigint' }).notNull().default(0n),
  importedCount: bigint('imported_count', { mode: 'bigint' }).notNull().default(0n),
  duplicatedCount: bigint('duplicated_count', { mode: 'bigint' }).notNull().default(0n),
  invalidCount: bigint('invalid_count', { mode: 'bigint' }).notNull().default(0n),
  rejectedCount: bigint('rejected_count', { mode: 'bigint' }).notNull().default(0n),
  failedCount: bigint('failed_count', { mode: 'bigint' }).notNull().default(0n),
  terminalError: jsonb('terminal_error'),
  version: bigint({ mode: 'bigint' }).notNull().default(1n),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
