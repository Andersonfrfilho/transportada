import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { CTE_ISSUANCE_SCHEMA_EXPORT_NAMES, readSchemaExport, requireSchemaTable } from './tables.js'

const EXPECTED_TABLE_NAMES = [
  'cte_issuance_attempts',
  'cte_fiscal_documents',
  'cte_issuance_events',
  'cte_retry_schedules',
  'cte_issuance_payloads',
  'cte_processed_messages',
]

describe('CT-e issuance schema aggregation', () => {
  test('exports every CT-e issuance table from the database schema', () => {
    expect(CTE_ISSUANCE_SCHEMA_EXPORT_NAMES.map(readSchemaExport)).not.toContain(undefined)
    expect(
      CTE_ISSUANCE_SCHEMA_EXPORT_NAMES.map((name) => getTableConfig(requireSchemaTable(name)).name),
    ).toEqual(EXPECTED_TABLE_NAMES)
  })

  test('keeps CT-e issuance schema in one dedicated module', async () => {
    const moduleUrl = new URL('../../src/database/cte-issuance.schema.ts', import.meta.url)

    expect(await Bun.file(moduleUrl).exists()).toBeTrue()
  })
})
