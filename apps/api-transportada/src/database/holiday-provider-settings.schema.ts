/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { sql } from 'drizzle-orm'
import {
  bigint,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  FERIADOS_API_MAX_MONTHLY_REQUEST_BUDGET,
  FERIADOS_API_MIN_MONTHLY_REQUEST_BUDGET,
  HOLIDAY_PROVIDER_SETTINGS_PROVIDERS,
} from '../shared/holiday-provider.constant.js'
import { inList } from './schema-check.constant.js'

/**
 * Spec 262 / ADR-0102 §3: a chave da FeriadosAPI e o orçamento mensal, UMA linha por fornecedor da instalação.
 * Sem `company_id` de propósito (mesma exceção declarada do cache, ADR-0100 §3): a conta do fornecedor e a
 * cota são da instalação (ADR-0021), e nenhuma rota devolve esta linha crua.
 *
 * `token_envelope` é o envelope A256GCM (o `keyId` mora dentro dele; não há coluna à parte), com AAD amarrado
 * ao `id` da linha. `token_hint` são os 4 últimos caracteres, em claro, só para a tela. CHECK aceita NULL:
 * a da chave exige cada campo com `is not null` à parte. Sem linha = sem chave e orçamento padrão.
 * `monthly_request_budget` NULL = "o padrão" (4500): só o que o administrador definiu fica gravado, e o worker
 * resolve `coalesce` com a constante.
 */
export const holidayProviderSettings = pgTable(
  'holiday_provider_settings',
  {
    id: uuid().defaultRandom().primaryKey(),
    provider: text().notNull().default('feriadosapi'),
    tokenEnvelope: jsonb('token_envelope'),
    tokenHint: text('token_hint'),
    tokenUpdatedAt: timestamp('token_updated_at', { withTimezone: true }),
    monthlyRequestBudget: integer('monthly_request_budget'),
    version: bigint({ mode: 'bigint' }).notNull().default(1n),
    updatedByUserId: uuid('updated_by_user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('holiday_provider_settings_provider_unique').on(table.provider),
    check(
      'holiday_provider_settings_provider_check',
      sql`${table.provider} in (${sql.raw(inList(HOLIDAY_PROVIDER_SETTINGS_PROVIDERS))})`,
    ),
    check(
      'holiday_provider_settings_budget_check',
      sql`${table.monthlyRequestBudget} is null or ${table.monthlyRequestBudget} between ${sql.raw(String(FERIADOS_API_MIN_MONTHLY_REQUEST_BUDGET))} and ${sql.raw(String(FERIADOS_API_MAX_MONTHLY_REQUEST_BUDGET))}`,
    ),
    check('holiday_provider_settings_version_check', sql`${table.version} > 0`),
    check(
      'holiday_provider_settings_token_check',
      sql`(${table.tokenEnvelope} is null and ${table.tokenHint} is null and ${table.tokenUpdatedAt} is null) or (${table.tokenEnvelope} is not null and jsonb_typeof(${table.tokenEnvelope}) = 'object' and ${table.tokenHint} is not null and ${table.tokenHint} ~ '^[!-~]{4}$' and ${table.tokenUpdatedAt} is not null)`,
    ),
  ],
)
