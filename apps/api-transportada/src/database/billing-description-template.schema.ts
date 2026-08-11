/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import { BILLING_OBSERVATIONS_MAX_LENGTH } from './company-fiscal-profile.schema.js'
import { companies } from './identity.schema.js'

export const BILLING_DESCRIPTION_TEMPLATE_NAME_MAX_LENGTH = 120

export const billingDescriptionTemplates = pgTable(
  'billing_description_templates',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    name: text().notNull(),
    body: text().notNull(),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'billing_description_templates_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    unique('billing_description_templates_company_id_id_unique').on(table.companyId, table.id),
    unique('billing_description_templates_company_name_unique').on(table.companyId, table.name),
    uniqueIndex('billing_description_templates_company_default_unique')
      .on(table.companyId)
      .where(sql`${table.isDefault}`),
    check(
      'billing_description_templates_name_check',
      sql`length(btrim(${table.name})) between 1 and ${sql.raw(String(BILLING_DESCRIPTION_TEMPLATE_NAME_MAX_LENGTH))}`,
    ),
    /** O texto resolvido vai para billing_invoices.observations, que tem o mesmo teto. */
    check(
      'billing_description_templates_body_check',
      sql`length(${table.body}) between 1 and ${sql.raw(String(BILLING_OBSERVATIONS_MAX_LENGTH))}`,
    ),
  ],
)
