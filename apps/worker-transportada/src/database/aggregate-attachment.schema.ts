/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor do schema da API — migrations só rodam lá. Mudou a tabela do outro lado, mude
 * aqui. Só o que este worker lê e escreve está declarado: o outbox inteiro, e do anexo apenas as
 * colunas que a extração toca.
 */
import { bigint, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const aggregateAttachmentOutbox = pgTable('aggregate_attachment_outbox', {
  id: uuid().defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().defaultRandom(),
  companyId: uuid('company_id').notNull(),
  attachmentId: uuid('attachment_id').notNull(),
  eventType: text('event_type').notNull(),
  eventVersion: bigint('event_version', { mode: 'bigint' }).notNull().default(1n),
  correlationId: text('correlation_id').notNull(),
  payload: jsonb().notNull(),
  attempt: bigint({ mode: 'bigint' }).notNull().default(0n),
  claimOwner: text('claim_owner'),
  claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull().defaultNow(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const aggregateApplicationAttachments = pgTable('aggregate_application_attachments', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  type: text().notNull(),
  extractedFields: jsonb('extracted_fields'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
