/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { storedObjects } from '../../src/database/stored-object.schema.js'
import { tripOccurrenceAttachments } from '../../src/database/trip-occurrence-attachment.schema.js'

const STORAGE_WORKER = new URL('../../src/database/stored-object.schema.ts', import.meta.url)
const STORAGE_API = new URL(
  '../../../api-transportada/src/database/storage.schema.ts',
  import.meta.url,
)
const ATTACHMENT_WORKER = new URL(
  '../../src/database/trip-occurrence-attachment.schema.ts',
  import.meta.url,
)
const ATTACHMENT_API = new URL(
  '../../../api-transportada/src/database/trip.schema.ts',
  import.meta.url,
)

const COLUMN_LINE = /^\s+[a-zA-Z]+: (uuid|text|bigint|smallint|timestamp)\(.*,$/

function extractColumnLines(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => COLUMN_LINE.test(line))
    .map((line) => line.trim())
}

/**
 * ⚠️ **Cópia por valor.** O worker apaga bytes e marca `deleted` a partir da própria cópia; coluna
 * renomeada na API e não aqui é `UPDATE`/`DELETE` que falha em produção, e a foto vencida fica sem
 * quem a apague.
 *
 * `company_id` não entra na comparação linha a linha: a API o declara com `.references()` em várias
 * linhas (FK composta), e a cópia aqui não carrega FK nenhuma — quem migra é a API. A presença da
 * coluna é conferida pelo nome via `getTableConfig`, não pelo texto.
 */
describe('stored objects mirror parity (spec 161 T17)', () => {
  test('every plain column the worker declares reads exactly as the API declares it', async () => {
    const [worker, api] = await Promise.all([
      readFile(STORAGE_WORKER, 'utf8'),
      readFile(STORAGE_API, 'utf8'),
    ])

    const workerColumns = extractColumnLines(worker).filter(
      (line) => !line.startsWith('companyId:'),
    )
    const apiColumns = new Set(extractColumnLines(api))

    expect(workerColumns.length).toBe(14)
    for (const line of workerColumns) {
      expect(apiColumns.has(line)).toBeTrue()
    }
  })

  test('points at the table the API migrates, with the columns the purge reads and writes', () => {
    const config = getTableConfig(storedObjects)
    const names = config.columns.map((column) => column.name)

    expect(config.name).toBe('stored_objects')
    for (const written of [
      'company_id',
      'bucket',
      'object_key',
      'purpose',
      'status',
      'retention_until',
      'deleted_at',
    ]) {
      expect(names).toContain(written)
    }
  })
})

/**
 * ⚠️ **Cópia por valor.** O worker remove a linha do anexo a partir da própria cópia; coluna
 * renomeada na API e não aqui é `DELETE` que falha em produção, e a foto e a miniatura ficam presas
 * uma na outra para sempre.
 */
describe('trip document occurrence attachments mirror parity (spec 161 T17)', () => {
  test('every column the worker declares reads exactly as the API declares it', async () => {
    const [worker, api] = await Promise.all([
      readFile(ATTACHMENT_WORKER, 'utf8'),
      readFile(ATTACHMENT_API, 'utf8'),
    ])

    const workerColumns = extractColumnLines(worker)
    const apiColumns = new Set(extractColumnLines(api))

    expect(workerColumns.length).toBe(7)
    for (const line of workerColumns) {
      expect(apiColumns.has(line)).toBeTrue()
    }
  })

  test('points at the table the API migrates, with the columns the purge resolves the unit by', () => {
    const config = getTableConfig(tripOccurrenceAttachments)
    const names = config.columns.map((column) => column.name)

    expect(config.name).toBe('trip_document_occurrence_attachments')
    expect(names).toEqual([
      'id',
      'company_id',
      'occurrence_id',
      'stored_object_id',
      'thumbnail_object_id',
      'position',
      'created_at',
    ])
  })
})
