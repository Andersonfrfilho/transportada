import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { columnNames, foreignKeys } from '../fiscal-schema/support.js'
import { OPERATIONS_SCHEMA_EXPORT_NAMES, requireSchemaTable } from './tables.js'

const FORBIDDEN_OPERATIONAL_PAYLOAD_COLUMNS = [
  'xml',
  'xml_payload',
  'xml_content',
  'storage_key',
  'certificate_password',
  'certificate_base64',
  'private_key',
  'token',
] as const

describe('operations schema tenant safety', () => {
  test('requires company ownership and restrictive company relationship on every table', () => {
    for (const exportName of OPERATIONS_SCHEMA_EXPORT_NAMES) {
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

  test('excludes raw XML, object storage keys, certificates, and tokens', () => {
    const tables = OPERATIONS_SCHEMA_EXPORT_NAMES.map(requireSchemaTable)
    const allColumnNames = tables.flatMap((table) => columnNames(table))

    for (const forbiddenColumnName of FORBIDDEN_OPERATIONAL_PAYLOAD_COLUMNS) {
      expect(allColumnNames).not.toContain(forbiddenColumnName)
    }
  })
})
