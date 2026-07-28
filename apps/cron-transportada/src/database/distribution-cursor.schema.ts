/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Schema copy of the API nfe_distribution_cursors table (read). The cron uses
 * next_allowed_at as the anti-656 cooldown window per (company, environment).
 * Parity with the nfeDistributionCursors table in
 * apps/api-transportada/src/database/nfe.schema.ts.
 */
import { bigint, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const CRON_CURSOR_ENVIRONMENTS = ['homologation', 'production'] as const
export type CronCursorEnvironment = (typeof CRON_CURSOR_ENVIRONMENTS)[number]

export const nfeDistributionCursors = pgTable(
  'nfe_distribution_cursors',
  {
    companyId: uuid('company_id').notNull(),
    environment: text().$type<CronCursorEnvironment>().notNull(),
    ultNsu: text('ult_nsu').notNull().default('000000000000000'),
    maxNsu: text('max_nsu').notNull().default('000000000000000'),
    nextAllowedAt: timestamp('next_allowed_at', { withTimezone: true }),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.companyId, table.environment],
      name: 'nfe_distribution_cursors_company_environment_pk',
    }),
  ],
)
