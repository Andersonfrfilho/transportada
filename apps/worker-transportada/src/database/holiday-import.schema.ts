/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Cópia por valor** de `api-transportada/src/database/holiday-import.schema.ts`, só com as colunas
 * (sem CHECK, FK nem índice: a migration roda na API). A paridade, coluna a coluna, é cobrada por
 * `test/holiday-provider-pull/schema-parity.contract.ts`. Mudou a tabela lá? confira aqui.
 *
 * Demanda de cidades por empresa (`holiday_import_cities`), cursor da descoberta e liga/desliga da
 * empresa (`company_holiday_import_settings`) e feriados que o operador desligou
 * (`holiday_import_suppressions`, só leitura aqui).
 */
import { boolean, date, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import type { HolidayProviderScope } from '../holiday-provider-pull/domain/holiday-provider.constant.js'

export const holidayImportCities = pgTable('holiday_import_cities', {
  companyId: uuid('company_id').notNull(),
  cityIbgeCode: text('city_ibge_code').notNull(),
  documentCount: integer('document_count').notNull().default(0),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
})

export const companyHolidayImportSettings = pgTable('company_holiday_import_settings', {
  companyId: uuid('company_id').primaryKey(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  cursorUpdatedAt: timestamp('cursor_updated_at', { withTimezone: true }),
  cursorIssuedAt: timestamp('cursor_issued_at', { withTimezone: true }),
  cursorDocumentId: uuid('cursor_document_id'),
})

export const holidayImportSuppressions = pgTable('holiday_import_suppressions', {
  id: uuid().defaultRandom().primaryKey(),
  companyId: uuid('company_id').notNull(),
  scope: text().$type<HolidayProviderScope>().notNull(),
  ibgeCode: text('ibge_code').notNull(),
  holidayOn: date('holiday_on').notNull(),
  suppressedByUserId: uuid('suppressed_by_user_id').notNull(),
  suppressedAt: timestamp('suppressed_at', { withTimezone: true }).notNull().defaultNow(),
})
