/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { companyCrewSettings } from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  columnNames,
  columnSqlTypes,
  foreignKeys,
  requiredColumnNames,
} from '../fiscal-schema/support.js'

describe('company crew settings schema (spec 149)', () => {
  test('stores the company helper daily rate keyed by tenant', () => {
    expect(getTableConfig(companyCrewSettings).name).toBe('company_crew_settings')

    expect(columnNames(companyCrewSettings)).toEqual([
      'company_id',
      'helper_daily_rate',
      'created_at',
      'updated_at',
    ])
    expect(columnSqlTypes(companyCrewSettings)).toMatchObject({
      company_id: 'uuid',
      helper_daily_rate: 'numeric(19, 4)',
    })
    /** Nula é "a empresa ainda não definiu": a conta avisa em vez de inventar zero. */
    expect(requiredColumnNames(companyCrewSettings)).toEqual([
      'company_id',
      'created_at',
      'updated_at',
    ])

    const companyId = getTableConfig(companyCrewSettings).columns.find(
      (column) => column.name === 'company_id',
    )
    expect(companyId?.primary).toBeTrue()

    expect(foreignKeys(companyCrewSettings)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'company_crew_settings_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('refuses a negative daily rate', () => {
    const check = checkSqlByName(companyCrewSettings).company_crew_settings_helper_daily_rate_check

    expect(check).toContain('is null')
    expect(check).toContain('>= 0')
  })
})
