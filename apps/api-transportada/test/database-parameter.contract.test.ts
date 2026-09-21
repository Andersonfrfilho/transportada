/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  serializeJsonParameter,
  serializeJsonParameters,
} from '../src/database/database-parameter.policy'

/**
 * Regressão de 11/09/2026: com `prepare: false` (spec 137) todo `jsonb` gravado pela API chegava
 * ao Postgres como `[object Object]` — `route_suggestions.assumptions`, `view_preferences`,
 * `trips.planned_toll` — e a rota respondia INTERNAL_ERROR. O parâmetro estruturado tem de sair
 * do cliente guardado já serializado; o resto passa intacto.
 */
describe('database parameter serialization (prepare: false)', () => {
  test('a plain object becomes its JSON text', () => {
    const assumptions = { dutyEnabled: false, serviceTimeSeconds: 600, nested: { key: 'v' } }

    expect(serializeJsonParameter(assumptions)).toBe(JSON.stringify(assumptions))
  })

  test('an array becomes its JSON text, never the comma-joined string', () => {
    expect(serializeJsonParameter([{ id: 1 }, { id: 2 }])).toBe('[{"id":1},{"id":2}]')
    expect(serializeJsonParameter(['a', 'b'])).toBe('["a","b"]')
  })

  test('a null-prototype object is still JSON', () => {
    const bare: Record<string, unknown> = Object.create(null)
    bare.key = 'value'

    expect(serializeJsonParameter(bare)).toBe('{"key":"value"}')
  })

  test('primitives, null, Uint8Array and already-serialized text pass untouched', () => {
    const bytes = new Uint8Array([1, 2])

    expect(serializeJsonParameter('text')).toBe('text')
    expect(serializeJsonParameter('{"already":"json"}')).toBe('{"already":"json"}')
    expect(serializeJsonParameter(12)).toBe(12)
    expect(serializeJsonParameter(12n)).toBe(12n)
    expect(serializeJsonParameter(true)).toBe(true)
    expect(serializeJsonParameter(null)).toBeNull()
    expect(serializeJsonParameter(undefined)).toBeUndefined()
    expect(serializeJsonParameter(bytes)).toBe(bytes)
  })

  /**
   * ⚠️ Medido em staging (2026-09-21): `GET /fleet/drivers` respondia 500 e o Postgres registrava
   * `invalid input syntax for type timestamp with time zone: "Tue Jun 23 2026 18:40:41 GMT+0000
   * (Coordinated Universal Time)"`. Numa comparação em SQL cru (`coalesce(a, b) >= ${data}`) não há
   * coluna para o drizzle consultar, então a `Date` chega inteira ao driver — e com `prepare: false`
   * o Bun a converte com `String()`, que o Postgres não sabe ler. A suíte não via porque os testes
   * criam o provider **com** preparo.
   */
  test('Date vira ISO — sem coluna para tipar, o driver a converteria com String()', () => {
    const date = new Date('2026-09-11T20:24:00.000Z')

    expect(serializeJsonParameter(date)).toBe('2026-09-11T20:24:00.000Z')
    expect(serializeJsonParameters([date, 'queued'])).toEqual([
      '2026-09-11T20:24:00.000Z',
      'queued',
    ])
  })

  test('the parameter list keeps positions, serializing only what is structured', () => {
    const uuid = '11b0bfe5-bc27-4175-bc88-38283fb08a17'

    expect(serializeJsonParameters([uuid, null, 'queued', { seed: 7 }])).toEqual([
      uuid,
      null,
      'queued',
      '{"seed":7}',
    ])
  })
})
