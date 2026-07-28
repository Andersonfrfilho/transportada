/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { companies, identityUsers, userCompanyMemberships } from './identity.schema.js'

/**
 * Per-user, per-view table configuration (column order/visibility, page size,
 * sort and saved filters). The `preferences` payload is stored as an opaque JSON
 * blob so the module stays generic and reusable across any data table; each
 * table identifies its configuration by a stable `viewKey`.
 */
export const viewPreferences = pgTable(
  'view_preferences',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    userId: uuid('user_id')
      .notNull()
      .references(() => identityUsers.id, {
        onDelete: 'restrict',
        onUpdate: 'cascade',
      }),
    viewKey: text('view_key').notNull(),
    preferences: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('view_preferences_view_key_not_blank_check', sql`length(trim(${table.viewKey})) > 0`),
    foreignKey({
      columns: [table.userId, table.companyId],
      foreignColumns: [userCompanyMemberships.userId, userCompanyMemberships.companyId],
      name: 'view_preferences_membership_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('view_preferences_company_user_view_key_unique').on(
      table.companyId,
      table.userId,
      table.viewKey,
    ),
    index('view_preferences_company_user_idx').on(table.companyId, table.userId),
  ],
)
