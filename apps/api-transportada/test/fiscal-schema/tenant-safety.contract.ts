import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { columnNames, expectRequiredUtcTimestamps, foreignKeys } from './support.js'
import {
  auditLogs,
  companyFiscalProfiles,
  digitalCertificates,
  fiscalSequenceReservations,
  fiscalSequences,
  idempotencyRecords,
} from './tables.js'

describe('tenant fiscal schema', () => {
  test('requires tenant ownership and safe timestamps across fiscal records', () => {
    for (const table of [
      companyFiscalProfiles,
      digitalCertificates,
      fiscalSequences,
      fiscalSequenceReservations,
      idempotencyRecords,
      auditLogs,
    ]) {
      const companyId = getTableConfig(table).columns.find((column) => column.name === 'company_id')

      expect(companyId?.getSQLType()).toBe('uuid')
      expect(companyId?.notNull).toBeTrue()
      expectRequiredUtcTimestamps(table)
    }

    for (const table of [digitalCertificates, fiscalSequences, idempotencyRecords, auditLogs]) {
      expect(foreignKeys(table)).toContainEqual({
        columns: ['company_id'],
        foreignColumns: ['id'],
        foreignTable: 'companies',
        name: `${getTableConfig(table).name}_company_id_companies_id_fk`,
        onDelete: 'restrict',
        onUpdate: 'cascade',
      })
    }
    expect(foreignKeys(digitalCertificates)).toContainEqual({
      columns: ['created_by_user_id'],
      foreignColumns: ['id'],
      foreignTable: 'identity_users',
      name: 'digital_certificates_created_by_user_id_identity_users_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(auditLogs)).toContainEqual({
      columns: ['actor_user_id'],
      foreignColumns: ['id'],
      foreignTable: 'identity_users',
      name: 'audit_logs_actor_user_id_identity_users_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })

    const fiscalColumnNames = [digitalCertificates, idempotencyRecords, auditLogs].flatMap(
      (table) => columnNames(table),
    )
    expect(fiscalColumnNames).not.toContain('password')
    expect(fiscalColumnNames).not.toContain('pfx')
    expect(fiscalColumnNames).not.toContain('private_key')
    expect(fiscalColumnNames).not.toContain('subject')
    expect(fiscalColumnNames).not.toContain('raw_request')
    expect(fiscalColumnNames).not.toContain('raw_error')
  })
})
