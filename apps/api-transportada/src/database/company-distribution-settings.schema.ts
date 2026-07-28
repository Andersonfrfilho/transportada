/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { boolean, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'

export const companyDistributionSettings = pgTable('company_distribution_settings', {
  companyId: uuid('company_id')
    .primaryKey()
    .references(() => companies.id, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),
  scheduledDistributionEnabled: boolean('scheduled_distribution_enabled').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})
