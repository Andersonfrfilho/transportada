import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { companyDistributionSettings } from '../../src/database/database.schema.js'
import { columnNames, columnSqlTypes, foreignKeys, requiredColumnNames } from './support.js'

describe('company distribution settings schema', () => {
  test('stores the per-company scheduled-distribution opt-in keyed by tenant', () => {
    expect(getTableConfig(companyDistributionSettings).name).toBe('company_distribution_settings')

    expect(columnNames(companyDistributionSettings)).toEqual([
      'company_id',
      'scheduled_distribution_enabled',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(companyDistributionSettings)).toMatchObject({
      company_id: 'uuid',
      scheduled_distribution_enabled: 'boolean',
    })
    expect(requiredColumnNames(companyDistributionSettings)).toEqual(
      columnNames(companyDistributionSettings),
    )

    const companyId = getTableConfig(companyDistributionSettings).columns.find(
      (column) => column.name === 'company_id',
    )
    expect(companyId?.primary).toBeTrue()

    expect(foreignKeys(companyDistributionSettings)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'company_distribution_settings_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })
})
