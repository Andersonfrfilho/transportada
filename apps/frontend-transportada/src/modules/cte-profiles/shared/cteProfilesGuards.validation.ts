/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  CTE_PROFILE_ICMS_CST,
  CTE_PROFILE_MODAL,
  CTE_PROFILE_PICKUP_INDICATOR,
  CTE_PROFILE_RECEIVER_IE_INDICATOR,
  CTE_PROFILE_SERVICE_TYPE,
  CTE_PROFILE_TAKER,
} from './cteProfiles.types'

const MONEY_PATTERN = /^(?:0|[1-9][0-9]{0,14})\.[0-9]{4}$/
const RATE_PATTERN = /^(?:0|1)\.[0-9]{6}$/
const INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isNullableString(value: unknown): value is null | string {
  return value === null || isString(value)
}

export function isMoneyDecimal(value: unknown): value is string {
  return isString(value) && MONEY_PATTERN.test(value)
}

export function isNullableMoneyDecimal(value: unknown): value is null | string {
  return value === null || isMoneyDecimal(value)
}

export function isRateDecimal(value: unknown): value is string {
  return isString(value) && RATE_PATTERN.test(value)
}

export function isNullableRateDecimal(value: unknown): value is null | string {
  return value === null || isRateDecimal(value)
}

export function isIntegerString(value: unknown): value is string {
  return isString(value) && INTEGER_PATTERN.test(value)
}

export function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

export function hasEveryKey(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => key in value)
}

export function isOneOf<TOption extends string>(
  value: unknown,
  options: readonly TOption[],
): value is TOption {
  return isString(value) && options.includes(value as TOption)
}

export const PROFILE_ENUMS = {
  calculationType: ['fixed_amount', 'percentage_of_cargo', 'percentage_of_freight'] as const,
  groupingMode: ['per_invoice', 'sender_recipient'] as const,
  icmsCst: CTE_PROFILE_ICMS_CST,
  matchMode: ['manual', 'sender_tax_id'] as const,
  matchRole: ['recipient', 'sender'] as const,
  modal: CTE_PROFILE_MODAL,
  pickupIndicator: CTE_PROFILE_PICKUP_INDICATOR,
  predominantProductMode: ['fixed', 'highest_value', 'highest_weight'] as const,
  receiverIeIndicator: CTE_PROFILE_RECEIVER_IE_INDICATOR,
  serviceType: CTE_PROFILE_SERVICE_TYPE,
  status: ['active', 'draft', 'inactive'] as const,
  taker: CTE_PROFILE_TAKER,
} as const
