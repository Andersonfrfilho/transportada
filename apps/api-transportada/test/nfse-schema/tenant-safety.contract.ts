/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { columnNames, expectRequiredUtcTimestamps, foreignKeys } from '../fiscal-schema/support.js'
import { NFSE_SCHEMA_EXPORT_NAMES, requireSchemaTable } from './tables.js'

const FORBIDDEN_NFSE_PAYLOAD_COLUMNS = [
  'xml',
  'xml_payload',
  'xml_content',
  'pdf',
  'pdf_content',
  'storage_key',
  'api_token',
  'token',
  'password',
  'private_key',
] as const

describe('nfse schema tenant safety', () => {
  test('requires company ownership and restrictive company relationship on every table', () => {
    for (const exportName of NFSE_SCHEMA_EXPORT_NAMES) {
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

  test('keys every child by the composite company pair so no row crosses tenants', () => {
    for (const exportName of NFSE_SCHEMA_EXPORT_NAMES) {
      const table = requireSchemaTable(exportName)
      const tableName = getTableConfig(table).name
      const compositeKeys = foreignKeys(table).filter(
        (foreignKey) => foreignKey.columns.length === 2 && foreignKey.foreignTable !== 'companies',
      )

      for (const foreignKey of compositeKeys) {
        expect(foreignKey.columns).toContain('company_id')
        expect(foreignKey.foreignColumns).toContain('company_id')
        expect(foreignKey.onUpdate).toBe('cascade')
        expect(['restrict', 'cascade']).toContain(foreignKey.onDelete ?? '')
      }

      expect(Object.keys(uniqueNames(table))).toContain(`${tableName}_company_id_id_unique`)
    }
  })

  test('uses UTC timestamps and excludes raw document, token, and password columns', () => {
    const tables = NFSE_SCHEMA_EXPORT_NAMES.map(requireSchemaTable)

    for (const table of tables) {
      expectRequiredUtcTimestamps(table)
    }

    const allColumnNames = tables.flatMap((table) => columnNames(table))
    for (const forbiddenColumnName of FORBIDDEN_NFSE_PAYLOAD_COLUMNS) {
      expect(allColumnNames).not.toContain(forbiddenColumnName)
    }
  })
})

const uniqueNames = (table: Parameters<typeof getTableConfig>[0]): Readonly<Record<string, true>> =>
  Object.fromEntries(
    getTableConfig(table).uniqueConstraints.map((constraint) => [constraint.name, true]),
  )
