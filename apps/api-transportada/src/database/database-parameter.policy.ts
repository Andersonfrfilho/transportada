/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Com `prepare: false` o Bun SQL não pede ao Postgres o tipo de cada parâmetro e converte o que
 * não é primitivo com `String()`: objeto vira `[object Object]`, array vira `a,b`. O drizzle
 * entrega o valor de `json`/`jsonb` cru ao driver (só array de json ele serializa), então quem
 * fecha a lacuna é o cliente guardado. Array do Postgres nunca chega aqui como array: o drizzle já
 * o converte em literal `{...}`; `Date` ele mesmo converte em ISO; `Uint8Array` fica intacto.
 */
export function serializeJsonParameter(value: unknown): unknown {
  return isJsonStructure(value) ? JSON.stringify(value) : value
}

export function serializeJsonParameters(parameters: readonly unknown[]): unknown[] {
  return parameters.map(serializeJsonParameter)
}

function isJsonStructure(value: unknown): value is Record<string, unknown> | unknown[] {
  if (Array.isArray(value)) return true
  if (typeof value !== 'object' || value === null) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
