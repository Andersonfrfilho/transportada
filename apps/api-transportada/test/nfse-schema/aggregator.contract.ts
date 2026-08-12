/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { databaseSchema } from '../../src/database/database.schema.js'
import { NFSE_SCHEMA_EXPORT_NAMES, readSchemaExport } from './tables.js'

describe('nfse database schema aggregation', () => {
  test('exports every nfse table from the database schema', () => {
    for (const exportName of NFSE_SCHEMA_EXPORT_NAMES) {
      expect(readSchemaExport(exportName)).toBeDefined()
      expect(databaseSchema).toHaveProperty(exportName)
    }
  })
})
