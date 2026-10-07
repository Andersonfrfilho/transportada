/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import { CITY_IBGE_CODE_SOURCE } from '../shared/business-calendar.constant.js'
import {
  HOLIDAY_IMPORT_SUPPRESSION_SCOPES,
  type HolidayProviderScope,
} from '../shared/holiday-provider.constant.js'
import { companies } from './identity.schema.js'
import { holidayScopeCodeSql, inList } from './schema-check.constant.js'

/**
 * Spec 252 / ADR-0100 §3: a demanda de cidades de uma empresa — o destino físico das notas dela, com um
 * `document_count` aproximado que só serve para ordenar a busca. Referencia só `companies`.
 */
export const holidayImportCities = pgTable(
  'holiday_import_cities',
  {
    companyId: uuid('company_id').notNull(),
    cityIbgeCode: text('city_ibge_code').notNull(),
    documentCount: integer('document_count').notNull().default(0),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.companyId, table.cityIbgeCode],
      name: 'holiday_import_cities_pkey',
    }),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'holiday_import_cities_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'holiday_import_cities_city_check',
      sql`${table.cityIbgeCode} ~ ${sql.raw(`'${CITY_IBGE_CODE_SOURCE}'`)}`,
    ),
    check('holiday_import_cities_document_count_check', sql`${table.documentCount} >= 0`),
    index('holiday_import_cities_city_idx').on(table.cityIbgeCode),
  ],
)

/**
 * Se a empresa participa da importação e onde a descoberta parou. O cursor anda sobre
 * `nfe_documents_company_updated_issued_id_idx`: os três campos juntos ou nenhum.
 */
export const companyHolidayImportSettings = pgTable(
  'company_holiday_import_settings',
  {
    companyId: uuid('company_id').primaryKey(),
    isEnabled: boolean('is_enabled').notNull().default(true),
    cursorUpdatedAt: timestamp('cursor_updated_at', { withTimezone: true }),
    cursorIssuedAt: timestamp('cursor_issued_at', { withTimezone: true }),
    cursorDocumentId: uuid('cursor_document_id'),
  },
  (table) => [
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'company_holiday_import_settings_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'company_holiday_import_settings_cursor_check',
      sql`(${table.cursorUpdatedAt} is null and ${table.cursorIssuedAt} is null and ${table.cursorDocumentId} is null) or (${table.cursorUpdatedAt} is not null and ${table.cursorIssuedAt} is not null and ${table.cursorDocumentId} is not null)`,
    ),
  ],
)

/**
 * O feriado importado que o operador desligou (ADR-0100 §4): sem esta linha a data voltaria no ciclo
 * seguinte. `suppressed_by_user_id` não tem FK, de propósito: é rastro que sobrevive ao usuário.
 */
export const holidayImportSuppressions = pgTable(
  'holiday_import_suppressions',
  {
    id: uuid().defaultRandom().primaryKey(),
    companyId: uuid('company_id').notNull(),
    scope: text().$type<HolidayProviderScope>().notNull(),
    ibgeCode: text('ibge_code').notNull(),
    holidayOn: date('holiday_on').notNull(),
    suppressedByUserId: uuid('suppressed_by_user_id').notNull(),
    suppressedAt: timestamp('suppressed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('holiday_import_suppressions_company_scope_code_day_unique').on(
      table.companyId,
      table.scope,
      table.ibgeCode,
      table.holidayOn,
    ),
    foreignKey({
      columns: [table.companyId],
      foreignColumns: [companies.id],
      name: 'holiday_import_suppressions_company_id_companies_id_fk',
    })
      .onDelete('restrict')
      .onUpdate('cascade'),
    check(
      'holiday_import_suppressions_scope_check',
      sql`${table.scope} in (${sql.raw(inList(HOLIDAY_IMPORT_SUPPRESSION_SCOPES))})`,
    ),
    check(
      'holiday_import_suppressions_scope_code_check',
      holidayScopeCodeSql(table, HOLIDAY_IMPORT_SUPPRESSION_SCOPES),
    ),
  ],
)
