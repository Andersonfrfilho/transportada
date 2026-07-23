import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { columnNames, expectRequiredUtcTimestamps, foreignKeys } from '../fiscal-schema/support.js'
import { BILLING_SCHEMA_EXPORT_NAMES, requireSchemaTable } from './tables.js'

const FORBIDDEN_BILLING_PAYLOAD_COLUMNS = [
  'xml',
  'xml_payload',
  'xml_content',
  'storage_key',
  'certificate_password',
  'certificate_base64',
  'private_key',
  'token',
] as const

describe('billing schema tenant safety', () => {
  test('requires company ownership and restrictive company relationship on every table', () => {
    for (const exportName of BILLING_SCHEMA_EXPORT_NAMES) {
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

  test('uses UTC timestamps and excludes raw XML, storage key, certificate, and token columns', () => {
    const tables = BILLING_SCHEMA_EXPORT_NAMES.map(requireSchemaTable)

    for (const table of tables) {
      expectRequiredUtcTimestamps(table)
    }

    const allColumnNames = tables.flatMap((table) => columnNames(table))
    for (const forbiddenColumnName of FORBIDDEN_BILLING_PAYLOAD_COLUMNS) {
      expect(allColumnNames).not.toContain(forbiddenColumnName)
    }
  })
})
