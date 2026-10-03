/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { getTableConfig } from 'drizzle-orm/pg-core'

import { companyLocationRetentionSettings } from '../../src/database/database.schema.js'
import { foreignKeys } from '../fiscal-schema/support.js'

/**
 * Spec 239 D1: a configuração do expurgo é por empresa, com a empresa de chave primária. Uma linha
 * sem tenant faria o painel de uma transportadora decidir o que se apaga na de outra.
 */
describe('location retention settings tenant safety (spec 239)', () => {
  test('anchors the settings to the company', () => {
    expect(foreignKeys(companyLocationRetentionSettings)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'company_location_retention_settings_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('has exactly one row per company: the company is the primary key', () => {
    const { columns } = getTableConfig(companyLocationRetentionSettings)
    const primaryKeys = columns.filter((column) => column.primary).map((column) => column.name)

    expect(primaryKeys).toEqual(['company_id'])
  })
})
