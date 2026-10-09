/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Os caminhos da gestão da importação (spec 252 T4.1, ADR-0100 §4). */
export const HOLIDAY_IMPORT_PATH = {
  STATUS: '/holiday-imports/status',
  SUPPRESSIONS: '/holiday-imports/suppressions',
} as const

/** O escopo que a API aceita desligar: o que vira linha da empresa é cidade e estado. */
export const HOLIDAY_IMPORT_SCOPES = ['city', 'state'] as const

/** A API pagina como `/cities`: `perPage` até 100. A tela pede poucas por vez. */
export const HOLIDAY_IMPORT_SUPPRESSIONS_PER_PAGE = 20
export const HOLIDAY_IMPORT_FIRST_PAGE = 1

/** O vocabulário de falha que a rotina grava no cache; o que não está aqui cai no texto genérico. */
export const HOLIDAY_FETCH_FAILURE_CODES = [
  'malformed_response',
  'persistence_failed',
  'provider_not_found',
  'provider_plan_restricted',
  'provider_rate_limited',
  'provider_unauthorized',
  'provider_unreachable',
] as const

export const HOLIDAY_IMPORT_HEADLINE = {
  DISABLED: 'disabled',
  FAILING: 'failing',
  HEALTHY: 'healthy',
  QUOTA: 'quota',
  WAITING: 'waiting',
} as const

export const HOLIDAY_PROVENANCE = {
  IMPORTED: 'imported',
  RULE: 'rule',
  TYPED: 'typed',
  UNKNOWN: 'unknown',
} as const
