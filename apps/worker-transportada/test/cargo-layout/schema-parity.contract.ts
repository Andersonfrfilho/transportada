/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readFile } from 'node:fs/promises'

import { getTableConfig } from 'drizzle-orm/pg-core'

import { tripCargoLayouts } from '../../src/database/trip-cargo-layout.schema.js'
import { tripCargoLayoutOutbox } from '../../src/database/trip-cargo-layout-outbox.schema.js'

const WORKER = new URL('../../src/database/trip-cargo-layout.schema.ts', import.meta.url)
const API = new URL(
  '../../../api-transportada/src/database/trip-cargo-layout.schema.ts',
  import.meta.url,
)
const OUTBOX_WORKER = new URL(
  '../../src/database/trip-cargo-layout-outbox.schema.ts',
  import.meta.url,
)
const OUTBOX_API = new URL(
  '../../../api-transportada/src/database/trip-cargo-layout-outbox.schema.ts',
  import.meta.url,
)

const COLUMN_LINE = /^\s+[a-zA-Z]+: (uuid|text|jsonb|bigint|timestamp)\(.*,$/

/** A API declara a tabela com um terceiro argumento e recua as colunas um nível a mais. */
function extractColumnLines(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => COLUMN_LINE.test(line))
    .map((line) => line.trim())
}

/**
 * ⚠️ **Cópia por valor.** As apps não importam código uma da outra, e o worker escreve nesta tabela
 * a partir da própria cópia. Uma coluna renomeada na API e não aqui é `UPDATE` que falha em produção
 * com a planta já calculada — e a viagem fica `running` para sempre.
 */
describe('trip cargo layouts mirror parity (spec 145 D5)', () => {
  test('every column the worker declares reads exactly as the API declares it', async () => {
    const [worker, api] = await Promise.all([readFile(WORKER, 'utf8'), readFile(API, 'utf8')])

    const workerColumns = extractColumnLines(worker)
    const apiColumns = new Set(extractColumnLines(api))

    expect(workerColumns.length).toBe(14)
    for (const line of workerColumns) {
      expect(apiColumns.has(line)).toBeTrue()
    }
    expect(apiColumns.size).toBe(workerColumns.length)
  })

  test('points at the table the API migrates, with the columns the worker writes', () => {
    const config = getTableConfig(tripCargoLayouts)
    const names = config.columns.map((column) => column.name)

    expect(config.name).toBe('trip_cargo_layouts')
    for (const written of [
      'status',
      'layout',
      'error_code',
      'attempt',
      'duration_ms',
      'computed_at',
      'updated_at',
    ]) {
      expect(names).toContain(written)
    }
  })
})

/**
 * ⚠️ **Cópia por valor.** O worker publica esta fila a partir da própria cópia; uma coluna
 * renomeada na API e não aqui é `INSERT` que falha em produção com a planta já pronta — e o pedido
 * nunca sai do outbox.
 */
describe('trip cargo layout outbox mirror parity (spec 145 D8)', () => {
  test('every column the worker declares reads exactly as the API declares it', async () => {
    const [worker, api] = await Promise.all([
      readFile(OUTBOX_WORKER, 'utf8'),
      readFile(OUTBOX_API, 'utf8'),
    ])

    const workerColumns = extractColumnLines(worker)
    const apiColumns = new Set(extractColumnLines(api))

    expect(workerColumns.length).toBe(15)
    for (const line of workerColumns) {
      expect(apiColumns.has(line)).toBeTrue()
    }
    expect(apiColumns.size).toBe(workerColumns.length)
  })

  test('points at the table the API migrates, with the columns the worker reads', () => {
    const config = getTableConfig(tripCargoLayoutOutbox)
    const names = config.columns.map((column) => column.name)

    expect(config.name).toBe('trip_cargo_layout_outbox')
    for (const written of [
      'event_id',
      'company_id',
      'layout_id',
      'event_type',
      'payload',
      'attempt',
      'claim_owner',
      'claim_expires_at',
      'next_attempt_at',
      'published_at',
    ]) {
      expect(names).toContain(written)
    }
  })
})
