/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { tripOccurrenceUploads } from '../../src/database/trip-occurrence-upload.schema.js'

const UPLOAD_WORKER = new URL(
  '../../src/database/trip-occurrence-upload.schema.ts',
  import.meta.url,
)
const UPLOAD_API = new URL('../../../api-transportada/src/database/trip.schema.ts', import.meta.url)

const COLUMN_LINE = /^\s+[a-zA-Z]+: (uuid|text|bigint|smallint|timestamp)\(.*,$/

function extractColumnLines(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => COLUMN_LINE.test(line))
    .map((line) => line.trim())
}

/**
 * ⚠️ **Cópia por valor.** O worker expira e apaga o objeto a partir da própria cópia; coluna
 * renomeada na API e não aqui é `UPDATE` que falha em produção, e o pedido vencido fica sem quem o
 * feche (mesmo desenho de `trip-occurrence-attachment-purge/schema-parity.contract.ts`).
 *
 * `company_id` não entra na comparação linha a linha: a API a declara com `.references()` em várias
 * linhas (FK composta com `trip_id`), e a cópia aqui não carrega FK nenhuma — quem migra é a API.
 */
describe('trip occurrence uploads mirror parity (achado [3], spec 179)', () => {
  test('every plain column the worker declares reads exactly as the API declares it', async () => {
    const [worker, api] = await Promise.all([
      readFile(UPLOAD_WORKER, 'utf8'),
      readFile(UPLOAD_API, 'utf8'),
    ])

    const workerColumns = extractColumnLines(worker).filter(
      (line) => !line.startsWith('companyId:'),
    )
    const apiColumns = new Set(extractColumnLines(api))

    expect(workerColumns.length).toBe(11)
    for (const line of workerColumns) {
      expect(apiColumns.has(line)).toBeTrue()
    }
  })

  test('points at the table the API migrates, with the columns the routine reads and writes', () => {
    const config = getTableConfig(tripOccurrenceUploads)
    const names = config.columns.map((column) => column.name)

    expect(config.name).toBe('trip_occurrence_uploads')
    for (const written of [
      'company_id',
      'trip_id',
      'bucket',
      'object_key',
      'status',
      'expires_at',
    ]) {
      expect(names).toContain(written)
    }
  })
})
