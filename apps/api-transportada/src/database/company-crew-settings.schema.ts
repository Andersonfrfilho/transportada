/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import { check, numeric, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

import { companies } from './identity.schema.js'

/** Spec 149: a diária padrão do ajudante; nula é "ainda não definida", nunca zero. */
export const companyCrewSettings = pgTable(
  'company_crew_settings',
  {
    companyId: uuid('company_id')
      .primaryKey()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    helperDailyRate: numeric('helper_daily_rate', { precision: 19, scale: 4 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'company_crew_settings_helper_daily_rate_check',
      sql`${table.helperDailyRate} is null or ${table.helperDailyRate} >= 0`,
    ),
  ],
)
