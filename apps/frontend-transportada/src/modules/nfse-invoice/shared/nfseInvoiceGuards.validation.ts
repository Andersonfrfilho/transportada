import { hasExactKeys } from '@/modules/shared/objectKeys.service'

/** Dinheiro e alíquota chegam como string decimal — número binário aqui perde centavo. */
const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/

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
  return value === null || typeof value === 'string'
}

export function isDecimalString(value: unknown): value is string {
  return typeof value === 'string' && DECIMAL_PATTERN.test(value)
}

export function isUnsignedInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every(isString)
}

/** Spec 079: reexporta a guarda compartilhada — a regra mora num lugar so. */
export { hasExactKeys }

export function isOneOf<TOption extends string>(
  value: unknown,
  options: readonly TOption[],
): value is TOption {
  return typeof value === 'string' && options.includes(value as TOption)
}

export function isEveryItem<TItem>(
  value: unknown,
  guard: (item: unknown) => item is TItem,
): value is readonly TItem[] {
  return Array.isArray(value) && value.every(guard)
}
