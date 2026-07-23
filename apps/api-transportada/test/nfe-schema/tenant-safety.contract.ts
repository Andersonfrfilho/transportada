import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { columnNames, expectRequiredUtcTimestamps, foreignKeys } from '../fiscal-schema/support.js'
import { sensitiveColumnNames } from './support.js'
import { NFE_SCHEMA_EXPORT_NAMES, requireSchemaTable } from './tables.js'

describe('NF-e schema tenant safety', () => {
  test('requires company ownership and a restrictive company relationship on every table', () => {
    for (const exportName of NFE_SCHEMA_EXPORT_NAMES) {
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

  test('uses UTC timestamps and excludes secret or raw fiscal payload columns', () => {
    const tables = NFE_SCHEMA_EXPORT_NAMES.map(requireSchemaTable)

    for (const table of tables.filter(
      (candidate) => getTableConfig(candidate).name !== 'processed_messages',
    )) {
      expectRequiredUtcTimestamps(table)
    }

    const allColumnNames = tables.flatMap((table) => columnNames(table))
    for (const sensitiveColumnName of sensitiveColumnNames) {
      expect(allColumnNames).not.toContain(sensitiveColumnName)
    }
  })

  test('keeps requesting and publishing actors linked to persisted identities', () => {
    const actorRelationships = [
      [
        requireSchemaTable('nfeImports'),
        'requested_by_user_id',
        'nfe_imports_requested_by_membership_fk',
      ],
      [
        requireSchemaTable('nfeDocuments'),
        'created_by_user_id',
        'nfe_documents_created_by_membership_fk',
      ],
      [
        requireSchemaTable('processingOutbox'),
        'actor_user_id',
        'processing_outbox_actor_membership_fk',
      ],
    ] as const

    for (const [table, actorColumn, relationshipName] of actorRelationships) {
      expect(foreignKeys(table)).toContainEqual({
        columns: [actorColumn, 'company_id'],
        foreignColumns: ['user_id', 'company_id'],
        foreignTable: 'user_company_memberships',
        name: relationshipName,
        onDelete: 'restrict',
        onUpdate: 'cascade',
      })
    }
  })
})
