import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { CTE_BATCH_SCHEMA_EXPORT_NAMES, readSchemaExport, requireSchemaTable } from './tables.js'

const EXPECTED_TABLE_NAMES = [
  'cte_batches',
  'cte_batch_items',
  'cte_batch_events',
  'cte_submission_records',
]

describe('CT-e batch schema aggregation', () => {
  test('exports every CT-e batch table from the database schema', () => {
    expect(CTE_BATCH_SCHEMA_EXPORT_NAMES.map(readSchemaExport)).not.toContain(undefined)
    expect(
      CTE_BATCH_SCHEMA_EXPORT_NAMES.map((name) => getTableConfig(requireSchemaTable(name)).name),
    ).toEqual(EXPECTED_TABLE_NAMES)
  })

  test('keeps CT-e batch schema in one dedicated module', async () => {
    const moduleUrl = new URL('../../src/database/cte-batch.schema.ts', import.meta.url)

    expect(await Bun.file(moduleUrl).exists()).toBeTrue()
  })
})
