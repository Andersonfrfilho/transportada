/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T2.1 (ADR-0102 §3): a tabela da instalação que guarda a chave selada da FeriadosAPI e o
 * orçamento mensal. Os nomes e os limites moram aqui, e os contratos estático e de banco leem esta lista.
 */
export const MIGRATION_SUFFIX = '_holiday_provider_settings'
export const TABLE_NAME = 'holiday_provider_settings'
export const POSTGRES_IDENTIFIER_MAX_BYTES = 63

export const CONSTRAINT_NAMES = {
  budgetCheck: 'holiday_provider_settings_budget_check',
  primaryKey: 'holiday_provider_settings_pkey',
  providerCheck: 'holiday_provider_settings_provider_check',
  providerUnique: 'holiday_provider_settings_provider_unique',
  tokenCheck: 'holiday_provider_settings_token_check',
  versionCheck: 'holiday_provider_settings_version_check',
} as const

/** Os cinco nomes explícitos do ADR-0102 §3 com o tamanho em bytes que ele contou. */
export const EXPECTED_NAME_BYTES = {
  [CONSTRAINT_NAMES.budgetCheck]: 38,
  [CONSTRAINT_NAMES.primaryKey]: 30,
  [CONSTRAINT_NAMES.providerCheck]: 40,
  [CONSTRAINT_NAMES.providerUnique]: 41,
  [CONSTRAINT_NAMES.tokenCheck]: 37,
  [CONSTRAINT_NAMES.versionCheck]: 39,
} as const

export const COLUMN_NAMES = [
  'id',
  'provider',
  'token_envelope',
  'token_hint',
  'token_updated_at',
  'monthly_request_budget',
  'version',
  'updated_by_user_id',
  'created_at',
  'updated_at',
] as const

export const BUDGET_MIN = 1
export const BUDGET_MAX = 1_000_000
export const FERIADOS_API_PROVIDER = 'feriadosapi'
