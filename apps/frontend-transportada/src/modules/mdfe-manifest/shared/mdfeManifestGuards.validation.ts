/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  MDFE_ATTEMPT_KIND,
  MDFE_CARGO_TYPE,
  MDFE_CARGO_UNIT,
  MDFE_EMITTER_TYPE,
  MDFE_FISCAL_ENVIRONMENT,
  MDFE_MANIFEST_STATUS,
  MDFE_TRANSPORTER_TYPE,
} from './mdfeManifest.types'

/** Dinheiro e peso chegam como string decimal — número binário aqui perde centavo. */
const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/
const UNSIGNED_INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

export function isNullableString(value: unknown): value is null | string {
  return value === null || isString(value)
}

export function isDecimalString(value: unknown): value is string {
  return isString(value) && DECIMAL_PATTERN.test(value)
}

export function isUnsignedIntegerString(value: unknown): value is string {
  return isString(value) && UNSIGNED_INTEGER_PATTERN.test(value)
}

export function isUnsignedInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isString)
}

export function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

export function hasEveryKey(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => key in value)
}

export function hasExactKeys(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return isRecord(value) && hasOnlyKeys(value, keys) && hasEveryKey(value, keys)
}

export function isOneOf<TOption extends string>(
  value: unknown,
  options: readonly TOption[],
): value is TOption {
  return isString(value) && options.includes(value as TOption)
}

export function isOptionalOneOf<TOption extends string>(
  value: unknown,
  options: readonly TOption[],
): value is '' | TOption {
  return value === '' || isOneOf(value, options)
}

export const MDFE_ENUMS = {
  attemptKind: MDFE_ATTEMPT_KIND,
  cargoType: MDFE_CARGO_TYPE,
  cargoUnit: MDFE_CARGO_UNIT,
  emitterType: MDFE_EMITTER_TYPE,
  fiscalEnvironment: MDFE_FISCAL_ENVIRONMENT,
  status: MDFE_MANIFEST_STATUS,
  transporterType: MDFE_TRANSPORTER_TYPE,
} as const
