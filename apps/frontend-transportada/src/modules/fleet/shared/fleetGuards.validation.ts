/* Copyright (c) 2026 Ada Technology. MIT License. */
import { FUEL_PRODUCTS, FUEL_UNITS } from '../../shared/fuel.constant'
import { VEHICLE_TYPES } from '../../shared/vehicleType.constant'
import {
  FLEET_DRIVER_STATUS,
  FLEET_FUEL_PRICE_SOURCE,
  FLEET_VEHICLE_OWNERSHIP,
  FLEET_VEHICLE_ROLE,
  FLEET_VEHICLE_STATUS,
  LICENSE_CATEGORIES,
  MDFE_BODY_TYPE,
  MDFE_OWNER_TAX_REGIME,
} from './fleet.types'

const UNSIGNED_INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/
const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/

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

/** Dinheiro e consumo chegam como decimal string — número binário aqui é resposta inválida. */
export function isDecimalString(value: unknown): value is string {
  return isString(value) && DECIMAL_PATTERN.test(value)
}

export function isNullableDecimalString(value: unknown): value is null | string {
  return value === null || isDecimalString(value)
}

export function isUnsignedIntegerNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
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
  fuelPriceSource: FLEET_FUEL_PRICE_SOURCE,
  fuelType: FUEL_PRODUCTS,
  fuelUnit: FUEL_UNITS,
  licenseCategory: LICENSE_CATEGORIES,
  ownership: FLEET_VEHICLE_OWNERSHIP,
  role: FLEET_VEHICLE_ROLE,
  taxRegime: MDFE_OWNER_TAX_REGIME,
  vehicleStatus: FLEET_VEHICLE_STATUS,
  vehicleType: VEHICLE_TYPES,
} as const
