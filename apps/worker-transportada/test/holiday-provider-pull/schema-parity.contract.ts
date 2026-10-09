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
import {
  holidayProviderEntries,
  holidayProviderFetches,
  holidayProviderMonthlyUsage,
} from '../../src/database/holiday-provider.schema.js'

const WORKER_IMPORT = new URL('../../src/database/holiday-import.schema.ts', import.meta.url)
const API_IMPORT = new URL(
  '../../../api-transportada/src/database/holiday-import.schema.ts',
  import.meta.url,
)
const WORKER_PROVIDER = new URL('../../src/database/holiday-provider.schema.ts', import.meta.url)
const API_PROVIDER = new URL(
  '../../../api-transportada/src/database/holiday-provider.schema.ts',
  import.meta.url,
)

const COLUMN_START = /^\s+[a-zA-Z]+: (boolean|date|integer|text|timestamp|uuid)\(/u

/** Uma coluna é a declaração inteira, que pode quebrar em várias linhas e termina na linha com `,`. */
function extractColumnStatements(source: string): string[] {
  const statements: string[] = []
  let current: string[] | undefined

  for (const line of source.split('\n')) {
    if (current === undefined && COLUMN_START.test(line)) current = []
    if (current === undefined) continue

    current.push(line.trim())
    if (line.trimEnd().endsWith(',')) {
      statements.push(current.join(''))
      current = undefined
    }
  }

  return statements
}

async function compareColumns(input: {
  readonly api: URL
  readonly expectedCount: number
  readonly worker: URL
}): Promise<void> {
  const [worker, api] = await Promise.all([
    readFile(input.worker, 'utf8'),
    readFile(input.api, 'utf8'),
  ])

  const workerColumns = extractColumnStatements(worker)
  const apiColumns = extractColumnStatements(api)

  expect(workerColumns.length).toBe(apiColumns.length)
  expect(workerColumns.length).toBe(input.expectedCount)
  expect(new Set(workerColumns)).toEqual(new Set(apiColumns))
}

const columnNames = (table: Parameters<typeof getTableConfig>[0]) =>
  getTableConfig(table).columns.map((column) => column.name)

describe('as tabelas de demanda da importação espelham a API (spec 252 T3.2)', () => {
  test('toda coluna que o worker declara é lida exatamente como a API a declara, e nenhuma falta', async () => {
    await compareColumns({ api: API_IMPORT, expectedCount: 16, worker: WORKER_IMPORT })
  })

  test('as colunas das duas tabelas que a descoberta escreve têm os nomes do banco', () => {
    expect(columnNames(holidayImportCities)).toEqual([
      'company_id',
      'city_ibge_code',
      'document_count',
      'last_seen_at',
    ])
    expect(columnNames(companyHolidayImportSettings)).toEqual([
      'company_id',
      'is_enabled',
      'cursor_updated_at',
      'cursor_issued_at',
      'cursor_document_id',
    ])
  })
})

describe('o cache global do fornecedor espelha a API (spec 252 T3.3)', () => {
  test('toda coluna das três tabelas é a da API, na mesma declaração', async () => {
    await compareColumns({ api: API_PROVIDER, expectedCount: 22, worker: WORKER_PROVIDER })
  })

  test('os nomes de coluna são os do banco', () => {
    expect(columnNames(holidayProviderFetches)).toEqual([
      'id',
      'scope',
      'ibge_code',
      'year',
      'status',
      'attempts',
      'last_error_code',
      'next_attempt_at',
      'fetched_at',
    ])
    expect(columnNames(holidayProviderEntries)).toEqual([
      'id',
      'scope',
      'ibge_code',
      'holiday_on',
      'name',
      'provider_type',
      'external_id',
      'is_banking',
      'first_seen_at',
      'last_seen_at',
      'removed_at',
    ])
    expect(columnNames(holidayProviderMonthlyUsage)).toEqual(['month', 'requests'])
  })
})
