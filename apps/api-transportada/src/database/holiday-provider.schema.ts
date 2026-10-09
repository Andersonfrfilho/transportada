/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  BUSINESS_CALENDAR_MAX_YEAR,
  BUSINESS_CALENDAR_MIN_YEAR,
  HOLIDAY_NAME_MAX_LENGTH,
} from '../shared/business-calendar.constant.js'
import {
  HOLIDAY_PROVIDER_FETCH_STATUS,
  HOLIDAY_PROVIDER_FETCH_STATUSES,
  HOLIDAY_PROVIDER_SCOPES,
  HOLIDAY_PROVIDER_TYPES,
  type HolidayProviderFetchStatus,
  type HolidayProviderScope,
  type HolidayProviderType,
} from '../shared/holiday-provider.constant.js'
import { holidayScopeCodeSql, holidayScopeTypeSql, inList } from './schema-check.constant.js'

/**
 * Spec 252 / ADR-0100 §3: o cache GLOBAL do que a FeriadosAPI respondeu. Não tem `company_id` de
 * propósito (mesma exceção declarada de `geocoded_addresses`): o feriado de uma cidade é fato público,
 * pagar duas vezes a mesma cidade seria desperdício de cota, e nenhuma rota devolve estas tabelas cruas.
 *
 * `ibge_code` é NOT NULL: o nacional vale `'BR'`. Com nulo o único `(scope, ibge_code, year)` não
 * seguraria, porque NULL é distinto de NULL, e `NULLS NOT DISTINCT` depende da versão do Postgres.
 */
export const holidayProviderFetches = pgTable(
  'holiday_provider_fetches',
  {
    id: uuid().defaultRandom().primaryKey(),
    scope: text().$type<HolidayProviderScope>().notNull(),
    ibgeCode: text('ibge_code').notNull(),
    year: integer().notNull(),
    status: text()
      .$type<HolidayProviderFetchStatus>()
      .notNull()
      .default(HOLIDAY_PROVIDER_FETCH_STATUS.PENDING),
    attempts: integer().notNull().default(0),
    lastErrorCode: text('last_error_code'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
  },
  (table) => [
    unique('holiday_provider_fetches_scope_code_year_unique').on(
      table.scope,
      table.ibgeCode,
      table.year,
    ),
    check(
      'holiday_provider_fetches_scope_check',
      sql`${table.scope} in (${sql.raw(inList(HOLIDAY_PROVIDER_SCOPES))})`,
    ),
    check(
      'holiday_provider_fetches_scope_code_check',
      holidayScopeCodeSql(table, HOLIDAY_PROVIDER_SCOPES),
    ),
    check(
      'holiday_provider_fetches_status_check',
      sql`${table.status} in (${sql.raw(inList(HOLIDAY_PROVIDER_FETCH_STATUSES))})`,
    ),
    check(
      'holiday_provider_fetches_year_check',
      sql`${table.year} between ${sql.raw(String(BUSINESS_CALENDAR_MIN_YEAR))} and ${sql.raw(String(BUSINESS_CALENDAR_MAX_YEAR))}`,
    ),
    check('holiday_provider_fetches_attempts_check', sql`${table.attempts} >= 0`),
    index('holiday_provider_fetches_status_next_attempt_idx').on(table.status, table.nextAttemptAt),
  ],
)

/**
 * Uma data por `(escopo, ibge, data)` (D2): o `id` do fornecedor é só rastro, e se ele renumerar nada
 * se duplica. Duas entradas da mesma resposta no mesmo dia (um `FACULTATIVO` e um `MUNICIPAL`): vence a
 * não facultativa, decidido na gravação. `removed_at` marca a data que o fornecedor deixou de listar —
 * a linha da empresa fica, sinalizada, e a entrada nunca é apagada (a FK é `RESTRICT`).
 */
export const holidayProviderEntries = pgTable(
  'holiday_provider_entries',
  {
    id: uuid().defaultRandom().primaryKey(),
    scope: text().$type<HolidayProviderScope>().notNull(),
    ibgeCode: text('ibge_code').notNull(),
    holidayOn: date('holiday_on').notNull(),
    name: text().notNull(),
    providerType: text('provider_type').$type<HolidayProviderType>().notNull(),
    externalId: text('external_id'),
    isBanking: boolean('is_banking').notNull().default(false),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (table) => [
    unique('holiday_provider_entries_scope_code_day_unique').on(
      table.scope,
      table.ibgeCode,
      table.holidayOn,
    ),
    /** Alvo da FK composta das linhas importadas: a linha da empresa só aponta para a entrada da MESMA data. */
    unique('holiday_provider_entries_id_code_day_unique').on(
      table.id,
      table.ibgeCode,
      table.holidayOn,
    ),
    check(
      'holiday_provider_entries_scope_check',
      sql`${table.scope} in (${sql.raw(inList(HOLIDAY_PROVIDER_SCOPES))})`,
    ),
    check(
      'holiday_provider_entries_scope_code_check',
      holidayScopeCodeSql(table, HOLIDAY_PROVIDER_SCOPES),
    ),
    check(
      'holiday_provider_entries_provider_type_check',
      sql`${table.providerType} in (${sql.raw(inList(HOLIDAY_PROVIDER_TYPES))})`,
    ),
    check('holiday_provider_entries_scope_type_check', holidayScopeTypeSql(table)),
    check(
      'holiday_provider_entries_name_check',
      sql`char_length(${table.name}) between 1 and ${sql.raw(String(HOLIDAY_NAME_MAX_LENGTH))}`,
    ),
  ],
)

/**
 * O orçamento mensal de requisições, por instalação (o contador mora no banco de cada uma, ADR-0021).
 * `month` é sempre o dia 1º. O incremento é um upsert que cria a linha no 1º pedido do mês — um
 * `UPDATE` cru não acharia linha e pararia a rotina para sempre.
 */
export const holidayProviderMonthlyUsage = pgTable(
  'holiday_provider_monthly_usage',
  {
    month: date().primaryKey(),
    requests: integer().notNull().default(0),
  },
  (table) => [
    check('holiday_provider_monthly_usage_month_check', sql`extract(day from ${table.month}) = 1`),
    check('holiday_provider_monthly_usage_requests_check', sql`${table.requests} >= 0`),
  ],
)
