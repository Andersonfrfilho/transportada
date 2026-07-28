/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { check, foreignKey } from 'drizzle-orm/pg-core'

import { companies, identityUsers, userCompanyMemberships } from './identity.schema.js'

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
    permission: text().notNull().default('legacy.audit'),
    targetType: text('target_type').notNull().default('legacy'),
    targetId: uuid('target_id').notNull().defaultRandom(),
    result: text().notNull().default('allowed'),
    correlationId: text('correlation_id').notNull(),
    reason: text(),
    metadata: jsonb()
      .notNull()
      .default(sql`'{}'::jsonb`),
    beforeSnapshot: jsonb('before_snapshot'),
    afterSnapshot: jsonb('after_snapshot'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.actorUserId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'audit_logs_actor_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    index('audit_logs_company_id_created_at_id_idx').on(table.companyId, table.createdAt, table.id),
    index('audit_logs_company_created_at_idx').on(table.companyId, table.createdAt),
    index('audit_logs_company_target_idx').on(
      table.companyId,
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
    index('audit_logs_company_correlation_idx').on(table.companyId, table.correlationId),
    check('audit_logs_result_check', sql`${table.result} in ('allowed', 'denied', 'failed')`),
    check(
      'audit_logs_reason_check',
      sql`${table.reason} is null or length(${table.reason}) <= 500`,
    ),
    check('audit_logs_permission_check', sql`length(${table.permission}) between 1 and 120`),
    check('audit_logs_action_check', sql`length(${table.action}) between 1 and 160`),
  ],
)
