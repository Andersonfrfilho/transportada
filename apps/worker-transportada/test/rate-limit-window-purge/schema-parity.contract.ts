/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { rateLimitWindows } from '../../src/database/rate-limit-window.schema.js'

const WORKER = new URL('../../src/database/rate-limit-window.schema.ts', import.meta.url)
const API = new URL(
  '../../../api-transportada/src/database/rate-limit-window.schema.ts',
  import.meta.url,
)

const COLUMN_LINE = /^\s+[a-zA-Z]+: (varchar|integer|timestamp)\(.*,$/

function extractColumnLines(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => COLUMN_LINE.test(line))
    .map((line) => line.trim())
}

/**
 * ⚠️ **Cópia por valor.** O worker apaga desta tabela a partir da própria cópia; uma coluna renomeada
 * na API e não aqui é `DELETE` que falha em produção — e a tabela cresce a cada e-mail enviado.
 */
describe('rate limit windows mirror parity (spec 150 T406)', () => {
  test('every column the worker declares reads exactly as the API declares it', async () => {
    const [worker, api] = await Promise.all([readFile(WORKER, 'utf8'), readFile(API, 'utf8')])

    const workerColumns = extractColumnLines(worker)
    const apiColumns = extractColumnLines(api)

    expect(workerColumns).toHaveLength(4)
    expect(workerColumns).toEqual(apiColumns)
  })

  test('points at the table the API migrates, with the column the purge filters on', () => {
    const config = getTableConfig(rateLimitWindows)

    expect(config.name).toBe('rate_limit_windows')
    expect(config.columns.map((column) => column.name)).toEqual([
      'scope',
      'subject_key',
      'window_start',
      'hits',
    ])
  })
})
