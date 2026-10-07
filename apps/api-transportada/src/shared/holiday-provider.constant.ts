/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 252 / ADR-0100 §3: o vocabulário do cache do fornecedor de feriados e das supressões. Os valores
 * viajam para CHECK do banco (texto + CHECK, sem ENUM nativo), então mudar um é migration.
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

export const HOLIDAY_PROVIDER_SCOPES = [
  HOLIDAY_PROVIDER_SCOPE.CITY,
  HOLIDAY_PROVIDER_SCOPE.STATE,
  HOLIDAY_PROVIDER_SCOPE.NATIONAL,
] as const

/** A supressão do operador só existe para o que vira linha da empresa: cidade e estado. */
export const HOLIDAY_IMPORT_SUPPRESSION_SCOPES = [
  HOLIDAY_PROVIDER_SCOPE.CITY,
  HOLIDAY_PROVIDER_SCOPE.STATE,
] as const

export const HOLIDAY_PROVIDER_FETCH_STATUS = {
  DONE: 'done',
  FAILED: 'failed',
  NOT_COVERED: 'not_covered',
  PENDING: 'pending',
  QUOTA_EXHAUSTED: 'quota_exhausted',
} as const
export type HolidayProviderFetchStatus =
  (typeof HOLIDAY_PROVIDER_FETCH_STATUS)[keyof typeof HOLIDAY_PROVIDER_FETCH_STATUS]

export const HOLIDAY_PROVIDER_FETCH_STATUSES = [
  HOLIDAY_PROVIDER_FETCH_STATUS.PENDING,
  HOLIDAY_PROVIDER_FETCH_STATUS.DONE,
  HOLIDAY_PROVIDER_FETCH_STATUS.FAILED,
  HOLIDAY_PROVIDER_FETCH_STATUS.QUOTA_EXHAUSTED,
  HOLIDAY_PROVIDER_FETCH_STATUS.NOT_COVERED,
] as const

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
