/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Cópia por valor** de `api-transportada/src/database/holiday-provider.schema.ts`, só com as colunas
 * (sem CHECK, único nem índice: a migration roda na API). A paridade, coluna a coluna, é cobrada por
 * `test/holiday-provider-pull/schema-parity.contract.ts`. Mudou a tabela lá? confira aqui.
 *
 * O cache GLOBAL do que a FeriadosAPI respondeu: sem `company_id` de propósito (mesma exceção declarada
 * de `geocoded_addresses`). Só o worker escreve aqui, e nenhuma rota devolve estas tabelas cruas.
 */
import { boolean, date, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

import {
  HOLIDAY_PROVIDER_FETCH_STATUS,
  type HolidayProviderFetchStatus,
  type HolidayProviderScope,
  type HolidayProviderType,
} from '../holiday-provider-pull/domain/holiday-provider.constant.js'

export const holidayProviderFetches = pgTable('holiday_provider_fetches', {
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
})

export const holidayProviderEntries = pgTable('holiday_provider_entries', {
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
})

export const holidayProviderMonthlyUsage = pgTable('holiday_provider_monthly_usage', {
  month: date().primaryKey(),
  requests: integer().notNull().default(0),
})
