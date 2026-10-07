/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** As 27 unidades da federação pelo código IBGE, que é o prefixo do código do município. */
export const BRAZILIAN_STATE_IBGE_CODE_LIST = [
  '11',
  '12',
  '13',
  '14',
  '15',
  '16',
  '17',
  '21',
  '22',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '31',
  '32',
  '33',
  '35',
  '41',
  '42',
  '43',
  '50',
  '51',
  '52',
  '53',
] as const

export const HOLIDAY_RECURRENCE = {
  ONCE: 'once',
  YEARLY: 'yearly',
} as const

export const MUNICIPAL_HOLIDAY_KIND = {
  CITY_ANNIVERSARY: 'city_anniversary',
  HOLIDAY: 'holiday',
} as const

/** Ordem do vocabulário no CHECK do banco: o padrão primeiro. */
export const MUNICIPAL_HOLIDAY_KINDS = [
  MUNICIPAL_HOLIDAY_KIND.HOLIDAY,
  MUNICIPAL_HOLIDAY_KIND.CITY_ANNIVERSARY,
] as const

/** Mesma forma do CHECK do banco e da política de domínio: município IBGE de UF de 1 a 5. */
export const CITY_IBGE_CODE_SOURCE = '^[1-5][0-9]{6}$'

/** O CHECK antigo de `municipal_holidays`: sete dígitos, sem conferir a UF (as rotas novas conferem). */
export const LEGACY_CITY_IBGE_CODE_SOURCE = '^[0-9]{7}$'

export const HOLIDAY_NAME_MAX_LENGTH = 120

// A Páscoa de Meeus só vale no calendário gregoriano, adotado em 1582.
export const BUSINESS_CALENDAR_MIN_YEAR = 1583

export const BUSINESS_CALENDAR_MAX_YEAR = 9999
