/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { gte, sql } from 'drizzle-orm'

import { timestamptzParameter } from '../src/database/sql-timestamptz-parameter.support'

function containsRawDate(value: unknown): boolean {
  if (value instanceof Date) return true
  if (Array.isArray(value)) return value.some(containsRawDate)
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some(containsRawDate)
  }
  return false
}

/**
 * Regressão de 2026-09-21: `GET /fleet/drivers` derrubava em `22007` porque uma `Date` interpolada
 * dentro de `sql\`\`` cru chega ao driver sem coluna para o drizzle tipar — `serializeJsonParameter`
 * fecha a lacuna no cliente, mas cada ponto de chamada deve sair já blindado, sem depender só dela.
 */
describe('timestamptzParameter', () => {
  test('gera o texto ISO com cast explícito ::timestamptz', () => {
    const value = new Date('2026-06-23T18:40:41.000Z')

    const fragment = timestamptzParameter(value)

    expect(fragment.queryChunks).toEqual([
      { value: [''] },
      '2026-06-23T18:40:41.000Z',
      { value: ['::timestamptz'] },
    ])
  })

  test('a Date nunca aparece crua nos parâmetros de uma consulta que a usa', () => {
    const windowStart = new Date('2026-06-23T18:40:41.000Z')

    const condition = gte(
      sql`coalesce(recorded_at, captured_at)`,
      timestamptzParameter(windowStart),
    )
    const rendered = sql`select 1 where ${condition}`

    expect(containsRawDate(rendered.queryChunks)).toBe(false)
  })
})
