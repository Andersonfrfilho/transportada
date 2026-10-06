/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor da tabela que a API versiona (spec 239 D1), **só as colunas que a junção do expurgo
 * lê**. Quem grava e migra é a API, e `test/trip-location-purge/schema-parity.contract.ts` confere a cópia.
 */
import { boolean, integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'

export const companyLocationRetentionSettings = pgTable('company_location_retention_settings', {
  companyId: uuid('company_id').primaryKey(),
  purgeEnabled: boolean('purge_enabled').notNull(),
  retentionDays: integer('retention_days').notNull(),
  purgeEffectiveAt: timestamp('purge_effective_at', { withTimezone: true }),
})
