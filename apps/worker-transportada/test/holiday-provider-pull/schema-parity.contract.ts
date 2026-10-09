/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * ⚠️ Cópia por valor. A rotina escreve nestas tabelas a partir da cópia do worker; coluna renomeada na
 * API e não aqui é `INSERT` que falha em produção, num ciclo diário que ninguém está olhando. A cópia
 * não carrega CHECK, FK nem índice (quem migra é a API): só as colunas, uma a uma.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  companyHolidayImportSettings,
  holidayImportCities,
} from '../../src/database/holiday-import.schema.js'

const WORKER_IMPORT = new URL('../../src/database/holiday-import.schema.ts', import.meta.url)
const API_IMPORT = new URL(
  '../../../api-transportada/src/database/holiday-import.schema.ts',
  import.meta.url,
)

const COLUMN_LINE = /^\s+[a-zA-Z]+: (boolean|date|integer|text|timestamp|uuid)\(.*,$/u

function extractColumnLines(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => COLUMN_LINE.test(line))
    .map((line) => line.trim())
}

describe('as tabelas de demanda da importação espelham a API (spec 252 T3.2)', () => {
  test('toda coluna que o worker declara é lida exatamente como a API a declara, e nenhuma falta', async () => {
    const [worker, api] = await Promise.all([
      readFile(WORKER_IMPORT, 'utf8'),
      readFile(API_IMPORT, 'utf8'),
    ])

    const workerColumns = extractColumnLines(worker)
    const apiColumns = extractColumnLines(api)

    expect(workerColumns.length).toBe(apiColumns.length)
    expect(workerColumns.length).toBe(16)
    expect(new Set(workerColumns)).toEqual(new Set(apiColumns))
  })

  test('as colunas das duas tabelas que a descoberta escreve têm os nomes do banco', () => {
    expect(getTableConfig(holidayImportCities).columns.map((column) => column.name)).toEqual([
      'company_id',
      'city_ibge_code',
      'document_count',
      'last_seen_at',
    ])
    expect(
      getTableConfig(companyHolidayImportSettings).columns.map((column) => column.name),
    ).toEqual([
      'company_id',
      'is_enabled',
      'cursor_updated_at',
      'cursor_issued_at',
      'cursor_document_id',
    ])
  })
})
