/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Com `prepare: false` o Bun SQL não pede ao Postgres o tipo de cada parâmetro e converte o que
 * não é primitivo com `String()`: objeto vira `[object Object]`, array vira `a,b`. O drizzle
 * entrega o valor de `json`/`jsonb` cru ao driver (só array de json ele serializa), então quem
 * fecha a lacuna é o cliente guardado. Array do Postgres nunca chega aqui como array: o drizzle já
 * o converte em literal `{...}`; `Uint8Array` fica intacto.
 *
 * ⚠️ **`Date` também precisa virar texto aqui, e a versão anterior deste comentário errava ao dizer
 * que "o drizzle mesmo converte em ISO".** Ele converte quando existe coluna para tipar o valor;
 * numa comparação em SQL cru (`coalesce(a, b) >= ${data}`) não existe, a `Date` chega inteira ao
 * driver e o `String()` produz `Tue Jun 23 2026 18:40:41 GMT+0000 (Coordinated Universal Time)`,
 * que o Postgres recusa com `22007`. Medido em staging (2026-09-21): `GET /fleet/drivers` em 500 e
 * o detalhe da viagem sem carregar. ISO é o formato que o Postgres lê sem ambiguidade de fuso.
 */
export function serializeJsonParameter(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
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
