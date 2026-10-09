/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ **Cópia por valor** de `api-transportada/src/shared/holiday-provider.constant.ts`: o vocabulário do
 * cache do fornecedor viaja para CHECK do banco, e a migration só roda na API. Mudou lá? confira aqui
 * (`test/holiday-provider-pull/parity.contract.ts`).
 */

/** O nacional não tem município nem UF: o código é `BR`, porque nulo deixaria o único sem efeito. */
export const HOLIDAY_PROVIDER_NATIONAL_CODE = 'BR'

export const HOLIDAY_PROVIDER_SCOPE = {
  CITY: 'city',
  NATIONAL: 'national',
  STATE: 'state',
} as const
export type HolidayProviderScope =
  (typeof HOLIDAY_PROVIDER_SCOPE)[keyof typeof HOLIDAY_PROVIDER_SCOPE]

export const HOLIDAY_PROVIDER_FETCH_STATUS = {
  DONE: 'done',
  FAILED: 'failed',
  NOT_COVERED: 'not_covered',
  PENDING: 'pending',
  QUOTA_EXHAUSTED: 'quota_exhausted',
} as const
export type HolidayProviderFetchStatus =
  (typeof HOLIDAY_PROVIDER_FETCH_STATUS)[keyof typeof HOLIDAY_PROVIDER_FETCH_STATUS]

/** O `tipo` que o fornecedor devolve, como ele escreve. */
export const HOLIDAY_PROVIDER_TYPE = {
  FACULTATIVE: 'FACULTATIVO',
  MUNICIPAL: 'MUNICIPAL',
  NATIONAL: 'NACIONAL',
  STATE: 'ESTADUAL',
} as const
export type HolidayProviderType = (typeof HOLIDAY_PROVIDER_TYPE)[keyof typeof HOLIDAY_PROVIDER_TYPE]

export const HOLIDAY_PROVIDER_TYPES = [
  HOLIDAY_PROVIDER_TYPE.NATIONAL,
  HOLIDAY_PROVIDER_TYPE.STATE,
  HOLIDAY_PROVIDER_TYPE.MUNICIPAL,
  HOLIDAY_PROVIDER_TYPE.FACULTATIVE,
] as const

/** A supressão do operador só existe para o que vira linha da empresa: cidade e estado. */
export const HOLIDAY_IMPORT_SUPPRESSION_SCOPES = [
  HOLIDAY_PROVIDER_SCOPE.CITY,
  HOLIDAY_PROVIDER_SCOPE.STATE,
] as const

/** O teto de `state_holidays_name_check` e de `holiday_provider_entries_name_check`. */
export const HOLIDAY_NAME_MAX_LENGTH = 120

/** Mesma forma do CHECK do banco: município IBGE de UF de 1 a 5. */
export const CITY_IBGE_CODE_PATTERN = /^[1-5][0-9]{6}$/u
