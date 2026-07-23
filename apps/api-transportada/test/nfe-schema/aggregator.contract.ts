import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { NFE_SCHEMA_EXPORT_NAMES, readSchemaExport, requireSchemaTable } from './tables.js'

const EXPECTED_TABLE_NAMES = [
  'nfe_imports',
  'nfe_import_items',
  'nfe_documents',
  'nfe_participants',
  'nfe_addresses',
  'nfe_volumes',
  'nfe_products',
  'nfe_events',
  'nfe_distribution_cursors',
  'processing_outbox',
  'processed_messages',
  'stored_objects',
]

describe('NF-e database schema aggregation', () => {
  test('exports every NF-e, processing, and storage table from the database schema', () => {
    expect(NFE_SCHEMA_EXPORT_NAMES.map(readSchemaExport)).not.toContain(undefined)
    expect(
      NFE_SCHEMA_EXPORT_NAMES.map((name) => getTableConfig(requireSchemaTable(name)).name),
    ).toEqual(EXPECTED_TABLE_NAMES)
  })

  test('keeps the schema split across the three planned domain modules', async () => {
    const moduleUrls = ['nfe.schema.ts', 'processing.schema.ts', 'storage.schema.ts'].map(
      (fileName) => new URL(`../../src/database/${fileName}`, import.meta.url),
    )

    expect(await Promise.all(moduleUrls.map((moduleUrl) => Bun.file(moduleUrl).exists()))).toEqual([
      true,
      true,
      true,
    ])
  })
})
