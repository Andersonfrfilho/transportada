/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import { isNullableString, isNumber } from './businessCalendarGuards.validation'
import {
  HOLIDAY_ENABLEMENT_ORIGINS,
  HOLIDAY_PROVIDER_BUDGET_ORIGINS,
} from './holidayProviderSettings.constant'
import type {
  HolidayImportEnablement,
  HolidayProviderSettings,
} from './holidayProviderSettings.types'

/**
 * Chaves exatas com `toHolidayProviderSettingsView` da API (`holiday-provider-settings.schema.ts`): a chave, o envelope
 * e quem alterou não fazem parte do contrato, então uma chave a mais — a prova de que algo secreto vazou — é recusada.
 */
const SETTINGS_KEYS = [
  'budgetOrigin',
  'monthlyRequestBudget',
  'tokenConfigured',
  'tokenHint',
  'tokenUpdatedAt',
  'updatedAt',
  'version',
] as const
const ENABLEMENT_KEYS = ['isEnabled', 'origin'] as const

function isOneOf(value: unknown, options: readonly string[]): boolean {
  return options.some((option) => option === value)
}

export function isHolidayProviderSettings(value: unknown): value is HolidayProviderSettings {
  return (
    hasExactKeys(value, SETTINGS_KEYS) &&
    isOneOf(value.budgetOrigin, HOLIDAY_PROVIDER_BUDGET_ORIGINS) &&
    isNumber(value.monthlyRequestBudget) &&
    typeof value.tokenConfigured === 'boolean' &&
    isNullableString(value.tokenHint) &&
    isNullableString(value.tokenUpdatedAt) &&
    isNullableString(value.updatedAt) &&
    isNullableString(value.version)
  )
}

export function isHolidayImportEnablement(value: unknown): value is HolidayImportEnablement {
  return (
    hasExactKeys(value, ENABLEMENT_KEYS) &&
    typeof value.isEnabled === 'boolean' &&
    isOneOf(value.origin, HOLIDAY_ENABLEMENT_ORIGINS)
  )
}
