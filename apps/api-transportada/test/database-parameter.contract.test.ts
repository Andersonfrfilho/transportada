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

  test('primitives, null, Date, Uint8Array and already-serialized text pass untouched', () => {
    const date = new Date('2026-09-11T20:24:00.000Z')
    const bytes = new Uint8Array([1, 2])

    expect(serializeJsonParameter('text')).toBe('text')
    expect(serializeJsonParameter('{"already":"json"}')).toBe('{"already":"json"}')
    expect(serializeJsonParameter(12)).toBe(12)
    expect(serializeJsonParameter(12n)).toBe(12n)
    expect(serializeJsonParameter(true)).toBe(true)
    expect(serializeJsonParameter(null)).toBeNull()
    expect(serializeJsonParameter(undefined)).toBeUndefined()
    expect(serializeJsonParameter(date)).toBe(date)
    expect(serializeJsonParameter(bytes)).toBe(bytes)
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
