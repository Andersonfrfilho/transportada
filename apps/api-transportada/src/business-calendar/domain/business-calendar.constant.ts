/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  BRAZILIAN_STATE_IBGE_CODE_LIST,
  BUSINESS_CALENDAR_MAX_YEAR,
  BUSINESS_CALENDAR_MIN_YEAR,
  CITY_IBGE_CODE_SOURCE,
  HOLIDAY_RECURRENCE,
  LEGACY_CITY_IBGE_CODE_SOURCE,
  MUNICIPAL_HOLIDAY_KIND,
} from '../../shared/business-calendar.constant.js'

export {
  BUSINESS_CALENDAR_MAX_YEAR,
  BUSINESS_CALENDAR_MIN_YEAR,
  HOLIDAY_RECURRENCE,
  MUNICIPAL_HOLIDAY_KIND,
}

/** O teto de 1–60 dias é do perfil do contratante; a política só barra o absurdo. */
export const BUSINESS_CALENDAR_MAX_DAYS = 366

export const BUSINESS_CALENDAR_MAX_RULES = 5000

/** Fuso fixo de São Paulo (ADR-0096 Q3): é nele que o instante vira o ano corrente da geração. */
export const BUSINESS_CALENDAR_TIME_ZONE = 'America/Sao_Paulo'

/** A regra "todo ano" gera as datas do ano corrente até o corrente + 10 (ADR-0096 §5). */
export const MUNICIPAL_HOLIDAY_MATERIALIZATION_YEARS = 10

export const BUSINESS_CALENDAR_MAX_COVERAGE_SPAN_YEARS = 5

export const CITY_IBGE_CODE_PATTERN = new RegExp(CITY_IBGE_CODE_SOURCE, 'u')

export const LEGACY_CITY_IBGE_CODE_PATTERN = new RegExp(LEGACY_CITY_IBGE_CODE_SOURCE, 'u')

export const STATE_IBGE_CODE_LENGTH = 2

/** A lista mora em `shared/` porque o schema do banco a usa no CHECK e não importa de domínio. */
export const BRAZILIAN_STATE_IBGE_CODES: ReadonlySet<string> = new Set(
  BRAZILIAN_STATE_IBGE_CODE_LIST,
)

export const BUSINESS_CALENDAR_ERROR_CODE = {
  COVERAGE_TOO_WIDE: 'BUSINESS_CALENDAR_COVERAGE_TOO_WIDE',
  INVALID_CITY: 'BUSINESS_CALENDAR_INVALID_CITY',
  INVALID_COVERAGE: 'BUSINESS_CALENDAR_INVALID_COVERAGE',
  INVALID_DATE: 'BUSINESS_CALENDAR_INVALID_DATE',
  INVALID_DAYS: 'BUSINESS_CALENDAR_INVALID_DAYS',
  INVALID_RULE: 'BUSINESS_CALENDAR_INVALID_RULE',
  OUT_OF_COVERAGE: 'BUSINESS_CALENDAR_OUT_OF_COVERAGE',
  TOO_MANY_RULES: 'BUSINESS_CALENDAR_TOO_MANY_RULES',
  UNKNOWN_STATE: 'BUSINESS_CALENDAR_UNKNOWN_STATE',
} as const

/** Recusas das rotas de cadastro; as da política (acima) são 422, estas seguem o verbo HTTP. */
export const BUSINESS_CALENDAR_RULE_ERROR_CODE = {
  HOLIDAY_IMPORT_PAST_DATE: 'HOLIDAY_IMPORT_PAST_DATE',
  HOLIDAY_NOT_IMPORTED: 'HOLIDAY_NOT_IMPORTED',
  MUNICIPAL_HOLIDAY_GENERATED_BY_RULE: 'MUNICIPAL_HOLIDAY_GENERATED_BY_RULE',
  MUNICIPAL_HOLIDAY_NOT_FOUND: 'MUNICIPAL_HOLIDAY_NOT_FOUND',
  MUNICIPAL_HOLIDAY_RULE_CONFLICT: 'MUNICIPAL_HOLIDAY_RULE_CONFLICT',
  MUNICIPAL_HOLIDAY_RULE_INVALID_DAY: 'MUNICIPAL_HOLIDAY_RULE_INVALID_DAY',
  MUNICIPAL_HOLIDAY_RULE_NOT_FOUND: 'MUNICIPAL_HOLIDAY_RULE_NOT_FOUND',
  STATE_HOLIDAY_CONFLICT: 'STATE_HOLIDAY_CONFLICT',
  STATE_HOLIDAY_NOT_FOUND: 'STATE_HOLIDAY_NOT_FOUND',
  STATE_HOLIDAY_RECURRENCE_MISMATCH: 'STATE_HOLIDAY_RECURRENCE_MISMATCH',
} as const

export type BusinessCalendarErrorCode =
  (typeof BUSINESS_CALENDAR_ERROR_CODE)[keyof typeof BUSINESS_CALENDAR_ERROR_CODE]

export const NATIONAL_HOLIDAY_KEY = {
  ALL_SOULS_DAY: 'all_souls_day',
  BLACK_CONSCIOUSNESS: 'black_consciousness',
  CARNIVAL: 'carnival',
  CHRISTMAS: 'christmas',
  CORPUS_CHRISTI: 'corpus_christi',
  GOOD_FRIDAY: 'good_friday',
  INDEPENDENCE_DAY: 'independence_day',
  LABOUR_DAY: 'labour_day',
  OUR_LADY_OF_APARECIDA: 'our_lady_of_aparecida',
  REPUBLIC_PROCLAMATION: 'republic_proclamation',
  TIRADENTES: 'tiradentes',
  UNIVERSAL_FRATERNIZATION: 'universal_fraternization',
} as const

export type NationalHolidayKey = (typeof NATIONAL_HOLIDAY_KEY)[keyof typeof NATIONAL_HOLIDAY_KEY]

/**
 * A mesma lista do painel (`brazilianHoliday.service.ts`), presa pelo contrato de paridade.
 * Consciência Negra entra em todo ano por paridade, embora só seja nacional desde 2024 (ADR-0096).
 */
export const FIXED_NATIONAL_HOLIDAYS: readonly Readonly<{
  day: number
  key: NationalHolidayKey
  month: number
}>[] = [
  { day: 1, key: NATIONAL_HOLIDAY_KEY.UNIVERSAL_FRATERNIZATION, month: 1 },
  { day: 21, key: NATIONAL_HOLIDAY_KEY.TIRADENTES, month: 4 },
  { day: 1, key: NATIONAL_HOLIDAY_KEY.LABOUR_DAY, month: 5 },
  { day: 7, key: NATIONAL_HOLIDAY_KEY.INDEPENDENCE_DAY, month: 9 },
  { day: 12, key: NATIONAL_HOLIDAY_KEY.OUR_LADY_OF_APARECIDA, month: 10 },
  { day: 2, key: NATIONAL_HOLIDAY_KEY.ALL_SOULS_DAY, month: 11 },
  { day: 15, key: NATIONAL_HOLIDAY_KEY.REPUBLIC_PROCLAMATION, month: 11 },
  { day: 20, key: NATIONAL_HOLIDAY_KEY.BLACK_CONSCIOUSNESS, month: 11 },
  { day: 25, key: NATIONAL_HOLIDAY_KEY.CHRISTMAS, month: 12 },
]

/** Carnaval e Corpus Christi como feriado: decisão da spec 238, como o painel já faz. */
export const EASTER_RELATIVE_NATIONAL_HOLIDAYS: readonly Readonly<{
  easterOffsetDays: number
  key: NationalHolidayKey
}>[] = [
  { easterOffsetDays: -48, key: NATIONAL_HOLIDAY_KEY.CARNIVAL },
  { easterOffsetDays: -47, key: NATIONAL_HOLIDAY_KEY.CARNIVAL },
  { easterOffsetDays: -2, key: NATIONAL_HOLIDAY_KEY.GOOD_FRIDAY },
  { easterOffsetDays: 60, key: NATIONAL_HOLIDAY_KEY.CORPUS_CHRISTI },
]
