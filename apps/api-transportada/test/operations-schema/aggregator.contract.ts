import { describe, expect, test } from 'bun:test'

import { databaseSchema } from '../../src/database/database.schema.js'
import { OPERATIONS_SCHEMA_EXPORT_NAMES, readSchemaExport } from './tables.js'

describe('operations database schema aggregation', () => {
  test('exports every operations/audit table from the database schema', () => {
    for (const exportName of OPERATIONS_SCHEMA_EXPORT_NAMES) {
      expect(readSchemaExport(exportName)).toBeDefined()
      expect(databaseSchema).toHaveProperty(exportName)
    }
  })
})
