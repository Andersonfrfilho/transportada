/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia das tabelas que a API versiona (`password_reset_requests`,
 * `password_reset_delivery_outbox`). Migration só roda na API — mudou lá, mude aqui. Só as colunas
 * que a entrega lê estão declaradas.
 */
import { bigint, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const passwordResetRequests = pgTable('password_reset_requests', {
  id: uuid().primaryKey(),
  companyId: uuid('company_id').notNull(),
  userId: uuid('user_id').notNull(),
  sealedCode: jsonb('sealed_code'),
  deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})

/** Sem `actor_user_id`: quem pede recuperação não está autenticado. */
export const passwordResetDeliveryOutbox = pgTable('password_reset_delivery_outbox', {
  id: uuid().primaryKey(),
  eventId: uuid('event_id').notNull(),
  companyId: uuid('company_id').notNull(),
  requestId: uuid('request_id').notNull(),
  eventType: text('event_type').notNull(),
  eventVersion: bigint('event_version', { mode: 'bigint' }).notNull(),
  correlationId: text('correlation_id').notNull(),
  payload: jsonb().notNull(),
  attempt: bigint({ mode: 'bigint' }).notNull(),
  claimOwner: text('claim_owner'),
  claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
  nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
})
