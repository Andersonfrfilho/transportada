/* Copyright (c) 2026 Ada Technology. MIT License. */

/** O dia civil que a API usa para o aviso (`BUSINESS_CALENDAR_TIME_ZONE`): o do destino, não o do aparelho. */
export const HOLIDAY_TIME_ZONE = 'America/Sao_Paulo'

/** Chaves estáveis do feriado nacional que a API devolve em `reasons[].name` (paridade presa por contrato). */
export const NATIONAL_HOLIDAY_KEYS = [
  'all_souls_day',
  'black_consciousness',
  'carnival',
  'christmas',
  'corpus_christi',
  'good_friday',
  'independence_day',
  'labour_day',
  'our_lady_of_aparecida',
  'republic_proclamation',
  'tiradentes',
  'universal_fraternization',
] as const

export type NationalHolidayKey = (typeof NATIONAL_HOLIDAY_KEYS)[number]

export const HOLIDAY_SCOPE = {
  NATIONAL: 'national',
  STATE: 'state',
  MUNICIPAL: 'municipal',
} as const
