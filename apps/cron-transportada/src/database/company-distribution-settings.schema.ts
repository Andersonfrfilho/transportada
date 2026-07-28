/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Schema copy of the API company_distribution_settings opt-in table (read).
 * Parity with
 * apps/api-transportada/src/database/company-distribution-settings.schema.ts.
 */
import { boolean, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

export const companyDistributionSettings = pgTable('company_distribution_settings', {
  companyId: uuid('company_id').primaryKey(),
  scheduledDistributionEnabled: boolean('scheduled_distribution_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
