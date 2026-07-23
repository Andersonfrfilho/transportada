import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { FREIGHT_SCHEMA_EXPORT_NAMES, readSchemaExport, requireSchemaTable } from './tables.js'

const EXPECTED_TABLE_NAMES = ['freight_rules', 'freight_rule_versions', 'freight_calculations']

describe('freight database schema aggregation', () => {
  test('exports every freight table from the database schema', () => {
    expect(FREIGHT_SCHEMA_EXPORT_NAMES.map(readSchemaExport)).not.toContain(undefined)
    expect(
      FREIGHT_SCHEMA_EXPORT_NAMES.map((name) => getTableConfig(requireSchemaTable(name)).name),
    ).toEqual(EXPECTED_TABLE_NAMES)
  })

  test('keeps freight persistence in its own schema module', async () => {
    const moduleUrl = new URL('../../src/database/freight.schema.ts', import.meta.url)

    expect(await Bun.file(moduleUrl).exists()).toBeTrue()
  })
})
