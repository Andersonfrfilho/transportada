/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys, hasKeys } from '@/modules/shared/objectKeys.service'

import {
  HOLIDAY_KINDS,
  HOLIDAY_ORIGINS,
  HOLIDAY_RECURRENCE,
  SETTINGS_ORIGINS,
} from './businessCalendar.constant'
import type {
  BusinessCalendarSettings,
  MaterializationSummary,
  MunicipalHoliday,
  MunicipalHolidayRule,
  SavedMunicipalHoliday,
  StateHoliday,
} from './businessCalendar.types'

/**
 * Guardas de resposta com chaves exatas (`objectKeys.service.ts`): chave a mais é recusada, e é isso que impede a
 * API de vazar identidade de tenant para dentro do cliente. Os formatos são os de
 * `apps/api-transportada/src/business-calendar/presentation/*.schema.ts`.
 */
const SETTINGS_KEYS = ['origin', 'saturdayIsBusinessDay', 'updatedAt'] as const
const RULE_KEYS = [
  'cityIbgeCode',
  'createdAt',
  'day',
  'id',
  'kind',
  'materializedThroughYear',
  'month',
  'name',
  'updatedAt',
] as const
const RULE_OPTIONAL_KEYS = [...RULE_KEYS, 'typedHolidaysKept'] as const
const HOLIDAY_KEYS = [
  'cityIbgeCode',
  'generatedByRuleId',
  'holidayOn',
  'id',
  'kind',
  'name',
] as const
const HOLIDAY_OPTIONAL_KEYS = [...HOLIDAY_KEYS, 'origin'] as const
const SAVED_HOLIDAY_KEYS = [...HOLIDAY_KEYS, 'adoptedFromRuleId'] as const
const SAVED_HOLIDAY_OPTIONAL_KEYS = [...SAVED_HOLIDAY_KEYS, 'origin'] as const
const STATE_SHARED_KEYS = ['id', 'name', 'recurrence', 'stateIbgeCode', 'updatedAt'] as const
const STATE_ONCE_KEYS = [...STATE_SHARED_KEYS, 'holidayOn'] as const
const STATE_YEARLY_KEYS = [...STATE_SHARED_KEYS, 'day', 'month'] as const
const SUMMARY_KEYS = ['holidaysCreated', 'rulesProcessed'] as const

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value)
}

function isKind(value: unknown): boolean {
  return HOLIDAY_KINDS.some((kind) => kind === value)
}

/** Ausente é a API que ainda não manda a origem; presente tem de ser uma das duas. */
function isOptionalOrigin(value: unknown): boolean {
  return value === undefined || HOLIDAY_ORIGINS.some((origin) => origin === value)
}

export function isDataEnvelope(value: unknown): value is Readonly<{ data: unknown }> {
  return hasExactKeys(value, ['data'])
}

export function isBusinessCalendarSettings(value: unknown): value is BusinessCalendarSettings {
  return (
    hasExactKeys(value, SETTINGS_KEYS) &&
    SETTINGS_ORIGINS.some((origin) => origin === value.origin) &&
    typeof value.saturdayIsBusinessDay === 'boolean' &&
    isNullableString(value.updatedAt)
  )
}

export function isMunicipalHolidayRule(value: unknown): value is MunicipalHolidayRule {
  return (
    hasKeys(value, { allowed: RULE_OPTIONAL_KEYS, required: RULE_KEYS }) &&
    isString(value.cityIbgeCode) &&
    isString(value.createdAt) &&
    isNumber(value.day) &&
    isString(value.id) &&
    isKind(value.kind) &&
    isNumber(value.materializedThroughYear) &&
    isNumber(value.month) &&
    isString(value.name) &&
    (value.typedHolidaysKept === undefined || isNumber(value.typedHolidaysKept)) &&
    isString(value.updatedAt)
  )
}

function hasHolidayFields(value: Record<string, unknown>): boolean {
  return (
    isString(value.cityIbgeCode) &&
    isNullableString(value.generatedByRuleId) &&
    isString(value.holidayOn) &&
    isString(value.id) &&
    isKind(value.kind) &&
    isString(value.name)
  )
}

export function isMunicipalHoliday(value: unknown): value is MunicipalHoliday {
  return (
    hasKeys(value, { allowed: HOLIDAY_OPTIONAL_KEYS, required: HOLIDAY_KEYS }) &&
    hasHolidayFields(value) &&
    isOptionalOrigin(value.origin)
  )
}

export function isSavedMunicipalHoliday(value: unknown): value is SavedMunicipalHoliday {
  return (
    hasKeys(value, { allowed: SAVED_HOLIDAY_OPTIONAL_KEYS, required: SAVED_HOLIDAY_KEYS }) &&
    hasHolidayFields(value) &&
    isNullableString(value.adoptedFromRuleId) &&
    isOptionalOrigin(value.origin)
  )
}

function hasStateSharedFields(value: Record<string, unknown>): boolean {
  return (
    isOptionalOrigin(value.origin) &&
    isString(value.id) &&
    isString(value.name) &&
    isString(value.stateIbgeCode) &&
    isString(value.updatedAt)
  )
}

export function isStateHoliday(value: unknown): value is StateHoliday {
  if (hasKeys(value, { allowed: [...STATE_ONCE_KEYS, 'origin'], required: STATE_ONCE_KEYS })) {
    return (
      value.recurrence === HOLIDAY_RECURRENCE.ONCE &&
      hasStateSharedFields(value) &&
      isString(value.holidayOn)
    )
  }
  return (
    hasKeys(value, { allowed: [...STATE_YEARLY_KEYS, 'origin'], required: STATE_YEARLY_KEYS }) &&
    value.recurrence === HOLIDAY_RECURRENCE.YEARLY &&
    hasStateSharedFields(value) &&
    isNumber(value.day) &&
    isNumber(value.month)
  )
}

export function isMaterializationSummary(value: unknown): value is MaterializationSummary {
  return (
    hasExactKeys(value, SUMMARY_KEYS) &&
    isNumber(value.holidaysCreated) &&
    isNumber(value.rulesProcessed)
  )
}
