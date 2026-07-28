/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  FLEET_DRIVER_STATUS,
  FLEET_VEHICLE_OWNERSHIP,
  FLEET_VEHICLE_ROLE,
  FLEET_VEHICLE_STATUS,
  MDFE_BODY_TYPE,
  MDFE_OWNER_TAX_REGIME,
  MDFE_WHEEL_TYPE,
} from './fleet.types'

const UNSIGNED_INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isNullableString(value: unknown): value is null | string {
  return value === null || isString(value)
}

export function isUnsignedIntegerString(value: unknown): value is string {
  return isString(value) && UNSIGNED_INTEGER_PATTERN.test(value)
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

export const FLEET_ENUMS = {
  bodyType: MDFE_BODY_TYPE,
  driverStatus: FLEET_DRIVER_STATUS,
  ownership: FLEET_VEHICLE_OWNERSHIP,
  role: FLEET_VEHICLE_ROLE,
  taxRegime: MDFE_OWNER_TAX_REGIME,
  vehicleStatus: FLEET_VEHICLE_STATUS,
  wheelType: MDFE_WHEEL_TYPE,
} as const
