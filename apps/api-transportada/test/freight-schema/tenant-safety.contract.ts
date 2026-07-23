import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { columnNames, expectRequiredUtcTimestamps, foreignKeys } from '../fiscal-schema/support.js'
import { FREIGHT_SCHEMA_EXPORT_NAMES, requireSchemaTable } from './tables.js'

const FORBIDDEN_FREIGHT_COLUMN_NAMES = [
  'company_id_from_client',
  'xml',
  'xml_content',
  'xml_payload',
  'request_payload',
  'certificate_password',
  'private_key',
]

describe('freight schema tenant safety', () => {
  test('requires company ownership and restrictive tenant relationships on every table', () => {
    for (const exportName of FREIGHT_SCHEMA_EXPORT_NAMES) {
      const table = requireSchemaTable(exportName)
      const tableName = getTableConfig(table).name
      const companyId = getTableConfig(table).columns.find((column) => column.name === 'company_id')

      expect(companyId?.getSQLType()).toBe('uuid')
      expect(companyId?.notNull).toBeTrue()
      expect(foreignKeys(table)).toContainEqual({
        columns: ['company_id'],
        foreignColumns: ['id'],
        foreignTable: 'companies',
        name: `${tableName}_company_id_companies_id_fk`,
        onDelete: 'restrict',
        onUpdate: 'cascade',
      })
    }
  })

  test('uses UTC timestamps and excludes XML, secrets, and caller tenant columns', () => {
    const tables = FREIGHT_SCHEMA_EXPORT_NAMES.map(requireSchemaTable)

    for (const table of tables) {
      expectRequiredUtcTimestamps(table)
    }

    const allColumnNames = tables.flatMap((table) => columnNames(table))
    for (const forbiddenColumnName of FORBIDDEN_FREIGHT_COLUMN_NAMES) {
      expect(allColumnNames).not.toContain(forbiddenColumnName)
    }
  })
})
