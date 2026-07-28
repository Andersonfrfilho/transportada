import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  checkSqlByName,
  columnNames,
  expectGeneratedUuidPrimaryKey,
  expectRequiredUtcTimestamps,
  foreignKeys,
  indexColumnsByName,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'
import { requireSchemaTable } from './tables.js'

const FORBIDDEN_PAYLOAD_COLUMNS = [
  'xml',
  'xml_payload',
  'certificate_password',
  'certificate_base64',
  'private_key',
  'token',
  'password',
] as const

describe('view_preferences schema tenant safety', () => {
  test('scopes every row to a company and a user with restrictive relationships', () => {
    const table = requireSchemaTable('viewPreferences')
    const columns = getTableConfig(table).columns
    const companyId = columns.find((column) => column.name === 'company_id')
    const userId = columns.find((column) => column.name === 'user_id')

    expect(companyId?.getSQLType()).toBe('uuid')
    expect(companyId?.notNull).toBeTrue()
    expect(userId?.getSQLType()).toBe('uuid')
    expect(userId?.notNull).toBeTrue()

    expect(foreignKeys(table)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'view_preferences_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(table)).toContainEqual({
      columns: ['user_id'],
      foreignColumns: ['id'],
      foreignTable: 'identity_users',
      name: 'view_preferences_user_id_identity_users_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(table)).toContainEqual({
      columns: ['user_id', 'company_id'],
      foreignColumns: ['user_id', 'company_id'],
      foreignTable: 'user_company_memberships',
      name: 'view_preferences_membership_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('keeps one configuration per company, user and view key', () => {
    const table = requireSchemaTable('viewPreferences')

    expect(uniqueColumnsByName(table)).toMatchObject({
      view_preferences_company_user_view_key_unique: ['company_id', 'user_id', 'view_key'],
    })
    expect(indexColumnsByName(table)).toMatchObject({
      view_preferences_company_user_idx: ['company_id', 'user_id'],
    })
    expect(checkSqlByName(table)).toHaveProperty('view_preferences_view_key_not_blank_check')
  })

  test('stores an opaque preferences payload without sensitive columns', () => {
    const table = requireSchemaTable('viewPreferences')
    const columns = getTableConfig(table).columns
    const preferences = columns.find((column) => column.name === 'preferences')

    expectGeneratedUuidPrimaryKey(table)
    expectRequiredUtcTimestamps(table)
    expect(preferences?.getSQLType()).toBe('jsonb')
    expect(preferences?.notNull).toBeTrue()

    const names = columnNames(table)
    for (const forbidden of FORBIDDEN_PAYLOAD_COLUMNS) {
      expect(names).not.toContain(forbidden)
    }
  })
})
