import { describe, expect, test } from 'bun:test'

import { databaseSchema } from '../../src/database/database.schema.js'
import { BILLING_SCHEMA_EXPORT_NAMES, readSchemaExport } from './tables.js'

describe('billing database schema aggregation', () => {
  test('exports every billing table from the database schema', () => {
    for (const exportName of BILLING_SCHEMA_EXPORT_NAMES) {
      expect(readSchemaExport(exportName)).toBeDefined()
      expect(databaseSchema).toHaveProperty(exportName)
    }
  })
})
