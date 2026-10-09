/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.3: o vocabulário da trilha de auditoria das escritas do calendário. Toda escrita grava
 * `audit_logs` na mesma transação, com ator, alvo, IP e instante (`docs/SECURITY.md`).
 */
export const BUSINESS_CALENDAR_AUDIT_PERMISSION = 'settings.manage'

/** Spec 262: a chave da FeriadosAPI é da instalação, e a trilha registra a permissão dedicada que a rota exigiu. */
export const HOLIDAY_IMPORT_CONFIGURE_PERMISSION = 'holiday-import.configure'

export const BUSINESS_CALENDAR_AUDIT_TARGET = {
  COMPANY_HOLIDAY_IMPORT_SETTINGS: 'company_holiday_import_settings',
  HOLIDAY_PROVIDER_SETTINGS: 'holiday_provider_settings',
  HOLIDAY_IMPORT_SUPPRESSION: 'holiday_import_suppression',
  MUNICIPAL_HOLIDAY: 'municipal_holiday',
  MUNICIPAL_HOLIDAY_RULE: 'municipal_holiday_rule',
  MUNICIPAL_HOLIDAY_RULES: 'municipal_holiday_rules',
  SETTINGS: 'company_business_calendar_settings',
  STATE_HOLIDAY: 'state_holiday',
} as const

export type BusinessCalendarAuditTarget =
  (typeof BUSINESS_CALENDAR_AUDIT_TARGET)[keyof typeof BUSINESS_CALENDAR_AUDIT_TARGET]

export const BUSINESS_CALENDAR_AUDIT_ACTION = {
  HOLIDAY_IMPORT_DISABLED: 'holiday-import.disabled',
  HOLIDAY_IMPORT_ENABLEMENT_CHANGED: 'holiday-import.enablement-changed',
  HOLIDAY_IMPORT_RESTORED: 'holiday-import.restored',
  HOLIDAY_PROVIDER_SETTINGS_SAVED: 'holiday-provider-settings.saved',
  HOLIDAY_PROVIDER_TOKEN_REMOVED: 'holiday-provider-settings.token-removed',
  MUNICIPAL_HOLIDAY_DELETED: 'municipal-holiday.deleted',
  MUNICIPAL_HOLIDAY_RULE_CREATED: 'municipal-holiday-rule.created',
  MUNICIPAL_HOLIDAY_RULE_DELETED: 'municipal-holiday-rule.deleted',
  MUNICIPAL_HOLIDAY_RULE_MATERIALIZED: 'municipal-holiday-rule.materialized',
  MUNICIPAL_HOLIDAY_RULE_UPDATED: 'municipal-holiday-rule.updated',
  MUNICIPAL_HOLIDAY_SAVED: 'municipal-holiday.saved',
  MUNICIPAL_HOLIDAY_UPDATED: 'municipal-holiday.updated',
  SETTINGS_SAVED: 'company-business-calendar-settings.saved',
  STATE_HOLIDAY_CREATED: 'state-holiday.created',
  STATE_HOLIDAY_DELETED: 'state-holiday.deleted',
  STATE_HOLIDAY_UPDATED: 'state-holiday.updated',
} as const
