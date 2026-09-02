/* Copyright (c) 2026 Ada Technology. MIT License. */
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

export function isUnsignedInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export function isOneOf<TOption extends string>(
  value: unknown,
  options: readonly TOption[],
): value is TOption {
  return isString(value) && (options as readonly string[]).includes(value)
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key))
}

function hasEveryKey(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => key in value)
}

export function hasExactKeys(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return isRecord(value) && hasOnlyKeys(value, keys) && hasEveryKey(value, keys)
}

export function isEveryItem<TItem>(
  value: unknown,
  guard: (item: unknown) => item is TItem,
): value is readonly TItem[] {
  return Array.isArray(value) && value.every(guard)
}

/**
 * Spec 078 D2: **permitidas** e **obrigatorias** sao conjuntos diferentes.
 *
 * `hasExactKeys` nao sabe expressar campo opcional: tirar da lista faz a chave presente ser
 * recusada como desconhecida, e deixar na lista faz a chave ausente ser recusada. Nenhum dos dois
 * e o que se quer no intervalo entre o deploy da API e o do bundle.
 *
 * ⚠️ A protecao contra vazamento continua inteira: chave fora de `allowed` segue recusada — e e
 * ela que impede token, identidade de tenant ou XML fiscal de atravessarem (D1).
 */
export function hasKeys(
  value: unknown,
  input: Readonly<{ allowed: readonly string[]; required: readonly string[] }>,
): value is Record<string, unknown> {
  return isRecord(value) && hasOnlyKeys(value, input.allowed) && hasEveryKey(value, input.required)
}
