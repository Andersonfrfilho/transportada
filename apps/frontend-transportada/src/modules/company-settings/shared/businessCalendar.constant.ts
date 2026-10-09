/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Os caminhos das rotas da spec 238 T1.3 (ADR-0096 §6). */
export const BUSINESS_CALENDAR_PATH = {
  MATERIALIZATIONS: '/municipal-holiday-rules/materializations',
  MUNICIPAL_HOLIDAYS: '/municipal-holidays',
  MUNICIPAL_RULES: '/municipal-holiday-rules',
  SETTINGS: '/company-settings/business-calendar',
  STATE_HOLIDAYS: '/state-holidays',
} as const

export const HOLIDAY_KIND = { CITY_ANNIVERSARY: 'city_anniversary', HOLIDAY: 'holiday' } as const

/** A ordem do vocabulário da API: o padrão primeiro. */
export const HOLIDAY_KINDS = [HOLIDAY_KIND.HOLIDAY, HOLIDAY_KIND.CITY_ANNIVERSARY] as const

export const HOLIDAY_RECURRENCE = { ONCE: 'once', YEARLY: 'yearly' } as const

export const HOLIDAY_RECURRENCES = [HOLIDAY_RECURRENCE.YEARLY, HOLIDAY_RECURRENCE.ONCE] as const

export const SETTINGS_ORIGINS = ['company', 'default'] as const

/** De onde veio a data que a API conhece: digitada pelo operador ou importada da FeriadosAPI (spec 252). */
export const HOLIDAY_ORIGINS = ['typed', 'imported'] as const

export const HOLIDAY_NAME_MAX_LENGTH = 120

/** A API gera 10 anos na escrita da regra; abaixo do ano corrente + 2 a tela avisa (ADR-0096 §6). */
export const MATERIALIZATION_YEARS = 10
export const MATERIALIZATION_WARNING_MARGIN_YEARS = 2

/** O mesmo fuso da geração na API (`BUSINESS_CALENDAR_TIME_ZONE`, ADR-0096 Q3). */
export const BUSINESS_CALENDAR_TIME_ZONE = 'America/Sao_Paulo'

export const BUSINESS_CALENDAR_QUERY_KEY = 'business-calendar'

export const MONTHS_IN_YEAR = 12
export const DAY_INPUT_MAX_LENGTH = 2
export const CITY_IBGE_CODE_PATTERN = /^[1-5][0-9]{6}$/u
export const STATE_CODE_LENGTH = 2

export type BrazilianState = Readonly<{ acronym: string; code: string; name: string }>

/** As 27 UFs pelo prefixo do código IBGE; nomes próprios, iguais nos dois idiomas. */
export const BRAZILIAN_STATES: readonly BrazilianState[] = [
  { acronym: 'RO', code: '11', name: 'Rondônia' },
  { acronym: 'AC', code: '12', name: 'Acre' },
  { acronym: 'AM', code: '13', name: 'Amazonas' },
  { acronym: 'RR', code: '14', name: 'Roraima' },
  { acronym: 'PA', code: '15', name: 'Pará' },
  { acronym: 'AP', code: '16', name: 'Amapá' },
  { acronym: 'TO', code: '17', name: 'Tocantins' },
  { acronym: 'MA', code: '21', name: 'Maranhão' },
  { acronym: 'PI', code: '22', name: 'Piauí' },
  { acronym: 'CE', code: '23', name: 'Ceará' },
  { acronym: 'RN', code: '24', name: 'Rio Grande do Norte' },
  { acronym: 'PB', code: '25', name: 'Paraíba' },
  { acronym: 'PE', code: '26', name: 'Pernambuco' },
  { acronym: 'AL', code: '27', name: 'Alagoas' },
  { acronym: 'SE', code: '28', name: 'Sergipe' },
  { acronym: 'BA', code: '29', name: 'Bahia' },
  { acronym: 'MG', code: '31', name: 'Minas Gerais' },
  { acronym: 'ES', code: '32', name: 'Espírito Santo' },
  { acronym: 'RJ', code: '33', name: 'Rio de Janeiro' },
  { acronym: 'SP', code: '35', name: 'São Paulo' },
  { acronym: 'PR', code: '41', name: 'Paraná' },
  { acronym: 'SC', code: '42', name: 'Santa Catarina' },
  { acronym: 'RS', code: '43', name: 'Rio Grande do Sul' },
  { acronym: 'MS', code: '50', name: 'Mato Grosso do Sul' },
  { acronym: 'MT', code: '51', name: 'Mato Grosso' },
  { acronym: 'GO', code: '52', name: 'Goiás' },
  { acronym: 'DF', code: '53', name: 'Distrito Federal' },
]

/** A UF como o operador a procura: sigla e nome. */
export const STATE_CHOICES = BRAZILIAN_STATES.map((state) => ({
  label: `${state.acronym} — ${state.name}`,
  value: state.code,
}))

export const BUSINESS_CALENDAR_ERROR = {
  NETWORK: 'BUSINESS_CALENDAR_NETWORK_ERROR',
  REQUEST_FAILED: 'BUSINESS_CALENDAR_REQUEST_FAILED',
  RESPONSE_INVALID: 'BUSINESS_CALENDAR_RESPONSE_INVALID',
} as const

export const INVALID_REQUEST_CODE = 'INVALID_REQUEST'

/**
 * Todo código que a tela sabe dizer por extenso: as recusas das rotas (ADR-0096 §6), as da política de dias úteis
 * (422), as do cliente HTTP e as genéricas da API. O que não está aqui cai em `errors.generic`.
 */
export const BUSINESS_CALENDAR_REFUSAL_CODES = [
  'BUSINESS_CALENDAR_COVERAGE_TOO_WIDE',
  'BUSINESS_CALENDAR_INVALID_CITY',
  'BUSINESS_CALENDAR_INVALID_COVERAGE',
  'BUSINESS_CALENDAR_INVALID_DATE',
  'BUSINESS_CALENDAR_INVALID_DAYS',
  'BUSINESS_CALENDAR_INVALID_RULE',
  'BUSINESS_CALENDAR_NETWORK_ERROR',
  'BUSINESS_CALENDAR_OUT_OF_COVERAGE',
  'BUSINESS_CALENDAR_REQUEST_FAILED',
  'BUSINESS_CALENDAR_RESPONSE_INVALID',
  'BUSINESS_CALENDAR_TOO_MANY_RULES',
  'BUSINESS_CALENDAR_UNKNOWN_STATE',
  'DATABASE_UNAVAILABLE',
  'FORBIDDEN',
  'HOLIDAY_IMPORT_DATE_LOCKED',
  'HOLIDAY_IMPORT_PAST_DATE',
  'HOLIDAY_NOT_IMPORTED',
  'INVALID_REQUEST',
  'MUNICIPAL_HOLIDAY_GENERATED_BY_RULE',
  'MUNICIPAL_HOLIDAY_NOT_FOUND',
  'MUNICIPAL_HOLIDAY_RULE_CONFLICT',
  'MUNICIPAL_HOLIDAY_RULE_INVALID_DAY',
  'MUNICIPAL_HOLIDAY_RULE_NOT_FOUND',
  'STATE_HOLIDAY_CONFLICT',
  'STATE_HOLIDAY_NOT_FOUND',
  'STATE_HOLIDAY_RECURRENCE_MISMATCH',
  'TOO_MANY_REQUESTS',
  'UNAUTHENTICATED',
] as const

export type BusinessCalendarRefusalCode = (typeof BUSINESS_CALENDAR_REFUSAL_CODES)[number]
