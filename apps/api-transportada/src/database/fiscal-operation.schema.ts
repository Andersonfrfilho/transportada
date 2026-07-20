/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

import { companies, identityUsers } from './identity.schema.js'

export const idempotencyRecords = pgTable(
  'idempotency_records',
  {
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    operation: text().notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    status: text().notNull(),
    response: jsonb().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('idempotency_records_company_id_operation_idempotency_key_unique').on(
      table.companyId,
      table.operation,
      table.idempotencyKey,
    ),
    index('idempotency_records_company_id_created_at_idx').on(table.companyId, table.createdAt),
  ],
)

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => identityUsers.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    action: text().notNull(),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    correlationId: text('correlation_id').notNull(),
    beforeSnapshot: jsonb('before_snapshot'),
    afterSnapshot: jsonb('after_snapshot'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_logs_company_id_created_at_id_idx').on(table.companyId, table.createdAt, table.id),
  ],
)
