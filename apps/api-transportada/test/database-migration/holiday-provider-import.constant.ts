/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 T2.1 / ADR-0100 §3: os nomes que a migration da importação de feriados tem de ter. Nenhum
 * deles é o padrão do drizzle (o da FK de `municipal_holidays.provider_entry_id` teria 67 bytes, e o
 * Postgres trunca calado em 63). Contratos estático e de banco leem esta lista, nunca uma cópia.
 */
import { HOLIDAY_PROVIDER_TABLES } from './support.js'

export const MIGRATION_SUFFIX = '_holiday_provider_import'
export const PREVIOUS_MIGRATION = '20261008183714_trip_document_link_events'
export const JOB = 'holiday.provider.pull'
export const POSTGRES_IDENTIFIER_MAX_BYTES = 63

export const NEW_TABLES = HOLIDAY_PROVIDER_TABLES

/** Constraints PK, único, FK e CHECK de cada tabela nova, na ordem do ADR. */
export const NEW_TABLE_CONSTRAINTS = {
  holiday_provider_fetches: [
    'holiday_provider_fetches_pkey',
    'holiday_provider_fetches_scope_code_year_unique',
    'holiday_provider_fetches_scope_check',
    'holiday_provider_fetches_scope_code_check',
    'holiday_provider_fetches_status_check',
    'holiday_provider_fetches_year_check',
    'holiday_provider_fetches_attempts_check',
  ],
  holiday_provider_entries: [
    'holiday_provider_entries_pkey',
    'holiday_provider_entries_scope_code_day_unique',
    'holiday_provider_entries_id_code_day_unique',
    'holiday_provider_entries_scope_check',
    'holiday_provider_entries_scope_code_check',
    'holiday_provider_entries_provider_type_check',
    'holiday_provider_entries_scope_type_check',
    'holiday_provider_entries_name_check',
  ],
  holiday_provider_monthly_usage: [
    'holiday_provider_monthly_usage_pkey',
    'holiday_provider_monthly_usage_month_check',
    'holiday_provider_monthly_usage_requests_check',
  ],
  holiday_import_cities: [
    'holiday_import_cities_pkey',
    'holiday_import_cities_company_id_companies_id_fk',
    'holiday_import_cities_city_check',
    'holiday_import_cities_document_count_check',
  ],
  company_holiday_import_settings: [
    'company_holiday_import_settings_pkey',
    'company_holiday_import_settings_company_id_companies_id_fk',
    'company_holiday_import_settings_cursor_check',
  ],
  holiday_import_suppressions: [
    'holiday_import_suppressions_pkey',
    'holiday_import_suppressions_company_scope_code_day_unique',
    'holiday_import_suppressions_company_id_companies_id_fk',
    'holiday_import_suppressions_scope_check',
    'holiday_import_suppressions_scope_code_check',
  ],
} as const

/** Os índices das tabelas novas: os que sustentam PK e único levam o nome da constraint. */
export const NEW_TABLE_INDEXES = {
  holiday_provider_fetches: [
    'holiday_provider_fetches_pkey',
    'holiday_provider_fetches_scope_code_year_unique',
    'holiday_provider_fetches_status_next_attempt_idx',
  ],
  holiday_provider_entries: [
    'holiday_provider_entries_pkey',
    'holiday_provider_entries_scope_code_day_unique',
    'holiday_provider_entries_id_code_day_unique',
  ],
  holiday_provider_monthly_usage: ['holiday_provider_monthly_usage_pkey'],
  holiday_import_cities: ['holiday_import_cities_pkey', 'holiday_import_cities_city_idx'],
  company_holiday_import_settings: ['company_holiday_import_settings_pkey'],
  holiday_import_suppressions: [
    'holiday_import_suppressions_pkey',
    'holiday_import_suppressions_company_scope_code_day_unique',
  ],
} as const

/** O que a migration acrescenta às duas tabelas JÁ PUBLICADAS. */
export const PUBLISHED_TABLE_CONSTRAINTS = [
  'municipal_holidays_provider_entry_fk',
  'municipal_holidays_rule_or_provider_check',
  'state_holidays_provider_entry_fk',
  'state_holidays_provider_once_check',
] as const

export const PUBLISHED_TABLE_INDEXES = [
  'municipal_holidays_provider_entry_idx',
  'state_holidays_provider_entry_idx',
] as const

export const ALL_NEW_CONSTRAINT_NAMES: readonly string[] = [
  ...Object.values(NEW_TABLE_CONSTRAINTS).flat(),
  ...PUBLISHED_TABLE_CONSTRAINTS,
]

export const ALL_NEW_INDEX_NAMES: readonly string[] = [
  ...new Set(Object.values(NEW_TABLE_INDEXES).flat()),
  ...PUBLISHED_TABLE_INDEXES,
]

/** Os dois CHECK de `job` mudam de lista, não de nome. */
export const JOB_CHECKS = [
  ['job_executions', 'job_executions_job_check'],
  ['job_schedules', 'job_schedules_job_check'],
] as const
